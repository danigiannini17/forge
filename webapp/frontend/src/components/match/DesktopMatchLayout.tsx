import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CardViewState,
  ChatEntry,
  GameStatePayload,
  PlayerViewState,
  StackItemState,
} from '../../types';
import { CardVisual } from '../CardVisual';
import { ManaCostDisplay, ManaSymbolBadge, OracleTextDisplay } from '../ManaText';
import { ArcMode } from './TargetingArrowsOverlay';
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
  Check,
  Crosshair,
  Crown,
  Eye,
  FastForward,
  Flag,
  Heart,
  Layers,
  LogOut,
  Maximize2,
  MessageSquare,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Send,
  Smartphone,
  Sparkles,
  Sword,
  Swords,
  X,
  Zap,
} from 'lucide-react';

export interface MatchLayoutProps {
  gameState: GameStatePayload;
  chatMessages: ChatEntry[];
  inspectedCard: CardViewState | null;
  arcMode: ArcMode;
  onCycleArcMode: () => void;
  onInspectCard: (card: CardViewState) => void;
  onHoverCard: (cardId: number | null) => void;
  onZoomCard: (card: CardViewState, list?: CardViewState[]) => void;
  onCardClick: (
    card: CardViewState,
    e: React.MouseEvent | React.TouchEvent,
    otherCardIds?: number[]
  ) => void;
  onPlayerClick: (player: PlayerViewState) => void;
  onStackItemClick: (item: StackItemState) => void;
  hoveredStackKey: string | null;
  onHoverStackItem: (key: string | null) => void;
  onButtonOk: () => void;
  onButtonCancel: () => void;
  onUndo: () => void;
  onAlphaStrike: () => void;
  onUseMana: (colorCode: string) => void;
  onAutoPassEot: () => void;
  onYieldStackEmpty: () => void;
  onCancelAutoPass: () => void;
  onToggleAutoPassNoActions: () => void;
  onTogglePhaseStop: (phaseCode: string, ownTurn: boolean) => void;
  onSendChat: (text: string) => void;
  onConcede: () => void;
  onLeaveRoom: () => void;
  onSwitchLayoutMode: (mode: 'DESKTOP' | 'MOBILE') => void;
}

type LeftReportTab = 'STACK' | 'COMBAT' | 'LOG' | 'CHAT' | 'CMD';
type BottomDockTab = 'HAND' | 'COMMAND_EXTRA' | 'ZONE';

