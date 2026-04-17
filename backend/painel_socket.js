// painel_socket.js
const { Server } = require("socket.io");
const { EventEmitter } = require('events');

let ioInstance = null;
const panelEvents = new EventEmitter();

function initSocketIO(httpServer) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  ioInstance.on("connection", (socket) => {
    console.log("🖥️ Painel conectado:", socket.id);

    socket.on("request_human_chats", () => {
      // repassa pedido para backend (se houver listener) - o servidor wppconnect deve emitir human_chats periodicamente
      if (ioInstance) {
        console.log("Painel solicitou atualização de human_chats.");
        // notifica listeners internos para que possam sincronizar sob demanda
        panelEvents.emit('request_human_chats');
      }
    });

    socket.on("panel_ready", () => {
      // painel abriu — você pode responder com estado atual se quiser
      console.log("Painel pronto:", socket.id);
    });
  });

  console.log("🔌 Socket.IO do painel inicializado!");
}

function emitStatus(status) {
  if (ioInstance) ioInstance.emit("status_update", status);
}

function emitQR(qr) {
  if (ioInstance) ioInstance.emit("qr_code", qr);
}

function emitLog(msg) {
  if (ioInstance) ioInstance.emit("log", msg);
}

function emitHumanChats(list) {
  if (ioInstance) ioInstance.emit("human_chats", list);
}

function emitFlaskHealth(healthy, message) {
  if (ioInstance) ioInstance.emit("flask_health", { healthy: !!healthy, message: String(message || '') });
}

module.exports = {
  initSocketIO,
  emitStatus,
  emitQR,
  emitLog,
  emitHumanChats
};

// exporta o EventEmitter para que outros módulos possam escutar pedidos do painel
module.exports.panelEvents = panelEvents;
module.exports.emitFlaskHealth = emitFlaskHealth;
