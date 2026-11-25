import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CardViewState } from '../../types';
import { CardVisual } from '../CardVisual';
import { ManaSymbolBadge } from '../ManaText';
import { MatchLayoutProps } from './DesktopMatchLayout';
import {
  DockZoneKey,
  PHASES_12,
  findAutoOpenZone,
  formatPromptButtonLabel,
  getActionContextHint,
  getPhaseDisplay,
  partitionBattlefield,
} from './matchUtils';
import {
  PLAYMAT_THEMES,
  SLEEVE_THEMES,
  getPlaymatTheme,
  getSleeveTheme,
} from './playmats';
import {
  Check,
  ChevronDown,
  Crosshair,
  FastForward,
  Flag,
  Hand,
  Heart,
  Layers,
  LogOut,
  Menu,
  Monitor,
  Palette,
  PauseCircle,
  RotateCcw,
  ScrollText,
  Send,
  Sword,
  Users,
  X,
  Zap,
} from 'lucide-react';

type MobileSheet = 'NONE' | 'MENU' | 'PLAYERS' | 'STACK' | 'LOG_CHAT' | 'PHASES';
type LocalZoneTab = 'HAND' | 'COMMAND' | 'GRAVEYARD' | 'EXILE' | 'MANA' | null;

export const MobileMatchLayout: React.FC<MatchLayoutProps> = ({
  gameState,
  chatMessages,
  arcMode,
  playmatId,
  sleeveId,
  waitReactions,
  onSelectPlaymat,
  onSelectSleeve,
  onTriggerWaitReaction,
  onCycleArcMode,
  onInspectCard,
  onZoomCard,
  onCardClick,
  onPlayerClick,
  onStackItemClick,
  onHoverStackItem,
  onButtonOk,
  onButtonCancel,
  onUndo,
  onAlphaStrike,
  onUseMana,
  onAutoPassEot,
  onYieldStackEmpty,
  onCancelAutoPass,
  onToggleAutoPassNoActions,
  onTogglePhaseStop,
  onSendChat,
  onConcede,
  onLeaveRoom,
  onSwitchLayoutMode,
}) => {
  const [openSheet, setOpenSheet] = useState<MobileSheet>('NONE');
  const [localZoneTab, setLocalZoneTab] = useState<LocalZoneTab>('HAND');
  const preAutoZoneTabRef = useRef<LocalZoneTab | null>(null);

  const [oppOpenZone, setOppOpenZone] = useState<DockZoneKey | null>(null);
  const [focusedOppId, setFocusedOppId] = useState<number | null>(null);

  const playmatTheme = useMemo(() => getPlaymatTheme(playmatId), [playmatId]);
  const sleeveTheme = useMemo(() => getSleeveTheme(sleeveId), [sleeveId]);

  const [chatInput, setChatInput] = useState('');
  const [unreadChat, setUnreadChat] = useState(false);
  const prevChatLenRef = useRef<number>(chatMessages.length);
  const prevStackLenRef = useRef<number>(gameState.stack.length);
  const [confirmingConcede, setConfirmingConcede] = useState(false);
  const [promptInvalidPulse, setPromptInvalidPulse] = useState(false);
  const prevInvalidSeqRef = useRef<number>(gameState.prompt?.invalidActionSeq || 0);

  const localPlayer = useMemo(
    () => gameState.players.find((p) => p.isLocalViewer) || gameState.players[0],
    [gameState.players]
  );
  const opponents = useMemo(
    () => gameState.players.filter((p) => p.id !== localPlayer?.id),
    [gameState.players, localPlayer?.id]
  );

  // Active opponent selection in multiplayer
  useEffect(() => {
    if (opponents.length === 0) return;
    if (
      focusedOppId === null ||
      !opponents.some((o) => o.id === focusedOppId)
    ) {
      const turnOpp = opponents.find((o) => o.isTurn) || opponents[0];
      setFocusedOppId(turnOpp.id);
    }
  }, [opponents, focusedOppId]);

  useEffect(() => {
    const activeOpp = opponents.find((o) => o.isTurn || o.isSelectable);
    if (activeOpp) {
      setFocusedOppId(activeOpp.id);
    }
  }, [gameState.playerTurnId, gameState.selectablePlayerIds.length]);

  const activeOpponent = useMemo(
    () => opponents.find((o) => o.id === focusedOppId) || opponents[0],
    [opponents, focusedOppId]
  );

  // Auto-open Stack sheet when stack grows or stack items are selectable (and close when empty)
  useEffect(() => {
    const stackLen = gameState.stack.length;
    const stackSelectable = gameState.selectableStackIds.length > 0;
    if (
      stackLen > 0 &&
      (stackLen > prevStackLenRef.current || stackSelectable)
    ) {
      setOpenSheet('STACK');
    } else if (stackLen === 0 && openSheet === 'STACK') {
      setOpenSheet('NONE');
    }
    prevStackLenRef.current = stackLen;
  }, [gameState.stack.length, gameState.selectableStackIds.length]);

  // Auto-open selectable non-battlefield zones (Graveyard/Exile/Command) or floating Mana Pool
  useEffect(() => {
    const autoTarget = findAutoOpenZone(gameState);
    if (autoTarget) {
      if (localPlayer && autoTarget.playerId === localPlayer.id) {
        if (preAutoZoneTabRef.current === null) {
          preAutoZoneTabRef.current = localZoneTab;
        }
        const mappedTab: LocalZoneTab =
          autoTarget.zone === 'graveyard'
            ? 'GRAVEYARD'
            : autoTarget.zone === 'exile'
            ? 'EXILE'
            : 'COMMAND';
        setLocalZoneTab(mappedTab);
      } else if (activeOpponent && autoTarget.playerId === activeOpponent.id) {
        setOppOpenZone(autoTarget.zone);
      } else {
        setFocusedOppId(autoTarget.playerId);
        setOppOpenZone(autoTarget.zone);
      }
    } else if (!gameState.isSelecting && preAutoZoneTabRef.current !== null) {
      setLocalZoneTab(preAutoZoneTabRef.current);
      preAutoZoneTabRef.current = null;
      setOppOpenZone(null);
    }
  }, [gameState.isSelecting, gameState.selectableCardIds]);

  const prevManaTotalRef = useRef<number>(localPlayer?.manaPool.total || 0);
  useEffect(() => {
    const curTotal = localPlayer?.manaPool.total || 0;
    if (prevManaTotalRef.current === 0 && curTotal > 0) {
      if (preAutoZoneTabRef.current === null) {
        preAutoZoneTabRef.current = localZoneTab;
      }
      setLocalZoneTab('MANA');
    } else if (
      prevManaTotalRef.current > 0 &&
      curTotal === 0 &&
      localZoneTab === 'MANA' &&
      preAutoZoneTabRef.current !== null
    ) {
      setLocalZoneTab(preAutoZoneTabRef.current);
      preAutoZoneTabRef.current = null;
    }
    prevManaTotalRef.current = curTotal;
  }, [localPlayer?.manaPool.total]);

  useEffect(() => {
    if (chatMessages.length > prevChatLenRef.current && openSheet !== 'LOG_CHAT') {
      setUnreadChat(true);
    }
    prevChatLenRef.current = chatMessages.length;
    if (openSheet === 'LOG_CHAT') {
      setUnreadChat(false);
    }
  }, [chatMessages.length, openSheet]);

  useEffect(() => {
    const seq = gameState.prompt?.invalidActionSeq || 0;
    if (seq > prevInvalidSeqRef.current) {
      setPromptInvalidPulse(true);
      const t = window.setTimeout(() => setPromptInvalidPulse(false), 450);
      prevInvalidSeqRef.current = seq;
      return () => window.clearTimeout(t);
    }
    prevInvalidSeqRef.current = seq;
  }, [gameState.prompt?.invalidActionSeq]);

  const dimNonSelectable = Boolean(
    gameState.isSelecting && gameState.selectableCardIds.length > 0
  );

  const oppBf = useMemo(
    () => partitionBattlefield(activeOpponent?.zones.battlefield || []),
    [activeOpponent?.zones.battlefield]
  );

  const localBf = useMemo(
    () => partitionBattlefield(localPlayer?.zones.battlefield || []),
    [localPlayer?.zones.battlefield]
  );

  const actionHint = useMemo(() => getActionContextHint(gameState), [gameState]);
  const phaseDisplay = useMemo(
    () => getPhaseDisplay(gameState.phase),
    [gameState.phase]
  );

  const isYieldActive =
    gameState.yieldState.autoYieldAll ||
    gameState.yieldState.autoYieldEndOfStep ||
    gameState.yieldState.autoYieldStackEmpty;

  const toggleSheet = (sheet: MobileSheet) => {
    setOpenSheet((prev) => (prev === sheet ? 'NONE' : sheet));
  };

  const toggleLocalZone = (tab: Exclude<LocalZoneTab, null>) => {
    preAutoZoneTabRef.current = null;
    setLocalZoneTab((prev) => (prev === tab ? null : tab));
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  const renderZoneCardsRow = (
    cards: CardViewState[],
    emptyText: string,
    badge?: string
  ) => (
    <div className="mob-zone-scroll">
      {cards.length === 0 ? (
        <span className="mob-empty-strip">{emptyText}</span>
      ) : (
        cards.map((c) => (
          <CardVisual
            key={c.id}
            card={c}
            size="sm"
            sleeveTheme={sleeveTheme}
            inHand={localZoneTab === 'HAND'}
            badgeText={badge}
            isTouchMode={true}
            dimNonSelectable={dimNonSelectable}
            onClick={onCardClick}
            onInspect={onInspectCard}
            onZoom={(cardItem) => onZoomCard(cardItem, cards)}
          />
        ))
      )}
    </div>
  );

  const localCmdPlusFb = useMemo(() => {
    if (!localPlayer) return [];
    const ids = new Set<number>();
    const list: CardViewState[] = [];
    localPlayer.zones.command.forEach((c) => {
      ids.add(c.id);
      list.push(c);
    });
    localPlayer.zones.flashback.forEach((c) => {
      if (!ids.has(c.id)) list.push(c);
    });
    return list;
  }, [localPlayer]);

  const oppRowLandsSupport = (
    <div className="mob-bf-row">
      {oppBf.landGroups.map((grp) => (
        <CardVisual
          key={grp.key}
          card={grp.representative}
          size="xs"
          stackCount={grp.count}
          otherStackCardIds={grp.otherIds}
          isTouchMode={true}
          dimNonSelectable={dimNonSelectable}
          onClick={onCardClick}
          onInspect={onInspectCard}
          onZoom={(c) =>
            onZoomCard(
              c,
              oppBf.landGroups.map((g) => g.representative)
            )
          }
          attachedCards={oppBf.attachmentsByHostId[grp.representative.id] || []}
        />
      ))}
      {oppBf.support.map((c) => (
        <CardVisual
          key={c.id}
          card={c}
          size="xs"
          isTouchMode={true}
          dimNonSelectable={dimNonSelectable}
          onClick={onCardClick}
          onInspect={onInspectCard}
          onZoom={(cardItem) => onZoomCard(cardItem, oppBf.support)}
          attachedCards={oppBf.attachmentsByHostId[c.id] || []}
        />
      ))}
      {oppBf.landGroups.length === 0 && oppBf.support.length === 0 && (
        <span className="mob-row-hint">Terre / Supporto Avv.</span>
      )}
    </div>
  );

  const oppRowCreatures = (
    <div className="mob-bf-row">
      {oppBf.creatureGroups.map((grp) => (
        <CardVisual
          key={grp.key}
          card={grp.representative}
          size="xs"
          stackCount={grp.count}
          otherStackCardIds={grp.otherIds}
          isTouchMode={true}
          dimNonSelectable={dimNonSelectable}
          onClick={onCardClick}
          onInspect={onInspectCard}
          onZoom={(c) =>
            onZoomCard(
              c,
              oppBf.creatureGroups.map((g) => g.representative)
            )
          }
          attachedCards={oppBf.attachmentsByHostId[grp.representative.id] || []}
        />
      ))}
      {oppBf.creatureGroups.length === 0 && (
        <span className="mob-row-hint">Creature Avversario</span>
      )}
    </div>
  );

  const localHasCreatures = localBf.creatureGroups.length > 0;

  return (
    <div className="mob-match-shell">
      {/* ===================================================================
          TOP FMENUBAR + VUNIFIEDPHASE
         =================================================================== */}
      <header className="mob-top-menubar">
        <button
          type="button"
          className={`mob-menu-btn ${openSheet === 'MENU' ? 'active' : ''}`}
          onClick={() => toggleSheet('MENU')}
          title="Menu Partita"
        >
          <Menu size={16} />
        </button>

        <button
          type="button"
          className={`mob-menu-btn ${openSheet === 'PLAYERS' ? 'active' : ''}`}
          onClick={() => toggleSheet('PLAYERS')}
          title="Giocatori e Danni Comandante"
        >
          <Users size={15} />
          <span>{gameState.players.length}</span>
        </button>

        <button
          type="button"
          className={`mob-menu-btn ${openSheet === 'STACK' ? 'active' : ''} ${
            gameState.stack.length > 0 ? 'has-stack' : ''
          }`}
          onClick={() => toggleSheet('STACK')}
          title="Pila (Stack)"
        >
          <Layers size={15} />
          <span>Pila ({gameState.stack.length})</span>
        </button>

        <button
          type="button"
          className={`mob-menu-btn ${openSheet === 'LOG_CHAT' ? 'active' : ''}`}
          onClick={() => {
            setUnreadChat(false);
            toggleSheet('LOG_CHAT');
          }}
          title="Registro & Chat"
        >
          <ScrollText size={15} />
          {unreadChat && <span className="unread-dot" />}
        </button>

        <button
          type="button"
          className={`mob-menu-btn mob-wait-btn ${
            localPlayer && waitReactions[localPlayer.name.trim().toLowerCase()]
              ? 'active-wait'
              : ''
          }`}
          onClick={onTriggerWaitReaction}
          title="Aspetta / In risposta (Y)"
        >
          <Hand size={15} />
        </button>

        <button
          type="button"
          className={`mob-unified-phase-btn ${
            gameState.isMyTurn ? 'my-turn' : 'opp-turn'
          } ${openSheet === 'PHASES' ? 'active' : ''}`}
          onClick={() => toggleSheet('PHASES')}
          title="Tocca per impostare gli Stop alle fasi"
        >
          <span className="mob-turn-tag">Giro {gameState.round}</span>
          <span className="mob-phase-name">{phaseDisplay.itShort}</span>
          <ChevronDown size={13} />
        </button>
      </header>

      {/* ===================================================================
          DROPDOWN SHEETS BELOW TOP BAR (Bounded above VPrompt)
         =================================================================== */}
      {openSheet !== 'NONE' && (
        <div
          className="mob-sheet-backdrop"
          onClick={() => setOpenSheet('NONE')}
        >
          <div className="mob-dropdown-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mob-sheet-head">
              <strong>
                {openSheet === 'MENU'
                  ? 'Menu Partita & Azioni'
                  : openSheet === 'PLAYERS'
                  ? 'Giocatori & Statistiche'
                  : openSheet === 'STACK'
                  ? `Pila / Stack (${gameState.stack.length})`
                  : openSheet === 'LOG_CHAT'
                  ? 'Registro & Chat Tavolo'
                  : 'Stop Fasi (Tuo Turno & Avversari)'}
              </strong>
              <button
                type="button"
                className="mob-sheet-close"
                onClick={() => setOpenSheet('NONE')}
              >
                <X size={16} />
              </button>
            </div>

            {openSheet === 'MENU' && (
              <div className="mob-menu-wrap">
                <div className="mob-menu-grid">
                  <button
                    type="button"
                    className={`mob-action-tile ${
                      gameState.yieldState.autoYieldAll ? 'active' : ''
                    }`}
                    onClick={() => {
                      onAutoPassEot();
                      setOpenSheet('NONE');
                    }}
                  >
                    <FastForward size={16} /> Passa fino a Fine Turno
                  </button>
                  <button
                    type="button"
                    className={`mob-action-tile ${
                      gameState.yieldState.autoYieldStackEmpty ? 'active' : ''
                    }`}
                    onClick={() => {
                      onYieldStackEmpty();
                      setOpenSheet('NONE');
                    }}
                  >
                    <Layers size={16} /> Cedi Pila
                  </button>
                  <button
                    type="button"
                    className={`mob-action-tile ${
                      gameState.yieldState.autoPassNoActions ? 'active' : ''
                    }`}
                    onClick={onToggleAutoPassNoActions}
                  >
                    <Zap size={16} /> Auto-Pass se 0 Giocate
                  </button>
                  {isYieldActive && (
                    <button
                      type="button"
                      className="mob-action-tile danger"
                      onClick={() => {
                        onCancelAutoPass();
                        setOpenSheet('NONE');
                      }}
                    >
                      <PauseCircle size={16} /> Interrompi Auto-Pass
                    </button>
                  )}
                  <button
                    type="button"
                    className="mob-action-tile"
                    onClick={onCycleArcMode}
                  >
                    <Crosshair size={16} /> Archi:{' '}
                    {arcMode === 'ALL'
                      ? 'Tutti'
                      : arcMode === 'HOVER'
                      ? 'Hover'
                      : 'Off'}
                  </button>
                  <button
                    type="button"
                    className="mob-action-tile"
                    onClick={() => {
                      setOpenSheet('NONE');
                      onSwitchLayoutMode('DESKTOP');
                    }}
                  >
                    <Monitor size={16} /> Tavolo 2×2 Desktop
                  </button>
                  {!gameState.gameOver && !localPlayer?.hasLost && (
                    confirmingConcede ? (
                      <button
                        type="button"
                        className="mob-action-tile danger"
                        onClick={() => {
                          setConfirmingConcede(false);
                          setOpenSheet('NONE');
                          onConcede();
                        }}
                      >
                        <Flag size={16} /> Conferma Resa!
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="mob-action-tile"
                        onClick={() => setConfirmingConcede(true)}
                      >
                        <Flag size={16} /> Concedi Partita
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    className="mob-action-tile"
                    onClick={onLeaveRoom}
                  >
                    <LogOut size={16} /> Esci dalla Stanza
                  </button>
                </div>

                <div className="mob-playmat-section">
                  <div className="mob-playmat-title">
                    <Palette size={13} className="cyan-icon" /> Playmat &amp; Sleeve
                  </div>
                  <div className="mob-playmat-row">
                    {PLAYMAT_THEMES.map((pm) => (
                      <button
                        key={pm.id}
                        type="button"
                        className={`playmat-option-tile ${
                          playmatId === pm.id ? 'selected' : ''
                        }`}
                        onClick={() => onSelectPlaymat(pm.id)}
                      >
                        <span
                          className="playmat-swatch"
                          style={{ background: pm.swatch }}
                        />
                        <span className="playmat-option-name">{pm.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="sleeve-swatches-row">
                    {SLEEVE_THEMES.map((sl) => (
                      <button
                        key={sl.id}
                        type="button"
                        className={`sleeve-swatch-btn ${
                          sleeveId === sl.id ? 'selected' : ''
                        }`}
                        onClick={() => onSelectSleeve(sl.id)}
                      >
                        <span
                          className="sleeve-mini-preview"
                          style={{
                            background: sl.primary,
                            borderColor: sl.border,
                          }}
                        />
                        <span>{sl.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {openSheet === 'PLAYERS' && (
              <div className="mob-players-sheet">
                {gameState.players.map((p) => (
                  <div
                    key={p.id}
                    className={`mob-player-stat-card ${
                      p.isTurn ? 'active-turn' : ''
                    } ${p.isSelectable ? 'selectable' : ''}`}
                    onClick={() => {
                      if (p.isSelectable) {
                        onPlayerClick(p);
                        setOpenSheet('NONE');
                      } else if (!p.isLocalViewer) {
                        setFocusedOppId(p.id);
                        setOpenSheet('NONE');
                      }
                    }}
                  >
                    <div className="mob-pstat-top">
                      <strong>
                        {p.name} {p.isLocalViewer ? '(Tu)' : ''}{' '}
                        {p.isTurn ? '• Turno' : ''}
                      </strong>
                      <span className="mob-pstat-life">❤️ {p.life}</span>
                    </div>
                    <div className="mob-pstat-meta">
                      <span>✋ {p.zoneSizes.hand}</span>
                      <span>📚 {p.zoneSizes.library}</span>
                      <span>🪦 {p.zoneSizes.graveyard}</span>
                      <span>🌀 {p.zoneSizes.exile}</span>
                      {p.poisonCounters > 0 && <span>☠ {p.poisonCounters}</span>}
                    </div>
                    {p.commanderDamageTaken.some((d) => d.damage > 0) && (
                      <div className="mob-pstat-cmd">
                        {p.commanderDamageTaken
                          .filter((d) => d.damage > 0)
                          .map((d, idx) => (
                            <span key={idx}>
                              ⚔️ {d.commanderName}: {d.damage}/21
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {openSheet === 'STACK' && (
              <div className="mob-stack-sheet">
                {gameState.stack.length === 0 ? (
                  <div className="desk-empty-note">La Pila è vuota.</div>
                ) : (
                  gameState.stack.map((item, idx) => {
                    const isTop = idx === 0;
                    const targets = [
                      ...item.targetPlayers.map((tp) => tp.name),
                      ...item.targetCards.map((tc) => tc.name),
                    ];
                    return (
                      <div
                        key={item.key || idx}
                        data-stack-key={item.key}
                        className={`desk-stack-entry ${
                          isTop ? 'top-resolving' : ''
                        } ${item.isSelectable ? 'stack-selectable' : ''}`}
                        onMouseEnter={() => onHoverStackItem(item.key)}
                        onMouseLeave={() => onHoverStackItem(null)}
                        onClick={() => onStackItemClick(item)}
                      >
                        {item.sourceCard?.imageUrl && (
                          <img
                            src={item.sourceCard.imageUrl}
                            alt={item.sourceCard.name}
                            className="desk-stack-thumb"
                            onClick={(e) => {
                              if (!item.isSelectable && item.sourceCard) {
                                e.stopPropagation();
                                onZoomCard(item.sourceCard, [item.sourceCard]);
                              }
                            }}
                          />
                        )}
                        <div className="desk-stack-content">
                          <div className="desk-stack-meta">
                            {isTop && (
                              <span className="stack-resolving-next">
                                ▶ RISOLVE
                              </span>
                            )}
                            <span className="stack-owner">
                              {item.activatingPlayerName}
                            </span>
                          </div>
                          <strong>{item.sourceCard?.name || 'Abilità'}</strong>
                          <p className="desk-stack-text">{item.text}</p>
                          {targets.length > 0 && (
                            <div className="desk-stack-targets">
                              🎯 {targets.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {openSheet === 'LOG_CHAT' && (
              <div className="mob-logchat-sheet">
                <div className="mob-log-box">
                  {gameState.gameLog.slice(-25).map((entry, idx) => (
                    <div key={idx} className="log-line">
                      {entry.summary}
                    </div>
                  ))}
                </div>
                <div className="mob-chat-box">
                  <div className="mob-chat-scroll">
                    {chatMessages.map((m, idx) => (
                      <div key={idx} className="chat-bubble">
                        <span className="chat-sender">{m.sender}:</span>{' '}
                        <span>{m.message}</span>
                      </div>
                    ))}
                  </div>
                  <form className="chat-input-row" onSubmit={handleSendChat}>
                    <input
                      type="text"
                      placeholder="Messaggio..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                    />
                    <button type="submit" className="btn-primary btn-sm">
                      <Send size={13} />
                    </button>
                  </form>
                </div>
              </div>
            )}

            {openSheet === 'PHASES' && (
              <div className="mob-phases-sheet">
                <div className="mob-phase-group">
                  <div className="mob-phase-group-title">
                    Tuo Turno — Tocca per mettere/togliere Stop
                  </div>
                  <div className="mob-phase-pills-12">
                    {PHASES_12.map((ph) => {
                      const isStopped =
                        !gameState.yieldState.skippedOwnPhases.includes(ph.code);
                      const isCurrent =
                        gameState.isMyTurn && gameState.phase === ph.code;
                      return (
                        <button
                          key={ph.code}
                          type="button"
                          className={`mob-phase-pill ${
                            isStopped ? 'has-stop' : 'skipped'
                          } ${isCurrent ? 'current' : ''}`}
                          onClick={() => onTogglePhaseStop(ph.code, true)}
                        >
                          {ph.short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mob-phase-group">
                  <div className="mob-phase-group-title">
                    Turno Avversario — Tocca per mettere/togliere Stop
                  </div>
                  <div className="mob-phase-pills-12">
                    {PHASES_12.map((ph) => {
                      const isStopped =
                        !gameState.yieldState.skippedOpponentPhases.includes(
                          ph.code
                        );
                      const isCurrent =
                        !gameState.isMyTurn && gameState.phase === ph.code;
                      return (
                        <button
                          key={ph.code}
                          type="button"
                          className={`mob-phase-pill ${
                            isStopped ? 'has-stop' : 'skipped'
                          } ${isCurrent ? 'current' : ''}`}
                          onClick={() => onTogglePhaseStop(ph.code, false)}
                        >
                          {ph.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================
          CENTER FIELDS SCROLLER (OPPONENT TOP + LOCAL PLAYER BOTTOM)
         =================================================================== */}
      <main className="mob-fields-container">
        {/* 1. OPPONENT VPANEL (MIRRORED) */}
        {activeOpponent && (
          <section
            className={`mob-player-panel opp-panel ${
              activeOpponent.isTurn ? 'turn-active' : ''
            } ${activeOpponent.hasPriority ? 'has-priority' : ''}`}
          >
            {opponents.length > 1 && (
              <div className="mob-opp-tabs">
                {opponents.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`mob-opp-tab ${
                      o.id === activeOpponent.id ? 'active' : ''
                    } ${o.isSelectable ? 'selectable' : ''}`}
                    onClick={() => {
                      setFocusedOppId(o.id);
                      setOppOpenZone(null);
                    }}
                  >
                    {o.isTurn && '● '}
                    {o.name} ❤️{o.life}
                    {o.isSelectable && ' 🎯'}
                  </button>
                ))}
              </div>
            )}

            {/* Mirrored Opponent Control Bar */}
            <div className="mob-control-bar opp-bar">
              <button
                type="button"
                data-player-avatar={activeOpponent.id}
                className={`mob-avatar-pill ${
                  activeOpponent.isSelectable ? 'player-selectable' : ''
                } ${activeOpponent.isSelected ? 'player-selected' : ''}`}
                onClick={() => onPlayerClick(activeOpponent)}
              >
                <span className="mob-pname">
                  {activeOpponent.name}
                  {activeOpponent.isAI ? ' (IA)' : ''}
                </span>
                <span
                  className={`mob-life ${
                    activeOpponent.life <= 5 ? 'critical' : ''
                  }`}
                >
                  <Heart size={11} /> {activeOpponent.life}
                </span>
                {activeOpponent.poisonCounters > 0 && (
                  <span className="mob-poison">☠{activeOpponent.poisonCounters}</span>
                )}
              </button>

              <div className="mob-infotabs">
                <span className="mob-infotab passive">
                  ✋{activeOpponent.zoneSizes.hand}
                </span>
                <span className="mob-infotab passive">
                  📚{activeOpponent.zoneSizes.library}
                </span>
                <button
                  type="button"
                  className={`mob-infotab ${
                    oppOpenZone === 'graveyard' ? 'active' : ''
                  }`}
                  onClick={() =>
                    setOppOpenZone((prev) =>
                      prev === 'graveyard' ? null : 'graveyard'
                    )
                  }
                >
                  🪦{activeOpponent.zoneSizes.graveyard}
                </button>
                <button
                  type="button"
                  className={`mob-infotab ${
                    oppOpenZone === 'exile' ? 'active' : ''
                  }`}
                  onClick={() =>
                    setOppOpenZone((prev) => (prev === 'exile' ? null : 'exile'))
                  }
                >
                  🌀{activeOpponent.zoneSizes.exile}
                </button>
                {(activeOpponent.zoneSizes.command > 0 ||
                  activeOpponent.commanders.length > 0) && (
                  <button
                    type="button"
                    className={`mob-infotab gold ${
                      oppOpenZone === 'command' ? 'active' : ''
                    }`}
                    onClick={() =>
                      setOppOpenZone((prev) =>
                        prev === 'command' ? null : 'command'
                      )
                    }
                  >
                    👑{activeOpponent.zoneSizes.command}
                  </button>
                )}
              </div>
            </div>

            {/* Optional Opponent Open Zone Strip */}
            {oppOpenZone && (
              <div className="mob-zone-strip opp-zone-strip">
                {renderZoneCardsRow(
                  activeOpponent.zones[oppOpenZone] || [],
                  'Zona vuota'
                )}
              </div>
            )}

            {/* Opponent Mirrored Battlefield: Lands/Support Top -> Creatures Bottom */}
            <div className="mob-bf-rows">
              {oppRowLandsSupport}
              {oppRowCreatures}
            </div>
          </section>
        )}

        {/* 2. LOCAL PLAYER VPANEL */}
        {localPlayer && (
          <section
            className={`mob-player-panel local-panel ${
              localPlayer.isTurn ? 'turn-active' : ''
            } ${localZoneTab === null ? 'zone-collapsed' : ''}`}
            style={{ background: playmatTheme.surfaceCss }}
          >
            {Object.keys(waitReactions).length > 0 && (
              <div className="mob-wait-toast">
                <Hand size={13} /> Aspetta! In risposta…
              </div>
            )}
            {/* Local Battlefield: Creatures (or Support if 0 creatures) Top -> Lands/Support Bottom */}
            <div className="mob-bf-rows">
              <div className="mob-bf-row">
                {localHasCreatures ? (
                  localBf.creatureGroups.map((grp) => (
                    <CardVisual
                      key={grp.key}
                      card={grp.representative}
                      size="xs"
                      stackCount={grp.count}
                      otherStackCardIds={grp.otherIds}
                      isTouchMode={true}
                      dimNonSelectable={dimNonSelectable}
                      onClick={onCardClick}
                      onInspect={onInspectCard}
                      onZoom={(c) =>
                        onZoomCard(
                          c,
                          localBf.creatureGroups.map((g) => g.representative)
                        )
                      }
                      attachedCards={
                        localBf.attachmentsByHostId[grp.representative.id] || []
                      }
                    />
                  ))
                ) : localBf.support.length > 0 ? (
                  localBf.support.map((c) => (
                    <CardVisual
                      key={c.id}
                      card={c}
                      size="xs"
                      isTouchMode={true}
                      dimNonSelectable={dimNonSelectable}
                      onClick={onCardClick}
                      onInspect={onInspectCard}
                      onZoom={(cardItem) => onZoomCard(cardItem, localBf.support)}
                      attachedCards={localBf.attachmentsByHostId[c.id] || []}
                    />
                  ))
                ) : (
                  <span className="mob-row-hint">Le tue Creature</span>
                )}
              </div>

              <div className="mob-bf-row">
                {localBf.landGroups.map((grp) => (
                  <CardVisual
                    key={grp.key}
                    card={grp.representative}
                    size="xs"
                    stackCount={grp.count}
                    otherStackCardIds={grp.otherIds}
                    isTouchMode={true}
                    dimNonSelectable={dimNonSelectable}
                    onClick={onCardClick}
                    onInspect={onInspectCard}
                    onZoom={(c) =>
                      onZoomCard(
                        c,
                        localBf.landGroups.map((g) => g.representative)
                      )
                    }
                    attachedCards={
                      localBf.attachmentsByHostId[grp.representative.id] || []
                    }
                  />
                ))}
                {localHasCreatures &&
                  localBf.support.map((c) => (
                    <CardVisual
                      key={c.id}
                      card={c}
                      size="xs"
                      isTouchMode={true}
                      dimNonSelectable={dimNonSelectable}
                      onClick={onCardClick}
                      onInspect={onInspectCard}
                      onZoom={(cardItem) => onZoomCard(cardItem, localBf.support)}
                      attachedCards={localBf.attachmentsByHostId[c.id] || []}
                    />
                  ))}
                {localBf.landGroups.length === 0 &&
                  (!localHasCreatures || localBf.support.length === 0) && (
                    <span className="mob-row-hint">Terre / Artefatti</span>
                  )}
              </div>
            </div>

            {/* Swappable / Collapsible VZoneDisplay Strip */}
            {localZoneTab !== null && (
              <div className="mob-zone-strip local-zone-strip">
                {localZoneTab === 'HAND' &&
                  renderZoneCardsRow(localPlayer.zones.hand, 'Mano vuota')}
                {localZoneTab === 'COMMAND' &&
                  renderZoneCardsRow(
                    localCmdPlusFb,
                    'Nessuna carta in Comando',
                    'CMD'
                  )}
                {localZoneTab === 'GRAVEYARD' &&
                  renderZoneCardsRow(
                    localPlayer.zones.graveyard,
                    'Cimitero vuoto'
                  )}
                {localZoneTab === 'EXILE' &&
                  renderZoneCardsRow(localPlayer.zones.exile, 'Esilio vuoto')}
                {localZoneTab === 'MANA' && (
                  <div className="mob-mana-pool-strip">
                    <span className="mob-mana-hint">
                      Tocca un colore per spendere 1 mana:
                    </span>
                    {(['W', 'U', 'B', 'R', 'G', 'C'] as const).map((col) => {
                      const val = localPlayer.manaPool[col] || 0;
                      return (
                        <button
                          key={col}
                          type="button"
                          className={`mob-mana-orb ${val > 0 ? 'has-mana' : ''}`}
                          onClick={() => onUseMana(col)}
                        >
                          <ManaSymbolBadge symbol={col} size="md" />
                          <strong>{val}</strong>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Local Control & InfoTab Bar */}
            <div className="mob-control-bar local-bar">
              <button
                type="button"
                data-player-avatar={localPlayer.id}
                className={`mob-avatar-pill you ${
                  localPlayer.isSelectable ? 'player-selectable' : ''
                } ${localPlayer.isSelected ? 'player-selected' : ''}`}
                onClick={() => onPlayerClick(localPlayer)}
              >
                <span className="mob-pname">TU</span>
                <span
                  className={`mob-life ${
                    localPlayer.life <= 5 ? 'critical' : ''
                  }`}
                >
                  <Heart size={11} /> {localPlayer.life}
                </span>
                {localPlayer.poisonCounters > 0 && (
                  <span className="mob-poison">☠{localPlayer.poisonCounters}</span>
                )}
              </button>

              <div className="mob-infotabs">
                <button
                  type="button"
                  className={`mob-infotab ${
                    localZoneTab === 'HAND' ? 'active' : ''
                  } ${
                    localPlayer.zones.hand.some(
                      (c) => c.isActionable || c.isSelectable
                    )
                      ? 'has-action'
                      : ''
                  }`}
                  onClick={() => toggleLocalZone('HAND')}
                  title="Mostra/Nascondi Mano"
                >
                  ✋{localPlayer.zoneSizes.hand}
                </button>
                <button
                  type="button"
                  className={`mob-infotab gold ${
                    localZoneTab === 'COMMAND' ? 'active' : ''
                  } ${
                    localCmdPlusFb.some((c) => c.isActionable || c.isSelectable)
                      ? 'has-action'
                      : ''
                  }`}
                  onClick={() => toggleLocalZone('COMMAND')}
                  title="Zona Comando / Giocabili"
                >
                  👑{localCmdPlusFb.length}
                </button>
                <button
                  type="button"
                  className={`mob-infotab ${
                    localZoneTab === 'GRAVEYARD' ? 'active' : ''
                  } ${
                    localPlayer.zones.graveyard.some((c) => c.isSelectable)
                      ? 'has-action'
                      : ''
                  }`}
                  onClick={() => toggleLocalZone('GRAVEYARD')}
                  title="Cimitero"
                >
                  🪦{localPlayer.zoneSizes.graveyard}
                </button>
                <button
                  type="button"
                  className={`mob-infotab ${
                    localZoneTab === 'EXILE' ? 'active' : ''
                  } ${
                    localPlayer.zones.exile.some((c) => c.isSelectable)
                      ? 'has-action'
                      : ''
                  }`}
                  onClick={() => toggleLocalZone('EXILE')}
                  title="Esilio"
                >
                  🌀{localPlayer.zoneSizes.exile}
                </button>
                <button
                  type="button"
                  className={`mob-infotab ${
                    localZoneTab === 'MANA' ? 'active' : ''
                  } ${localPlayer.manaPool.total > 0 ? 'has-action' : ''}`}
                  onClick={() => toggleLocalZone('MANA')}
                  title="Riserva Mana"
                >
                  💎{localPlayer.manaPool.total}
                </button>
              </div>
            </div>

            {/* Compact 12-Pill Horizontal VPhaseIndicator */}
            <div className="mob-phase-bar">
              {PHASES_12.map((ph) => {
                const isOwn = gameState.isMyTurn;
                const skipped = isOwn
                  ? gameState.yieldState.skippedOwnPhases
                  : gameState.yieldState.skippedOpponentPhases;
                const isStopped = !skipped.includes(ph.code);
                const isCurrent =
                  gameState.phase === ph.code ||
                  (gameState.phase === 'UNTAP' && ph.code === 'UPKEEP');
                return (
                  <button
                    key={ph.code}
                    type="button"
                    className={`mob-phase-chip ${
                      isCurrent ? 'current' : ''
                    } ${isStopped ? 'has-stop' : 'skipped'}`}
                    onClick={() => onTogglePhaseStop(ph.code, isOwn)}
                    title={`${ph.full} — Tocca per attivare/disattivare stop`}
                  >
                    {ph.short}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* ===================================================================
          BOTTOM THUMB-FRIENDLY VPROMPT BAR
         =================================================================== */}
      <footer
        className={`mob-bottom-prompt tone-${actionHint.tone} ${
          promptInvalidPulse ? 'prompt-invalid-flash' : ''
        }`}
      >
        <button
          type="button"
          className="mob-btn-ok"
          disabled={!gameState.prompt?.okEnabled}
          onClick={onButtonOk}
        >
          <Check size={15} />
          <span>
            {formatPromptButtonLabel(
              gameState.prompt?.okText,
              true,
              gameState
            )}
          </span>
        </button>

        <div
          className="mob-prompt-center"
          onClick={() => {
            if (gameState.prompt?.card && !gameState.prompt.card.hidden) {
              onZoomCard(gameState.prompt.card, [gameState.prompt.card]);
            }
          }}
        >
          <div className="mob-prompt-badge-row">
            <span className={`mob-tone-pill tone-${actionHint.tone}`}>
              {actionHint.badge}
            </span>
            {gameState.isDeclareAttackers && gameState.isMyTurn && (
              <button
                type="button"
                className="mob-alpha-chip"
                onClick={(e) => {
                  e.stopPropagation();
                  onAlphaStrike();
                }}
              >
                <Sword size={11} /> Tutto
              </button>
            )}
          </div>
          <div className="mob-prompt-msg">
            {gameState.prompt?.message || actionHint.hint}
          </div>
        </div>

        {gameState.undoAvailable &&
          !(gameState.prompt?.cancelText || '')
            .toLowerCase()
            .includes('undo') && (
            <button
              type="button"
              className="mob-btn-undo"
              onClick={onUndo}
              title="Annulla ultima azione"
            >
              <RotateCcw size={15} />
            </button>
          )}

        <button
          type="button"
          className="mob-btn-cancel"
          disabled={!gameState.prompt?.cancelEnabled}
          onClick={onButtonCancel}
        >
          {formatPromptButtonLabel(
            gameState.prompt?.cancelText,
            false,
            gameState
          )}
        </button>
      </footer>
    </div>
  );
};
