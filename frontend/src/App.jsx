import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip,
  Paper,
  Grid,
  Avatar,
  Badge,
  Alert,
  AlertTitle
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import TerminalIcon from "@mui/icons-material/Terminal";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import LogoutIcon from "@mui/icons-material/Logout";
import Logo from "../assets/logo.png";

const colorScheme = {
  navy: "#003366",
  navyLight: "#1a4d80",
  white: "#FFFFFF",
  grayLight: "#f5f7fa",
  grayBorder: "#e0e5ec",
  success: "#28a745",
  warning: "#ffc107",
  error: "#dc3545"
};

export default function DashboardWPP() {
  const [status, setStatus] = useState("Conectando...");
  const [qrCode, setQrCode] = useState(null);
  const [logs, setLogs] = useState([]);
  const [humanChats, setHumanChats] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [flaskOnline, setFlaskOnline] = useState(true);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io("http://localhost:3000", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setStatus("Painel conectado");
      pushLog("Socket conectado ao servidor.");
      socket.emit("panel_ready");
    });

    socket.on("connect_error", (err) => {
      setIsConnected(false);
      setStatus("Erro de conexão");
      console.error("Erro de conexão socket:", err);
    });

    socket.on("disconnect", (reason) => {
      setIsConnected(false);
      pushLog(`Socket desconectado: ${reason}`);
      setStatus("Desconectado");
    });

    socket.on("status_update", (s) => {
      const translatedStatus = translateStatus(s);
      setStatus(translatedStatus);
      pushLog(`Status WhatsApp: ${translatedStatus}`);

      if (s === "CONNECTED" || s === "isLogged" || s === "qrReadSuccess") {
        setQrCode(null);
      }
    });

    socket.on("qr_code", (qr) => {
      setQrCode(qr);
      setStatus("Aguardando QR Code");
      pushLog("Novo QR Code recebido.");
    });

    socket.on("log", (msg) => {
      pushLog(msg);
    });

    socket.on("human_chats", (list) => {
      setHumanChats(list || []);
    });

    socket.on("flask_health", (data) => {
      setFlaskOnline(!!data?.healthy);
      if (!data?.healthy) {
        pushLog("Alerta: sistema de respostas desconectado.");
      }
    });

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("status_update");
      socket.off("qr_code");
      socket.off("log");
      socket.off("human_chats");
      socket.off("flask_health");
      socket.disconnect();
    };
  }, []);

  function translateStatus(s) {
    const statusMap = {
      CONNECTED: "Conectado",
      isLogged: "Autenticado",
      qrReadSuccess: "QR Code lido",
      WAITING_FOR_QR: "Aguardando QR Code",
      CONFLICT: "Conflito de sessão",
      UNPAIRED: "Desconectado do celular",
      UNLAUNCHED: "Sessão não iniciada",
      DISCONNECTED: "Desconectado",
      AUTHENTICATING: "Autenticando...",
      ERROR: "Erro na conexão",
      disconnectedMobile: "Desconectado do celular",
      OPENNING: "Abrindo sessão...",
      browserClose: "Desconectado",
      PAIRING: "Emparelhando...",
      notLogged: "Desconectado",
    };

    return statusMap[s] || s;
  }

  function pushLog(msg) {
    setLogs((prev) => {
      const timestamp = new Date().toLocaleTimeString();
      const newEntry = `${timestamp} - ${msg}`;
      if (prev.length > 0 && prev[0].includes(msg)) return prev;
      return [newEntry, ...prev].slice(0, 100);
    });
  }

  const finalizar = async (user_id) => {
    if (!user_id) return;

    try {
      pushLog(`Finalizando atendimento para ${user_id}...`);

      const res = await fetch(
        `http://localhost:3000/finalizar/${encodeURIComponent(user_id)}`,
        { method: "POST" }
      );

      if (res.ok) {
        pushLog("Atendimento finalizado.");
        refreshHumanChats();
      } else {
        pushLog(`Erro ao finalizar: ${res.status}`);
      }
    } catch (err) {
      pushLog(`Erro de rede: ${err.message}`);
    }
  };

  const refreshHumanChats = () => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("request_human_chats");
      pushLog("Solicitando atualização...");
    } else {
      pushLog("Erro: sem conexão com o servidor.");
    }
  };

  const getSystemState = () => {
    const s = status.toLowerCase().trim();

    if (!isConnected) {
      return {
        color: colorScheme.error,
        icon: <WarningAmberIcon sx={{ color: colorScheme.error }} />,
        label: "Painel desconectado",
        subtitle: "O painel perdeu a conexão com o servidor."
      };
    }

    if (!flaskOnline) {
      return {
        color: colorScheme.error,
        icon: <WarningAmberIcon sx={{ color: colorScheme.error }} />,
        label: "Atendimento automático indisponível",
        subtitle: "O WhatsApp está conectado, mas o sistema de respostas está fora do ar."
      };
    }

    if (
      s.includes("aguardando qr") ||
      s.includes("desconectado do celular") ||
      s.includes("desconectado") ||
      s.includes("sessão não iniciada") ||
      s.includes("conflito")
    ) {
      return {
        color: colorScheme.warning,
        icon: <WarningAmberIcon sx={{ color: colorScheme.warning }} />,
        label: "WhatsApp precisa de atenção",
        subtitle: "É necessário reconectar o WhatsApp para voltar a responder mensagens."
      };
    }

    if (
      s.includes("autenticando") ||
      s.includes("abrindo") ||
      s.includes("emparelhando") ||
      s.includes("conectando")
    ) {
      return {
        color: colorScheme.warning,
        icon: <WarningAmberIcon sx={{ color: colorScheme.warning }} />,
        label: "Sistema em preparação",
        subtitle: "O atendimento automático está iniciando."
      };
    }

    return {
      color: colorScheme.success,
      icon: <CheckCircleOutlineIcon sx={{ color: colorScheme.success }} />,
      label: "Sistema funcionando normalmente",
      subtitle: "O painel, o WhatsApp e o atendimento automático estão operando corretamente."
    };
  };

  const systemState = getSystemState();

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Paper
        elevation={0}
        sx={{
          bgcolor: colorScheme.navy,
          color: colorScheme.white,
          p: 3,
          mb: 3,
          borderRadius: 2,
        }}
      >
        <Grid container alignItems="center" justifyContent="space-between">
          <Grid item>
            <Box display="flex" alignItems="center" gap={2}>
              <img src={Logo} alt="Logo" style={{ width: 60, height: "auto" }} />
              <Box>
                <Typography variant="h5" fontWeight="bold">
                  Painel WPPConnect
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  Gestão de Atendimento
                </Typography>
              </Box>
            </Box>
          </Grid>

          <Grid item>
            <Tooltip title="Atualizar atendimentos">
              <IconButton
                onClick={refreshHumanChats}
                sx={{ color: "white", bgcolor: "rgba(255,255,255,0.1)" }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={3}>
        <Grid item size={{ xs: 12, md: 8 }}>
          <Card sx={{ mb: 3, borderLeft: `6px solid ${systemState.color}` }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                {systemState.icon}

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Situação atual do sistema
                  </Typography>
                  <Typography
                    variant="h6"
                    fontWeight="bold"
                    color={systemState.color}
                  >
                    {systemState.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {systemState.subtitle}
                  </Typography>
                </Box>
              </Box>

              {qrCode && (
                <Box
                  sx={{
                    mt: 2,
                    textAlign: "center",
                    p: 2,
                    border: "1px dashed orange",
                    borderRadius: 2,
                    bgcolor: "#fff8e1",
                  }}
                >
                  <Typography variant="subtitle2" color="orange" mb={1}>
                    Escaneie o QR Code para reconectar o WhatsApp
                  </Typography>
                  <img
                    src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code para conexão do WhatsApp"
                    style={{ width: 200, borderRadius: 8 }}
                  />
                </Box>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography
                variant="h6"
                gutterBottom
                display="flex"
                alignItems="center"
                gap={1}
              >
                <TerminalIcon fontSize="small" />
                Logs do sistema
              </Typography>

              <Paper
                sx={{
                  height: 350,
                  overflowY: "auto",
                  bgcolor: "#1a1e2c",
                  color: "#fff",
                  p: 2,
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                }}
              >
                {logs.map((log, i) => (
                  <Box key={i} sx={{ py: 0.2, borderBottom: "1px solid #222" }}>
                    <span style={{ color: "#4ecdc4" }}>{log.split(" - ")[0]}</span> -{" "}
                    {log.split(" - ").slice(1).join(" - ")}
                  </Box>
                ))}
              </Paper>
            </CardContent>
          </Card>
        </Grid>

        <Grid item size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h6" display="flex" alignItems="center" gap={1}>
                  <Badge badgeContent={humanChats.length} color="error">
                    <PersonOutlineIcon />
                  </Badge>
                  Atendimentos em pendência
                </Typography>

                <IconButton size="small" onClick={refreshHumanChats}>
                  <RefreshIcon />
                </IconButton>
              </Box>

              <Typography variant="caption" color="text.secondary" mb={2}>
                Conversas que precisam de intervenção humana. Clique no ícone para finalizar.
              </Typography>

              <List
                sx={{
                  border: "1px solid #eee",
                  borderRadius: 1,
                  maxHeight: 500,
                  overflowY: "auto",
                }}
              >
                {humanChats.length === 0 ? (
                  <Typography align="center" py={5} color="text.secondary">
                    Nenhum atendimento em pendência
                  </Typography>
                ) : (
                  humanChats.map((chat, i) => (
                    <ListItem
                      key={i}
                      secondaryAction={
                        <IconButton
                          color="error"
                          onClick={() => finalizar(chat.user_id)}
                        >
                          <LogoutIcon />
                        </IconButton>
                      }
                    >
                      <Avatar sx={{ bgcolor: colorScheme.navy, mr: 2 }}>
                        {(chat.user_name || "U")[0]}
                      </Avatar>
                      <ListItemText
                        primary={chat.user_name || "Usuário"}
                        secondary={chat.user_id}
                      />
                    </ListItem>
                  ))
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}