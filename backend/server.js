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

// --- ajuste a URL do seu Flask aqui ---
const FLASK_API_URL_BASE = "http://localhost:5000"; // se seu Flask rodar em 5000 (local)
const FLASK_CHAT_REMOVE = `${FLASK_API_URL_BASE}/chat/remove`;
const FLASK_CHAT_HUMANCHATS = `${FLASK_API_URL_BASE}/chat/humanChats`;

// endpoint simples healthcheck
app.get("/", (req, res) => res.send("Servidor WPPConnect + Socket.IO ativo"));

// endpoint para finalizar atendimento (chamado pelo painel)
app.post("/finalizar/:user_id", async (req, res) => {
  const user_id = req.params.user_id;
  try {
    // repassa para Flask
    const r = await axios.post(FLASK_CHAT_REMOVE, { user_id });
    emitLog(`Finalizar pedido repassado para Flask para ${user_id}`);
    // atualiza lista de human_chats requisitando do Flask
    try {
      const hh = await axios.get(FLASK_CHAT_HUMANCHATS);
      if (hh.data && hh.data.human_chats) {
        emitHumanChats(hh.data.human_chats);
      }
    } catch (err) {
      emitLog("Erro ao buscar human_chats do Flask: " + err.message);
    }
    return res.json({ status: "OK", forwarded: true, flask: r.data || null });
  } catch (err) {
    console.error("Erro finalizar:", err.message);
    emitLog("Erro finalizar: " + err.message);
    return res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// cria http server e Socket.IO
const server = http.createServer(app);
initSocketIO(server);

// começa o servidor
const PORT = 3000;
server.listen(PORT, () => console.log(`HTTP + Socket.IO rodando em http://localhost:${PORT}`));

// Exportar funções para outros módulos (para que o wppconnect principal chame emitStatus etc.)
module.exports = {
  emitStatus,
  emitQR,
  emitLog,
  emitHumanChats
};
