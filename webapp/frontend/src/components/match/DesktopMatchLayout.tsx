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
  PLAYMAT_THEMES,
  SLEEVE_THEMES,
  getPlaymatTheme,
  getSleeveTheme,
} from './playmats';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Crown,
  Eye,
  FastForward,
  Flag,
  Hand,
  Heart,
  Layers,
  LogOut,
  Maximize2,
  MessageSquare,
  Palette,
  PanelRightClose,
  PanelRightOpen,
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
  playmatId: string;
  sleeveId: string;
  waitReactions: Record<string, number>;
  onSelectPlaymat: (id: string) => void;
  onSelectSleeve: (id: string) => void;
  onTriggerWaitReaction: () => void;
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

type DrawerTab = 'STACK' | 'COMBAT' | 'LOG' | 'CHAT' | 'CMD';
type BottomDockTab = 'HAND' | 'COMMAND_EXTRA' | 'ZONE';

export const DesktopMatchLayout: React.FC<MatchLayoutProps> = ({
  gameState,
  chatMessages,
  inspectedCard,
  arcMode,
  playmatId,
  sleeveId,
  waitReactions,
  onSelectPlaymat,
  onSelectSleeve,
  onTriggerWaitReaction,
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
  const [drawerOpen, setDrawerOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1220 : true
  );
  const [reportTab, setReportTab] = useState<DrawerTab>(() =>
    gameState.stack.length > 0 ? 'STACK' : 'LOG'
  );
  const preAutoReportTabRef = useRef<DrawerTab | null>(null);
  const prevStackLenRef = useRef<number>(gameState.stack.length);

  const [bottomTab, setBottomTab] = useState<BottomDockTab>('HAND');
  const [handDockCollapsed, setHandDockCollapsed] = useState<boolean>(false);
  const [zoneBrowserPlayerId, setZoneBrowserPlayerId] = useState<number | null>(null);
  const [zoneBrowserType, setZoneBrowserType] = useState<DockZoneKey>('graveyard');
  const preAutoBottomTabRef = useRef<BottomDockTab | null>(null);

  const [phaseStopScope, setPhaseStopScope] = useState<'AUTO' | 'OWN' | 'OPP'>('AUTO');
  const [playmatMenuOpen, setPlaymatMenuOpen] = useState<boolean>(false);
  const [expandedOppId, setExpandedOppId] = useState<number | null>(null);

  const [showAlternateFace, setShowAlternateFace] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [unreadChat, setUnreadChat] = useState(false);
  const prevChatLenRef = useRef<number>(chatMessages.length);

  const [confirmingConcede, setConfirmingConcede] = useState(false);
  const [promptInvalidPulse, setPromptInvalidPulse] = useState(false);
  const prevInvalidSeqRef = useRef<number>(gameState.prompt?.invalidActionSeq || 0);

  // Life deltas with independent per-player timers
  const prevLifeRef = useRef<Record<number, number>>({});
  const lifeDeltaTimersRef = useRef<Record<number, number>>({});
  const [lifeDeltas, setLifeDeltas] = useState<Record<number, number>>({});

  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const playmatTheme = useMemo(() => getPlaymatTheme(playmatId), [playmatId]);
  const sleeveTheme = useMemo(() => getSleeveTheme(sleeveId), [sleeveId]);

  const localPlayer = useMemo(
    () => gameState.players.find((p) => p.isLocalViewer) || gameState.players[0],
    [gameState.players]
  );
  const opponents = useMemo(
    () => gameState.players.filter((p) => p.id !== localPlayer?.id),
    [gameState.players, localPlayer?.id]
  );

  // Build ordered quadrant seats:
  // 4P -> classic EDHPlay 2x2: [Opp0 (TL), Opp1 (TR), Local (BL), Opp2 (BR)]
  // 2P -> [Opp0 (Top), Local (Bottom)]
  // 3P -> [Opp0 (TL), Opp1 (TR), Local (Bottom full width)]
  // 5P+ -> [Opponents..., Local]
  const quadrantSeats = useMemo(() => {
    if (!localPlayer) return [];
    if (expandedOppId !== null) {
      const targetOpp = opponents.find((o) => o.id === expandedOppId);
      if (targetOpp) {
        return [
          { player: targetOpp, mirror: true, spanFull: false },
          { player: localPlayer, mirror: false, spanFull: false },
        ];
      }
    }
    if (opponents.length === 1) {
      return [
        { player: opponents[0], mirror: true, spanFull: false },
        { player: localPlayer, mirror: false, spanFull: false },
      ];
    }
    if (opponents.length === 2) {
      return [
        { player: opponents[0], mirror: true, spanFull: false },
        { player: opponents[1], mirror: true, spanFull: false },
        { player: localPlayer, mirror: false, spanFull: true },
      ];
    }
    if (opponents.length === 3) {
      return [
        { player: opponents[0], mirror: true, spanFull: false },
        { player: opponents[1], mirror: true, spanFull: false },
        { player: localPlayer, mirror: false, spanFull: false },
        { player: opponents[2], mirror: true, spanFull: false },
      ];
    }
    return [
      ...opponents.map((o) => ({ player: o, mirror: true, spanFull: false })),
      { player: localPlayer, mirror: false, spanFull: false },
    ];
  }, [localPlayer, opponents, expandedOppId]);

  const gridLayoutClass = useMemo(() => {
    if (expandedOppId !== null || opponents.length <= 1) return 'quad-layout-2p';
    if (opponents.length === 2) return 'quad-layout-3p';
    if (opponents.length === 3) return 'quad-layout-2x2';
    return 'quad-layout-multi';
  }, [opponents.length, expandedOppId]);

  // Reset DFC flip when inspected card changes
  const displayCard =
    inspectedCard || gameState.prompt?.focusedCard || gameState.prompt?.card || null;
  useEffect(() => {
    setShowAlternateFace(false);
  }, [displayCard?.id]);

  // Auto-switch drawer report tab to STACK / COMBAT like CMatchUI
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
    } else if (
      stackLen === 0 &&
      !hasCombat &&
      preAutoReportTabRef.current !== null
    ) {
      setReportTab(preAutoReportTabRef.current);
      preAutoReportTabRef.current = null;
    }
    prevStackLenRef.current = stackLen;
  }, [
    gameState.stack.length,
    gameState.combat?.numAttackers,
    gameState.selectableStackIds.length,
  ]);

  // Auto-open selectable non-hand/non-battlefield zone (Graveyard/Exile/Command targeting)
  useEffect(() => {
    const autoTarget = findAutoOpenZone(gameState);
    if (autoTarget) {
      if (preAutoBottomTabRef.current === null) {
        preAutoBottomTabRef.current = bottomTab;
      }
      setHandDockCollapsed(false);
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
    if (drawerOpen && reportTab === 'LOG' && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [gameState.gameLog.length, reportTab, drawerOpen]);

  useEffect(() => {
    if (
      chatMessages.length > prevChatLenRef.current &&
      (!drawerOpen || reportTab !== 'CHAT')
    ) {
      setUnreadChat(true);
    }
    prevChatLenRef.current = chatMessages.length;
    if (drawerOpen && reportTab === 'CHAT') {
      setUnreadChat(false);
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }
  }, [chatMessages.length, reportTab, drawerOpen]);

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

  const isLocalWaiting = Boolean(
    localPlayer && waitReactions[localPlayer.name.trim().toLowerCase()]
  );

  const effectivePhaseStopOwn =
    phaseStopScope === 'OWN'
      ? true
      : phaseStopScope === 'OPP'
      ? false
      : gameState.isMyTurn;

  const openZoneTab = (playerId: number, zone: DockZoneKey) => {
    preAutoBottomTabRef.current = null;
    setHandDockCollapsed(false);
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

  const activeZonePlayer =
    gameState.players.find((p) => p.id === zoneBrowserPlayerId) || localPlayer;

  const showFloatingStack =
    gameState.stack.length > 0 && (!drawerOpen || reportTab !== 'STACK');

  const renderStackEntry = (item: StackItemState, idx: number) => {
    const isTop = idx === 0;
    const targets = [
      ...item.targetPlayers.map((tp) => tp.name),
      ...item.targetCards.map((tc) => tc.name),
    ];
    return (
      <div
        key={item.key || idx}
        data-stack-key={item.key}
        className={`desk-stack-entry ${isTop ? 'top-resolving' : ''} ${
          item.isSelectable ? 'stack-selectable' : ''
        } ${
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
            {isTop && <span className="stack-resolving-next">▶ RISOLVE</span>}
            <span className="stack-kind-pill">
              {item.isTrigger
                ? 'TRIGGER'
                : item.ability
                ? 'ABILITÀ'
                : 'MAGIA'}
            </span>
            <span className="stack-owner">{item.activatingPlayerName}</span>
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
  };

  const renderQuadrant = (
    player: PlayerViewState,
    mirror: boolean,
    spanFull: boolean
  ) => {
    const bf = mirror
      ? partitionBattlefield(player.zones.battlefield || [])
      : localBf;
    const lifeDelta = lifeDeltas[player.id];
    const isTurnActive = gameState.playerTurnId === player.id;
    const isTargetedByStack = stackTargetPlayerIds.has(player.id);
    const hasWaitReaction = Boolean(
      waitReactions[player.name.trim().toLowerCase()]
    );
    const cardSize =
      opponents.length >= 3 && expandedOppId === null ? 'xs' : 'sm';

    const creaturesRow = (
      <div className="quad-bf-row quad-creatures-row">
        {bf.creatureGroups.length === 0 ? (
          <span className="quad-row-placeholder">
            {mirror ? 'Creature' : 'Prima Linea — Creature'}
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
                sleeveTheme={sleeveTheme}
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
      <div className="quad-bf-row quad-back-row">
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
                sleeveTheme={sleeveTheme}
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
                    sleeveTheme={sleeveTheme}
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
                  sleeveTheme={sleeveTheme}
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

    const maxCmdDmg =
      player.commanderDamageTaken.length > 0
        ? Math.max(...player.commanderDamageTaken.map((d) => d.damage))
        : 0;

    return (
      <section
        key={player.id}
        className={`edh-quadrant ${mirror ? 'is-opponent' : 'is-local'} ${
          spanFull ? 'span-full' : ''
        } ${isTurnActive ? 'is-turn-player' : ''} ${
          player.hasPriority ? 'has-priority' : ''
        } ${player.hasLost ? 'player-lost' : ''}`}
        style={
          !mirror
            ? {
                background: playmatTheme.surfaceCss,
                borderColor: isTurnActive
                  ? 'var(--accent-cyan)'
                  : playmatTheme.borderAccent,
              }
            : undefined
        }
      >
        {/* Wait / In Response floating banner on this player's quadrant */}
        {hasWaitReaction && (
          <div className="quad-wait-reaction-banner" role="status">
            <Hand size={15} />
            <span>
              <strong>{player.name}</strong>: Aspetta! In risposta…
            </span>
          </div>
        )}

        {/* Quadrant Top HUD Bar */}
        <div className="quad-header">
          <button
            type="button"
            data-player-avatar={player.id}
            className={`quad-player-pill ${
              player.isSelectable ? 'player-selectable' : ''
            } ${player.isSelected ? 'player-selected' : ''} ${
              isTargetedByStack ? 'player-stack-target' : ''
            }`}
            onClick={() => onPlayerClick(player)}
            title={`${player.name}${
              player.isSelectable ? ' — Clicca per bersagliare/selezionare' : ''
            }`}
          >
            <span className="quad-player-name">
              {isTurnActive && <span className="dot-turn" title="Turno Attivo">●</span>}
              {player.name}
              {player.isLocalViewer && <span className="you-mini-tag">TU</span>}
              {player.isAI && <span className="ai-mini-tag">IA</span>}
            </span>
            {player.hasPriority && (
              <span className="quad-prio-badge" title="Ha la Priorità">
                ⚡
              </span>
            )}
            <span className={`quad-life-chip ${player.life <= 5 ? 'critical' : ''}`}>
              <Heart size={11} /> {player.life}
            </span>
            {lifeDelta !== undefined && lifeDelta !== 0 && (
              <span
                className={`life-delta-pop ${
                  lifeDelta > 0 ? 'positive' : 'negative'
                }`}
              >
                {lifeDelta > 0 ? `+${lifeDelta}` : lifeDelta}
              </span>
            )}
            {player.poisonCounters > 0 && (
              <span className="quad-poison-chip" title="Segnalini Veleno">
                ☠ {player.poisonCounters}
              </span>
            )}
          </button>

          {/* Compact Zone Pills */}
          <div className="quad-zones-bar">
            <span className="quad-zone-pill passive" title="Carte in Mano">
              ✋ {player.zoneSizes.hand}
            </span>
            <span className="quad-zone-pill passive" title="Grimorio">
              📚 {player.zoneSizes.library}
            </span>
            <button
              type="button"
              className={`quad-zone-pill ${
                player.zones.graveyard.some((c) => c.isSelectable)
                  ? 'zone-has-selectable'
                  : ''
              }`}
              onClick={() => openZoneTab(player.id, 'graveyard')}
              title="Apri Cimitero"
            >
              🪦 {player.zoneSizes.graveyard}
            </button>
            <button
              type="button"
              className={`quad-zone-pill ${
                player.zones.exile.some((c) => c.isSelectable)
                  ? 'zone-has-selectable'
                  : ''
              }`}
              onClick={() => openZoneTab(player.id, 'exile')}
              title="Apri Esilio"
            >
              🌀 {player.zoneSizes.exile}
            </button>
            {(player.zoneSizes.command > 0 || player.commanders.length > 0) && (
              <button
                type="button"
                className={`quad-zone-pill cmd ${
                  player.zones.command.some((c) => c.isSelectable || c.isActionable)
                    ? 'zone-has-selectable'
                    : ''
                }`}
                onClick={() => openZoneTab(player.id, 'command')}
                title="Apri Zona di Comando"
              >
                👑 {player.zoneSizes.command}
              </button>
            )}
            {player.zoneSizes.flashback > 0 && (
              <button
                type="button"
                className="quad-zone-pill extra"
                onClick={() => openZoneTab(player.id, 'flashback')}
                title="Carte giocabili da altre zone"
              >
                ✨ {player.zoneSizes.flashback}
              </button>
            )}
            {!mirror && (
              <span
                className="quad-zone-pill passive land-drop-pill"
                title="Terre giocate questo turno"
              >
                ⛰ {player.numLandsPlayed}/{player.maxLandsToPlay}
              </span>
            )}
            {maxCmdDmg > 0 && (
              <button
                type="button"
                className="quad-zone-pill danger"
                onClick={() => {
                  setDrawerOpen(true);
                  setReportTab('CMD');
                }}
                title="Danni da Comandante subiti"
              >
                ⚔️ {maxCmdDmg}/21
              </button>
            )}
          </div>

          {/* Interactive Mana Pool inline (when floating mana or local player) */}
          <div className="quad-header-right">
            {(!mirror || player.manaPool.total > 0) && (
              <div className="quad-mana-strip">
                {(['W', 'U', 'B', 'R', 'G', 'C'] as const).map((col) => {
                  const val = player.manaPool[col] || 0;
                  if (val === 0) return null;
                  return (
                    <button
                      key={col}
                      type="button"
                      disabled={mirror}
                      className="quad-mana-chip"
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
            {mirror && opponents.length > 1 && (
              <button
                type="button"
                className={`quad-focus-btn ${
                  expandedOppId === player.id ? 'active' : ''
                }`}
                onClick={() =>
                  setExpandedOppId((prev) =>
                    prev === player.id ? null : player.id
                  )
                }
                title={
                  expandedOppId === player.id
                    ? 'Torna alla griglia 2×2'
                    : 'Ingrandisci questo quadrante'
                }
              >
                <Maximize2 size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Battlefield Playmat Rows */}
        <div className="quad-playarea">
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
      </section>
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
    <div className="edh-table-shell">
      {/* ===================================================================
          TOP BAR: TURN + INTERACTIVE 12 PHASES + AUTO-PASS + PLAYMAT + DRAWER
         =================================================================== */}
      <header className="edh-table-topbar">
        <div className="topbar-left-group">
          <div className="topbar-brand-mini">
            <Swords size={14} className="cyan-icon" />
            <span>LOZZANDER</span>
          </div>
          <div
            className={`topbar-turn-chip ${
              gameState.isMyTurn ? 'my-turn' : 'opp-turn'
            }`}
            title={`Giro #${gameState.round} • Turno #${gameState.turn}`}
          >
            <span>Giro {gameState.round}</span>
            <span>•</span>
            <strong>{gameState.playerTurnName || 'Turno'}</strong>
          </div>
        </div>

        {/* Interactive 12-Phase Track */}
        <div className="topbar-phases-cluster">
          <button
            type="button"
            className={`phase-scope-btn ${
              phaseStopScope !== 'AUTO' ? 'pinned' : ''
            }`}
            onClick={() =>
              setPhaseStopScope((prev) =>
                prev === 'AUTO' ? 'OWN' : prev === 'OWN' ? 'OPP' : 'AUTO'
              )
            }
            title="Seleziona per quali turni modificare gli Stop di fase (Auto / Tuo / Avv.)"
          >
            Stop:{' '}
            {phaseStopScope === 'AUTO'
              ? gameState.isMyTurn
                ? 'Tuo'
                : 'Avv.'
              : phaseStopScope === 'OWN'
              ? 'Tuo'
              : 'Avv.'}
          </button>

          <div className="topbar-phase-pills">
            {PHASES_12.map((ph) => {
              const skippedList = effectivePhaseStopOwn
                ? gameState.yieldState.skippedOwnPhases
                : gameState.yieldState.skippedOpponentPhases;
              const isStopped = !skippedList.includes(ph.code);
              const isCurrent =
                gameState.phase === ph.code ||
                (gameState.phase === 'UNTAP' && ph.code === 'UPKEEP');
              return (
                <button
                  key={ph.code}
                  type="button"
                  className={`topbar-phase-pill group-${ph.group.toLowerCase()} ${
                    isCurrent ? 'current' : ''
                  } ${isStopped ? 'has-stop' : 'skipped'}`}
                  onClick={() => onTogglePhaseStop(ph.code, effectivePhaseStopOwn)}
                  title={`${ph.full} (${
                    effectivePhaseStopOwn ? 'Tuo Turno' : 'Turno Avversario'
                  }) — ${isStopped ? 'Stop Attivo' : 'Saltata'}`}
                >
                  {ph.short}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Utility Controls */}
        <div className="topbar-right-group">
          <button
            type="button"
            className={`topbar-tool-btn ${
              gameState.yieldState.autoYieldAll ? 'active' : ''
            }`}
            onClick={onAutoPassEot}
            title="Passa automaticamente fino alla Fine del Turno"
          >
            <FastForward size={13} /> <span>Passa Turno</span>
          </button>
          <button
            type="button"
            className={`topbar-tool-btn ${
              gameState.yieldState.autoYieldStackEmpty ? 'active' : ''
            }`}
            onClick={onYieldStackEmpty}
            title="Cedi priorità finché la Pila non è vuota"
          >
            <Layers size={13} /> <span>Cedi Pila</span>
          </button>
          <button
            type="button"
            className={`topbar-tool-btn ${
              gameState.yieldState.autoPassNoActions ? 'active' : ''
            }`}
            onClick={onToggleAutoPassNoActions}
            title="Auto-Pass intelligente quando non hai giocate"
          >
            <Zap size={13} /> <span>Smart</span>
          </button>
          {isYieldActive && (
            <button
              type="button"
              className="topbar-tool-btn danger"
              onClick={onCancelAutoPass}
              title="Annulla Auto-Pass attivo"
            >
              <PauseCircle size={13} /> <span>Stop Auto</span>
            </button>
          )}

          <button
            type="button"
            className={`topbar-tool-btn ${arcMode !== 'OFF' ? 'active' : ''}`}
            onClick={onCycleArcMode}
            title="Modalità archi bersaglio (Tutti / Hover / Off)"
          >
            <Crosshair size={13} />
          </button>

          {/* Playmat & Sleeve Selector Popover Trigger */}
          <div className="playmat-popover-anchor">
            <button
              type="button"
              className={`topbar-tool-btn ${playmatMenuOpen ? 'active' : ''}`}
              onClick={() => setPlaymatMenuOpen((prev) => !prev)}
              title="Scegli Playmat e Sleeve carte"
            >
              <Palette size={13} /> <span>Playmat</span>
            </button>

            {playmatMenuOpen && (
              <div className="playmat-popover">
                <div className="playmat-pop-header">
                  <strong>Playmat &amp; Sleeve</strong>
                  <button
                    type="button"
                    className="playmat-pop-close"
                    onClick={() => setPlaymatMenuOpen(false)}
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="playmat-pop-section">
                  <span className="playmat-pop-label">Playmat Tavolo</span>
                  <div className="playmat-grid">
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
                </div>

                <div className="playmat-pop-section">
                  <span className="playmat-pop-label">
                    Sleeve Carte (Caricamento / Coperte)
                  </span>
                  <div className="sleeve-swatches-row">
                    {SLEEVE_THEMES.map((sl) => (
                      <button
                        key={sl.id}
                        type="button"
                        className={`sleeve-swatch-btn ${
                          sleeveId === sl.id ? 'selected' : ''
                        }`}
                        onClick={() => onSelectSleeve(sl.id)}
                        title={sl.name}
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
          </div>

          <button
            type="button"
            className="topbar-tool-btn"
            onClick={() => onSwitchLayoutMode('MOBILE')}
            title="Passa al layout compatto Mobile"
          >
            <Smartphone size={13} />
          </button>

          {!gameState.gameOver &&
            !localPlayer?.hasLost &&
            (confirmingConcede ? (
              <div className="concede-confirm-pair">
                <button
                  type="button"
                  className="topbar-tool-btn danger"
                  onClick={() => {
                    setConfirmingConcede(false);
                    onConcede();
                  }}
                >
                  <Flag size={12} /> Conferma
                </button>
                <button
                  type="button"
                  className="topbar-tool-btn"
                  onClick={() => setConfirmingConcede(false)}
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="topbar-tool-btn"
                onClick={() => setConfirmingConcede(true)}
                title="Concedi partita"
              >
                <Flag size={13} />
              </button>
            ))}

          <button
            type="button"
            className="topbar-tool-btn"
            onClick={onLeaveRoom}
            title="Esci dalla stanza"
          >
            <LogOut size={13} />
          </button>

          <button
            type="button"
            className={`topbar-drawer-toggle ${drawerOpen ? 'open' : ''}`}
            onClick={() => setDrawerOpen((prev) => !prev)}
            title={
              drawerOpen
                ? 'Chiudi pannello laterale'
                : 'Apri pannello laterale (Pila, Log, Chat, Carta)'
            }
          >
            {drawerOpen ? (
              <PanelRightClose size={15} />
            ) : (
              <PanelRightOpen size={15} />
            )}
            <span>Pannello</span>
            {!drawerOpen && gameState.stack.length > 0 && (
              <span className="drawer-badge-count">{gameState.stack.length}</span>
            )}
            {!drawerOpen && unreadChat && <span className="unread-dot" />}
          </button>
        </div>
      </header>

      {/* ===================================================================
          BODY WORKSPACE: 2x2 QUADRANT TABLE + COLLAPSIBLE RIGHT DRAWER
         =================================================================== */}
      <div className="edh-table-workspace">
        <div className="edh-table-main-col">
          {/* 2x2 Quadrant Battlefield Canvas */}
          <main className="edh-table-stage">
            <div className={`edh-quadrants-grid ${gridLayoutClass}`}>
              {quadrantSeats.map(({ player, mirror, spanFull }) =>
                renderQuadrant(player, mirror, spanFull)
              )}
            </div>

            {/* Floating Live Stack Overlay when drawer is closed or on another tab */}
            {showFloatingStack && (
              <aside className="floating-live-stack" aria-label="Pila Live">
                <div className="floating-stack-head">
                  <span className="floating-stack-title">
                    <Layers size={13} className="cyan-icon" /> PILA LIVE (
                    {gameState.stack.length})
                  </span>
                  <button
                    type="button"
                    className="floating-stack-open-btn"
                    onClick={() => {
                      setDrawerOpen(true);
                      setReportTab('STACK');
                    }}
                  >
                    Espandi
                  </button>
                </div>
                <div className="floating-stack-items">
                  {gameState.stack.slice(0, 5).map((item, idx) =>
                    renderStackEntry(item, idx)
                  )}
                </div>
              </aside>
            )}

            {/* Floating Edge Handle when Drawer is Collapsed */}
            {!drawerOpen && (
              <button
                type="button"
                className="drawer-edge-handle"
                onClick={() => setDrawerOpen(true)}
                title="Apri pannello laterale (Pila, Log, Chat, Ispezione Carta)"
              >
                <PanelRightOpen size={15} />
                {gameState.stack.length > 0 && (
                  <span className="drawer-badge-count">
                    {gameState.stack.length}
                  </span>
                )}
                {unreadChat && <span className="unread-dot" />}
              </button>
            )}
          </main>

          {/* =================================================================
              BOTTOM HAND DOCK + ACTION PROMPT + "ASPETTA / IN RISPOSTA" (Y)
             ================================================================= */}
          {localPlayer && (
            <footer
              className={`edh-bottom-dock tone-${actionHint.tone} ${
                promptInvalidPulse ? 'prompt-invalid-flash' : ''
              } ${handDockCollapsed ? 'is-collapsed' : ''}`}
            >
              {/* Left Cluster: Prompt Status + Context Actions */}
              <div className="dock-prompt-cluster">
                <div className="dock-prompt-top">
                  <span className={`prompt-state-badge tone-${actionHint.tone}`}>
                    {actionHint.badge}
                  </span>
                  <span className="dock-phase-pill">{phaseDisplay.itShort}</span>
                  {gameState.isDeclareAttackers && gameState.isMyTurn && (
                    <button
                      type="button"
                      className="dock-inline-combat-btn"
                      onClick={onAlphaStrike}
                      title="Attacca con tutte le creature disponibili"
                    >
                      <Sword size={12} /> Attacca Tutto
                    </button>
                  )}
                </div>

                <div className="dock-prompt-body">
                  {gameState.prompt?.card && !gameState.prompt.card.hidden && (
                    <button
                      type="button"
                      className="prompt-card-mini"
                      onMouseEnter={() => onInspectCard(gameState.prompt.card!)}
                      onClick={() =>
                        onZoomCard(gameState.prompt.card!, [
                          gameState.prompt.card!,
                        ])
                      }
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
                  <div className="dock-prompt-text">
                    <p>
                      {gameState.prompt?.message || actionHint.hint}
                    </p>
                    {gameState.prompt?.notification &&
                      gameState.prompt.notification !==
                        gameState.prompt.message && (
                        <span className="prompt-notification-sub">
                          {gameState.prompt.notification}
                        </span>
                      )}
                  </div>
                </div>

                {/* Selectable Player Target Pills */}
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

                <div className="dock-action-buttons">
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
                        <RotateCcw size={13} /> Undo
                      </button>
                    )}
                  <button
                    type="button"
                    className="btn-prompt-ok"
                    disabled={!gameState.prompt?.okEnabled}
                    onClick={onButtonOk}
                    title="Conferma / Passa (Spazio)"
                  >
                    <Check size={14} />{' '}
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

              {/* Center Cluster: Hand / Command / Zone Dock */}
              <div className="dock-hand-cluster">
                <div className="dock-hand-tabs">
                  <button
                    type="button"
                    className={`hand-tab-btn ${
                      bottomTab === 'HAND' ? 'active' : ''
                    }`}
                    onClick={() => {
                      preAutoBottomTabRef.current = null;
                      setHandDockCollapsed(false);
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
                      setHandDockCollapsed(false);
                      setBottomTab('COMMAND_EXTRA');
                    }}
                  >
                    <Crown size={12} /> Comando (
                    {localPlayer.zones.command.length +
                      localPlayer.zones.flashback.length}
                    )
                  </button>
                  <button
                    type="button"
                    className={`hand-tab-btn ${
                      bottomTab === 'ZONE' ? 'active' : ''
                    }`}
                    onClick={() =>
                      openZoneTab(
                        activeZonePlayer?.id ?? localPlayer.id,
                        zoneBrowserType
                      )
                    }
                  >
                    <Eye size={12} /> Zone ({activeZonePlayer?.name || 'Tu'})
                  </button>

                  <button
                    type="button"
                    className="hand-collapse-btn ml-auto"
                    onClick={() => setHandDockCollapsed((prev) => !prev)}
                    title={
                      handDockCollapsed
                        ? 'Espandi la mano'
                        : 'Riduci dock mano per più spazio al tavolo'
                    }
                  >
                    {handDockCollapsed ? (
                      <>
                        <ChevronUp size={13} /> Mostra Mano
                      </>
                    ) : (
                      <>
                        <ChevronDown size={13} /> Riduci
                      </>
                    )}
                  </button>
                </div>

                {!handDockCollapsed && (
                  <div className="dock-hand-body">
                    {bottomTab === 'HAND' && (
                      <div className="desk-hand-tray">
                        {(localPlayer.zones.command.length > 0 ||
                          localPlayer.zones.flashback.length > 0) && (
                          <div className="pinned-command-slot">
                            <span className="slot-micro-label">
                              <Crown size={10} /> CMD
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
                                    sleeveTheme={sleeveTheme}
                                    onClick={onCardClick}
                                    onInspect={onInspectCard}
                                    onZoom={(cardItem) =>
                                      onZoomCard(
                                        cardItem,
                                        localPlayer.zones.command
                                      )
                                    }
                                    badgeText={
                                      cmdMeta && cmdMeta.taxMana > 0
                                        ? `+${cmdMeta.taxMana}`
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
                                .slice(0, 2)
                                .map((c) => (
                                  <CardVisual
                                    key={c.id}
                                    card={c}
                                    size="sm"
                                    sleeveTheme={sleeveTheme}
                                    onClick={onCardClick}
                                    onInspect={onInspectCard}
                                    onZoom={(cardItem) =>
                                      onZoomCard(
                                        cardItem,
                                        localPlayer.zones.flashback
                                      )
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
                            localPlayer.zones.hand.length >= 4
                              ? 'fanned-hand-strip'
                              : ''
                          }`}
                        >
                          {localPlayer.zones.hand.length === 0 ? (
                            <div className="desk-empty-note">
                              Nessuna carta in mano.
                            </div>
                          ) : (
                            localPlayer.zones.hand.map((c, idx) => {
                              const total = localPlayer.zones.hand.length;
                              const mid = (total - 1) / 2;
                              const offset = idx - mid;
                              const fanRot =
                                total >= 4 && total <= 10 ? offset * 1.4 : 0;
                              const fanY =
                                total >= 4 && total <= 10
                                  ? Math.abs(offset) * 1.8
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
                                    sleeveTheme={sleeveTheme}
                                    onClick={onCardClick}
                                    onInspect={onInspectCard}
                                    onZoom={(cardItem) =>
                                      onZoomCard(
                                        cardItem,
                                        localPlayer.zones.hand
                                      )
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
                            size="sm"
                            sleeveTheme={sleeveTheme}
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
                              !localPlayer.zones.command.some(
                                (cc) => cc.id === fc.id
                              )
                          )
                          .map((c) => (
                            <CardVisual
                              key={c.id}
                              card={c}
                              size="sm"
                              sleeveTheme={sleeveTheme}
                              onClick={onCardClick}
                              onInspect={onInspectCard}
                              onZoom={(cardItem) =>
                                onZoomCard(
                                  cardItem,
                                  localPlayer.zones.flashback
                                )
                              }
                              badgeText="GIOCABILE"
                              dimNonSelectable={dimNonSelectable}
                            />
                          ))}
                        {localPlayer.zones.command.length === 0 &&
                          localPlayer.zones.flashback.length === 0 && (
                            <div className="desk-empty-note">
                              Nessuna carta in Zona di Comando o giocabile da
                              altre zone.
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
                              {zt.label} (
                              {activeZonePlayer?.zones[zt.key]?.length || 0})
                            </button>
                          ))}
                          <button
                            type="button"
                            className="btn-ghost-sm ml-auto"
                            onClick={() => setBottomTab('HAND')}
                          >
                            <X size={12} /> Mano
                          </button>
                        </div>

                        <div className="hand-cards-strip">
                          {(activeZonePlayer?.zones[zoneBrowserType] || [])
                            .length === 0 ? (
                            <div className="desk-empty-note">
                              Nessuna carta in questa zona.
                            </div>
                          ) : (
                            (
                              activeZonePlayer?.zones[zoneBrowserType] || []
                            ).map((c) => (
                              <CardVisual
                                key={c.id}
                                card={c}
                                size="sm"
                                sleeveTheme={sleeveTheme}
                                onClick={onCardClick}
                                onInspect={onInspectCard}
                                onZoom={(cardItem) =>
                                  onZoomCard(
                                    cardItem,
                                    activeZonePlayer?.zones[zoneBrowserType] ||
                                      []
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
                )}
              </div>

              {/* Right Cluster: EDHPlay "Aspetta / In risposta" Reaction (Key Y) */}
              <div className="dock-reaction-cluster">
                <button
                  type="button"
                  className={`btn-wait-reaction ${
                    isLocalWaiting ? 'is-active' : ''
                  }`}
                  onClick={onTriggerWaitReaction}
                  title="Alza la mano per segnalare 'Aspetta, in risposta!' a tutto il tavolo (Tasto Y) e interrompere l'auto-pass"
                >
                  <Hand size={18} className="wait-hand-icon" />
                  <div className="wait-btn-labels">
                    <strong>
                      {isLocalWaiting ? 'In risposta!' : 'Aspetta'}
                    </strong>
                    <span>In risposta</span>
                  </div>
                  <kbd className="hotkey-kbd">Y</kbd>
                </button>
              </div>
            </footer>
          )}
        </div>

        {/* ===================================================================
            COLLAPSIBLE RIGHT SIDE DRAWER: STACK / COMBAT / LOG / CHAT / CMD + CARD INSPECTOR
           =================================================================== */}
        <aside className={`edh-side-drawer ${drawerOpen ? 'open' : 'closed'}`}>
          {drawerOpen && (
            <>
              <div className="drawer-top-section">
                <div className="desk-tabs-bar">
                  <button
                    type="button"
                    className={`desk-tab-btn ${
                      reportTab === 'STACK' ? 'active' : ''
                    } ${gameState.stack.length > 0 ? 'has-items' : ''}`}
                    onClick={() => {
                      preAutoReportTabRef.current = null;
                      setReportTab('STACK');
                    }}
                  >
                    <Layers size={12} /> Pila ({gameState.stack.length})
                  </button>
                  <button
                    type="button"
                    className={`desk-tab-btn ${
                      reportTab === 'COMBAT' ? 'active' : ''
                    } ${
                      (gameState.combat?.numAttackers || 0) > 0
                        ? 'has-combat'
                        : ''
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
                    className={`desk-tab-btn ${
                      reportTab === 'LOG' ? 'active' : ''
                    }`}
                    onClick={() => {
                      preAutoReportTabRef.current = null;
                      setReportTab('LOG');
                    }}
                  >
                    <ScrollText size={12} /> Log
                  </button>
                  <button
                    type="button"
                    className={`desk-tab-btn ${
                      reportTab === 'CHAT' ? 'active' : ''
                    }`}
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
                      className={`desk-tab-btn ${
                        reportTab === 'CMD' ? 'active' : ''
                      }`}
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
                        gameState.stack.map((item, idx) =>
                          renderStackEntry(item, idx)
                        )
                      )}
                    </div>
                  )}

                  {reportTab === 'COMBAT' && (
                    <div className="desk-combat-list">
                      {!gameState.combat ||
                      gameState.combat.numAttackers === 0 ? (
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
                                .map(
                                  (a) => `${a.name} (${a.power}/${a.toughness})`
                                )
                                .join(', ')}
                            </div>
                            {b.blocked && b.blockers.length > 0 ? (
                              <div className="combat-band-blk">
                                🛡️ Bloccato da:{' '}
                                {b.blockers
                                  .map(
                                    (blk) =>
                                      `${blk.name} (${blk.power}/${blk.toughness})`
                                  )
                                  .join(', ')}
                              </div>
                            ) : (
                              <div className="combat-band-unblocked">
                                Non bloccato
                              </div>
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
                      <form
                        className="chat-input-row"
                        onSubmit={handleChatSubmit}
                      >
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
                          <Crown size={14} className="cyan-icon" /> Comandanti
                          &amp; Tassa
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
                                    {cm.castCount}x (+{cm.taxMana})
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="info-card-block">
                        <h4>
                          <Swords size={14} className="cyan-icon" /> Danni da
                          Comandante
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
                                  <strong
                                    className={
                                      d.damage >= 15 ? 'danger-text' : ''
                                    }
                                  >
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
              </div>

              {/* Drawer Bottom: Card Picture + Oracle Inspector */}
              <div className="drawer-inspector-section">
                {displayCard && !displayCard.hidden ? (
                  <>
                    <div className="drawer-card-preview-row">
                      {detailImage && (
                        <div className="drawer-card-thumb-wrap">
                          <img
                            src={detailImage}
                            alt={detailName || 'Carta'}
                            className="drawer-card-img"
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
                                e.currentTarget.src !==
                                  displayCard.scryfallFallbackUrl
                              ) {
                                e.currentTarget.src =
                                  displayCard.scryfallFallbackUrl;
                              }
                            }}
                          />
                        </div>
                      )}
                      <div className="drawer-card-meta">
                        <div className="vdetail-header">
                          <h3 className="vdetail-name">{detailName}</h3>
                          <ManaCostDisplay text={detailMana} size="sm" />
                        </div>
                        <div className="vdetail-type">
                          <span>{detailType || 'Carta'}</span>
                          {displayCard.setCode && (
                            <span className="set-tag">
                              {displayCard.setCode}
                            </span>
                          )}
                        </div>
                        <div className="vdetail-stats-row">
                          {displayCard.isCreature && (
                            <span className="vdetail-stat-pill">
                              <strong>
                                {showAlternateFace &&
                                displayCard.alternatePower !== undefined
                                  ? `${displayCard.alternatePower}/${displayCard.alternateToughness}`
                                  : `${displayCard.power ?? 0}/${displayCard.toughness ?? 0}`}
                              </strong>
                              {(displayCard.damage || 0) > 0 && (
                                <span className="dmg-warn">
                                  {' '}
                                  (-{displayCard.damage})
                                </span>
                              )}
                            </span>
                          )}
                          {displayCard.isPlaneswalker && displayCard.loyalty && (
                            <span className="vdetail-stat-pill">
                              ❖ {displayCard.loyalty}
                            </span>
                          )}
                          {displayCard.defense && displayCard.defense !== '0' && (
                            <span className="vdetail-stat-pill">
                              🛡️ {displayCard.defense}
                            </span>
                          )}
                        </div>
                        <div className="drawer-card-actions">
                          {displayCard.hasAlternateState && (
                            <button
                              type="button"
                              className="btn-flip-dfc"
                              onClick={() =>
                                setShowAlternateFace((prev) => !prev)
                              }
                            >
                              <RefreshCw size={11} />{' '}
                              {showAlternateFace ? 'Fronte' : 'Gira'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-zoom-pic"
                            onClick={() =>
                              onZoomCard(displayCard, [displayCard])
                            }
                            title="Ingrandisci carta (Z)"
                          >
                            <Maximize2 size={11} /> Zoom (Z)
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="vdetail-oracle-scroll">
                      <OracleTextDisplay
                        text={detailOracle || 'Nessun testo regole.'}
                      />
                      {displayCard.counters &&
                        Object.keys(displayCard.counters).length > 0 && (
                          <div className="vdetail-counters">
                            {Object.entries(displayCard.counters).map(
                              ([k, v]) => (
                                <span key={k} className="counter-pill">
                                  {v}x {k}
                                </span>
                              )
                            )}
                          </div>
                        )}
                    </div>
                  </>
                ) : (
                  <div className="vpicture-placeholder">
                    <Sparkles size={20} className="cyan-icon" />
                    <span>Passa il mouse su una carta per ispezionarla</span>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
};
