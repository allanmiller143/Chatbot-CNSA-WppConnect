// painel_socket.js
const { Server } = require("socket.io");
const { EventEmitter } = require('events');

let ioInstance = null;
const panelEvents = new EventEmitter();

function initSocketIO(httpServer) {
  if (ioInstance) return ioInstance;

  ioInstance = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  ioInstance.on("connection", (socket) => {
    console.log("🖥️ Painel conectado:", socket.id);

    socket.on("request_human_chats", () => {
      console.log("Painel solicitou atualização de human_chats.");
      panelEvents.emit('request_human_chats');
    });

    socket.on("panel_ready", () => {
      console.log("Painel pronto:", socket.id);
      panelEvents.emit('panel_ready');
    });

    socket.on("disconnect", () => {
      console.log("🖥️ Painel desconectado:", socket.id);
    });
  });

  console.log("🔌 Socket.IO do painel inicializado!");
  return ioInstance;
}

function getIO() {
  return ioInstance;
}

function emitStatus(status) {
  if (ioInstance) {
    console.log("Emitting status_update:", status);
    ioInstance.emit("status_update", status);
  }
}

function emitQR(qr) {
  if (ioInstance) {
    console.log("Emitting qr_code");
    ioInstance.emit("qr_code", qr);
  }
}

function emitLog(msg) {
  if (ioInstance) {
    ioInstance.emit("log", msg);
  }
}

function emitHumanChats(list) {
  if (ioInstance) {
    ioInstance.emit("human_chats", list);
  }
}

function emitFlaskHealth(healthy, message) {
  if (ioInstance) {
    ioInstance.emit("flask_health", { healthy: !!healthy, message: String(message || '') });
  }
}

module.exports = {
  initSocketIO,
  getIO,
  emitStatus,
  emitQR,
  emitLog,
  emitHumanChats,
  emitFlaskHealth,
  panelEvents
};
