// index.js (wppconnect-app)
const wppconnect = require('@wppconnect-team/wppconnect');
const axios = require('axios');
const { emitStatus, emitQR, emitLog, emitHumanChats, panelEvents, emitFlaskHealth } = require('./painel_socket');
const { server } = require('./server'); // Importa o servidor HTTP configurado

// URL DO SEU FLASK - ajustar para seu endpoint real (prod/ngrok)
const FLASK_API_URL_BASE = "http://localhost:5000";
const FLASK_API_URL = `${FLASK_API_URL_BASE}/chat`;

let wppClient = null;
let human_chats = [];
let isInitializing = false;

/**
 * Função que cria o cliente WPPConnect
 */
async function createClient() {
  if (isInitializing) return;
  isInitializing = true;

  console.log("Iniciando tentativa de conexão WPPConnect...");
  emitLog("Iniciando WPPConnect...");

  try {
    const client = await wppconnect.create({
      session: "escola_amparo",
      catchQR: (qrCode, asciiQR) => {
        console.log("=================================================");
        console.log("🚨 ATENÇÃO: É NECESSÁRIO ESCANEAR O QR CODE!");
        console.log("=================================================");
        emitQR(qrCode);
        emitStatus("WAITING_FOR_QR");
        emitLog("QR Code gerado. Aguardando leitura...");
      },
      statusFind: (status, session) => {
        console.log('Status da Sessão:', status);
        emitStatus(status);
        emitLog('Status da Sessão: ' + status);
      },
      autoClose: 0,
      headless: true,
      logQR: false,
      waitForLogin: true,
      updatesLog: false,
      disableWelcome: true,
      browserArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    isInitializing = false;
    startBot(client);
  } catch (error) {
    isInitializing = false;
    console.error("❌ ERRO CRÍTICO na inicialização do WPPConnect:", error.message);
    emitLog("ERRO CRÍTICO na inicialização: " + error.message);
    emitStatus("ERROR");
    
    // Tenta reiniciar após 10s em caso de falha na criação
    setTimeout(createClient, 10000);
  }
}

function get_human_chats_status(status) {
  return status === 'MANTIDO_HUMANO' || status === 'TRANSFERIDO';
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
    const r = await axios.get(`${FLASK_API_URL_BASE}/chat/humanChats`);

    emitFlaskHealth(true); 
    if (r.data && r.data.human_chats) {
      human_chats = r.data.human_chats;
      emitHumanChats(human_chats);
      console.log("Sincronizado human_chats com Flask: " + human_chats.length);
    }
  } catch (err) {
    console.error("Erro ao sincronizar human_chats:", err.message);
    // Não emite log para o painel se for erro de conexão recusada (Flask offline)
    emitFlaskHealth(false);
    if (!err.message.includes('ECONNREFUSED')) {
        emitLog("Erro ao sincronizar atendimentos: " + err.message);
    }
  }
}

async function startBot(client) {
  wppClient = client;
  console.log("🚀 WPPConnect iniciado com sucesso! Sessão ativa.");
  emitStatus("CONNECTED");
  emitLog("WhatsApp conectado e pronto.");

  syncHumanChatsFromFlask();

  panelEvents.on('request_human_chats', () => {
    syncHumanChatsFromFlask();
  });

  panelEvents.on('panel_ready', () => {
    if (wppClient) {
      emitStatus("CONNECTED");
      syncHumanChatsFromFlask();
    } else {
        emitStatus("DISCONNECTED");
    }
  });

  client.onStateChange((state) => {
    console.log('Estado da Conexão Alterado:', state);
    emitStatus(state);
    emitLog("Estado alterado: " + state);

    if (state === 'CONFLICT' || state === 'UNPAIRED' || state === 'UNLAUNCHED') {
        wppClient = null;
        client.close().catch(() => {});
        setTimeout(createClient, 5000);
    }
  });

  client.onMessage(async (msg) => {
    if (!wppClient) return;

    try {
      if (!msg.from || msg.isGroupMsg || msg.type === 'status_v3') return;

      const userNumber = msg.from.replace("@c.us", "");
      const question = msg.body?.trim() || "";

      if (!question) return;

      let userName = "Desconhecido";
      try {
        const contact = await client.getContact(msg.from);
        userName = contact.pushname || contact.name || userNumber;
      } catch (e) {}

      emitLog(`Mensagem de ${userName}: ${question.substring(0, 50)}${question.length > 50 ? '...' : ''}`);
      let botAnswer = "Desculpe, ocorreu um erro desconhecido ao processar sua mensagem.";
      let transfer = false;

      try {
        const response = await axios.post(FLASK_API_URL, {
          question,
          user_id: userNumber,
          user_name: userName
        });

        const botAnswer = response.data.answer;
        const isHuman = get_human_chats_status(response.data.status);
        transfer = get_human_chats(response.data.status);


        // se foi transferido, atualiza lista local e emite para painel
        if (response.data.status === "TRANSFERIDO" || response.data.status === "MANTIDO_HUMANO") {
          // Pede nova lista ao Flask e emite
          await syncHumanChatsFromFlask();
        } 

        if (!transfer) {
          try {
            await client.sendText(msg.from, botAnswer);
            emitLog(`Resposta enviada a ${userName}: ${botAnswer.substring(0, 50)}${botAnswer.length > 50 ? '...' : ''}`);
          } catch (err) {
            emitLog("Erro ao enviar resposta: " + err.message);
          }
        } else {
          emitLog(`Mensagem transferida para humano: ${userName}`);
        }

      } catch (apiError) {
        console.error("Erro Flask:", apiError.message);
        emitLog("Erro na API de resposta (Flask): " + apiError.message);
      }

    } catch (err) {
      console.error("Erro onMessage:", err.message);
    }
  });

  setInterval(syncHumanChatsFromFlask, 60000);
}

// Inicia o processo do bot
createClient();
