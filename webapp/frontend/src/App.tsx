import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChatEntry,
  GameStatePayload,
  RoomState,
  RoomSummary,
} from './types';
import {
  createRoom,
  fetchRooms,
  fetchServerStatus,
  getOrCreateSessionToken,
  getSavedNickname,
  joinRoom,
  leaveRoomApi,
  normalizeGameState,
  normalizeRoomState,
  saveNickname,
} from './api';
import { LobbyView } from './components/LobbyView';
import { GameTableView } from './components/GameTableView';
import {
  Crown,
  KeyRound,
  Layers,
  Lock,
  LogIn,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Swords,
  User,
  Users,
} from 'lucide-react';

export const App: React.FC = () => {
  const [sessionToken] = useState<string>(() => getOrCreateSessionToken());
  const [nickname, setNickname] = useState<string>(() => getSavedNickname());

  // Server & Room Directory state
  const [serverInfo, setServerInfo] = useState<{
    version: string;
    loadedCards: number;
  } | null>(null);
  const [roomsList, setRoomsList] = useState<RoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Create Room form state
  const [newRoomId, setNewRoomId] = useState('');
  const [newRoomName, setNewRoomName] = useState('Tavolo Commander dei Planeswalker');
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [newRoomFormat, setNewRoomFormat] = useState<'COMMANDER' | 'CONSTRUCTED'>(
    'COMMANDER'
  );
  const [newRoomMaxPlayers, setNewRoomMaxPlayers] = useState<number>(4);
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Join Room by ID form state
  const [joinRoomIdInput, setJoinRoomIdInput] = useState('');
  const [joinPasswordInput, setJoinPasswordInput] = useState('');
  const [joiningRoom, setJoiningRoom] = useState(false);

  // Active Room & Game state
  const [activeRoom, setActiveRoom] = useState<RoomState | null>(null);
  const [activePassword, setActivePassword] = useState<string>('');
  const [gameState, setGameState] = useState<GameStatePayload | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const refreshLobbyDirectory = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const [statusData, rList] = await Promise.all([
        fetchServerStatus(),
        fetchRooms(sessionToken),
      ]);
      setServerInfo(statusData);
      setRoomsList(rList);
    } catch {
      // ignore transient network errors on background poll
    } finally {
      setLoadingRooms(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    refreshLobbyDirectory();
    const interval = window.setInterval(() => {
      if (!activeRoom) {
        refreshLobbyDirectory();
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [activeRoom, refreshLobbyDirectory]);

  // Connect WebSocket when activeRoom is present
  useEffect(() => {
    if (!activeRoom?.roomId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    const currentRoomId = activeRoom.roomId;
    let unmounted = false;
    let authRejected = false;

    const connectWs = () => {
      if (unmounted || authRejected) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws`;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (unmounted) return;
        setWsConnected(true);
        socket.send(
          JSON.stringify({
            type: 'AUTH',
            roomId: currentRoomId,
            sessionToken,
            nickname,
            password: activePassword,
          })
        );
      };

      socket.onmessage = (event) => {
        if (unmounted) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'AUTH_ERROR') {
            authRejected = true;
            setGlobalError(msg.message || 'Accesso alla stanza negato.');
            setActiveRoom(null);
            setGameState(null);
            socket.close();
            return;
          }
          if (msg.type === 'ROOM_STATE' && msg.room) {
            const normRoom = normalizeRoomState(msg.room);
            setActiveRoom(normRoom);
            if (normRoom.chatHistory) {
              setChatMessages(normRoom.chatHistory);
            }
          } else if (msg.type === 'GAME_STATE' && (msg.state || msg.game)) {
            const normGame = normalizeGameState(msg.state || msg.game);
            if (normGame) {
              setGameState(normGame);
            }
          } else if (msg.type === 'CHAT' && msg.entry) {
            setChatMessages((prev) => [...prev, msg.entry]);
          } else if (msg.type === 'ERROR' && msg.message) {
            setGlobalError(msg.message);
          }
        } catch {
          // Silently ignore malformed WebSocket frames without logging to browser console
        }
      };

      socket.onclose = () => {
        if (unmounted || authRejected) return;
        setWsConnected(false);
        reconnectTimerRef.current = window.setTimeout(connectWs, 2000);
      };
    };

    connectWs();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [activeRoom?.roomId, sessionToken, nickname, activePassword]);

  const sendWsMessage = useCallback((payload: Record<string, any>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const handleNicknameChange = (val: string) => {
    setNickname(val);
    saveNickname(val);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingRoom(true);
    setGlobalError(null);
    try {
      const res = await createRoom({
        roomId: newRoomId.trim() || undefined,
        roomName: newRoomName.trim() || `Tavolo di ${nickname}`,
        password: newRoomPassword,
        format: newRoomFormat,
        maxPlayers: newRoomMaxPlayers,
        sessionToken,
        nickname: nickname.trim() || 'Planeswalker',
      });
      setActivePassword(newRoomPassword);
      setGameState(null);
      setChatMessages(res.room.chatHistory || []);
      setActiveRoom(res.room);
    } catch (err: any) {
      setGlobalError(err.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleJoinRoomSubmit = async (
    targetRoomId: string,
    passwordToUse: string
  ) => {
    if (!targetRoomId.trim()) return;
    setJoiningRoom(true);
    setGlobalError(null);
    try {
      const res = await joinRoom(targetRoomId.trim(), {
        sessionToken,
        nickname: nickname.trim() || 'Planeswalker',
        password: passwordToUse,
      });
      setActivePassword(passwordToUse);
      setChatMessages(res.room.chatHistory || []);
      setActiveRoom(res.room);
    } catch (err: any) {
      setGlobalError(err.message);
    } finally {
      setJoiningRoom(false);
    }
  };

  const handleLeaveRoom = async () => {
    const roomIdToLeave = activeRoom?.roomId;
    setActiveRoom(null);
    setGameState(null);
    setGlobalError(null);
    if (roomIdToLeave) {
      try {
        await leaveRoomApi(roomIdToLeave, sessionToken);
      } catch {
        // Ignore transient network failure when leaving
      }
    }
    refreshLobbyDirectory();
  };

  const handleReturnToLobby = () => {
    setGameState(null);
    setGlobalError(null);
    sendWsMessage({ type: 'REQUEST_STATE' });
  };

  // RENDER 1: ACTIVE GAME TABLE
  if (activeRoom && (activeRoom.status === 'IN_GAME' || gameState) && gameState) {
    return (
      <>
        {!wsConnected && (
          <div className="ws-reconnect-banner">
            ⟳ Riconnessione al tavolo in corso...
          </div>
        )}
        <GameTableView
          gameState={gameState}
          chatMessages={chatMessages}
          onSendWs={sendWsMessage}
          onReturnToLobby={handleReturnToLobby}
          onLeaveRoom={handleLeaveRoom}
        />
      </>
    );
  }

  // RENDER 2: ROOM LOBBY
  if (activeRoom) {
    return (
      <div className="app-wrapper">
        {!wsConnected && (
          <div className="ws-reconnect-banner">
            ⟳ Connessione in tempo reale in corso...
          </div>
        )}
        <LobbyView
          room={activeRoom}
          sessionToken={sessionToken}
          nickname={nickname}
          chatMessages={chatMessages}
          onSendWs={sendWsMessage}
          onRoomUpdated={(r) => setActiveRoom(r)}
          onLeaveRoom={handleLeaveRoom}
        />
      </div>
    );
  }

  // RENDER 3: HOME / ROOM HUB
  return (
    <div className="home-screen">
      {/* Top Navigation & Player Recognition Bar */}
      <nav className="top-navbar">
        <div className="brand-cluster">
          <div className="brand-emblem">
            <Swords size={22} />
          </div>
          <div>
            <span className="brand-title">LOZZANDER ONLINE</span>
            <span className="brand-sub">
              Multiplayer Web Engine • Commander &amp; Constructed
            </span>
          </div>
        </div>

        <div className="identity-bar">
          <div className="identity-input-group">
            <User size={15} className="gold-icon" />
            <label htmlFor="nickname-input">Il tuo Nickname:</label>
            <input
              id="nickname-input"
              type="text"
              value={nickname}
              onChange={(e) => handleNicknameChange(e.target.value)}
              placeholder="Il tuo nome al tavolo..."
            />
          </div>
          <div
            className="session-pill"
            title="La tua sessione è protetta da un token crittografico salvato localmente per riconoscerti al tavolo"
          >
            <ShieldCheck size={14} className="emerald-icon" /> Sessione Protetta:{' '}
            <code>Attiva • Crittografata</code>
          </div>
        </div>
      </nav>

      <main className="home-main-content">
        {globalError && <div className="alert-error">{globalError}</div>}

        <div className="home-hero-grid">
          {/* LEFT CARD: CREATE NEW ROOM INSTANCE */}
          <section className="hub-card create-room-card">
            <div className="hub-card-header">
              <PlusCircle size={22} className="gold-icon" />
              <div>
                <h2>Crea una Nuova Stanza</h2>
                <p>
                  Configura un&apos;istanza di gioco con ID e Password opzionale per
                  giocare con amici o Bot IA.
                </p>
              </div>
            </div>

            <form className="hub-form" onSubmit={handleCreateRoom}>
              <div className="form-grid-2">
                <div className="form-field">
                  <label>ID Stanza Personalizzato (o vuoto per automatico)</label>
                  <input
                    type="text"
                    placeholder="Es. EDH-SERATA o ARENA1"
                    value={newRoomId}
                    onChange={(e) => setNewRoomId(e.target.value.toUpperCase())}
                    maxLength={16}
                  />
                </div>
                <div className="form-field">
                  <label>Password Stanza (opzionale)</label>
                  <input
                    type="password"
                    placeholder="Lascia vuoto per stanza aperta"
                    value={newRoomPassword}
                    onChange={(e) => setNewRoomPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-field">
                <label>Nome del Tavolo</label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Es. Commander Serale 4 Giocatori"
                />
              </div>

              <div className="form-field">
                <label>Formato di Gioco</label>
                <div className="format-selector-cards">
                  <button
                    type="button"
                    className={`format-option-card ${
                      newRoomFormat === 'COMMANDER' ? 'selected' : ''
                    }`}
                    onClick={() => {
                      setNewRoomFormat('COMMANDER');
                      setNewRoomMaxPlayers(4);
                    }}
                  >
                    <Crown size={20} className="gold-icon" />
                    <div>
                      <strong>Commander / EDH</strong>
                      <span>100 carte + Comandante • 40 Punti Vita • Zona di Comando</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`format-option-card ${
                      newRoomFormat === 'CONSTRUCTED' ? 'selected' : ''
                    }`}
                    onClick={() => {
                      setNewRoomFormat('CONSTRUCTED');
                      setNewRoomMaxPlayers(2);
                    }}
                  >
                    <Layers size={20} className="gold-icon" />
                    <div>
                      <strong>Costruito / Classico</strong>
                      <span>Mazzi da 60+ carte • 20 Punti Vita • 1v1 o Multiplayer</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="form-field">
                <label>Numero Massimo Giocatori al Tavolo</label>
                <div className="player-count-pills">
                  {[2, 3, 4, 5, 6, 8].map((num) => (
                    <button
                      key={num}
                      type="button"
                      className={`count-pill ${
                        newRoomMaxPlayers === num ? 'active' : ''
                      }`}
                      onClick={() => setNewRoomMaxPlayers(num)}
                    >
                      {num} Giocatori
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary btn-lg full-width"
                disabled={creatingRoom}
              >
                <Sparkles size={18} />{' '}
                {creatingRoom ? 'Creazione Stanza...' : 'Crea Stanza ed Entra nella Lobby'}
              </button>
            </form>
          </section>

          {/* RIGHT COLUMN: JOIN BY ROOM ID & ACTIVE ROOMS LIST */}
          <div className="hub-right-stack">
            {/* Join by Direct ID & Password */}
            <section className="hub-card join-direct-card">
              <div className="hub-card-header">
                <KeyRound size={20} className="gold-icon" />
                <div>
                  <h2>Entra tramite ID Stanza</h2>
                  <p>Hai ricevuto il codice di una stanza da un amico? Inseriscilo qui.</p>
                </div>
              </div>

              <form
                className="join-direct-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleJoinRoomSubmit(joinRoomIdInput, joinPasswordInput);
                }}
              >
                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Codice / ID Stanza</label>
                    <input
                      type="text"
                      placeholder="Es. A1B2C3"
                      value={joinRoomIdInput}
                      onChange={(e) =>
                        setJoinRoomIdInput(e.target.value.toUpperCase())
                      }
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>Password (se richiesta)</label>
                    <input
                      id="join-password-input"
                      type="password"
                      placeholder="Password stanza..."
                      value={joinPasswordInput}
                      onChange={(e) => setJoinPasswordInput(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="btn-secondary full-width"
                  disabled={joiningRoom || !joinRoomIdInput.trim()}
                >
                  <LogIn size={16} />{' '}
                  {joiningRoom ? 'Connessione...' : 'Collegati alla Stanza'}
                </button>
              </form>
            </section>

            {/* Active Rooms List */}
            <section className="hub-card active-rooms-card">
              <div className="hub-card-header between">
                <div className="header-with-icon">
                  <Users size={20} className="gold-icon" />
                  <div>
                    <h2>Stanze Attive sul Server</h2>
                    <p>
                      {serverInfo
                        ? `Server Lozzander Online v${serverInfo.version} • ${serverInfo.loadedCards.toLocaleString()} carte caricate`
                        : 'Connessione al server Lozzander Online...'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={refreshLobbyDirectory}
                  title="Aggiorna elenco stanze"
                >
                  <RefreshCw size={16} className={loadingRooms ? 'spin' : ''} />
                </button>
              </div>

              <div className="rooms-directory-list">
                {roomsList.length === 0 ? (
                  <div className="empty-rooms-box">
                    Nessuna stanza attiva in questo momento. Crea la prima stanza a
                    sinistra per iniziare!
                  </div>
                ) : (
                  roomsList.map((r) => (
                    <div
                      key={r.roomId}
                      className={`room-directory-item ${
                        r.canReconnect ? 'reconnect-highlight' : ''
                      }`}
                    >
                      <div className="room-dir-info">
                        <div className="room-dir-title-row">
                          <span className="room-code-chip">{r.roomId}</span>
                          <strong>{r.roomName}</strong>
                          {r.hasPassword && <Lock size={13} className="muted-icon" />}
                          {r.canReconnect && (
                            <span className="reconnect-badge">
                              ✓ Il tuo posto è attivo
                            </span>
                          )}
                        </div>
                        <div className="room-dir-sub">
                          <span>
                            {r.isCommander ? 'Commander (100)' : 'Costruito (60)'}
                          </span>
                          <span>•</span>
                          <span>
                            {r.occupiedCount}/{r.maxPlayers} Posti
                          </span>
                          <span>•</span>
                          <span
                            className={`status-tag status-${r.status.toLowerCase()}`}
                          >
                            {r.status === 'IN_GAME'
                              ? 'Partita in Corso'
                              : r.status === 'LOBBY'
                              ? 'In Lobby'
                              : 'Conclusa'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={
                          r.canReconnect ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
                        }
                        onClick={() => {
                          if (r.hasPassword && !r.canReconnect && !joinPasswordInput.trim()) {
                            setJoinRoomIdInput(r.roomId);
                            document.getElementById('join-password-input')?.focus();
                          } else {
                            handleJoinRoomSubmit(r.roomId, joinPasswordInput);
                          }
                        }}
                      >
                        {r.canReconnect
                          ? 'Riconnettiti'
                          : r.hasPassword
                          ? 'Inserisci Password'
                          : 'Entra'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};
