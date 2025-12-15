const wppconnect = require('@wppconnect-team/wppconnect');
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// URL DO SEU FLASK
const FLASK_API_URL =
  "https://metaphorical-primordially-francesco.ngrok-free.dev/chat";

// Variável para armazenar o cliente WPPConnect
let wppClient = null;

// Função principal para criar e iniciar o cliente WPPConnect
function createClient( ) {
  console.log("Iniciando tentativa de conexão WPPConnect...");
  
  wppconnect
    .create({
      session: "escola_amparo",
      catchQR: (qrCode, asciiQR) => {
        console.log("=================================================");
        console.log("🚨 ATENÇÃO: É NECESSÁRIO ESCANEAR O QR CODE!");
        console.log("📱 Escaneie o QR Code abaixo para reativar a sessão:");
        console.log(asciiQR);
        console.log("=================================================");
      },
      statusFind: (status, session) => {
        console.log('Status da Sessão:', status);
        // Opcional: Adicionar lógica para notificar o usuário ou tentar reconectar
      },
      autoClose: false,
      // Opções para aumentar a resiliência e persistência da sessão
      headless: true, // Recomenda-se rodar sem interface gráfica em produção
      logQR: false, // Evita logar o QR code no console se catchQR já estiver em uso
      waitForLogin: true, // Espera o login antes de resolver a Promise
      updatesLog: true, // Loga atualizações importantes
    })
    .then((client) => startBot(client))
    .catch((error) => {
      console.error("❌ ERRO CRÍTICO na inicialização do WPPConnect:", error.message);
      // Tenta reiniciar o processo após um erro crítico
      setTimeout(createClient, 10000); // Tenta novamente em 10 segundos
    });
}

function get_human_chats(status){
  if (status === 'MANTIDO_HUMANO') {
    return true;
  }else{
    return false;
  }
}

// Inicia o bot
async function startBot(client) {
  wppClient = client;
  console.log("🚀 WPPConnect iniciado com sucesso! Sessão ativa.");

  // =================================================================
  // 1. TRATAMENTO DE DESCONEXÃO E MUDANÇA DE ESTADO
  // =================================================================
  client.onStateChange((state) => {
    console.log('Estado da Conexão Alterado:', state);
    
    if (state === 'CONFLICT') {
      console.error("🚨 CONFLITO DE SESSÃO: Outro dispositivo abriu o WhatsApp Web. Tentando fechar e reabrir.");
      client.useHere(); // Tenta assumir a sessão
    }
    
    if (state === 'UNPAIRED' || state === 'UNLAUNCHED') {
      console.error("🚨 SESSÃO PERDIDA: Necessário novo QR Code. Reiniciando o processo...");
      // Força o fechamento e reinicia para gerar um novo QR Code
      client.close().then(() => createClient());
    }
    
    if (state === 'DISCONNECTED') {
        console.error("🚨 DESCONECTADO: A conexão foi perdida. O wppconnect tentará reconectar automaticamente.");
    }
  });

  client.onStreamChange((state) => {
    console.log('Estado do Stream Alterado:', state);
    if (state === 'DISCONNECTED') {
        console.error("🚨 STREAM DESCONECTADO: O stream de dados foi interrompido. O wppconnect tentará reconectar.");
    }
  });
  
  // =================================================================
  // 2. TRATAMENTO DE MENSAGENS E ERROS DE API
  // =================================================================

  client.onMessage(async (msg) => {
    // Verifica se o cliente WPP está ativo antes de processar
    if (!wppClient) {
        console.error("Cliente WPP não está ativo. Ignorando mensagem.");
        return;
    }
    
    try {
      // Ignorar mensagens de grupos ou mídias
      if (!msg.from || msg.isGroupMsg) return;

      const userNumber = msg.from.replace("@c.us", "");
      const user_id = msg.from;
      const question = msg.body?.trim() || "";

      if (!question) return;

      // --- NOVO TRECHO PARA OBTER O NOME DO USUÁRIO ---
      let userName = "Desconhecido";
      try {
          const contact = await client.getContact(msg.from);
          // Prioriza o nome de exibição (pushname), depois o nome registrado, senão usa o número
          userName = contact.pushname || contact.name || userNumber;
      } catch (contactError) {
          console.error("❌ ERRO ao obter nome do contato:", contactError.message);
      }
      // ------------------------------------------------

      console.log(`📩 Mensagem recebida de ${userName} (${userNumber}):`, question);

      let botAnswer = "Desculpe, ocorreu um erro desconhecido ao processar sua mensagem.";
      let transfer = false;
      
      try {
        // Envia a pergunta para a API Flask
        const response = await axios.post(FLASK_API_URL, {
          question,
          user_id: userNumber,
          user_name: userName, // NOVO CAMPO ENVIADO PARA O FLASK
        });

        botAnswer = response.data.answer;
        transfer = get_human_chats(response.data.status);
        
        console.log("🤖 Resposta do bot:", botAnswer);

      } catch (apiError) {
        // Tratamento de erro específico para a API Flask
        console.error("❌ ERRO na comunicação com a API Flask:", apiError.message);
        
        // Notifica o usuário sobre a falha na API
        botAnswer = `⚠️ *ERRO DE COMUNICAÇÃO:* Não foi possível conectar com o nosso sistema de inteligência (${FLASK_API_URL}). Por favor, tente novamente mais tarde. Detalhes: ${apiError.message.substring(0, 50)}...`;
        transfer = false; // Garante que não tentará transferir em caso de falha de API
      }

      // Envia a resposta ao WhatsApp
      console.log(`tranfer: ${transfer}`);
      if (!transfer) {
        await client.sendText(msg.from, botAnswer);
      }

    } catch (err) {
      // Tratamento de erro geral (ex: falha ao enviar a mensagem de volta)
      console.error("❌ ERRO GERAL ao processar mensagem:", err.message);
      // Se falhar aqui, é provável que a conexão com o WhatsApp tenha caído
      // O onStateChange deve capturar isso, mas é bom ter um fallback
      if (err.message.includes('Session not active')) {
          console.error("Sessão inativa detectada. Aguardando reconexão automática ou reinício.");
      }
    }
  });
}

// Inicia o processo de criação do cliente
createClient();

// Opcional: Web server para status health-check
app.get("/", (req, res) => {
  res.send("Servidor WPPConnect ativo!");
});


app.listen(3000, () => {
  console.log("HTTP server rodando em http://localhost:3000" );
});