export const DesktopMatchLayout: React.FC<MatchLayoutProps> = ({
  gameState,
  chatMessages,
  inspectedCard,
  arcMode,
  onCycleArcMode,
  onInspectCard,
  onHoverCard,
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
  const [reportTab, setReportTab] = useState<LeftReportTab>('LOG');
  const preAutoReportTabRef = useRef<LeftReportTab | null>(null);
  const prevStackLenRef = useRef<number>(gameState.stack.length);

  const [bottomTab, setBottomTab] = useState<BottomDockTab>('HAND');
  const [zoneBrowserPlayerId, setZoneBrowserPlayerId] = useState<number | null>(null);
  const [zoneBrowserType, setZoneBrowserType] = useState<DockZoneKey>('graveyard');
  const preAutoBottomTabRef = useRef<BottomDockTab | null>(null);

  const [oppViewMode, setOppViewMode] = useState<'SPLIT' | 'TABBED'>(() =>
    gameState.players.length > 4 ? 'TABBED' : 'SPLIT'
  );
  const [focusedOppId, setFocusedOppId] = useState<number | null>(null);

  const [showAlternateFace, setShowAlternateFace] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [unreadChat, setUnreadChat] = useState(false);
  const prevChatLenRef = useRef<number>(chatMessages.length);

  const [confirmingConcede, setConfirmingConcede] = useState(false);
  const [promptInvalidPulse, setPromptInvalidPulse] = useState(false);
  const prevInvalidSeqRef = useRef<number>(gameState.prompt?.invalidActionSeq || 0);

  // Life deltas (independent per-player timers so subsequent WS updates never freeze the badge)
  const prevLifeRef = useRef<Record<number, number>>({});
  const lifeDeltaTimersRef = useRef<Record<number, number>>({});
  const [lifeDeltas, setLifeDeltas] = useState<Record<number, number>>({});

  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const localPlayer = useMemo(
    () => gameState.players.find((p) => p.isLocalViewer) || gameState.players[0],
    [gameState.players]
  );
  const opponents = useMemo(
    () => gameState.players.filter((p) => p.id !== localPlayer?.id),
    [gameState.players, localPlayer?.id]
  );

  // Keep focused opponent valid and follow active turn opponent in tabbed mode
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
    if (oppViewMode === 'TABBED') {
      const activeOpp = opponents.find((o) => o.isTurn || o.isSelectable);
      if (activeOpp) {
        setFocusedOppId(activeOpp.id);
      }
    }
  }, [gameState.playerTurnId, gameState.selectablePlayerIds.length, oppViewMode]);

  // Reset DFC flip when inspected card changes
  const displayCard =
    inspectedCard || gameState.prompt?.focusedCard || gameState.prompt?.card || null;
  useEffect(() => {
    setShowAlternateFace(false);
  }, [displayCard?.id]);

  // Auto-switch left report tab to STACK / COMBAT like CMatchUI
  useEffect(() => {
    const stackLen = gameState.stack.length;
    const hasCombat = (gameState.combat?.numAttackers || 0) > 0;
    const stackSelectable = gameState.selectableStackIds.length > 0;

    if (stackLen > 0 && (stackLen > prevStackLenRef.current || stackSelectable)) {
      if (preAutoReportTabRef.current === null && reportTab !== 'STACK') {
        preAutoReportTabRef.current = reportTab;
      }
      setReportTab('STACK');
    } else if (stackLen === 0 && hasCombat) {
      if (preAutoReportTabRef.current === null && reportTab !== 'COMBAT') {
        preAutoReportTabRef.current = reportTab;
      }
      setReportTab('COMBAT');
    } else if (stackLen === 0 && !hasCombat && preAutoReportTabRef.current !== null) {
      setReportTab(preAutoReportTabRef.current);
      preAutoReportTabRef.current = null;
    }
    prevStackLenRef.current = stackLen;
  }, [
    gameState.stack.length,
    gameState.combat?.numAttackers,
    gameState.selectableStackIds.length,
  ]);

  // Auto-open selectable non-hand/non-battlefield zone (e.g. Graveyard/Exile/Command targeting)
  useEffect(() => {
    const autoTarget = findAutoOpenZone(gameState);
    if (autoTarget) {
      if (preAutoBottomTabRef.current === null) {
        preAutoBottomTabRef.current = bottomTab;
      }
      setZoneBrowserPlayerId(autoTarget.playerId);
      setZoneBrowserType(autoTarget.zone);
      setBottomTab('ZONE');
    } else if (!gameState.isSelecting && preAutoBottomTabRef.current !== null) {
      setBottomTab(preAutoBottomTabRef.current);
      preAutoBottomTabRef.current = null;
    }
  }, [gameState.isSelecting, gameState.selectableCardIds]);

  // Auto-scroll Log & Chat
  useEffect(() => {
    if (reportTab === 'LOG' && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [gameState.gameLog.length, reportTab]);

  useEffect(() => {
    if (chatMessages.length > prevChatLenRef.current && reportTab !== 'CHAT') {
      setUnreadChat(true);
    }
    prevChatLenRef.current = chatMessages.length;
    if (reportTab === 'CHAT') {
      setUnreadChat(false);
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }
  }, [chatMessages.length, reportTab]);

  // Invalid click pulse
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

  // Life deltas
  useEffect(() => {
    const newDeltas: Record<number, number> = {};
    let changed = false;
    gameState.players.forEach((p) => {
      const prev = prevLifeRef.current[p.id];
      if (prev !== undefined && prev !== p.life) {
        const diff = p.life - prev;
        newDeltas[p.id] = diff;
        changed = true;
        if (lifeDeltaTimersRef.current[p.id]) {
          window.clearTimeout(lifeDeltaTimersRef.current[p.id]);
        }
        lifeDeltaTimersRef.current[p.id] = window.setTimeout(() => {
          setLifeDeltas((curr) => {
            if (!(p.id in curr)) return curr;
            const next = { ...curr };
            delete next[p.id];
            return next;
          });
          delete lifeDeltaTimersRef.current[p.id];
        }, 2000);
      }
      prevLifeRef.current[p.id] = p.life;
    });
    if (changed) {
      setLifeDeltas((prev) => ({ ...prev, ...newDeltas }));
    }
  }, [gameState.players]);

  useEffect(() => {
    return () => {
      Object.values(lifeDeltaTimersRef.current).forEach((timerId) =>
        window.clearTimeout(timerId)
      );
    };
  }, []);

  const dimNonSelectable = Boolean(
    gameState.isSelecting && gameState.selectableCardIds.length > 0
  );

  const stackTargetPlayerIds = useMemo(() => {
    const ids = new Set<number>();
    gameState.stack.forEach((s) =>
      s.targetPlayers.forEach((tp) => ids.add(tp.id))
    );
    return ids;
  }, [gameState.stack]);

  const stackSourceCardIds = useMemo(() => {
    const ids = new Set<number>();
    gameState.stack.forEach((s) => {
      if (s.sourceCard?.id) ids.add(s.sourceCard.id);
    });
    return ids;
  }, [gameState.stack]);

  const stackTargetCardIds = useMemo(() => {
    const ids = new Set<number>();
    gameState.stack.forEach((s) =>
      s.targetCards.forEach((tc) => ids.add(tc.id))
    );
    return ids;
  }, [gameState.stack]);

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

  const openZoneTab = (playerId: number, zone: DockZoneKey) => {
    preAutoBottomTabRef.current = null;
    setZoneBrowserPlayerId(playerId);
    setZoneBrowserType(zone);
    setBottomTab('ZONE');
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  const visibleOpponents =
    oppViewMode === 'TABBED' && opponents.length > 1
      ? opponents.filter((o) => o.id === focusedOppId)
      : opponents;

  const activeZonePlayer =
    gameState.players.find((p) => p.id === zoneBrowserPlayerId) || localPlayer;

  const renderPhaseColumn = (ownTurn: boolean, isPlayerTurnActive: boolean) => {
    const skippedList = ownTurn
      ? gameState.yieldState.skippedOwnPhases
      : gameState.yieldState.skippedOpponentPhases;
    return (
      <div
        className={`desk-phase-col ${isPlayerTurnActive ? 'turn-active' : ''}`}
        title={
          ownTurn
            ? 'Stop Fasi nel TUO Turno (clicca per attivare/disattivare)'
            : 'Stop Fasi nel Turno AVVERSARIO (clicca per attivare/disattivare)'
        }
      >
        {PHASES_12.map((ph) => {
          const isCurrent =
            isPlayerTurnActive &&
            (gameState.phase === ph.code ||
              (gameState.phase === 'UNTAP' && ph.code === 'UPKEEP'));
          const isStopped = !skippedList.includes(ph.code);
          return (
            <button
              key={ph.code}
              type="button"
              className={`desk-phase-chip group-${ph.group.toLowerCase()} ${
                isCurrent ? 'current' : ''
              } ${isStopped ? 'has-stop' : 'skipped'}`}
              onClick={() => onTogglePhaseStop(ph.code, ownTurn)}
              title={`${ph.full} (${
                ownTurn ? 'Tuo Turno' : 'Turno Avversario'
              }) — ${isStopped ? 'Stop Attivo' : 'Saltata'}`}
            >
              {ph.short}
            </button>
          );
        })}
      </div>
    );
  };

  const renderVField = (player: PlayerViewState, mirror: boolean) => {
    const bf = mirror
      ? partitionBattlefield(player.zones.battlefield || [])
      : localBf;
    const lifeDelta = lifeDeltas[player.id];
    const isTurnActive = gameState.playerTurnId === player.id;
    const isTargetedByStack = stackTargetPlayerIds.has(player.id);
    const cardSize = mirror && visibleOpponents.length > 1 ? 'xs' : 'sm';

    const creaturesRow = (
      <div className="vf-row vf-creatures-row">
        {bf.creatureGroups.length === 0 ? (
          <span className="vf-row-placeholder">
            {mirror ? 'Nessuna creatura' : 'Prima Linea (Creature)'}
          </span>
        ) : (
          bf.creatureGroups.map((grp) => (
            <div
              key={grp.key}
              onMouseEnter={() => onHoverCard(grp.representative.id)}
              onMouseLeave={() => onHoverCard(null)}
            >
              <CardVisual
                card={grp.representative}
                size={cardSize}
                stackCount={grp.count}
                otherStackCardIds={grp.otherIds}
                onClick={onCardClick}
                onInspect={onInspectCard}
                onZoom={(c) =>
                  onZoomCard(
                    c,
                    bf.creatureGroups.map((g) => g.representative)
                  )
                }
                attachedCards={bf.attachmentsByHostId[grp.representative.id] || []}
                isStackSource={grp.cards.some((c) => stackSourceCardIds.has(c.id))}
                isStackTarget={grp.cards.some((c) => stackTargetCardIds.has(c.id))}
                dimNonSelectable={dimNonSelectable}
              />
            </div>
          ))
        )}
      </div>
    );

    const backRow = (
      <div className="vf-row vf-back-row">
        <div className="vf-lands-cluster">
          {bf.landGroups.map((grp) => (
            <div
              key={grp.key}
              onMouseEnter={() => onHoverCard(grp.representative.id)}
              onMouseLeave={() => onHoverCard(null)}
            >
              <CardVisual
                card={grp.representative}
                size="xs"
                stackCount={grp.count}
                otherStackCardIds={grp.otherIds}
                onClick={onCardClick}
                onInspect={onInspectCard}
                onZoom={(c) =>
                  onZoomCard(
                    c,
                    bf.landGroups.map((g) => g.representative)
                  )
                }
                attachedCards={bf.attachmentsByHostId[grp.representative.id] || []}
                isStackSource={grp.cards.some((c) => stackSourceCardIds.has(c.id))}
                isStackTarget={grp.cards.some((c) => stackTargetCardIds.has(c.id))}
                dimNonSelectable={dimNonSelectable}
              />
            </div>
          ))}
        </div>

        {(bf.support.length > 0 || (mirror && player.zones.command.length > 0)) && (
          <div className="vf-support-cluster">
            {mirror &&
              player.zones.command.map((cmdCard) => (
                <div
                  key={cmdCard.id}
                  onMouseEnter={() => onHoverCard(cmdCard.id)}
                  onMouseLeave={() => onHoverCard(null)}
                >
                  <CardVisual
                    card={cmdCard}
                    size="xs"
                    badgeText="CMD"
                    onClick={onCardClick}
                    onInspect={onInspectCard}
                    onZoom={(c) => onZoomCard(c, player.zones.command)}
                    isStackSource={stackSourceCardIds.has(cmdCard.id)}
                    isStackTarget={stackTargetCardIds.has(cmdCard.id)}
                    dimNonSelectable={dimNonSelectable}
                  />
                </div>
              ))}
            {bf.support.map((supCard) => (
              <div
                key={supCard.id}
                onMouseEnter={() => onHoverCard(supCard.id)}
                onMouseLeave={() => onHoverCard(null)}
              >
                <CardVisual
                  card={supCard}
                  size={cardSize}
                  onClick={onCardClick}
                  onInspect={onInspectCard}
                  onZoom={(c) => onZoomCard(c, bf.support)}
                  attachedCards={bf.attachmentsByHostId[supCard.id] || []}
                  isStackSource={stackSourceCardIds.has(supCard.id)}
                  isStackTarget={stackTargetCardIds.has(supCard.id)}
                  dimNonSelectable={dimNonSelectable}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );

    return (
      <div
        key={player.id}
        className={`desk-vfield ${mirror ? 'opp-vfield' : 'local-vfield'} ${
          isTurnActive ? 'is-turn-player' : ''
        } ${player.hasPriority ? 'has-priority' : ''} ${
          player.hasLost ? 'player-lost' : ''
        }`}
      >
        {/* Left Player HUD */}
        <div className="desk-player-hud">
          <button
            type="button"
            data-player-avatar={player.id}
            className={`hud-avatar-box ${
              player.isSelectable ? 'player-selectable' : ''
            } ${player.isSelected ? 'player-selected' : ''} ${
              isTargetedByStack ? 'player-stack-target' : ''
            }`}
            onClick={() => onPlayerClick(player)}
            title={`${player.name}${
              player.isSelectable ? ' — Clicca per selezionare/bersagliare' : ''
            }`}
          >
            <div className="hud-avatar-top">
              <span className="hud-player-name">
                {player.isLocalViewer ? 'TU' : player.name}
                {player.isAI ? ' (IA)' : ''}
              </span>
              <span className="hud-status-dots">
                {isTurnActive && (
                  <span className="dot-turn" title="Turno Attivo">
                    ●
                  </span>
                )}
                {player.hasPriority && (
                  <span className="dot-prio" title="Ha la Priorità">
                    ⚡
                  </span>
                )}
              </span>
            </div>

            <div className="hud-life-row">
              <span
                className={`hud-life-val ${player.life <= 5 ? 'critical' : ''}`}
              >
                <Heart size={13} /> {player.life}
              </span>
              {lifeDelta !== undefined && lifeDelta !== 0 && (
                <span
                  className={`life-delta-pop ${
                    lifeDelta > 0 ? 'positive' : 'negative'
                  }`}
                  title="Ultima variazione punti vita (già inclusa nel totale)"
                >
                  ({lifeDelta > 0 ? `+${lifeDelta}` : lifeDelta})
                </span>
              )}
              {player.poisonCounters > 0 && (
                <span className="hud-poison-val" title="Segnalini Veleno">
                  ☠ {player.poisonCounters}
                </span>
              )}
            </div>
          </button>

          {/* 2-Column Zone Counters */}
          <div className="hud-zones-grid">
            <div className="hud-zone-cell" title="Carte in Mano">
              <span>✋</span>
              <strong>{player.zoneSizes.hand}</strong>
            </div>
            <div className="hud-zone-cell" title="Carte nel Grimorio">
              <span>📚</span>
              <strong>{player.zoneSizes.library}</strong>
            </div>
            <button
              type="button"
              className={`hud-zone-cell clickable ${
                player.zones.graveyard.some((c) => c.isSelectable)
                  ? 'zone-has-selectable'
                  : ''
              }`}
              onClick={() => openZoneTab(player.id, 'graveyard')}
              title="Apri Cimitero"
            >
              <span>🪦</span>
              <strong>{player.zoneSizes.graveyard}</strong>
            </button>
            <button
              type="button"
              className={`hud-zone-cell clickable ${
                player.zones.exile.some((c) => c.isSelectable)
                  ? 'zone-has-selectable'
                  : ''
              }`}
              onClick={() => openZoneTab(player.id, 'exile')}
              title="Apri Esilio"
            >
              <span>🌀</span>
              <strong>{player.zoneSizes.exile}</strong>
            </button>
            {(player.zoneSizes.command > 0 || player.commanders.length > 0) && (
              <button
                type="button"
                className="hud-zone-cell clickable gold"
                onClick={() => openZoneTab(player.id, 'command')}
                title="Apri Zona di Comando"
              >
                <span>👑</span>
                <strong>{player.zoneSizes.command}</strong>
              </button>
            )}
            {player.zoneSizes.flashback > 0 && (
              <button
                type="button"
                className="hud-zone-cell clickable emerald"
                onClick={() => openZoneTab(player.id, 'flashback')}
                title="Carte giocabili da altre zone"
              >
                <span>✨</span>
                <strong>{player.zoneSizes.flashback}</strong>
              </button>
            )}
          </div>

          {/* Local Land Drops & Commander Damage Badge */}
          {!mirror && (
            <div className="hud-sub-meta">
              <span title="Terre giocate in questo turno">
                ⛰ {player.numLandsPlayed}/{player.maxLandsToPlay}
              </span>
              {player.energyCounters > 0 && <span>⚡ {player.energyCounters}</span>}
            </div>
          )}

          {player.commanderDamageTaken.some((d) => d.damage > 0) && (
            <button
              type="button"
              className="hud-cmddmg-btn"
              onClick={() => setReportTab('CMD')}
              title="Danni da Comandante subiti"
            >
              <Swords size={11} /> Cmd:{' '}
              {Math.max(...player.commanderDamageTaken.map((d) => d.damage))}/21
            </button>
          )}

          {/* Mana Pool (Interactive for Local Player, Badge for Opponents if >0) */}
          {(!mirror || player.manaPool.total > 0) && (
            <div className="hud-mana-grid">
              {(['W', 'U', 'B', 'R', 'G', 'C'] as const).map((col) => {
                const val = player.manaPool[col] || 0;
                if (mirror && val === 0) return null;
                return (
                  <button
                    key={col}
                    type="button"
                    disabled={mirror}
                    className={`hud-mana-cell ${val > 0 ? 'has-mana' : ''}`}
                    onClick={() => !mirror && onUseMana(col)}
                    title={
                      mirror
                        ? `Mana ${col}: ${val}`
                        : `Spendi 1 mana ${col} dalla riserva`
                    }
                  >
                    <ManaSymbolBadge symbol={col} size="sm" />
                    <span>{val}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Vertical 12-Pill Phase Indicator */}
        {renderPhaseColumn(!mirror, isTurnActive)}

        {/* PlayArea */}
        <div className="desk-playarea">
          {mirror ? (
            <>
              {backRow}
              {creaturesRow}
            </>
          ) : (
            <>
              {creaturesRow}
              {backRow}
            </>
          )}
        </div>
      </div>
    );
  };

  const detailName =
    showAlternateFace && displayCard?.alternateName
      ? displayCard.alternateName
      : displayCard?.name;
  const detailMana =
    showAlternateFace && displayCard?.alternateManaCost
      ? displayCard.alternateManaCost
      : displayCard?.manaCost;
  const detailType =
    showAlternateFace && displayCard?.alternateType
      ? displayCard.alternateType
      : displayCard?.type;
  const detailOracle =
    showAlternateFace && displayCard?.alternateOracleText
      ? displayCard.alternateOracleText
      : displayCard?.oracleText || displayCard?.abilityText || displayCard?.fullText;
  const detailImage =
    showAlternateFace && displayCard?.alternateImageUrl
      ? displayCard.alternateImageUrl
      : displayCard?.imageUrl || displayCard?.scryfallFallbackUrl || '';

  return (
    <div className="desk-match-shell">
      {/* ===================================================================
          LEFT COLUMN (~21%): REPORT PANEL + DOCK BAR + PROMPT PANEL
         =================================================================== */}
      <aside className="desk-left-col">
        {/* Top Report Panel: Stack / Combat / Log / Chat / Cmd */}
        <section className="desk-report-panel">
          <div className="desk-tabs-bar">
            <button
              type="button"
              className={`desk-tab-btn ${reportTab === 'STACK' ? 'active' : ''} ${
                gameState.stack.length > 0 ? 'has-items' : ''
              }`}
              onClick={() => {
                preAutoReportTabRef.current = null;
                setReportTab('STACK');
              }}
            >
              <Layers size={12} /> Pila ({gameState.stack.length})
            </button>
            <button
              type="button"
              className={`desk-tab-btn ${reportTab === 'COMBAT' ? 'active' : ''} ${
                (gameState.combat?.numAttackers || 0) > 0 ? 'has-combat' : ''
              }`}
              onClick={() => {
                preAutoReportTabRef.current = null;
                setReportTab('COMBAT');
              }}
            >
              <Swords size={12} /> Comb.
              {(gameState.combat?.numAttackers || 0) > 0 &&
                ` (${gameState.combat?.numAttackers})`}
            </button>
            <button
              type="button"
              className={`desk-tab-btn ${reportTab === 'LOG' ? 'active' : ''}`}
              onClick={() => {
                preAutoReportTabRef.current = null;
                setReportTab('LOG');
              }}
            >
              <ScrollText size={12} /> Log
            </button>
            <button
              type="button"
              className={`desk-tab-btn ${reportTab === 'CHAT' ? 'active' : ''}`}
              onClick={() => {
                preAutoReportTabRef.current = null;
                setUnreadChat(false);
                setReportTab('CHAT');
              }}
            >
              <MessageSquare size={12} /> Chat
              {unreadChat && <span className="unread-dot" />}
            </button>
            {gameState.isCommander && (
              <button
                type="button"
                className={`desk-tab-btn ${reportTab === 'CMD' ? 'active' : ''}`}
                onClick={() => {
                  preAutoReportTabRef.current = null;
                  setReportTab('CMD');
                }}
              >
                <Crown size={12} /> Cmd
              </button>
            )}
          </div>

          <div className="desk-report-body">
            {reportTab === 'STACK' && (
              <div className="desk-stack-list">
                {gameState.stack.length === 0 ? (
                  <div className="desk-empty-note">
                    La Pila (Stack) è vuota.
                  </div>
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
                        } ${item.isSelectable ? 'stack-selectable' : ''} ${
                          item.isTrigger
                            ? 'kind-trigger'
                            : item.ability
                            ? 'kind-ability'
                            : 'kind-spell'
                        }`}
                        onMouseEnter={() => {
                          onHoverStackItem(item.key);
                          if (item.sourceCard) onInspectCard(item.sourceCard);
                        }}
                        onMouseLeave={() => onHoverStackItem(null)}
                        onClick={() => onStackItemClick(item)}
                      >
                        {item.sourceCard?.imageUrl && (
                          <img
                            src={item.sourceCard.imageUrl}
                            alt={item.sourceCard.name}
                            className="desk-stack-thumb"
                          />
                        )}
                        <div className="desk-stack-content">
                          <div className="desk-stack-meta">
                            {isTop && (
                              <span className="stack-resolving-next">
                                ▶ RISOLVE
                              </span>
                            )}
                            <span className="stack-kind-pill">
                              {item.isTrigger
                                ? 'TRIGGER'
                                : item.ability
                                ? 'ABILITÀ'
                                : 'MAGIA'}
                            </span>
                            <span className="stack-owner">
                              {item.activatingPlayerName}
                            </span>
                          </div>
                          <strong className="desk-stack-title">
                            {item.sourceCard?.name || 'Abilità'}
                          </strong>
                          <p className="desk-stack-text">{item.text}</p>
                          {targets.length > 0 && (
                            <div className="desk-stack-targets">
                              <Crosshair size={10} /> {targets.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {reportTab === 'COMBAT' && (
              <div className="desk-combat-list">
                {!gameState.combat || gameState.combat.numAttackers === 0 ? (
                  <div className="desk-empty-note">
                    Nessun combattimento in corso.
                  </div>
                ) : (
                  gameState.combat.bands.map((b, idx) => (
                    <div key={idx} className="desk-combat-band">
                      <div className="combat-band-def">
                        ⚔️ Attacca <strong>{b.defenderName}</strong>
                      </div>
                      <div className="combat-band-att">
                        {b.attackers
                          .map((a) => `${a.name} (${a.power}/${a.toughness})`)
                          .join(', ')}
                      </div>
                      {b.blocked && b.blockers.length > 0 ? (
                        <div className="combat-band-blk">
                          🛡️ Bloccato da:{' '}
                          {b.blockers
                            .map((blk) => `${blk.name} (${blk.power}/${blk.toughness})`)
                            .join(', ')}
                        </div>
                      ) : (
                        <div className="combat-band-unblocked">Non bloccato</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {reportTab === 'LOG' && (
              <div className="desk-log-scroll" ref={logScrollRef}>
                {gameState.gameLog.length === 0 ? (
                  <div className="desk-empty-note">
                    La partita è appena iniziata.
                  </div>
                ) : (
                  gameState.gameLog.map((entry, idx) => (
                    <div key={idx} className="log-line">
                      {entry.summary}
                    </div>
                  ))
                )}
              </div>
            )}

            {reportTab === 'CHAT' && (
              <div className="desk-chat-wrap">
                <div className="desk-chat-scroll" ref={chatScrollRef}>
                  {chatMessages.map((m, idx) => (
                    <div key={idx} className="chat-bubble">
                      <span className="chat-sender">{m.sender}:</span>{' '}
                      <span>{m.message}</span>
                    </div>
                  ))}
                </div>
                <form className="chat-input-row" onSubmit={handleChatSubmit}>
                  <input
                    type="text"
                    placeholder="Messaggio al tavolo..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                  />
                  <button type="submit" className="btn-primary btn-sm">
                    <Send size={13} />
                  </button>
                </form>
              </div>
            )}

            {reportTab === 'CMD' && (
              <div className="desk-cmd-pane">
                <div className="info-card-block">
                  <h4>
                    <Crown size={14} className="gold-icon" /> Comandanti &amp; Tassa
                  </h4>
                  {gameState.players.map((p) => (
                    <div key={p.id} className="cmd-player-summary">
                      <div className="cmd-player-header">
                        <strong>{p.name}</strong>
                        <span>{p.life} PV</span>
                      </div>
                      {p.commanders.length === 0 ? (
                        <div className="muted-sm">Nessun Comandante</div>
                      ) : (
                        p.commanders.map((cm, idx) => (
                          <div key={idx} className="cmd-tax-row">
                            <span>{cm.card.name}</span>
                            <span className="tax-pill">
                              {cm.castCount}x (Tassa +{cm.taxMana})
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>

                <div className="info-card-block">
                  <h4>
                    <Swords size={14} className="gold-icon" /> Danni da Comandante
                  </h4>
                  {gameState.players.map((p) => (
                    <div key={p.id} className="cmd-dmg-block">
                      <strong>{p.name}:</strong>
                      {p.commanderDamageTaken.length === 0 ? (
                        <div className="muted-sm">0 danni</div>
                      ) : (
                        p.commanderDamageTaken.map((d, idx) => (
                          <div key={idx} className="cmd-dmg-line">
                            <span>
                              da {d.commanderName} ({d.commanderOwnerName})
                            </span>
                            <strong className={d.damage >= 15 ? 'danger-text' : ''}>
                              {d.damage}/21
                            </strong>
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Middle Dock Toolbar (VDock) */}
        <section className="desk-dock-bar">
          <button
            type="button"
            className={`dock-btn ${gameState.yieldState.autoYieldAll ? 'active' : ''}`}
            onClick={onAutoPassEot}
            title="Passa automaticamente fino alla Fine del Turno"
          >
            <FastForward size={13} /> Passa Turno
          </button>
          <button
            type="button"
            className={`dock-btn ${
              gameState.yieldState.autoYieldStackEmpty ? 'active' : ''
            }`}
            onClick={onYieldStackEmpty}
            title="Cedi priorità finché la Pila non è vuota"
          >
            <Layers size={13} /> Cedi Pila
          </button>
          <button
            type="button"
            className={`dock-btn ${
              gameState.yieldState.autoPassNoActions ? 'active' : ''
            }`}
            onClick={onToggleAutoPassNoActions}
            title="Auto-Pass intelligente quando non hai carte o abilità giocabili (attivo di default)"
          >
            <Zap size={13} /> Smart Pass
          </button>
          {isYieldActive && (
            <button
              type="button"
              className="dock-btn danger"
              onClick={onCancelAutoPass}
              title="Annulla Auto-Pass attivo"
            >
              <PauseCircle size={13} /> Stop Auto
            </button>
          )}
          {gameState.isDeclareAttackers && gameState.isMyTurn && (
            <button
              type="button"
              className="dock-btn combat"
              onClick={onAlphaStrike}
              title="Attacca con tutte le creature disponibili (Alpha Strike)"
            >
              <Sword size={13} /> Attacca Tutto
            </button>
          )}
          <button
            type="button"
            className={`dock-btn ${arcMode !== 'OFF' ? 'active' : ''}`}
            onClick={onCycleArcMode}
            title="Cambia modalità frecce di combattimento/bersaglio (Tutte / Hover / Off)"
          >
            <Crosshair size={13} /> Archi:{' '}
            {arcMode === 'ALL' ? 'Tutti' : arcMode === 'HOVER' ? 'Hover' : 'Off'}
          </button>
          <button
            type="button"
            className="dock-btn"
            onClick={() => onSwitchLayoutMode('MOBILE')}
            title="Passa al layout compatto Mobile / Android"
          >
            <Smartphone size={13} /> Mobile UI
          </button>
          {!gameState.gameOver && !localPlayer?.hasLost && (
            confirmingConcede ? (
              <>
                <button
                  type="button"
                  className="dock-btn danger"
                  onClick={() => {
                    setConfirmingConcede(false);
                    onConcede();
                  }}
                >
                  <Flag size={13} /> Conferma Resa
                </button>
                <button
                  type="button"
                  className="dock-btn"
                  onClick={() => setConfirmingConcede(false)}
                >
                  No
                </button>
              </>
            ) : (
              <button
                type="button"
                className="dock-btn"
                onClick={() => setConfirmingConcede(true)}
                title="Concedi questa partita"
              >
                <Flag size={13} /> Concedi
              </button>
            )
          )}
          <button
            type="button"
            className="dock-btn"
            onClick={onLeaveRoom}
            title="Esci dalla stanza"
          >
            <LogOut size={13} /> Esci
          </button>
        </section>

        {/* Bottom Prompt Panel (VPrompt, anchored next to Hand) */}
        <section
          className={`desk-prompt-panel tone-${actionHint.tone} ${
            promptInvalidPulse ? 'prompt-invalid-flash' : ''
          }`}
        >
          <div className="prompt-header-strip">
            <span
              className="prompt-turn-pill"
              title={`Giro di tavolo #${gameState.round} • Turno giocatore #${gameState.turn}`}
            >
              Giro {gameState.round} • {phaseDisplay.itShort}
            </span>
            <span className={`prompt-state-badge tone-${actionHint.tone}`}>
              {actionHint.badge}
            </span>
          </div>

          <div className="prompt-guidance-line">{actionHint.hint}</div>

          <div className="prompt-message-scroll">
            {gameState.prompt?.card && !gameState.prompt.card.hidden && (
              <button
                type="button"
                className="prompt-card-mini"
                onMouseEnter={() => onInspectCard(gameState.prompt.card!)}
                onClick={() => onZoomCard(gameState.prompt.card!, [gameState.prompt.card!])}
                title={`Clicca per ingrandire ${gameState.prompt.card.name}`}
              >
                {gameState.prompt.card.imageUrl && (
                  <img
                    src={gameState.prompt.card.imageUrl}
                    alt={gameState.prompt.card.name}
                  />
                )}
              </button>
            )}
            <div className="prompt-message-text">
              <p>
                {gameState.prompt?.message || 'In attesa della prossima azione...'}
              </p>
              {gameState.prompt?.notification &&
                gameState.prompt.notification !== gameState.prompt.message && (
                  <div className="prompt-notification-sub">
                    💡 {gameState.prompt.notification}
                  </div>
                )}
            </div>
          </div>

          {/* Selectable Player quick pills */}
          {gameState.selectablePlayerIds.length > 0 && (
            <div className="prompt-target-players-row">
              {gameState.players
                .filter((p) => gameState.selectablePlayerIds.includes(p.id))
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="btn-target-player"
                    onClick={() => onPlayerClick(p)}
                  >
                    🎯 {p.name} {p.isLocalViewer ? '(Tu)' : ''}
                  </button>
                ))}
            </div>
          )}

          <div className="prompt-action-footer">
            {gameState.undoAvailable &&
              !(gameState.prompt?.cancelText || '')
                .toLowerCase()
                .includes('undo') && (
                <button
                  type="button"
                  className="btn-undo-square"
                  onClick={onUndo}
                  title="Annulla ultima azione (Ctrl+Z)"
                >
                  <RotateCcw size={14} /> Undo
                </button>
              )}
            <div className="prompt-ok-cancel-pair">
              <button
                type="button"
                className="btn-prompt-ok"
                disabled={!gameState.prompt?.okEnabled}
                onClick={onButtonOk}
                title="Conferma / Passa alla fase successiva (Spazio)"
              >
                <Check size={15} />{' '}
                {formatPromptButtonLabel(
                  gameState.prompt?.okText,
                  true,
                  gameState
                )}
              </button>
              <button
                type="button"
                className="btn-prompt-cancel"
                disabled={!gameState.prompt?.cancelEnabled}
                onClick={onButtonCancel}
              >
                {formatPromptButtonLabel(
                  gameState.prompt?.cancelText,
                  false,
                  gameState
                )}
              </button>
            </div>
          </div>
        </section>
      </aside>

      {/* ===================================================================
          CENTER COLUMN (~59%): OPPONENT VFIELD(S) + LOCAL VFIELD + HAND/ZONES
         =================================================================== */}
      <main className="desk-center-col">
        {/* Opponents Region */}
        <section className="desk-opponents-region">
          {opponents.length > 1 && (
            <div className="desk-opp-switcher">
              <button
                type="button"
                className={`opp-sw-pill ${oppViewMode === 'SPLIT' ? 'active' : ''}`}
                onClick={() => setOppViewMode('SPLIT')}
              >
                Griglia ({opponents.length})
              </button>
              {opponents.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`opp-sw-pill ${
                    oppViewMode === 'TABBED' && focusedOppId === o.id
                      ? 'active'
                      : ''
                  } ${o.isTurn ? 'opp-turn' : ''} ${
                    o.isSelectable ? 'opp-selectable' : ''
                  }`}
                  onClick={() => {
                    setOppViewMode('TABBED');
                    setFocusedOppId(o.id);
                  }}
                >
                  {o.isTurn && '● '}
                  {o.name} ❤️{o.life}
                  {o.isSelectable && ' 🎯'}
                </button>
              ))}
            </div>
          )}

          <div
            className={`desk-opponents-grid count-${
              oppViewMode === 'TABBED' ? 1 : Math.min(visibleOpponents.length, 3)
            }`}
          >
            {visibleOpponents.map((opp) => renderVField(opp, true))}
          </div>
        </section>

        {/* Local Player VField */}
        {localPlayer && (
          <section className="desk-local-region">
            {renderVField(localPlayer, false)}
          </section>
        )}

        {/* Bottom VHand + Docked VZone Tabs */}
        {localPlayer && (
          <section className="desk-hand-panel">
            <div className="desk-hand-tabs">
              <button
                type="button"
                className={`hand-tab-btn ${bottomTab === 'HAND' ? 'active' : ''}`}
                onClick={() => {
                  preAutoBottomTabRef.current = null;
                  setBottomTab('HAND');
                }}
              >
                ✋ Mano ({localPlayer.zones.hand.length})
              </button>
              <button
                type="button"
                className={`hand-tab-btn ${
                  bottomTab === 'COMMAND_EXTRA' ? 'active' : ''
                }`}
                onClick={() => {
                  preAutoBottomTabRef.current = null;
                  setBottomTab('COMMAND_EXTRA');
                }}
              >
                <Crown size={12} /> Comando / Giocabili (
                {localPlayer.zones.command.length +
                  localPlayer.zones.flashback.length}
                )
              </button>
              <button
                type="button"
                className={`hand-tab-btn ${bottomTab === 'ZONE' ? 'active' : ''}`}
                onClick={() =>
                  openZoneTab(
                    activeZonePlayer?.id ?? localPlayer.id,
                    zoneBrowserType
                  )
                }
              >
                <Eye size={12} /> Zone ({activeZonePlayer?.name || 'Tu'})
              </button>
            </div>

            <div className="desk-hand-body">
              {bottomTab === 'HAND' && (
                <div className="desk-hand-tray">
                  {(localPlayer.zones.command.length > 0 ||
                    localPlayer.zones.flashback.length > 0) && (
                    <div className="pinned-command-slot">
                      <span className="slot-micro-label">
                        <Crown size={11} /> CMD
                      </span>
                      <div className="pinned-command-cards">
                        {localPlayer.zones.command.map((c) => {
                          const cmdMeta = localPlayer.commanders.find(
                            (cm) => cm.card.name === c.name
                          );
                          return (
                            <CardVisual
                              key={c.id}
                              card={c}
                              size="sm"
                              onClick={onCardClick}
                              onInspect={onInspectCard}
                              onZoom={(cardItem) =>
                                onZoomCard(cardItem, localPlayer.zones.command)
                              }
                              badgeText={
                                cmdMeta && cmdMeta.taxMana > 0
                                  ? `Tax +${cmdMeta.taxMana}`
                                  : undefined
                              }
                              dimNonSelectable={dimNonSelectable}
                            />
                          );
                        })}
                        {localPlayer.zones.flashback
                          .filter(
                            (fc) =>
                              !localPlayer.zones.command.some(
                                (cc) => cc.id === fc.id
                              )
                          )
                          .slice(0, 3)
                          .map((c) => (
                            <CardVisual
                              key={c.id}
                              card={c}
                              size="sm"
                              onClick={onCardClick}
                              onInspect={onInspectCard}
                              onZoom={(cardItem) =>
                                onZoomCard(cardItem, localPlayer.zones.flashback)
                              }
                              badgeText="EXTRA"
                              dimNonSelectable={dimNonSelectable}
                            />
                          ))}
                      </div>
                    </div>
                  )}

                  <div
                    className={`hand-cards-strip ${
                      localPlayer.zones.hand.length >= 4 ? 'fanned-hand-strip' : ''
                    }`}
                  >
                    {localPlayer.zones.hand.length === 0 ? (
                      <div className="desk-empty-note">Nessuna carta in mano.</div>
                    ) : (
                      localPlayer.zones.hand.map((c, idx) => {
                        const total = localPlayer.zones.hand.length;
                        const mid = (total - 1) / 2;
                        const offset = idx - mid;
                        const fanRot =
                          total >= 4 && total <= 10 ? offset * 1.6 : 0;
                        const fanY =
                          total >= 4 && total <= 10
                            ? Math.abs(offset) * 2.2
                            : 0;
                        return (
                          <div
                            key={c.id}
                            className="fanned-hand-item"
                            style={
                              {
                                '--hand-rot': `${fanRot}deg`,
                                '--hand-y': `${fanY}px`,
                                zIndex: 5 + idx,
                              } as React.CSSProperties
                            }
                          >
                            <CardVisual
                              card={c}
                              size="md"
                              inHand={true}
                              onClick={onCardClick}
                              onInspect={onInspectCard}
                              onZoom={(cardItem) =>
                                onZoomCard(cardItem, localPlayer.zones.hand)
                              }
                              dimNonSelectable={dimNonSelectable}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {bottomTab === 'COMMAND_EXTRA' && (
                <div className="hand-cards-strip">
                  {localPlayer.zones.command.map((c) => (
                    <CardVisual
                      key={c.id}
                      card={c}
                      size="md"
                      onClick={onCardClick}
                      onInspect={onInspectCard}
                      onZoom={(cardItem) =>
                        onZoomCard(cardItem, localPlayer.zones.command)
                      }
                      badgeText="CMD"
                      dimNonSelectable={dimNonSelectable}
                    />
                  ))}
                  {localPlayer.zones.flashback
                    .filter(
                      (fc) =>
                        !localPlayer.zones.command.some((cc) => cc.id === fc.id)
                    )
                    .map((c) => (
                      <CardVisual
                        key={c.id}
                        card={c}
                        size="md"
                        onClick={onCardClick}
                        onInspect={onInspectCard}
                        onZoom={(cardItem) =>
                          onZoomCard(cardItem, localPlayer.zones.flashback)
                        }
                        badgeText="GIOCABILE"
                        dimNonSelectable={dimNonSelectable}
                      />
                    ))}
                  {localPlayer.zones.command.length === 0 &&
                    localPlayer.zones.flashback.length === 0 && (
                      <div className="desk-empty-note">
                        Nessuna carta in Zona di Comando o giocabile da altre zone.
                      </div>
                    )}
                </div>
              )}

              {bottomTab === 'ZONE' && (
                <div className="desk-zone-browser">
                  <div className="zone-browser-controls">
                    <select
                      value={activeZonePlayer?.id ?? ''}
                      onChange={(e) =>
                        setZoneBrowserPlayerId(Number(e.target.value))
                      }
                    >
                      {gameState.players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.isLocalViewer ? '(Tu)' : ''}
                        </option>
                      ))}
                    </select>
                    {(
                      [
                        { key: 'graveyard', label: 'Cimitero' },
                        { key: 'exile', label: 'Esilio' },
                        { key: 'command', label: 'Comando' },
                        { key: 'flashback', label: 'Giocabili' },
                      ] as const
                    ).map((zt) => (
                      <button
                        key={zt.key}
                        type="button"
                        className={`pill-btn ${
                          zoneBrowserType === zt.key ? 'active' : ''
                        }`}
                        onClick={() => setZoneBrowserType(zt.key)}
                      >
                        {zt.label} ({activeZonePlayer?.zones[zt.key]?.length || 0})
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn-ghost-sm ml-auto"
                      onClick={() => setBottomTab('HAND')}
                      title="Torna alla Mano"
                    >
                      <X size={13} /> Mano
                    </button>
                  </div>

                  <div className="hand-cards-strip">
                    {(activeZonePlayer?.zones[zoneBrowserType] || []).length ===
                    0 ? (
                      <div className="desk-empty-note">
                        Nessuna carta in questa zona.
                      </div>
                    ) : (
                      (activeZonePlayer?.zones[zoneBrowserType] || []).map((c) => (
                        <CardVisual
                          key={c.id}
                          card={c}
                          size="sm"
                          onClick={onCardClick}
                          onInspect={onInspectCard}
                          onZoom={(cardItem) =>
                            onZoomCard(
                              cardItem,
                              activeZonePlayer?.zones[zoneBrowserType] || []
                            )
                          }
                          dimNonSelectable={dimNonSelectable}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ===================================================================
          RIGHT COLUMN (~20%): ALWAYS-VISIBLE VDETAIL + VPICTURE
         =================================================================== */}
      <aside className="desk-right-col">
        {/* Top VDetail */}
        <section className="desk-vdetail">
          {displayCard && !displayCard.hidden ? (
            <>
              <div className="vdetail-header">
                <h3 className="vdetail-name">{detailName}</h3>
                <ManaCostDisplay text={detailMana} size="sm" />
              </div>
              <div className="vdetail-type">
                <span>{detailType || 'Carta'}</span>
                {displayCard.setCode && (
                  <span className="set-tag">{displayCard.setCode}</span>
                )}
              </div>
              <div className="vdetail-stats-row">
                {displayCard.isCreature && (
                  <span className="vdetail-stat-pill">
                    F/C:{' '}
                    <strong>
                      {showAlternateFace &&
                      displayCard.alternatePower !== undefined
                        ? `${displayCard.alternatePower}/${displayCard.alternateToughness}`
                        : `${displayCard.power ?? 0}/${displayCard.toughness ?? 0}`}
                    </strong>
                    {(displayCard.damage || 0) > 0 && (
                      <span className="dmg-warn"> (-{displayCard.damage})</span>
                    )}
                  </span>
                )}
                {displayCard.isPlaneswalker && displayCard.loyalty && (
                  <span className="vdetail-stat-pill">
                    Fedeltà: <strong>❖ {displayCard.loyalty}</strong>
                  </span>
                )}
                {displayCard.defense && displayCard.defense !== '0' && (
                  <span className="vdetail-stat-pill">
                    Difesa: <strong>🛡️ {displayCard.defense}</strong>
                  </span>
                )}
              </div>
              <div className="vdetail-oracle-scroll">
                <OracleTextDisplay
                  text={detailOracle || 'Nessun testo regole.'}
                />
                {displayCard.counters &&
                  Object.keys(displayCard.counters).length > 0 && (
                    <div className="vdetail-counters">
                      {Object.entries(displayCard.counters).map(([k, v]) => (
                        <span key={k} className="counter-pill">
                          {v}x {k}
                        </span>
                      ))}
                    </div>
                  )}
              </div>
            </>
          ) : (
            <div className="desk-empty-note">
              Passa il mouse sopra qualsiasi carta per leggere il testo Oracle
              completo e i dettagli.
            </div>
          )}
        </section>

        {/* Bottom VPicture */}
        <section className="desk-vpicture">
          {displayCard && !displayCard.hidden ? (
            <div className="vpicture-frame">
              <img
                src={detailImage}
                alt={detailName || 'Carta'}
                className="vpicture-img"
                onClick={() => {
                  if (displayCard.hasAlternateState) {
                    setShowAlternateFace((prev) => !prev);
                  } else {
                    onZoomCard(displayCard, [displayCard]);
                  }
                }}
                onError={(e) => {
                  if (
                    displayCard.scryfallFallbackUrl &&
                    e.currentTarget.src !== displayCard.scryfallFallbackUrl
                  ) {
                    e.currentTarget.src = displayCard.scryfallFallbackUrl;
                  }
                }}
              />
              <div className="vpicture-actions">
                {displayCard.hasAlternateState && (
                  <button
                    type="button"
                    className="btn-flip-dfc"
                    onClick={() => setShowAlternateFace((prev) => !prev)}
                  >
                    <RefreshCw size={12} />{' '}
                    {showAlternateFace ? 'Fronte' : 'Gira Faccia'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-zoom-pic"
                  onClick={() => onZoomCard(displayCard, [displayCard])}
                  title="Ingrandisci carta (Scorciatoia: Z)"
                >
                  <Maximize2 size={12} /> Zoom (Z)
                </button>
              </div>
            </div>
          ) : (
            <div className="vpicture-placeholder">
              <Sparkles size={24} className="gold-icon" />
              <span>Anteprima Carta</span>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
};
