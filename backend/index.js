// index.js (wppconnect-app)
require('dotenv').config();
const wppconnect = require('@wppconnect-team/wppconnect');
const axios = require('axios');
const { emitStatus, emitQR, emitLog, emitHumanChats, panelEvents, emitFlaskHealth } = require('./painel_socket');
require('./server'); // Garante que o servidor HTTP + Socket.IO seja iniciado

// URL DO SEU FLASK - ajustar para seu endpoint real (prod/ngrok)
const FLASK_API_URL_BASE = process.env.FLASK_API_URL_BASE || "http://localhost:5000";
const FLASK_API_URL = `${FLASK_API_URL_BASE}/chat`;

let wppClient = null;
let human_chats = [];
let isInitializing = false;
let syncInterval = null;
let panelListenersRegistered = false;

/**
 * Retorna true se o destino é uma conversa individual (segura para responder).
 * Bloqueia status@broadcast, listas de transmissão, newsletters e grupos.
 */
function isPrivateChat(jid) {
  return typeof jid === 'string' && (jid.endsWith('@c.us') || jid.endsWith('@lid'));
}

/**
 * Retorna true se a mensagem deve ser ignorada pelo bot.
 */
function shouldIgnoreMessage(msg) {
  return (
    !msg.from ||
    msg.fromMe ||
    msg.isGroupMsg ||
    msg.isStatusV3 ||
    msg.broadcast ||
    msg.type === 'status_v3' ||
    msg.from === 'status@broadcast' ||
    msg.from.endsWith('@broadcast') ||
    msg.from.endsWith('@newsletter') ||
    msg.from.endsWith('@g.us') ||
    !isPrivateChat(msg.from) ||
    msg.type !== 'chat' // só texto: em imagem/vídeo o body é base64, não texto
  );
}

/**
 * Status que indicam que o chat entrou/está na lista de atendimento humano
 * (usado para atualizar o painel).
 */
function isHumanStatus(status) {
  return status === 'MANTIDO_HUMANO' || status === 'TRANSFERIDO';
}

/**
 * Status em que o bot deve ficar em silêncio (humano já assumiu).
 * Em 'TRANSFERIDO' o bot ainda envia a resposta (aviso de transferência).
 */
function isBotSilenced(status) {
  return status === 'MANTIDO_HUMANO';
}

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
      session: process.env.SESSION_NAME || "escola_amparo",
      folderNameToken: process.env.TOKENS_FOLDER || "./tokens",
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

// sincroniza human_chats com Flask
async function syncHumanChatsFromFlask() {
  try {
    const r = await axios.get(`${FLASK_API_URL_BASE}/chat/humanChats`, { timeout: 10000 });

    emitFlaskHealth(true);
    if (r.data && r.data.human_chats) {
      human_chats = r.data.human_chats;
      emitHumanChats(human_chats);
      console.log("Sincronizado human_chats com Flask: " + human_chats.length);
    }
  } catch (err) {
    console.error("Erro ao sincronizar human_chats:", err.message);
    emitFlaskHealth(false, err.message);
    // Não emite log para o painel se for conexão recusada (Flask offline)
    if (!err.message.includes('ECONNREFUSED')) {
      emitLog("Erro ao sincronizar atendimentos: " + err.message);
    }
  }
}

/**
 * Registra os listeners do painel UMA única vez (evita acúmulo em reconexões).
 * Usam a variável global wppClient, então sempre refletem o cliente atual.
 */
function registerPanelListeners() {
  if (panelListenersRegistered) return;
  panelListenersRegistered = true;

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
}

function stopSyncInterval() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

async function startBot(client) {
  wppClient = client;
  console.log("🚀 WPPConnect iniciado com sucesso! Sessão ativa.");
  emitStatus("CONNECTED");
  emitLog("WhatsApp conectado e pronto.");

  registerPanelListeners();
  syncHumanChatsFromFlask();

  // Garante que exista só um intervalo ativo
  stopSyncInterval();
  syncInterval = setInterval(syncHumanChatsFromFlask, 60000);

  client.onStateChange((state) => {
    console.log('Estado da Conexão Alterado:', state);
    emitStatus(state);
    emitLog("Estado alterado: " + state);

    if (state === 'CONFLICT' || state === 'UNPAIRED' || state === 'UNLAUNCHED') {
      wppClient = null;
      stopSyncInterval();
      client.close().catch(() => {});
      setTimeout(createClient, 5000);
    }
  });

  client.onMessage(async (msg) => {
    if (!wppClient) return;

    try {
      // Ignora status/stories, broadcasts, newsletters, grupos, mídia e mensagens próprias
      if (shouldIgnoreMessage(msg)) return;

      const userNumber = msg.from.replace(/@(c\.us|lid)$/, "");
      const question = msg.body?.trim() || "";

      if (!question) return;

      let userName = userNumber;
      try {
        const contact = await client.getContact(msg.from);
        userName = contact.pushname || contact.name || userNumber;
      } catch (e) {}

      emitLog(`Mensagem de ${userName}: ${question.substring(0, 50)}${question.length > 50 ? '...' : ''}`);

      try {
        const response = await axios.post(
          FLASK_API_URL,
          {
            question,
            user_id: userNumber,
            user_name: userName
          },
          { timeout: 30000 }
        );

        const botAnswer = response.data?.answer;
        const status = response.data?.status;

        // se foi transferido (ou já está com humano), atualiza a lista e emite para o painel
        if (isHumanStatus(status)) {
          await syncHumanChatsFromFlask();
        }

        // humano já assumiu: bot fica em silêncio
        if (isBotSilenced(status)) {
          emitLog(`Mensagem encaminhada ao atendente humano: ${userName}`);
          return;
        }

        if (!botAnswer) {
          emitLog(`Flask não retornou resposta para ${userName}`);
          return;
        }

        // Trava de segurança: nunca envia para algo que não seja conversa individual
        if (!isPrivateChat(msg.from)) {
          emitLog(`Destino inválido ignorado: ${msg.from}`);
          return;
        }

        try {
          await client.sendText(msg.from, botAnswer);
          emitLog(`Resposta enviada a ${userName}: ${botAnswer.substring(0, 50)}${botAnswer.length > 50 ? '...' : ''}`);
        } catch (err) {
          emitLog("Erro ao enviar resposta: " + err.message);
        }
      } catch (apiError) {
        console.error("Erro Flask:", apiError.message);
        emitLog("Erro na API de resposta (Flask): " + apiError.message);
      }
    } catch (err) {
      console.error("Erro onMessage:", err.message);
    }
  });
}

// Inicia o processo do bot
createClient();