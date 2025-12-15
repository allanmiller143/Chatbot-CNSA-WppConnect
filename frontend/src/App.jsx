import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {Box,Card,CardContent,Typography,Button,List,ListItem,ListItemText,Divider,IconButton,Tooltip,Chip,Paper,Grid,Avatar,LinearProgress,Badge} from "@mui/material";
import RefreshIcon from '@mui/icons-material/Refresh';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import TerminalIcon from '@mui/icons-material/Terminal';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import LogoutIcon from '@mui/icons-material/Logout';
import Logo from '../assets/logo.png';

// Paleta de cores da escola
const colorScheme = {
  navy: '#003366',
  navyLight: '#1a4d80',
  white: '#FFFFFF',
  grayLight: '#f5f7fa',
  grayBorder: '#e0e5ec',
  success: '#28a745',
  warning: '#ffc107',
  error: '#dc3545'
};

export default function DashboardWPP() {
  const [status, setStatus] = useState("Desconectado");
  const [qrCode, setQrCode] = useState(null);
  const [logs, setLogs] = useState([]);
  const [humanChats, setHumanChats] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io("http://localhost:3000", {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("Painel conectado ao servidor");
      // eslint-disable-next-line react-hooks/immutability
      pushLog(`Socket conectado (${socket.id})`);
      socket.emit("panel_ready");
    });

    socket.on("disconnect", (reason) => {
      pushLog(`Socket desconectado: ${reason}`);
      setStatus("Desconectado do servidor");
    });

    socket.on("status_update", (s) => {
      setStatus(String(s));
      pushLog(`Status: ${s}`);
      if (s !== "UNPAIRED" && s !== "UNLAUNCHED" && s !== "DISCONNECTED") {
        setQrCode(null);
      }
    });

    socket.on("qr_code", (qr) => {
      setQrCode(qr);
      pushLog("QR Code recebido (novo).");
    });

    socket.on("log", (msg) => {
      // Filtrar logs de atualização de human_chats
      if (!msg.includes("human chats atualizado")) {
        pushLog(msg);
      }
    });

    socket.on("human_chats", (list) => {
      setHumanChats(list || []);
      // Não adiciona log para evitar poluição
    });

    // socket.emit("request_human_chats");

    return () => {
      socket.disconnect();
    };
  }, []);

  function pushLog(msg) {
    setLogs((prev) => {
      const next = [`${new Date().toLocaleTimeString()} - ${msg}`, ...prev]; // Inserir no início
      return next.slice(0, 200); // Manter apenas os 200 mais recentes
    });
  }

  const finalizar = async (user_id) => {
    try {
      const res = await fetch(`http://localhost:3000/finalizar/${encodeURIComponent(user_id)}`, {
        method: "POST"
      });
      if (res.ok) {
        pushLog(`Finalizar pedido enviado para ${user_id}`);
      } else {
        pushLog(`Erro ao finalizar ${user_id}: ${res.status}`);
      }
    } catch (err) {
      pushLog(`Erro fetch finalizar: ${err.message}`);
    }
  };

  const refreshHumanChats = () => {
    if (socketRef.current) {
      socketRef.current.emit("request_human_chats");
      pushLog("Pedido de atualização de atendimentos enviado.");
    }
  };

  const getStatusColor = (status) => {
    const s = status.toLowerCase();
    if (s.includes("conectado") || s.includes("ready") || s.includes("authenticated")) {
      return colorScheme.success;
    } else if (s.includes("desconectado") || s.includes("error")) {
      return colorScheme.error;
    } else if (s.includes("qr") || s.includes("pairing")) {
      return colorScheme.warning;
    }
    return colorScheme.navy;
  };

  return (
    <Box sx={{ 
      maxHeight: '100vh', 
      bgcolor: colorScheme.grayLight,
      p: { xs: 1, md: 3 }
    }}>
      {/* Header */}
      <Paper elevation={0} sx={{ 
        bgcolor: colorScheme.navy, 
        color: colorScheme.white,
        p: 3,
        mb: 3,
        borderRadius: 2,
        background: `linear-gradient(135deg, ${colorScheme.navy} 0%, ${colorScheme.navyLight} 100%)`
      }}>
        <Grid container alignItems="center" justifyContent="space-between">
          <Grid item>
            <Box display="flex" alignItems="center" gap={2}>
                <img 
                  src={Logo} 
                  alt="Logo" 
                  style={{ 
                    width: 100, 
                    height: 90,
                  }} 
                />
              <Box>
                <Typography variant="h4" fontWeight="bold">
                  Painel WPPConnect
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  Sistema de Gestão de Atendimentos
                </Typography>
              </Box>
            </Box>
          </Grid>
          <Grid item>
            <Tooltip title="Atualizar atendimentos">
              <IconButton 
                onClick={refreshHumanChats}
                sx={{ 
                  bgcolor: 'rgba(255,255,255,0.2)',
                  color: colorScheme.white,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' }
                }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={3}>
        {/* Coluna Esquerda - Ocupa 7 colunas */}
        <Grid item size={{ xs: 12, md: 7 }}>
          {/* Status Card */}
          <Card elevation={2} sx={{ 
            mb: 3, 
            borderLeft: `4px solid ${getStatusColor(status)}`,
            borderRadius: 2
          }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} mb={1}>
                {status.toLowerCase().includes("desconectado") ? (
                  <WarningAmberIcon sx={{ color: getStatusColor(status) }} />
                ) : (
                  <CheckCircleOutlineIcon sx={{ color: getStatusColor(status) }} />
                )}
                <Typography variant="h6" fontWeight="medium">
                  Status do Sistema
                </Typography>
              </Box>
              <Chip 
                label={status}
                sx={{ 
                  bgcolor: `${getStatusColor(status)}15`,
                  color: getStatusColor(status),
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  px: 2,
                  py: 1
                }}
              />

              <Divider sx={{ my: 3 }} />

              {qrCode && (
                  <Card elevation={0} sx={{ 
                    mb: 3, 
                    borderRadius: 2,
                  }}>
                      <Box display="flex" alignItems="center" justifyContent={'center'} gap={2} mb={2}>
                        <QrCodeScannerIcon sx={{ color: colorScheme.warning }} />
                        <Typography variant="h6" fontWeight="medium">
                          Autenticação Requerida
                        </Typography>
                      </Box>

                      <Box display="flex" justifyContent="center">
                        <Paper elevation={3} sx={{ 
                          p: 1, 
                          display: 'inline-block',
                          borderRadius: 2,
                          bgcolor: colorScheme.white
                        }}>
                          {qrCode.startsWith("data:") ? (
                            <img 
                              src={qrCode} 
                              alt="QR Code" 
                              style={{ 
                                width: 260, 
                                height: 260,
                                borderRadius: 8 
                              }} 
                            />
                          ) : (
                            <img 
                              src={`data:image/png;base64,${qrCode}`} 
                              alt="QR Code" 
                              style={{ 
                                width: 260, 
                                height: 260,
                                borderRadius: 8 
                              }} 
                            />
                          )}
                        </Paper>
                        
                      </Box>
                      <Typography variant="body2" color="text.secondary" paragraph align="center" sx={{ mt: 2 }}>
                        Escaneie o QR Code abaixo com seu WhatsApp para continuar:
                      </Typography>
                  </Card>
                )}
              {qrCode && (
                <LinearProgress sx={{ mt: 2 }} color="warning" />
              )}
            </CardContent>
          </Card>

          {/* QR Code Card */}
        
          {/* Logs Card */}
          <Card elevation={2} sx={{ 
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <CardContent sx={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column',
            
            }}>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <TerminalIcon sx={{ color: colorScheme.navy }} />
                <Typography variant="h6" fontWeight="medium">
                  Logs do Sistema
                </Typography>
              </Box>
              
              {/* Container dos Logs com altura fixa e scroll */}
              <Box sx={{ 
                flex: 1,
                height: 'calc(100vh - 10vh)', // Altura responsiva
                minHeight: '300px',
                maxHeight: '400px',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <Paper 
                  elevation={0}
                  sx={{ 
                    flex: 1,
                    overflowY: "auto",
                    bgcolor: '#1a1e2c',
                    color: '#c8d6e5',
                    p: 2,
                    borderRadius: 2,
                    fontFamily: "'Roboto Mono', monospace",
                    fontSize: '0.85rem',
                    '&::-webkit-scrollbar': {
                      width: '8px',
                    },
                    '&::-webkit-scrollbar-track': {
                      background: '#2d3748',
                      borderRadius: '4px'
                    },
                    '&::-webkit-scrollbar-thumb': {
                      background: colorScheme.navy,
                      borderRadius: '4px',
                      '&:hover': {
                        background: colorScheme.navyLight
                      }
                    }
                  }}
                >
                  {logs.length === 0 ? (
                    <Box sx={{ 
                      height: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center' 
                    }}>
                      <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        Aguardando logs...
                      </Typography>
                    </Box>
                  ) : (
                    logs.map((log, index) => (
                      <Box 
                        key={index} 
                        sx={{ 
                          py: 0.5,
                          borderBottom: index !== logs.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none'
                        }}
                      >
                        <span style={{ color: '#4ecdc4' }}>{log.split(' - ')[0]}</span>
                        <span style={{ color: '#ff9ff3', margin: '0 8px' }}>›</span>
                        <span>{log.split(' - ').slice(1).join(' - ')}</span>
                      </Box>
                    ))
                  )}
                </Paper>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Coluna Direita - Ocupa 5 colunas */}
        <Grid item size={{ xs: 12, md: 5 }}>
          <Card elevation={2} sx={{ 
            height: '100%',
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <CardContent sx={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column',
              p: 2 
            }}>
              <Box 
                display="flex" 
                alignItems="center" 
                justifyContent="space-between" 
                mb={2}
                sx={{
                  backgroundColor: colorScheme.grayLight,
                  p: 2,
                  borderRadius: 1,
                  border: `1px solid ${colorScheme.grayBorder}`
                }}
              >
                <Box display="flex" alignItems="center" gap={1.5}>
                  <Badge 
                    badgeContent={humanChats.length} 
                    color="error"
                    sx={{ 
                      '& .MuiBadge-badge': {
                        bgcolor: colorScheme.error,
                        fontSize: '0.75rem',
                        height: '18px',
                        minWidth: '18px'
                      }
                    }}
                  >
                    <PersonOutlineIcon sx={{ color: colorScheme.navy }} />
                  </Badge>
                  <Typography variant="h6" fontWeight="medium">
                    Atendimentos Ativos
                  </Typography>
                </Box>
                <Tooltip title="Atualizar atendimentos">
                  <IconButton 
                    onClick={refreshHumanChats}
                    sx={{ 
                      bgcolor: colorScheme.white,
                      color: colorScheme.navy,
                      border: `1px solid ${colorScheme.grayBorder}`,
                      '&:hover': { 
                        bgcolor: colorScheme.navy,
                        color: colorScheme.white
                      }
                    }}
                  >
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
              </Box>

              {humanChats.length === 0 ? (
                <Box 
                  textAlign="center" 
                  py={6}
                  sx={{ opacity: 0.6 }}
                >
                  <ChatBubbleOutlineIcon sx={{ fontSize: 48, color: colorScheme.grayBorder }} />
                  <Typography variant="body1" color="text.secondary" mt={2}>
                    Nenhum atendimento ativo
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ 
                  flex: 1,
                  display: 'flex', 
                  flexDirection: 'column',
                  height: 'calc(100vh - 350px)', // Mesma altura dos logs
                  minHeight: '300px',
                  maxHeight: '600px'
                }}>
                  <Typography variant="caption" color="text.secondary" mb={1}>
                    Clique no ícone para finalizar atendimento
                  </Typography>
                  
                  {/* Container da Lista com scroll */}
                  <Box sx={{ 
                    flex: 1,
                    overflow: 'hidden',
                    border: `1px solid ${colorScheme.grayBorder}`,
                    borderRadius: 1,
                    bgcolor: colorScheme.white
                  }}>
                    <List sx={{ 
                      height: '100%',
                      overflowY: 'auto',
                      p: 0,
                      '&::-webkit-scrollbar': {
                        width: '6px',
                      },
                      '&::-webkit-scrollbar-track': {
                        background: colorScheme.grayLight,
                        borderRadius: '3px'
                      },
                      '&::-webkit-scrollbar-thumb': {
                        background: colorScheme.grayBorder,
                        borderRadius: '3px',
                        '&:hover': {
                          background: colorScheme.navyLight
                        }
                      }
                    }}>
                      {humanChats.map((u, i) => (
                        <React.Fragment key={u.user_id || i}>
                          <ListItem
                            sx={{
                              py: 1.5,
                              px: 2,
                              '&:hover': {
                                bgcolor: colorScheme.grayLight,
                                borderRadius: 0
                              }
                            }}
                            secondaryAction={
                              <Tooltip title="Finalizar atendimento">
                                <IconButton
                                  onClick={() => finalizar(u.user_id || u.userId || u.id)}
                                  size="small"
                                  sx={{
                                    color: colorScheme.error,
                                    '&:hover': {
                                      bgcolor: colorScheme.error + '15'
                                    }
                                  }}
                                >
                                  <LogoutIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            }
                          >
                            <Avatar 
                              sx={{ 
                                bgcolor: colorScheme.navy + '20', 
                                color: colorScheme.navy,
                                mr: 2,
                                fontSize: '0.85rem',
                                width: 32,
                                height: 32
                              }}
                            >
                              {(u.user_name || u.name || u.userName || 'U').charAt(0).toUpperCase()}
                            </Avatar>
                            <ListItemText
                              primary={
                                <Typography 
                                  fontWeight="medium" 
                                  color={colorScheme.navy}
                                  fontSize="0.9rem"
                                  noWrap
                                >
                                  {u.user_name || u.name || u.userName || 'Usuário'}
                                </Typography>
                              }
                              secondary={
                                <Typography 
                                  variant="caption" 
                                  color="text.secondary"
                                  sx={{
                                    display: 'block',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    fontSize: '0.75rem'
                                  }}
                                >
                                  ID: {u.user_id || u.id || 'N/A'}
                                </Typography>
                              }
                              sx={{ 
                                '& .MuiListItemText-secondary': {
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }
                              }}
                            />
                          </ListItem>
                          {i < humanChats.length - 1 && (
                            <Divider sx={{ mx: 2 }} />
                          )}
                        </React.Fragment>
                      ))}
                    </List>
                  </Box>
                </Box>
              )}
            </CardContent>
            
            {/* Footer do Card */}
            <Box sx={{ 
              p: 2, 
              bgcolor: colorScheme.navy + '05',
              borderTop: `1px solid ${colorScheme.grayBorder}`,
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 8
            }}>
              <Typography variant="caption" color="text.secondary">
                {humanChats.length} atendimento{humanChats.length !== 1 ? 's' : ''} em andamento • Atualizado em {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </Typography>
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}