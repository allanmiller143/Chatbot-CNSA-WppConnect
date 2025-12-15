// wppconnect-app.js
const wppconnect = require('@wppconnect-team/wppconnect');
const axios = require('axios');
const { emitStatus, emitQR, emitLog, emitHumanChats } = require('./server'); // usamos o servidor para emitir
// OBS: se você estiver importando de painel_socket.js diretamente, ajuste o caminho

// URL DO SEU FLASK - ajustar para seu endpoint real (prod/ngrok)
const FLASK_API_URL =
  "http://localhost:5000/chat"; // ajuste se necessário

let wppClient = null;
let human_chats = []; // armazena usuários em atendimento humano (sincronize com Flask quando necessário)

/**
 * Função que cria o cliente WPPConnect (seu código original, com emits)
 */
function createClient() {
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
        try {
          // envia QR para o painel (se base64 já disponível, use; senão envie ascii na forma que preferir)
          // wppconnect catchQR pode fornecer o qr em string — aqui assumimos base64 se já for
          emitQR(qrCode);
          emitLog("QR Code gerado e enviado ao painel.");
        } catch (err) {
          console.error("Erro emitQR:", err.message);
        }
      },
      statusFind: (status, session) => {
        console.log('Status da Sessão:', status);
        emitLog('statusFind: ' + status);
      },
      autoClose: false,
      headless: true,
      logQR: false,
      waitForLogin: true,
      updatesLog: true
    })
    .then((client) => startBot(client))
    .catch((error) => {
      console.error("❌ ERRO CRÍTICO na inicialização do WPPConnect:", error.message);
      emitLog("ERRO CRÍTICO na inicialização: " + error.message);
      // Tenta reiniciar o processo após um erro crítico
      setTimeout(createClient, 10000); // Tenta novamente em 10s
    });
}

function get_human_chats(status){
  if (status === 'MANTIDO_HUMANO') {
    return true;
  } else {
    return false;
  }
}

// sincroniza human_chats com Flask
async function syncHumanChatsFromFlask() {
  try {
    const r = await axios.get("http://localhost:5000/chat/humanChats");
    if (r.data && r.data.human_chats) {
      human_chats = r.data.human_chats;
      emitHumanChats(human_chats);
      emitLog("Sincronizado human_chats com Flask: " + human_chats.length);
    }
  } catch (err) {
    emitLog("Erro ao sincronizar human_chats do Flask: " + err.message);
  }
}

async function startBot(client) {
  wppClient = client;
  console.log("🚀 WPPConnect iniciado com sucesso! Sessão ativa.");
  emitStatus("CONNECTED");
  emitLog("WPPConnect iniciado.");

  // atualiza lista inicial de human chats
  syncHumanChatsFromFlask();

  client.onStateChange((state) => {
    console.log('Estado da Conexão Alterado:', state);
    emitStatus(state);
    emitLog("StateChange: " + state);

    if (state === 'CONFLICT') {
      console.error("🚨 CONFLITO DE SESSÃO: Outro dispositivo abriu o WhatsApp Web. Tentando assumir.");
      client.useHere();
    }

    if (state === 'UNPAIRED' || state === 'UNLAUNCHED') {
      console.error("🚨 SESSÃO PERDIDA: Necessário novo QR Code. Reiniciando o processo...");
      emitLog("Sessão perdida, reiniciando para gerar novo QR.");
      client.close().then(() => {
        createClient();
      });
    }

    if (state === 'DISCONNECTED') {
      console.error("🚨 DESCONECTADO: A conexão foi perdida.");
      emitLog("DESCONEXÃO detectada.");
    }
  });

  client.onStreamChange((state) => {
    console.log('Estado do Stream Alterado:', state);
    emitLog("StreamChange: " + state);
    if (state === 'DISCONNECTED') {
      emitLog("STREAM DESCONECTADO.");
    }
  });

  client.onMessage(async (msg) => {
    if (!wppClient) {
      emitLog("Cliente WPP não ativo. Ignorando mensagem.");
      return;
    }

    try {
      if (!msg.from || msg.isGroupMsg) return;

      const userNumber = msg.from.replace("@c.us", "");
      const user_id = msg.from;
      const question = msg.body?.trim() || "";

      if (!question) return;

      let userName = "Desconhecido";
      try {
        const contact = await client.getContact(msg.from);
        userName = contact.pushname || contact.name || userNumber;
      } catch (contactError) {
        emitLog("Erro ao obter contato: " + contactError.message);
      }

      emitLog(`Mensagem recebida de ${userName} (${userNumber}): ${question}`);

      let botAnswer = "Desculpe, ocorreu um erro desconhecido ao processar sua mensagem.";
      let transfer = false;

      try {
        const response = await axios.post(FLASK_API_URL, {
          question,
          user_id: userNumber,
          user_name: userName
        });

        botAnswer = response.data.answer;
        transfer = get_human_chats(response.data.status);
        emitLog("Resposta do bot obtida do Flask. status=" + response.data.status);

        // se foi transferido, atualiza lista local e emite para painel
        if (response.data.status === "TRANSFERIDO" || response.data.status === "MANTIDO_HUMANO") {
          // Pede nova lista ao Flask e emite
          await syncHumanChatsFromFlask();
        }

      } catch (apiError) {
        console.error("❌ ERRO na comunicação com a API Flask:", apiError.message);
        emitLog("Erro comunicação Flask: " + apiError.message.substring(0, 120));
        botAnswer = `⚠️ ERRO DE COMUNICAÇÃO: Não foi possível conectar com nosso sistema.`;
        transfer = false;
      }

      if (!transfer) {
        try {
          await client.sendText(msg.from, botAnswer);
          emitLog(`Resposta enviada a ${userNumber}`);
        } catch (err) {
          emitLog("Erro ao enviar resposta: " + err.message);
        }
      } else {
        emitLog(`Mensagem transferida para humano: ${userNumber}`);
      }

    } catch (err) {
      console.error("❌ ERRO GERAL ao processar mensagem:", err.message);
      emitLog("Erro geral onMessage: " + err.message);
      if (err.message.includes('Session not active')) {
        emitLog("Session not active detectada.");
      }
    }
  });

  // opcional: atualiza human_chats periodicamente (ex: a cada 20s)
  setInterval(syncHumanChatsFromFlask, 20000);
}

// inicia
createClient();
