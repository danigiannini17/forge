import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ChatEntry,
  DeckCatalogEntry,
  DeckCatalogResponse,
  GameStatePayload,
  RoomState,
  RoomSummary,
} from './types';
import {
  applyDeckToRoomSlot,
  createRoom,
  fetchDeckCatalog,
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
  Globe,
  KeyRound,
  Layers,
  Lock,
  LogIn,
  Play,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Swords,
  User,
  Users,
  Zap,
} from 'lucide-react';

type ShowcaseCategory = 'COMMANDER' | 'PRECON' | 'THEME';

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

  // Starter Decks Showcase state
  const [deckCatalog, setDeckCatalog] = useState<DeckCatalogResponse | null>(null);
  const [showcaseCategory, setShowcaseCategory] =
    useState<ShowcaseCategory>('COMMANDER');
  const [showcaseSearch, setShowcaseSearch] = useState('');
  const [showcaseOffset, setShowcaseOffset] = useState(0);
  const [launchingDeckId, setLaunchingDeckId] = useState<string | null>(null);

  // Create Room form state
  const [newRoomId, setNewRoomId] = useState('');
  const [newRoomName, setNewRoomName] = useState('Tavolo Commander');
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
  const createSectionRef = useRef<HTMLElement | null>(null);
  const roomsSectionRef = useRef<HTMLElement | null>(null);
  const decksSectionRef = useRef<HTMLElement | null>(null);

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

  // Load starter decks catalog once for the Home showcase
  useEffect(() => {
    if (activeRoom || deckCatalog) return;
    fetchDeckCatalog()
      .then((data) => setDeckCatalog(data))
      .catch(() => {
        // Catalog stays empty if backend is unreachable; no browser console logs
      });
  }, [activeRoom, deckCatalog]);

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

  const handleQuickCreatePod = async () => {
    setCreatingRoom(true);
    setGlobalError(null);
    try {
      const res = await createRoom({
        roomName: `Pod Commander di ${nickname.trim() || 'Planeswalker'}`,
        format: 'COMMANDER',
        maxPlayers: 4,
        sessionToken,
        nickname: nickname.trim() || 'Planeswalker',
      });
      setActivePassword('');
      setGameState(null);
      setChatMessages(res.room.chatHistory || []);
      setActiveRoom(res.room);
    } catch (err: any) {
      setGlobalError(err.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const handlePlayStarterDeck = async (deck: DeckCatalogEntry) => {
    setLaunchingDeckId(deck.id);
    setGlobalError(null);
    const isCmdr = deck.format === 'COMMANDER' || deck.category === 'COMMANDER';
    try {
      const created = await createRoom({
        roomName: `${deck.name} — Tavolo di ${nickname.trim() || 'Planeswalker'}`,
        format: isCmdr ? 'COMMANDER' : 'CONSTRUCTED',
        maxPlayers: isCmdr ? 4 : 2,
        sessionToken,
        nickname: nickname.trim() || 'Planeswalker',
      });
      let finalRoom = created.room;
      const mySlot = created.room.mySlotIndex >= 0 ? created.room.mySlotIndex : 0;
      try {
        const applied = await applyDeckToRoomSlot(created.roomId, {
          sessionToken,
          slotIndex: mySlot,
          mode: 'CATALOG',
          deckId: deck.id,
        });
        finalRoom = applied.room;
      } catch {
        // Still enter the created room even if deck apply had a warning
      }
      setActivePassword('');
      setGameState(null);
      setChatMessages(finalRoom.chatHistory || []);
      setActiveRoom(finalRoom);
    } catch (err: any) {
      setGlobalError(err.message);
    } finally {
      setLaunchingDeckId(null);
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

  const showcaseDecks = useMemo(() => {
    if (!deckCatalog) return [];
    const pool =
      showcaseCategory === 'COMMANDER'
        ? deckCatalog.commanderDecks
        : showcaseCategory === 'PRECON'
        ? deckCatalog.preconDecks
        : deckCatalog.themeDecks;
    const q = showcaseSearch.trim().toLowerCase();
    const filtered = q
      ? pool.filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            (d.commanderName && d.commanderName.toLowerCase().includes(q)) ||
            (d.description && d.description.toLowerCase().includes(q))
        )
      : pool;
    if (filtered.length <= 6) return filtered;
    const safeOffset = showcaseOffset % filtered.length;
    const result: DeckCatalogEntry[] = [];
    for (let i = 0; i < 6; i++) {
      result.push(filtered[(safeOffset + i) % filtered.length]);
    }
    return result;
  }, [deckCatalog, showcaseCategory, showcaseSearch, showcaseOffset]);

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
      <div className="lobby-viewport-shell">
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

  // RENDER 3: HOME / EDHPLAY-STYLE HUB
  return (
    <div className="home-screen">
      {/* Top Sticky Navbar (EDHPlay-style) */}
      <nav className="top-navbar">
        <div className="navbar-inner">
          <div className="navbar-left">
            <div className="brand-cluster">
              <div className="brand-emblem">
                <Swords size={19} />
              </div>
              <div className="brand-wordmark">
                <span className="brand-title">LOZZANDER</span>
                <span className="brand-play-pill">PLAY</span>
              </div>
            </div>

            <div className="navbar-links">
              <button
                type="button"
                className="nav-link-btn"
                onClick={() =>
                  decksSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                Mazzi iniziali
              </button>
              <button
                type="button"
                className="nav-link-btn"
                onClick={() =>
                  roomsSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                Stanze ({roomsList.length})
              </button>
              <button
                type="button"
                className="nav-link-btn"
                onClick={() =>
                  createSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                Crea stanza
              </button>
            </div>
          </div>

          <div className="identity-bar">
            <div className="identity-input-group">
              <User size={14} className="cyan-icon" />
              <label htmlFor="nickname-input" className="sr-only">
                Il tuo Nickname
              </label>
              <input
                id="nickname-input"
                type="text"
                value={nickname}
                onChange={(e) => handleNicknameChange(e.target.value)}
                placeholder="Nickname al tavolo..."
                title="Il tuo nome visibile al tavolo"
              />
            </div>
            <div
              className="session-pill"
              title="Sessione protetta da token crittografico salvato localmente per riconnessione automatica al posto"
            >
              <ShieldCheck size={14} className="emerald-icon" />
              <span>Sessione Protetta</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section (EDHPlay Italian style) */}
      <header className="edh-hero-section">
        <div className="edh-hero-inner">
          <div className="edh-hero-copy">
            <h1>Gioca a Commander online, gratis nel browser</h1>
            <p className="edh-hero-lead">
              Il tavolo del tuo gruppo, in una scheda. Motore regole completo,
              Pila live, fasi interattive, tavoli 2×2 con playmat personalizzabili
              e supporto fino a 8 giocatori o Bot IA.
            </p>
            <div className="edh-hero-actions">
              <button
                type="button"
                className="btn-primary btn-lg"
                onClick={() =>
                  createSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                <PlusCircle size={18} /> Crea una Stanza
              </button>
              <button
                type="button"
                className="btn-secondary btn-lg"
                disabled={creatingRoom}
                onClick={handleQuickCreatePod}
              >
                <Play size={17} />{' '}
                {creatingRoom ? 'Preparazione tavolo...' : 'Apri Tavolo 4P Rapido'}
              </button>
            </div>
            <div className="edh-hero-meta">
              <span className="hero-stat-pill">
                <span className="live-dot" />
                {serverInfo
                  ? `Motore v${serverInfo.version} • ${serverInfo.loadedCards.toLocaleString()} carte`
                  : 'Connessione al server Lozzander Online...'}
              </span>
              <span className="hero-stat-pill">
                <Users size={13} className="cyan-icon" /> {roomsList.length}{' '}
                {roomsList.length === 1 ? 'stanza attiva' : 'stanze attive'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="home-main-content">
        {globalError && <div className="alert-error">{globalError}</div>}

        {/* SECTION 1: VETRINA MAZZI INIZIALI (EDHPlay Starter Decks Showcase) */}
        <section className="showcase-section" ref={decksSectionRef}>
          <div className="showcase-header">
            <div>
              <h2>Ogni mazzo iniziale, pronto da giocare</h2>
              <p>
                Scegli un precon Commander o Costruito dal catalogo: crea
                istantaneamente la tua stanza con il mazzo già pronto sul tavolo.
              </p>
            </div>

            <div className="showcase-controls">
              <div className="showcase-cat-pills">
                <button
                  type="button"
                  className={`pill-btn ${
                    showcaseCategory === 'COMMANDER' ? 'active' : ''
                  }`}
                  onClick={() => {
                    setShowcaseCategory('COMMANDER');
                    setShowcaseOffset(0);
                  }}
                >
                  <Crown size={13} /> Commander (
                  {deckCatalog?.commanderDecks.length || 0})
                </button>
                <button
                  type="button"
                  className={`pill-btn ${
                    showcaseCategory === 'PRECON' ? 'active' : ''
                  }`}
                  onClick={() => {
                    setShowcaseCategory('PRECON');
                    setShowcaseOffset(0);
                  }}
                >
                  <Layers size={13} /> Precon (
                  {deckCatalog?.preconDecks.length || 0})
                </button>
                <button
                  type="button"
                  className={`pill-btn ${
                    showcaseCategory === 'THEME' ? 'active' : ''
                  }`}
                  onClick={() => {
                    setShowcaseCategory('THEME');
                    setShowcaseOffset(0);
                  }}
                >
                  Tematici ({deckCatalog?.themeDecks.length || 0})
                </button>
              </div>

              <div className="showcase-search-cluster">
                <div className="search-input-wrap compact">
                  <Search size={14} className="muted-icon" />
                  <input
                    type="text"
                    placeholder="Cerca mazzo o comandante..."
                    value={showcaseSearch}
                    onChange={(e) => {
                      setShowcaseSearch(e.target.value);
                      setShowcaseOffset(0);
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setShowcaseOffset((prev) => prev + 6)}
                  title="Mostra altri mazzi dalla vetrina"
                >
                  <Shuffle size={14} /> Altri mazzi
                </button>
              </div>
            </div>
          </div>

          {showcaseDecks.length === 0 ? (
            <div className="showcase-empty">
              {deckCatalog
                ? 'Nessun mazzo trovato con questo filtro.'
                : 'Caricamento vetrina mazzi iniziali dal catalogo...'}
            </div>
          ) : (
            <div className="starter-decks-grid">
              {showcaseDecks.map((deck) => {
                const artUrl = deck.commanderArtCropUrl || deck.commanderImageUrl;
                const isLaunching = launchingDeckId === deck.id;
                return (
                  <article key={deck.id} className="starter-deck-card">
                    <div className="starter-deck-art">
                      {artUrl ? (
                        <img
                          src={artUrl}
                          alt={deck.commanderName || deck.name}
                          loading="lazy"
                          onError={(e) => {
                            if (
                              deck.commanderImageUrl &&
                              e.currentTarget.src !== deck.commanderImageUrl
                            ) {
                              e.currentTarget.src = deck.commanderImageUrl;
                            } else {
                              e.currentTarget.style.display = 'none';
                            }
                          }}
                        />
                      ) : (
                        <div className="starter-deck-art-fallback">
                          <Sparkles size={26} className="cyan-icon" />
                        </div>
                      )}
                      <div className="starter-deck-art-scrim" />
                      <div className="starter-deck-badges">
                        <span className="deck-format-badge">
                          {deck.category === 'COMMANDER' ? 'Commander' : 'Costruito'}
                        </span>
                        <span className="deck-starter-badge">Mazzo iniziale</span>
                      </div>
                    </div>

                    <div className="starter-deck-body">
                      <h3 className="starter-deck-title">{deck.name}</h3>
                      {deck.commanderName ? (
                        <div className="starter-deck-commander">
                          <Crown size={13} className="amber-icon" />
                          <span>{deck.commanderName}</span>
                        </div>
                      ) : (
                        <div className="starter-deck-desc">{deck.description}</div>
                      )}
                      <button
                        type="button"
                        className="btn-primary btn-sm full-width starter-play-btn"
                        disabled={isLaunching || creatingRoom}
                        onClick={() => handlePlayStarterDeck(deck)}
                      >
                        <Play size={14} />{' '}
                        {isLaunching ? 'Apertura tavolo...' : 'Gioca questo mazzo'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* SECTION 2: ACTIVE ROOMS DIRECTORY + CREATE ROOM */}
        <section className="home-workspace-grid" ref={roomsSectionRef}>
          {/* LEFT: STANZE ATTIVE + ENTRA CON CODICE */}
          <div className="hub-left-stack">
            <section className="hub-card active-rooms-card">
              <div className="hub-card-header between">
                <div className="header-with-icon">
                  <div className="card-icon-badge">
                    <Users size={18} />
                  </div>
                  <div>
                    <h2>Stanze Pubbliche &amp; Attive</h2>
                    <p>
                      Unisciti subito a un tavolo aperto oppure riconnettiti alla tua
                      partita in corso.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={refreshLobbyDirectory}
                  title="Aggiorna elenco stanze"
                >
                  <RefreshCw size={15} className={loadingRooms ? 'spin' : ''} />
                </button>
              </div>

              <div className="rooms-directory-list">
                {roomsList.length === 0 ? (
                  <div className="empty-rooms-box">
                    Nessuna stanza attiva al momento. Crea un tavolo a destra oppure
                    scegli un <strong>Mazzo iniziale</strong> qui sopra per iniziare!
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
                          <span className="room-format-tag">
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
                          r.canReconnect
                            ? 'btn-primary btn-sm'
                            : 'btn-secondary btn-sm'
                        }
                        onClick={() => {
                          if (
                            r.hasPassword &&
                            !r.canReconnect &&
                            !joinPasswordInput.trim()
                          ) {
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
                          ? 'Password'
                          : 'Entra'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Join by Direct ID & Password */}
            <section className="hub-card join-direct-card">
              <div className="hub-card-header">
                <div className="card-icon-badge">
                  <KeyRound size={18} />
                </div>
                <div>
                  <h2>Entra tramite Codice Stanza</h2>
                  <p>
                    Inserisci l&apos;ID condiviso dal tuo gruppo per sederti subito al
                    tavolo.
                  </p>
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
                    <label htmlFor="join-room-id-input">Codice / ID Stanza</label>
                    <input
                      id="join-room-id-input"
                      type="text"
                      placeholder="Es. EDH42"
                      value={joinRoomIdInput}
                      onChange={(e) =>
                        setJoinRoomIdInput(e.target.value.toUpperCase())
                      }
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="join-password-input">
                      Password (se richiesta)
                    </label>
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
          </div>

          {/* RIGHT: CREA UNA NUOVA STANZA */}
          <section className="hub-card create-room-card" ref={createSectionRef}>
            <div className="hub-card-header">
              <div className="card-icon-badge accent">
                <PlusCircle size={18} />
              </div>
              <div>
                <h2>Crea una Nuova Stanza</h2>
                <p>
                  Configura formato, posti (2–8) e password opzionale per il tuo pod o
                  per testare contro Bot IA.
                </p>
              </div>
            </div>

            <form className="hub-form" onSubmit={handleCreateRoom}>
              <div className="form-field">
                <label htmlFor="new-room-name">Nome del Tavolo</label>
                <input
                  id="new-room-name"
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Es. Pod Commander Serale"
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
                    <Crown size={18} className="cyan-icon" />
                    <div>
                      <strong>Commander / EDH</strong>
                      <span>100 carte + Comandante • 40 PV</span>
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
                    <Layers size={18} className="cyan-icon" />
                    <div>
                      <strong>Costruito / Classico</strong>
                      <span>60+ carte • 20 PV • 1v1 o Multi</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="form-field">
                <label>Posti al Tavolo</label>
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
                      {num}P
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-field">
                  <label htmlFor="new-room-id">ID Personalizzato (opzionale)</label>
                  <input
                    id="new-room-id"
                    type="text"
                    placeholder="Auto se vuoto"
                    value={newRoomId}
                    onChange={(e) => setNewRoomId(e.target.value.toUpperCase())}
                    maxLength={16}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="new-room-password">Password (opzionale)</label>
                  <input
                    id="new-room-password"
                    type="password"
                    placeholder="Stanza aperta"
                    value={newRoomPassword}
                    onChange={(e) => setNewRoomPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary btn-lg full-width"
                disabled={creatingRoom}
              >
                <Sparkles size={17} />{' '}
                {creatingRoom
                  ? 'Creazione Stanza...'
                  : 'Crea Stanza ed Entra in Lobby'}
              </button>
            </form>
          </section>
        </section>

        {/* SECTION 3: EDHPLAY-STYLE FEATURE STRIP */}
        <section className="features-strip">
          <div className="feature-tile">
            <Globe size={18} className="cyan-icon" />
            <h3>Gratis, nel tuo browser</h3>
            <p>
              Niente da installare e nessun account richiesto. La tua sessione
              crittografata ti riconnette automaticamente al posto.
            </p>
          </div>
          <div className="feature-tile">
            <Users size={18} className="cyan-icon" />
            <h3>Tavoli 2×2 fino a 8 posti</h3>
            <p>
              Quattro quadranti nativi con playmat selezionabili, sleeve durante
              il caricamento e Bot IA per testare in solitaria o in gruppo.
            </p>
          </div>
          <div className="feature-tile">
            <Zap size={18} className="cyan-icon" />
            <h3>Regole complete &amp; Pila live</h3>
            <p>
              Trigger automatici, Pila interattiva, stop su 12 fasi, Smart
              Auto-Pass, Undo e reazione rapida &ldquo;Aspetta / In risposta&rdquo;
              (Y).
            </p>
          </div>
          <div className="feature-tile">
            <Layers size={18} className="cyan-icon" />
            <h3>Mazzi pronti &amp; Deckbuilder</h3>
            <p>
              Precon Commander pronti all&apos;uso, import diretto da Moxfield /
              MTG Arena, generatore casuale e Deckbuilder integrato.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};
