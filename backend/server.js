// server.js
const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const cors = require("cors");
const {
  initSocketIO,
  emitStatus,
  emitQR,
  emitLog,
  emitHumanChats
} = require("./painel_socket");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());
app.use(cors());

const FLASK_API_URL_BASE = "http://localhost:5000";
const FLASK_CHAT_REMOVE = `${FLASK_API_URL_BASE}/chat/remove`;
const FLASK_CHAT_HUMANCHATS = `${FLASK_API_URL_BASE}/chat/humanChats`;

app.get("/", (req, res) => res.send("Servidor WPPConnect + Socket.IO ativo"));

app.post("/finalizar/:user_id", async (req, res) => {
  const user_id = req.params.user_id;
  try {
    const r = await axios.post(FLASK_CHAT_REMOVE, { user_id });
    emitLog(`Finalizar pedido repassado para Flask para ${user_id}`);
    try {
      const hh = await axios.get(FLASK_CHAT_HUMANCHATS);
      if (hh.data && hh.data.human_chats) {
        emitHumanChats(hh.data.human_chats);
      }
    } catch (err) {
      console.error("Erro ao buscar human_chats do Flask:", err.message);
    }
    return res.json({ status: "OK", forwarded: true, flask: r.data || null });
  } catch (err) {
    console.error("Erro finalizar:", err.message);
    emitLog("Erro finalizar: " + err.message);
    return res.status(500).json({ status: "ERROR", message: err.message });
  }
});

const server = http.createServer(app);
initSocketIO(server);

const PORT = 3000;
server.listen(PORT, () => console.log(`HTTP + Socket.IO rodando em http://localhost:${PORT}`));

// Exportamos o server para que o index.js possa garantir que ele foi carregado
module.exports = {
  server,
  emitStatus,
  emitQR,
  emitLog,
  emitHumanChats
};
