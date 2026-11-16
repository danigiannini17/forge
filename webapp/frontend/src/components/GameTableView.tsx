import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  CardViewState,
  ChatEntry,
  GameStatePayload,
  PlayerViewState,
  StackItemState,
} from '../types';
import { CardVisual } from './CardVisual';
import { ManaCostDisplay, ManaSymbolBadge, OracleTextDisplay } from './ManaText';
import {
  Check,
  Crosshair,
  Crown,
  Eye,
  FastForward,
  Flag,
  Heart,
  Info,
  Layers,
  MessageSquare,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Send,
  Shield,
  Sparkles,
  Sword,
  Swords,
  Zap,
} from 'lucide-react';

interface GameTableViewProps {
  gameState: GameStatePayload;
  chatMessages: ChatEntry[];
  onSendWs: (payload: Record<string, any>) => void;
  onReturnToLobby: () => void;
  onLeaveRoom: () => void;
}

interface PhaseDef {
  code: string;
  short: string;
  full: string;
  group: 'BEGIN' | 'MAIN1' | 'COMBAT' | 'MAIN2' | 'END';
  icon: string;
}

const PHASES: PhaseDef[] = [
  { code: 'UNTAP', short: 'STAP', full: 'Stappa (Untap)', group: 'BEGIN', icon: '↺' },
  { code: 'UPKEEP', short: 'MANT', full: 'Mantenimento (Upkeep)', group: 'BEGIN', icon: '🌅' },
  { code: 'DRAW', short: 'PESC', full: 'Acquisizione (Draw)', group: 'BEGIN', icon: '🃏' },
  { code: 'MAIN1', short: 'MAIN 1', full: 'Prima Fase Principale', group: 'MAIN1', icon: '🔮' },
  { code: 'COMBAT_BEGIN', short: 'INIZ CMB', full: 'Inizio Combattimento', group: 'COMBAT', icon: '🎺' },
  { code: 'COMBAT_DECLARE_ATTACKERS', short: 'ATTACC', full: 'Dichiarazione Attaccanti', group: 'COMBAT', icon: '⚔️' },
  { code: 'COMBAT_DECLARE_BLOCKERS', short: 'BLOCC', full: 'Dichiarazione Bloccanti', group: 'COMBAT', icon: '🛡️' },
  { code: 'COMBAT_FIRST_STRIKE_DAMAGE', short: '1° DANNO', full: 'Danno Attacco Improvviso', group: 'COMBAT', icon: '⚡' },
  { code: 'COMBAT_DAMAGE', short: 'DANNO', full: 'Danno da Combattimento', group: 'COMBAT', icon: '💥' },
  { code: 'COMBAT_END', short: 'FINE CMB', full: 'Fine Combattimento', group: 'COMBAT', icon: '🏳️' },
  { code: 'MAIN2', short: 'MAIN 2', full: 'Seconda Fase Principale', group: 'MAIN2', icon: '🔮' },
  { code: 'END_OF_TURN', short: 'FINE', full: 'Sottofase Finale (EOT)', group: 'END', icon: '🌙' },
  { code: 'CLEANUP', short: 'CANC', full: 'Cancellazione (Cleanup)', group: 'END', icon: '🧹' },
];

type SidebarTab = 'INSPECTOR' | 'COMMANDER_INFO' | 'ZONES' | 'LOG_CHAT';

interface LandStackGroup {
  key: string;
  representative: CardViewState;
  cards: CardViewState[];
  count: number;
}

interface PartitionedBattlefield {
  creatures: CardViewState[];
  support: CardViewState[]; // Artifacts, Enchantments, Planeswalkers, Battles
  landGroups: LandStackGroup[];
  attachmentsByHostId: Record<number, CardViewState[]>;
}

interface TriggerToast {
  id: string;
  kind: 'TRIGGER' | 'ABILITY' | 'SPELL';
  title: string;
  playerName: string;
  text: string;
  imageUrl?: string;
  targets: string[];
}

export const GameTableView: React.FC<GameTableViewProps> = ({
  gameState,
  chatMessages,
  onSendWs,
  onReturnToLobby,
  onLeaveRoom,
}) => {
  const [inspectedCard, setInspectedCard] = useState<CardViewState | null>(null);
  const [showAlternateFace, setShowAlternateFace] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('INSPECTOR');
  const [zoneViewerPlayerId, setZoneViewerPlayerId] = useState<number | null>(null);
  const [zoneViewerType, setZoneViewerType] = useState<
    'graveyard' | 'exile' | 'command' | 'flashback'
  >('graveyard');
  const [chatInput, setChatInput] = useState('');
  const [confirmingConcede, setConfirmingConcede] = useState(false);

  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Hovered stack item for target/source highlighting
  const [hoveredStackKey, setHoveredStackKey] = useState<string | null>(null);

  // Cinematic Phase / Turn Announcement state
  const prevTurnRef = useRef<number>(gameState.turn);
  const prevPhaseRef = useRef<string>(gameState.phase);
  const prevTappedIdsRef = useRef<Set<number>>(new Set());
  const [phaseAnnouncement, setPhaseAnnouncement] = useState<{
    id: number;
    title: string;
    subtitle: string;
    accent: 'turn-my' | 'turn-opp' | 'combat' | 'phase' | 'untap';
  } | null>(null);

  // Live Trigger & Stack Toasts
  const prevStackKeysRef = useRef<Set<string>>(new Set());
  const [triggerToasts, setTriggerToasts] = useState<TriggerToast[]>([]);

  // Player Life Delta indicators
  const prevLifeByPlayerRef = useRef<Record<number, number>>({});
  const [lifeDeltas, setLifeDeltas] = useState<Record<number, number>>({});

  // Modal local state
  const [selectedModalIndices, setSelectedModalIndices] = useState<number[]>([]);
  const [modalTextInput, setModalTextInput] = useState<string>('');
  const [modalDamageMap, setModalDamageMap] = useState<Record<number, number>>({});

  const localPlayer: PlayerViewState | undefined =
    gameState.players.find((p) => p.isLocalViewer) || gameState.players[0];
  const opponents: PlayerViewState[] = gameState.players.filter(
    (p) => p.id !== localPlayer?.id
  );

  useEffect(() => {
    if (gameState.gameOver) {
      setConfirmingConcede(false);
    }
  }, [gameState.gameOver]);

  useEffect(() => {
    if (sidebarTab === 'LOG_CHAT' && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [gameState.gameLog.length, sidebarTab]);

  useEffect(() => {
    if (sidebarTab === 'LOG_CHAT' && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages.length, sidebarTab]);

  // Sync inspected card with prompt card if none inspected yet
  useEffect(() => {
    if (!inspectedCard && gameState.prompt?.card) {
      setInspectedCard(gameState.prompt.card);
      setShowAlternateFace(false);
    }
  }, [gameState.prompt?.card]);

  // Detect Turn, Phase, and Mass-Untap transitions for Cinematic Banner
  useEffect(() => {
    const currentTappedIds = new Set<number>();
    gameState.players.forEach((p) => {
      p.zones.battlefield.forEach((c) => {
        if (c.tapped) currentTappedIds.add(c.id);
      });
    });

    let newlyUntappedCount = 0;
    prevTappedIdsRef.current.forEach((id) => {
      if (!currentTappedIds.has(id)) {
        newlyUntappedCount++;
      }
    });
    prevTappedIdsRef.current = currentTappedIds;

    const turnChanged = gameState.turn !== prevTurnRef.current;
    const phaseChanged = gameState.phase !== prevPhaseRef.current;
    prevTurnRef.current = gameState.turn;
    prevPhaseRef.current = gameState.phase;

    const phaseObj = PHASES.find((p) => p.code === gameState.phase);

    if (turnChanged) {
      setPhaseAnnouncement({
        id: Date.now(),
        title: `TURNO ${gameState.turn} — ${
          gameState.isMyTurn ? 'IL TUO TURNO' : `TURNO DI ${gameState.playerTurnName.toUpperCase()}`
        }`,
        subtitle:
          newlyUntappedCount > 0
            ? `↺ ${newlyUntappedCount} permanenti stappati • ${phaseObj?.full || gameState.phaseLabel}`
            : phaseObj?.full || gameState.phaseLabel,
        accent: gameState.isMyTurn ? 'turn-my' : 'turn-opp',
      });
    } else if (newlyUntappedCount >= 2) {
      setPhaseAnnouncement({
        id: Date.now(),
        title: `↺ FASE DI STAP (${newlyUntappedCount} PERMANENTI)`,
        subtitle: `I permanenti di ${gameState.playerTurnName} si stappano`,
        accent: 'untap',
      });
    } else if (
      phaseChanged &&
      phaseObj &&
      ['MAIN1', 'COMBAT_BEGIN', 'COMBAT_DECLARE_ATTACKERS', 'COMBAT_DECLARE_BLOCKERS', 'COMBAT_DAMAGE', 'MAIN2', 'END_OF_TURN'].includes(
        phaseObj.code
      )
    ) {
      setPhaseAnnouncement({
        id: Date.now(),
        title: `${phaseObj.icon} ${phaseObj.full.toUpperCase()}`,
        subtitle: gameState.isMyTurn
          ? `Tuo Turno (${gameState.playerTurnName})`
          : `Turno di ${gameState.playerTurnName}`,
        accent: phaseObj.group === 'COMBAT' ? 'combat' : 'phase',
      });
    }
  }, [gameState.turn, gameState.phase, gameState.playerTurnName, gameState.isMyTurn, gameState.players]);

  useEffect(() => {
    if (!phaseAnnouncement) return;
    const timer = window.setTimeout(() => {
      setPhaseAnnouncement(null);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [phaseAnnouncement?.id]);

  // Detect new Triggers / Spells / Abilities entering the Stack
  useEffect(() => {
    const currentKeys = new Set<string>();
    const newToasts: TriggerToast[] = [];

    gameState.stack.forEach((item) => {
      const signature = `${item.key}_${item.sourceCard?.id ?? 0}_${item.text.slice(0, 24)}`;
      currentKeys.add(signature);
      if (!prevStackKeysRef.current.has(signature)) {
        const targets: string[] = [
          ...item.targetPlayers.map((tp) => tp.name),
          ...item.targetCards.map((tc) => tc.name),
        ];
        newToasts.push({
          id: `${signature}_${Date.now()}`,
          kind: item.isTrigger ? 'TRIGGER' : item.ability ? 'ABILITY' : 'SPELL',
          title: item.sourceCard?.name || (item.isTrigger ? 'Abilità Innescata' : 'Abilità'),
          playerName: item.activatingPlayerName,
          text: item.text,
          imageUrl: item.sourceCard?.imageUrl,
          targets,
        });
      }
    });

    prevStackKeysRef.current = currentKeys;

    if (newToasts.length > 0) {
      setTriggerToasts((prev) => [...newToasts, ...prev].slice(0, 3));
    }
  }, [gameState.stack]);

  useEffect(() => {
    if (triggerToasts.length === 0) return;
    const timer = window.setTimeout(() => {
      setTriggerToasts((prev) => prev.slice(0, prev.length - 1));
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [triggerToasts]);

  // Track Life Deltas per player
  useEffect(() => {
    const newDeltas: Record<number, number> = {};
    let changed = false;
    gameState.players.forEach((p) => {
      const prev = prevLifeByPlayerRef.current[p.id];
      if (prev !== undefined && prev !== p.life) {
        newDeltas[p.id] = p.life - prev;
        changed = true;
      }
      prevLifeByPlayerRef.current[p.id] = p.life;
    });
    if (changed) {
      setLifeDeltas((prev) => ({ ...prev, ...newDeltas }));
      const timer = window.setTimeout(() => {
        setLifeDeltas({});
      }, 1900);
      return () => window.clearTimeout(timer);
    }
  }, [gameState.players]);

  // Reset modal selections whenever a new modalId arrives
  useEffect(() => {
    const modal = gameState.pendingModal;
    if (!modal) {
      setSelectedModalIndices([]);
      return;
    }
    if (modal.modalType === 'CHOOSE_ABILITY' || modal.modalType === 'GET_CHOICES') {
      const opts = modal.options || [];
      const preselected = opts.filter((o) => o.preselected).map((o) => o.index);
      if (preselected.length > 0) {
        setSelectedModalIndices(preselected);
      } else if ((modal.min || 0) >= 1 && opts.length > 0) {
        setSelectedModalIndices([opts[0].index]);
      } else {
        setSelectedModalIndices([]);
      }
    } else if (modal.modalType === 'INPUT_TEXT') {
      setModalTextInput(
        modal.inputKind === 'NUMBER'
          ? String(modal.initialValue ?? 0)
          : modal.defaultText || ''
      );
    } else if (
      modal.modalType === 'ASSIGN_COMBAT_DAMAGE' ||
      modal.modalType === 'ASSIGN_GENERIC_AMOUNT'
    ) {
      const initMap: Record<number, number> = {};
      const total = modal.totalDamageToAssign ?? modal.totalAmount ?? 0;
      const targets = modal.targets || [];
      targets.forEach((t, idx) => {
        initMap[t.index] =
          t.defaultDamage !== undefined ? t.defaultDamage : idx === 0 ? total : 0;
      });
      setModalDamageMap(initMap);
    }
  }, [gameState.pendingModal?.modalId]);

  const handleInspectCard = (card: CardViewState) => {
    setInspectedCard(card);
    setShowAlternateFace(false);
  };

  const handleCardClick = (card: CardViewState, e: React.MouseEvent) => {
    setInspectedCard(card);
    setShowAlternateFace(false);
    onSendWs({
      type: 'SELECT_CARD',
      cardId: card.id,
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
    });
  };

  const handlePlayerClick = (player: PlayerViewState) => {
    onSendWs({
      type: 'SELECT_PLAYER',
      playerId: player.id,
    });
  };

  const handleButtonOk = () => {
    onSendWs({ type: 'BUTTON_OK' });
  };

  const handleButtonCancel = () => {
    onSendWs({ type: 'BUTTON_CANCEL' });
  };

  const handleUndo = () => {
    onSendWs({ type: 'UNDO' });
  };

  // Keyboard shortcuts: Ctrl+Z -> Undo, Space -> Pass/OK (when not typing in chat/modal input)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onSendWs({ type: 'UNDO' });
      } else if (e.code === 'Space' && !gameState.pendingModal && gameState.prompt?.okEnabled) {
        e.preventDefault();
        onSendWs({ type: 'BUTTON_OK' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState.pendingModal, gameState.prompt?.okEnabled]);

  const handleAlphaStrike = () => {
    onSendWs({ type: 'ALPHA_STRIKE' });
  };

  const handleUseMana = (colorCode: string) => {
    onSendWs({ type: 'USE_MANA', color: colorCode });
  };

  const handleAutoPassEot = () => {
    onSendWs({ type: 'AUTO_PASS_UNTIL_END_OF_TURN' });
  };

  const handleYieldStackEmpty = () => {
    onSendWs({ type: 'YIELD_UNTIL_STACK_EMPTY' });
  };

  const handleCancelAutoPass = () => {
    onSendWs({ type: 'CANCEL_AUTO_PASS' });
  };

  const handleToggleAutoPassNoActions = () => {
    onSendWs({
      type: 'SET_AUTO_PASS_NO_ACTIONS',
      enabled: !gameState.yieldState.autoPassNoActions,
    });
  };

  const handleTogglePhaseStop = (phaseCode: string) => {
    onSendWs({
      type: 'TOGGLE_SKIP_PHASE',
      phase: phaseCode,
      ownTurn: gameState.isMyTurn,
    });
  };

  const handleOpenZoneBrowser = (
    playerId: number,
    zone: 'graveyard' | 'exile' | 'command' | 'flashback'
  ) => {
    setZoneViewerPlayerId(playerId);
    setZoneViewerType(zone);
    setSidebarTab('ZONES');
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendWs({ type: 'CHAT', message: chatInput.trim() });
    setChatInput('');
  };

  const submitModalResponse = (payload: Record<string, any>) => {
    if (!gameState.pendingModal) return;
    onSendWs({
      type: 'MODAL_RESPONSE',
      requestId: gameState.pendingModal.modalId,
      modalId: gameState.pendingModal.modalId,
      ...payload,
    });
  };

  const toggleModalOptionIndex = (idx: number, max: number) => {
    if (max <= 1) {
      setSelectedModalIndices((prev) => (prev.includes(idx) ? [] : [idx]));
      return;
    }
    setSelectedModalIndices((prev) => {
      if (prev.includes(idx)) return prev.filter((x) => x !== idx);
      if (prev.length >= max) return [...prev.slice(1), idx];
      return [...prev, idx];
    });
  };

  // Compute active Stack item for highlighting source & targets on the battlefield
  const activeStackItem: StackItemState | undefined = useMemo(() => {
    if (hoveredStackKey) {
      return gameState.stack.find((s) => s.key === hoveredStackKey) || gameState.stack[0];
    }
    return gameState.stack[0];
  }, [gameState.stack, hoveredStackKey]);

  const stackSourceCardId = activeStackItem?.sourceCard?.id ?? -1;
  const stackTargetCardIds = useMemo(
    () => new Set((activeStackItem?.targetCards || []).map((tc) => tc.id)),
    [activeStackItem]
  );
  const stackTargetPlayerIds = useMemo(
    () => new Set((activeStackItem?.targetPlayers || []).map((tp) => tp.id)),
    [activeStackItem]
  );

  /**
   * Smart 3-Zone Tactical Battlefield Partitioner:
   * - Tucks Auras & Equipment under their host permanent
   * - Separates Creatures (Front Line) from Support Artifacts/Enchantments/Planeswalkers (Flank)
   * - Stacks identical Lands with the same tapped/actionable state into compact piles (×N)
   */
  const partitionBattlefield = (cards: CardViewState[]): PartitionedBattlefield => {
    const cardIdsOnBoard = new Set(cards.map((c) => c.id));
    const attachmentsByHostId: Record<number, CardViewState[]> = {};
    const standaloneCards: CardViewState[] = [];

    cards.forEach((c) => {
      const hostId = c.attachedToId ?? -1;
      if (hostId > 0 && cardIdsOnBoard.has(hostId) && !c.isCreature) {
        if (!attachmentsByHostId[hostId]) {
          attachmentsByHostId[hostId] = [];
        }
        attachmentsByHostId[hostId].push(c);
      } else {
        standaloneCards.push(c);
      }
    });

    const creatures: CardViewState[] = [];
    const support: CardViewState[] = [];
    const rawLands: CardViewState[] = [];

    standaloneCards.forEach((c) => {
      if (c.isCreature) {
        creatures.push(c);
      } else if (c.isLand) {
        rawLands.push(c);
      } else {
        support.push(c);
      }
    });

    // Group identical lands that share state (tapped, actionable, selected, counters, attachments)
    const landGroups: LandStackGroup[] = [];
    const groupMap = new Map<string, LandStackGroup>();

    rawLands.forEach((land) => {
      const hasAttachments = (attachmentsByHostId[land.id]?.length || 0) > 0;
      const hasCounters = land.counters && Object.keys(land.counters).length > 0;
      const canGroup = !hasAttachments && !hasCounters && !land.selected;
      const groupKey = canGroup
        ? `${land.name}__tapped:${land.tapped}__act:${land.actionableStrength || 0}`
        : `single_${land.id}`;

      const existing = groupMap.get(groupKey);
      if (existing) {
        existing.cards.push(land);
        existing.count = existing.cards.length;
      } else {
        const grp: LandStackGroup = {
          key: groupKey,
          representative: land,
          cards: [land],
          count: 1,
        };
        groupMap.set(groupKey, grp);
        landGroups.push(grp);
      }
    });

    return { creatures, support, landGroups, attachmentsByHostId };
  };

  const localBf = useMemo(
    () => partitionBattlefield(localPlayer?.zones.battlefield || []),
    [localPlayer?.zones.battlefield]
  );
  const isYieldActive =
    gameState.yieldState.autoYieldAll ||
    gameState.yieldState.autoYieldEndOfStep ||
    gameState.yieldState.autoYieldStackEmpty;

  const activeZonePlayer =
    gameState.players.find((p) => p.id === zoneViewerPlayerId) || localPlayer;

  return (
    <div className="game-table-shell">
      {/* LEFT / CENTER PLAYMAT AREA */}
      <div className="playmat-column">
        {/* TOP BAR: Game Status, Turn, Phase Stops & Auto-Pass Controls */}
        <header className="table-top-bar">
          <div className="turn-badge-cluster">
            <span className="turn-counter">TURNO {gameState.turn}</span>
            <span
              className={`active-turn-player ${
                gameState.isMyTurn ? 'my-turn' : 'opp-turn'
              }`}
            >
              {gameState.isMyTurn
                ? `Tuo Turno (${gameState.playerTurnName})`
                : `Turno di ${gameState.playerTurnName}`}
            </span>
            {gameState.isCommander && (
              <span className="commander-badge-mini">
                <Crown size={12} /> COMMANDER
              </span>
            )}
          </div>

          {/* Interactive Grouped Phase Strip */}
          <div
            className="phase-strip"
            title="Clicca una fase per attivare/disattivare lo Stop automatico"
          >
            {PHASES.map((ph, idx) => {
              const isCurrent = gameState.phase === ph.code;
              const skippedList = gameState.isMyTurn
                ? gameState.yieldState.skippedOwnPhases
                : gameState.yieldState.skippedOpponentPhases;
              const isStopped = !skippedList.includes(ph.code);
              const prevGroup = idx > 0 ? PHASES[idx - 1].group : ph.group;
              const isNewGroup = idx > 0 && prevGroup !== ph.group;

              return (
                <React.Fragment key={ph.code}>
                  {isNewGroup && <span className="phase-group-divider" />}
                  <button
                    type="button"
                    className={`phase-pill phase-group-${ph.group.toLowerCase()} ${
                      isCurrent ? 'current' : ''
                    } ${isStopped ? 'has-stop' : 'skipped'}`}
                    onClick={() => handleTogglePhaseStop(ph.code)}
                    title={`${ph.full} — ${
                      isStopped
                        ? 'Stop Attivo (clicca per saltare automaticamente)'
                        : 'Salto Automatico (clicca per mettere uno Stop)'
                    }`}
                  >
                    <span className="stop-dot" />
                    <span className="phase-icon-mini">{ph.icon}</span>
                    {ph.short}
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* Auto-Pass & Table Actions */}
          <div className="autopass-cluster">
            <button
              type="button"
              className={`btn-autopass ${
                gameState.undoAvailable ? 'active' : ''
              }`}
              onClick={handleUndo}
              title="Annulla ultima azione / terra / pagamento mana (Scorciatoia: Ctrl+Z)"
            >
              <RotateCcw size={13} /> Undo
            </button>
            <button
              type="button"
              className={`btn-autopass ${
                gameState.yieldState.autoYieldAll ? 'active' : ''
              }`}
              onClick={handleAutoPassEot}
              title="Passa automaticamente la priorità fino alla Fine del Turno"
            >
              <FastForward size={13} /> Passa fino a Fine Turno
            </button>
            <button
              type="button"
              className={`btn-autopass ${
                gameState.yieldState.autoYieldStackEmpty ? 'active' : ''
              }`}
              onClick={handleYieldStackEmpty}
              title="Cedi priorità finché la Pila (Stack) non è vuota"
            >
              <Layers size={13} /> Cedi Pila
            </button>
            <button
              type="button"
              className={`btn-autopass ${
                gameState.yieldState.autoPassNoActions ? 'active' : ''
              }`}
              onClick={handleToggleAutoPassNoActions}
              title="Passa automaticamente quando non hai alcuna carta o abilità giocabile"
            >
              <Zap size={13} /> Auto se 0 Giocate
            </button>
            {isYieldActive && (
              <button
                type="button"
                className="btn-autopass danger"
                onClick={handleCancelAutoPass}
              >
                <PauseCircle size={13} /> Stop Auto-Pass
              </button>
            )}
            {!gameState.gameOver && !localPlayer?.hasLost && (
              confirmingConcede ? (
                <>
                  <button
                    type="button"
                    className="btn-autopass danger"
                    onClick={() => {
                      setConfirmingConcede(false);
                      onSendWs({ type: 'CONCEDE' });
                    }}
                    title="Conferma la resa nella partita in corso"
                  >
                    <Flag size={13} /> Confermi Resa?
                  </button>
                  <button
                    type="button"
                    className="btn-autopass ghost"
                    onClick={() => setConfirmingConcede(false)}
                  >
                    Annulla
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-autopass ghost"
                  onClick={() => setConfirmingConcede(true)}
                  title="Concedi la partita restando nella stanza per la rivincita"
                >
                  <Flag size={13} /> Concedi
                </button>
              )
            )}
            <button
              type="button"
              className="btn-autopass ghost"
              onClick={onLeaveRoom}
              title="Esci dalla stanza e torna alla Home"
            >
              Esci
            </button>
          </div>
        </header>

        {/* CINEMATIC PHASE & TURN TRANSITION FLOATING BANNER */}
        {phaseAnnouncement && (
          <div
            key={phaseAnnouncement.id}
            className={`phase-transition-banner accent-${phaseAnnouncement.accent}`}
          >
            <div className="phase-banner-title">{phaseAnnouncement.title}</div>
            <div className="phase-banner-sub">{phaseAnnouncement.subtitle}</div>
          </div>
        )}

        {/* LIVE TRIGGER & STACK TOAST OVERLAY */}
        {triggerToasts.length > 0 && (
          <div className="trigger-toast-container">
            {triggerToasts.map((toast) => (
              <div
                key={toast.id}
                className={`trigger-toast toast-${toast.kind.toLowerCase()}`}
              >
                {toast.imageUrl && (
                  <img
                    src={toast.imageUrl}
                    alt={toast.title}
                    className="trigger-toast-art"
                  />
                )}
                <div className="trigger-toast-body">
                  <div className="trigger-toast-header">
                    <span className={`trigger-kind-tag kind-${toast.kind.toLowerCase()}`}>
                      {toast.kind === 'TRIGGER'
                        ? '⚡ TRIGGER INNESCATO'
                        : toast.kind === 'ABILITY'
                        ? '⚙️ ABILITÀ ATTIVATA'
                        : '✨ MAGIA LANCIATA'}
                    </span>
                    <span className="trigger-toast-player">{toast.playerName}</span>
                  </div>
                  <strong className="trigger-toast-title">{toast.title}</strong>
                  <p className="trigger-toast-text">{toast.text}</p>
                  {toast.targets.length > 0 && (
                    <div className="trigger-toast-targets">
                      🎯 {toast.targets.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* OPPONENTS BATTLEFIELD GRID (Supports 1 to 7 Opponents in Commander!) */}
        <section
          className={`opponents-grid opponents-count-${Math.min(
            opponents.length,
            4
          )}`}
        >
          {opponents.map((opp) => {
            const oppBf = partitionBattlefield(opp.zones.battlefield || []);
            const isTargetedByStack = stackTargetPlayerIds.has(opp.id);
            const oppLifeDelta = lifeDeltas[opp.id];

            return (
              <div
                key={opp.id}
                className={`opponent-board ${
                  opp.hasPriority ? 'has-priority' : ''
                } ${opp.hasLost ? 'player-lost' : ''} ${
                  opp.isSelectable ? 'selectable-player-highlight' : ''
                } ${isTargetedByStack ? 'player-stack-target' : ''}`}
              >
                {/* Opponent Header Bar */}
                <div
                  className="player-status-bar opponent-bar"
                  onClick={() => handlePlayerClick(opp)}
                  title="Clicca il giocatore per bersagliarlo o attaccarlo"
                >
                  <div className="player-id-group">
                    <span className="player-name-tag">
                      {opp.name} {opp.isAI ? '(IA)' : ''}
                    </span>
                    {opp.hasPriority && (
                      <span className="opp-priority-dot" title="Ha la priorità">
                        ⚡ Priorità
                      </span>
                    )}
                    <div
                      className={`life-orb ${opp.life <= 10 ? 'critical' : ''}`}
                    >
                      <Heart size={13} /> <strong>{opp.life}</strong>
                      {oppLifeDelta !== undefined && oppLifeDelta !== 0 && (
                        <span
                          className={`life-delta-pop ${
                            oppLifeDelta > 0 ? 'positive' : 'negative'
                          }`}
                        >
                          {oppLifeDelta > 0 ? `+${oppLifeDelta}` : oppLifeDelta}
                        </span>
                      )}
                    </div>
                    {isTargetedByStack && (
                      <span className="stack-target-player-pill">
                        <Crosshair size={11} /> BERSAGLIO
                      </span>
                    )}
                    {opp.poisonCounters > 0 && (
                      <span className="counter-badge poison" title="Segnalini Veleno">
                        ☠ {opp.poisonCounters}
                      </span>
                    )}
                    {opp.commanderDamageTaken.length > 0 && (
                      <span
                        className="counter-badge cmd-dmg"
                        title={opp.commanderDamageTaken
                          .map(
                            (d) =>
                              `${d.commanderName} (${d.commanderOwnerName}): ${d.damage}/21 danni`
                          )
                          .join('\n')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSidebarTab('COMMANDER_INFO');
                        }}
                      >
                        <Swords size={12} /> Cmd Dmg:{' '}
                        {Math.max(...opp.commanderDamageTaken.map((d) => d.damage))}
                      </span>
                    )}
                  </div>

                  {/* Opponent Zone Counters & Command Zone quick buttons */}
                  <div
                    className="player-zones-pills"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="zone-pill" title="Carte in Mano">
                      ✋ Mano: <strong>{opp.zoneSizes.hand}</strong>
                    </span>
                    <span className="zone-pill" title="Carte nel Grimorio">
                      📚 Grimorio: <strong>{opp.zoneSizes.library}</strong>
                    </span>
                    <button
                      type="button"
                      className="zone-pill clickable"
                      onClick={() => handleOpenZoneBrowser(opp.id, 'graveyard')}
                    >
                      🪦 Cimitero: <strong>{opp.zoneSizes.graveyard}</strong>
                    </button>
                    <button
                      type="button"
                      className="zone-pill clickable"
                      onClick={() => handleOpenZoneBrowser(opp.id, 'exile')}
                    >
                      🌀 Esilio: <strong>{opp.zoneSizes.exile}</strong>
                    </button>
                    {(opp.commanders.length > 0 || opp.zoneSizes.command > 0) && (
                      <button
                        type="button"
                        className="zone-pill commander clickable"
                        onClick={() => handleOpenZoneBrowser(opp.id, 'command')}
                      >
                        <Crown size={11} /> Cmd: <strong>{opp.zoneSizes.command}</strong>
                      </button>
                    )}
                  </div>
                </div>

                {/* Opponent 3-Zone Tactical Battlefield */}
                <div className="opponent-battlefield-area">
                  {/* Opponent Command Zone Float */}
                  {opp.zones.command && opp.zones.command.length > 0 && (
                    <div className="opp-command-float">
                      <span className="lane-micro-tag gold">CMD</span>
                      {opp.zones.command.map((cmdCard) => (
                        <CardVisual
                          key={cmdCard.id}
                          card={cmdCard}
                          size="xs"
                          onClick={handleCardClick}
                          onInspect={handleInspectCard}
                          badgeText="ZONA CMD"
                          isStackSource={stackSourceCardId === cmdCard.id}
                          isStackTarget={stackTargetCardIds.has(cmdCard.id)}
                        />
                      ))}
                    </div>
                  )}

                  <div className="bf-tactical-grid">
                    {/* Front Row: Creatures (Left) + Support Artifacts/Enchantments/PW (Right) */}
                    <div className="bf-front-split">
                      <div className="bf-zone-cluster creatures-cluster">
                        {oppBf.creatures.length > 0 && (
                          <span className="lane-micro-tag">⚔️ Creature</span>
                        )}
                        <div className="bf-cards-flow">
                          {oppBf.creatures.map((c) => (
                            <CardVisual
                              key={c.id}
                              card={c}
                              size="sm"
                              onClick={handleCardClick}
                              onInspect={handleInspectCard}
                              attachedCards={oppBf.attachmentsByHostId[c.id] || []}
                              isStackSource={stackSourceCardId === c.id}
                              isStackTarget={stackTargetCardIds.has(c.id)}
                            />
                          ))}
                        </div>
                      </div>

                      {oppBf.support.length > 0 && (
                        <div className="bf-zone-cluster support-cluster">
                          <span className="lane-micro-tag">🔮 Supporto</span>
                          <div className="bf-cards-flow">
                            {oppBf.support.map((c) => (
                              <CardVisual
                                key={c.id}
                                card={c}
                                size="sm"
                                onClick={handleCardClick}
                                onInspect={handleInspectCard}
                                attachedCards={oppBf.attachmentsByHostId[c.id] || []}
                                isStackSource={stackSourceCardId === c.id}
                                isStackTarget={stackTargetCardIds.has(c.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Back Row: Grouped Lands */}
                    {oppBf.landGroups.length > 0 && (
                      <div className="bf-zone-cluster lands-cluster">
                        <span className="lane-micro-tag">⛰️ Terre</span>
                        <div className="bf-cards-flow">
                          {oppBf.landGroups.map((grp) => (
                            <CardVisual
                              key={grp.key}
                              card={grp.representative}
                              size="xs"
                              stackCount={grp.count}
                              onClick={handleCardClick}
                              onInspect={handleInspectCard}
                              attachedCards={
                                oppBf.attachmentsByHostId[grp.representative.id] || []
                              }
                              isStackSource={grp.cards.some(
                                (c) => c.id === stackSourceCardId
                              )}
                              isStackTarget={grp.cards.some((c) =>
                                stackTargetCardIds.has(c.id)
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* CENTER ACTION & PROMPT BAR + STACK + COMBAT SUMMARY */}
        <section className="center-command-strip">
          <div
            className={`prompt-banner ${
              gameState.hasPriority ? 'priority-active' : 'priority-waiting'
            }`}
          >
            <div className="prompt-text-wrap">
              <span
                className={`priority-badge ${
                  gameState.hasPriority ? 'yours' : 'theirs'
                }`}
              >
                {gameState.hasPriority ? '⚡ TUA PRIORITÀ' : '⏳ IN ATTESA'}
              </span>
              <span className="prompt-phase-tag">
                {PHASES.find((p) => p.code === gameState.phase)?.icon}{' '}
                {PHASES.find((p) => p.code === gameState.phase)?.full ||
                  gameState.phaseLabel}
              </span>
              <span className="prompt-message">
                {gameState.prompt?.message || 'In attesa della prossima azione...'}
              </span>
              {gameState.prompt?.notification &&
                gameState.prompt.notification !== gameState.prompt.message && (
                  <span className="prompt-notification-sub">
                    💡 {gameState.prompt.notification}
                  </span>
                )}
            </div>

            <div className="prompt-buttons">
              {/* Quick player-selection buttons when coin toss or player targeting is active */}
              {(gameState.players.some((p) => p.isSelectable) ||
                (gameState.prompt?.message || '').toLowerCase().includes('portrait') ||
                (gameState.prompt?.message || '').toLowerCase().includes('coin toss')) &&
                gameState.players.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="btn-prompt-ok"
                    onClick={() => handlePlayerClick(p)}
                    title={`Seleziona ${p.name}`}
                  >
                    🎯 {p.name} {p.isLocalViewer ? '(Tu)' : ''}
                  </button>
                ))}

              {gameState.isDeclareAttackers && (
                <button
                  type="button"
                  className="btn-combat-alpha"
                  onClick={handleAlphaStrike}
                  title="Attacca con tutte le creature disponibili (Alpha Strike)"
                >
                  <Sword size={15} /> Attacca con Tutto
                </button>
              )}

              <button
                type="button"
                className={`btn-undo ${gameState.undoAvailable ? 'undo-ready' : ''}`}
                onClick={handleUndo}
                title="Annulla ultima azione / terra / pagamento mana (Scorciatoia: Ctrl+Z)"
              >
                <RotateCcw size={14} /> Annulla (Undo)
              </button>

              {gameState.prompt?.okEnabled && (
                <button
                  type="button"
                  className="btn-prompt-ok"
                  onClick={handleButtonOk}
                >
                  <Check size={16} /> {gameState.prompt.okText || 'OK / Passa'}
                </button>
              )}

              {gameState.prompt?.cancelEnabled && (
                <button
                  type="button"
                  className="btn-prompt-cancel"
                  onClick={handleButtonCancel}
                >
                  {gameState.prompt.cancelText || 'Annulla / Fine Turno'}
                </button>
              )}
            </div>
          </div>

          {/* Active Combat Summary Banner */}
          {gameState.combat && gameState.combat.numAttackers > 0 && (
            <div className="combat-summary-strip">
              <span className="combat-tag">
                <Swords size={15} /> COMBATTIMENTO ({gameState.combat.numAttackers}{' '}
                Attaccanti):
              </span>
              <div className="combat-bands-inline">
                {gameState.combat.bands.map((b, idx) => (
                  <span key={idx} className="combat-band-pill">
                    ⚔️{' '}
                    {b.attackers
                      .map((a) => `${a.name} (${a.power}/${a.toughness})`)
                      .join(', ')}{' '}
                    ➔ <strong>{b.defenderName}</strong>
                    {b.blocked && b.blockers.length > 0 && (
                      <span className="blocker-sub">
                        {' '}
                        • 🛡️ Bloccato da:{' '}
                        {b.blockers
                          .map((blk) => `${blk.name} (${blk.power}/${blk.toughness})`)
                          .join(', ')}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Live Magic Stack Overlay Strip (Shows Triggers, Activated Abilities & Spells in resolution order) */}
          {gameState.stack.length > 0 && (
            <div className="stack-strip">
              <div className="stack-strip-title">
                <Layers size={15} className="gold-icon" /> PILA ({gameState.stack.length})
                <span className="stack-order-hint">Da sinistra: risolve per prima</span>
              </div>
              <div className="stack-items-row">
                {gameState.stack.map((item, idx) => {
                  const isTop = idx === 0;
                  const kindLabel = item.isTrigger
                    ? '⚡ TRIGGER'
                    : item.ability
                    ? '⚙️ ABILITÀ'
                    : '✨ MAGIA';
                  const kindClass = item.isTrigger
                    ? 'stack-kind-trigger'
                    : item.ability
                    ? 'stack-kind-ability'
                    : 'stack-kind-spell';
                  const allTargets = [
                    ...item.targetPlayers.map((tp) => tp.name),
                    ...item.targetCards.map((tc) => tc.name),
                  ];

                  return (
                    <div
                      key={item.key || idx}
                      className={`stack-item-card ${kindClass} ${
                        isTop ? 'stack-top-resolving' : ''
                      }`}
                      onMouseEnter={() => setHoveredStackKey(item.key)}
                      onMouseLeave={() => setHoveredStackKey(null)}
                      onClick={() => {
                        if (item.sourceCard) handleInspectCard(item.sourceCard);
                        const parsedStackId = Number(item.key);
                        onSendWs({
                          type: 'SELECT_STACK_ITEM',
                          stackItemId: Number.isNaN(parsedStackId) ? -1 : parsedStackId,
                          sourceCardId: item.sourceCard?.id ?? -1,
                        });
                      }}
                    >
                      {item.sourceCard?.imageUrl && (
                        <img
                          src={item.sourceCard.imageUrl}
                          alt={item.sourceCard.name}
                          className="stack-mini-art"
                        />
                      )}
                      <div className="stack-item-info">
                        <div className="stack-item-badges-row">
                          {isTop && (
                            <span className="stack-resolving-next">▶ RISOLVE ORA</span>
                          )}
                          <span className={`stack-type-pill ${kindClass}`}>
                            {kindLabel}
                          </span>
                          <span className="stack-owner">
                            {item.activatingPlayerName}
                          </span>
                        </div>
                        <div className="stack-item-header">
                          <strong>{item.sourceCard?.name || 'Abilità'}</strong>
                        </div>
                        <p className="stack-item-text" title={item.text}>
                          {item.text}
                        </p>
                        {allTargets.length > 0 && (
                          <div className="stack-item-targets">
                            <Crosshair size={10} /> Bersaglio:{' '}
                            <strong>{allTargets.join(', ')}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* LOCAL PLAYER BATTLEFIELD & ZONES */}
        {localPlayer && (
          <section className="local-player-board">
            {/* Local 3-Zone Tactical Battlefield */}
            <div className="local-battlefield-area">
              {localBf.creatures.length === 0 &&
                localBf.support.length === 0 &&
                localBf.landGroups.length === 0 && (
                  <div className="bf-empty-hint">
                    Il tuo Campo di Battaglia è vuoto. Clicca una terra o magia
                    evidenziata in verde nella tua mano per giocarla!
                  </div>
                )}

              {/* Front Row: Creatures (Main Front) + Support Permanents (Right Flank) */}
              {(localBf.creatures.length > 0 || localBf.support.length > 0) && (
                <div className="bf-front-split local-front">
                  <div className="bf-zone-cluster creatures-cluster">
                    <span className="lane-micro-tag">
                      ⚔️ Creature ({localBf.creatures.length})
                    </span>
                    <div className="bf-cards-flow">
                      {localBf.creatures.map((c) => (
                        <CardVisual
                          key={c.id}
                          card={c}
                          size="md"
                          onClick={handleCardClick}
                          onInspect={handleInspectCard}
                          attachedCards={localBf.attachmentsByHostId[c.id] || []}
                          isStackSource={stackSourceCardId === c.id}
                          isStackTarget={stackTargetCardIds.has(c.id)}
                        />
                      ))}
                    </div>
                  </div>

                  {localBf.support.length > 0 && (
                    <div className="bf-zone-cluster support-cluster">
                      <span className="lane-micro-tag">
                        🔮 Artefatti / Incantesimi / PW ({localBf.support.length})
                      </span>
                      <div className="bf-cards-flow">
                        {localBf.support.map((c) => (
                          <CardVisual
                            key={c.id}
                            card={c}
                            size="md"
                            onClick={handleCardClick}
                            onInspect={handleInspectCard}
                            attachedCards={localBf.attachmentsByHostId[c.id] || []}
                            isStackSource={stackSourceCardId === c.id}
                            isStackTarget={stackTargetCardIds.has(c.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Back Row: Smart Stacked Lands */}
              {localBf.landGroups.length > 0 && (
                <div className="bf-zone-cluster lands-cluster local-lands">
                  <span className="lane-micro-tag">
                    ⛰️ Terre (
                    {localBf.landGroups.reduce((acc, g) => acc + g.count, 0)})
                  </span>
                  <div className="bf-cards-flow">
                    {localBf.landGroups.map((grp) => (
                      <CardVisual
                        key={grp.key}
                        card={grp.representative}
                        size="sm"
                        stackCount={grp.count}
                        onClick={handleCardClick}
                        onInspect={handleInspectCard}
                        attachedCards={
                          localBf.attachmentsByHostId[grp.representative.id] || []
                        }
                        isStackSource={grp.cards.some(
                          (c) => c.id === stackSourceCardId
                        )}
                        isStackTarget={grp.cards.some((c) =>
                          stackTargetCardIds.has(c.id)
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Local Player Status, Mana Pool & Zone Triggers Bar */}
            <div
              className={`player-status-bar local-bar ${
                stackTargetPlayerIds.has(localPlayer.id) ? 'player-stack-target' : ''
              }`}
            >
              <div
                className={`player-id-group ${
                  localPlayer.isSelectable ? 'selectable-player-highlight' : ''
                }`}
                onClick={() => handlePlayerClick(localPlayer)}
                title="Clicca il tuo avatar per bersagliarti quando richiesto"
              >
                <span className="player-name-tag you">{localPlayer.name} (TU)</span>
                <div
                  className={`life-orb lg ${
                    localPlayer.life <= 10 ? 'critical' : ''
                  }`}
                >
                  <Heart size={15} /> <strong>{localPlayer.life}</strong>
                  {lifeDeltas[localPlayer.id] !== undefined &&
                    lifeDeltas[localPlayer.id] !== 0 && (
                      <span
                        className={`life-delta-pop ${
                          lifeDeltas[localPlayer.id] > 0 ? 'positive' : 'negative'
                        }`}
                      >
                        {lifeDeltas[localPlayer.id] > 0
                          ? `+${lifeDeltas[localPlayer.id]}`
                          : lifeDeltas[localPlayer.id]}
                      </span>
                    )}
                </div>
                {stackTargetPlayerIds.has(localPlayer.id) && (
                  <span className="stack-target-player-pill">
                    <Crosshair size={11} /> BERSAGLIO DELLA PILA
                  </span>
                )}
                <span
                  className="land-drop-pill"
                  title="Terre giocate in questo turno"
                >
                  ⛰ Terre: {localPlayer.numLandsPlayed}/{localPlayer.maxLandsToPlay}
                </span>
                {localPlayer.poisonCounters > 0 && (
                  <span className="counter-badge poison">
                    ☠ {localPlayer.poisonCounters}
                  </span>
                )}
                {localPlayer.energyCounters > 0 && (
                  <span className="counter-badge energy">
                    ⚡ {localPlayer.energyCounters}
                  </span>
                )}
              </div>

              {/* Interactive Mana Pool Orbs */}
              <div
                className="mana-pool-bar"
                title="Riserva di Mana — Clicca per spendere mana"
              >
                <span className="mana-pool-label">Mana:</span>
                {(['W', 'U', 'B', 'R', 'G', 'C'] as const).map((col) => {
                  const val = localPlayer.manaPool[col] || 0;
                  return (
                    <button
                      key={col}
                      type="button"
                      className={`mana-orb-btn ${val > 0 ? 'has-mana' : ''}`}
                      onClick={() => handleUseMana(col)}
                    >
                      <ManaSymbolBadge symbol={col} size="sm" />
                      <strong>{val}</strong>
                    </button>
                  );
                })}
              </div>

              {/* Local Zone Buttons */}
              <div className="player-zones-pills">
                <span className="zone-pill">
                  📚 Grimorio: <strong>{localPlayer.zoneSizes.library}</strong>
                </span>
                <button
                  type="button"
                  className="zone-pill clickable"
                  onClick={() => handleOpenZoneBrowser(localPlayer.id, 'graveyard')}
                >
                  🪦 Cimitero: <strong>{localPlayer.zoneSizes.graveyard}</strong>
                </button>
                <button
                  type="button"
                  className="zone-pill clickable"
                  onClick={() => handleOpenZoneBrowser(localPlayer.id, 'exile')}
                >
                  🌀 Esilio: <strong>{localPlayer.zoneSizes.exile}</strong>
                </button>
                <button
                  type="button"
                  className="zone-pill commander clickable"
                  onClick={() => handleOpenZoneBrowser(localPlayer.id, 'command')}
                >
                  <Crown size={12} /> Zona Comando:{' '}
                  <strong>{localPlayer.zoneSizes.command}</strong>
                </button>
                {localPlayer.zoneSizes.flashback > 0 && (
                  <button
                    type="button"
                    className="zone-pill flashback clickable"
                    onClick={() => handleOpenZoneBrowser(localPlayer.id, 'flashback')}
                  >
                    <Sparkles size={12} /> Giocabili da Zone:{' '}
                    <strong>{localPlayer.zoneSizes.flashback}</strong>
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Tray: Hand + Command Zone Dock */}
            <div className="hand-and-command-tray">
              {/* Command Zone & Flashback Quick Dock */}
              {(localPlayer.zones.command.length > 0 ||
                localPlayer.zones.flashback.length > 0) && (
                <div className="command-dock">
                  <div className="dock-label">
                    <Crown size={13} className="gold-icon" /> ZONA COMANDO / EXTRA
                  </div>
                  <div className="dock-cards">
                    {localPlayer.zones.command.map((c) => {
                      const cmdMeta = localPlayer.commanders.find(
                        (cm) => cm.card.name === c.name
                      );
                      return (
                        <CardVisual
                          key={c.id}
                          card={c}
                          size="md"
                          onClick={handleCardClick}
                          onInspect={handleInspectCard}
                          badgeText={
                            cmdMeta && cmdMeta.taxMana > 0
                              ? `Tax +${cmdMeta.taxMana}`
                              : undefined
                          }
                        />
                      );
                    })}
                    {localPlayer.zones.flashback
                      .filter(
                        (fc) =>
                          !localPlayer.zones.command.some((cc) => cc.id === fc.id)
                      )
                      .map((c) => (
                        <CardVisual
                          key={c.id}
                          card={c}
                          size="sm"
                          onClick={handleCardClick}
                          onInspect={handleInspectCard}
                          badgeText="EXTRA"
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* Local Hand */}
              <div className="local-hand-dock">
                <div className="dock-label">
                  ✋ LA TUA MANO ({localPlayer.zones.hand.length})
                </div>
                <div className="hand-cards-row">
                  {localPlayer.zones.hand.map((c) => (
                    <CardVisual
                      key={c.id}
                      card={c}
                      size="md"
                      inHand={true}
                      onClick={handleCardClick}
                      onInspect={handleInspectCard}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* RIGHT SIDEBAR: Card Info Inspector, Commander Damage Matrix, Zone Browser & Log/Chat */}
      <aside className="game-info-sidebar">
        <div className="sidebar-tabs">
          <button
            type="button"
            className={`sidebar-tab-btn ${sidebarTab === 'INSPECTOR' ? 'active' : ''}`}
            onClick={() => setSidebarTab('INSPECTOR')}
            title="Dettagli e testo Oracle della carta selezionata"
          >
            <Info size={14} /> Info Carta
          </button>
          <button
            type="button"
            className={`sidebar-tab-btn ${
              sidebarTab === 'COMMANDER_INFO' ? 'active' : ''
            }`}
            onClick={() => setSidebarTab('COMMANDER_INFO')}
            title="Danni Commander, Tassa Comandante e Stato Giocatori"
          >
            <Crown size={14} /> Info &amp; Cmd
          </button>
          <button
            type="button"
            className={`sidebar-tab-btn ${sidebarTab === 'ZONES' ? 'active' : ''}`}
            onClick={() => setSidebarTab('ZONES')}
            title="Esplora Cimitero, Esilio e Zona di Comando"
          >
            <Eye size={14} /> Zone
          </button>
          <button
            type="button"
            className={`sidebar-tab-btn ${sidebarTab === 'LOG_CHAT' ? 'active' : ''}`}
            onClick={() => setSidebarTab('LOG_CHAT')}
            title="Registro Partita e Chat"
          >
            <ScrollText size={14} /> Log/Chat
          </button>
        </div>

        {/* TAB 1: DETAILED CARD INSPECTOR (With DFC Flip Support!) */}
        {sidebarTab === 'INSPECTOR' && (
          <div className="sidebar-body inspector-pane">
            {inspectedCard && !inspectedCard.hidden ? (
              <div className="card-inspector-detail">
                <div className="inspector-art-frame">
                  <img
                    src={
                      showAlternateFace && inspectedCard.alternateImageUrl
                        ? inspectedCard.alternateImageUrl
                        : inspectedCard.imageUrl ||
                          inspectedCard.scryfallFallbackUrl ||
                          ''
                    }
                    alt={
                      showAlternateFace && inspectedCard.alternateName
                        ? inspectedCard.alternateName
                        : inspectedCard.name
                    }
                    className="inspector-large-img"
                    onError={(e) => {
                      if (
                        inspectedCard.scryfallFallbackUrl &&
                        e.currentTarget.src !== inspectedCard.scryfallFallbackUrl
                      ) {
                        e.currentTarget.src = inspectedCard.scryfallFallbackUrl;
                      }
                    }}
                  />
                  {inspectedCard.hasAlternateState && (
                    <button
                      type="button"
                      className="btn-flip-dfc"
                      onClick={() => setShowAlternateFace((prev) => !prev)}
                      title="Gira la carta per vedere l'altra faccia (DFC / Transform / Modal)"
                    >
                      <RefreshCw size={13} />{' '}
                      {showAlternateFace
                        ? `Mostra Fronte (${inspectedCard.name})`
                        : `Gira Faccia (${inspectedCard.alternateName || 'Retro'})`}
                    </button>
                  )}
                </div>
                <div className="inspector-meta-box">
                  <div className="inspector-title-line">
                    <h3>
                      {showAlternateFace && inspectedCard.alternateName
                        ? inspectedCard.alternateName
                        : inspectedCard.name}
                    </h3>
                    <ManaCostDisplay
                      text={
                        showAlternateFace && inspectedCard.alternateManaCost
                          ? inspectedCard.alternateManaCost
                          : inspectedCard.manaCost
                      }
                      size="md"
                    />
                  </div>
                  <div className="inspector-type-line">
                    <span>
                      {showAlternateFace && inspectedCard.alternateType
                        ? inspectedCard.alternateType
                        : inspectedCard.type}
                    </span>
                    {inspectedCard.setCode && (
                      <span className="set-tag">{inspectedCard.setCode}</span>
                    )}
                  </div>

                  {inspectedCard.isCreature && (
                    <div className="inspector-pt-bar">
                      Forza / Costituzione:{' '}
                      <strong>
                        {showAlternateFace &&
                        inspectedCard.alternatePower !== undefined
                          ? `${inspectedCard.alternatePower}/${inspectedCard.alternateToughness}`
                          : `${inspectedCard.power}/${inspectedCard.toughness}`}
                      </strong>
                      {(inspectedCard.damage || 0) > 0 && (
                        <span className="dmg-warn">
                          {' '}
                          ({inspectedCard.damage} danni inflitti)
                        </span>
                      )}
                    </div>
                  )}

                  <OracleTextDisplay
                    text={
                      showAlternateFace && inspectedCard.alternateOracleText
                        ? inspectedCard.alternateOracleText
                        : inspectedCard.oracleText ||
                          inspectedCard.abilityText ||
                          inspectedCard.fullText
                    }
                  />

                  {inspectedCard.counters &&
                    Object.keys(inspectedCard.counters).length > 0 && (
                      <div className="inspector-counters-box">
                        <h4>Segnalini</h4>
                        <div className="counter-tags">
                          {Object.entries(inspectedCard.counters).map(([k, v]) => (
                            <span key={k} className="counter-pill">
                              {v}x {k}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            ) : (
              <div className="sidebar-empty">
                Passa il mouse o clicca l&apos;icona <Info size={13} /> su qualsiasi
                carta per leggerne l&apos;immagine ad alta risoluzione e il testo
                completo.
              </div>
            )}
          </div>
        )}

        {/* TAB 2: COMMANDER DAMAGE MATRIX & MATCH INFO */}
        {sidebarTab === 'COMMANDER_INFO' && (
          <div className="sidebar-body commander-info-pane">
            <div className="info-card-block">
              <h4>
                <Crown size={15} className="gold-icon" /> Stato Comandanti &amp; Tassa
              </h4>
              {gameState.players.map((p) => (
                <div key={p.id} className="cmd-player-summary">
                  <div className="cmd-player-header">
                    <strong>{p.name}</strong>
                    <span>{p.life} PV</span>
                  </div>
                  {p.commanders.length === 0 ? (
                    <div className="muted-sm">Nessun Comandante registrato</div>
                  ) : (
                    p.commanders.map((cm, idx) => (
                      <div key={idx} className="cmd-tax-row">
                        <span>{cm.card.name}</span>
                        <span className="tax-pill">
                          Lanciato: {cm.castCount}x (Tassa +{cm.taxMana})
                        </span>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>

            <div className="info-card-block">
              <h4>
                <Swords size={15} className="gold-icon" /> Danni da Comandante Subiti (Limite 21)
              </h4>
              {gameState.players.map((p) => (
                <div key={p.id} className="cmd-dmg-block">
                  <strong>{p.name} ha subito:</strong>
                  {p.commanderDamageTaken.length === 0 ? (
                    <div className="muted-sm">0 danni da Comandante</div>
                  ) : (
                    p.commanderDamageTaken.map((d, idx) => (
                      <div key={idx} className="cmd-dmg-line">
                        <span>
                          da {d.commanderName} ({d.commanderOwnerName})
                        </span>
                        <strong className={d.damage >= 15 ? 'danger-text' : ''}>
                          {d.damage} / 21
                        </strong>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>

            <div className="info-card-block">
              <h4>Dettagli Stato Giocatori</h4>
              {gameState.players.map((p) => (
                <div key={p.id} className="player-detail-mini">
                  <strong>{p.name}:</strong> Terre {p.numLandsPlayed}/{p.maxLandsToPlay} •
                  Pescate oggi: {p.numDrawnThisTurn}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: ZONE EXPLORER */}
        {sidebarTab === 'ZONES' && (
          <div className="sidebar-body zones-pane">
            <div className="zone-selector-controls">
              <select
                value={activeZonePlayer?.id ?? ''}
                onChange={(e) => setZoneViewerPlayerId(Number(e.target.value))}
              >
                {gameState.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.isLocalViewer ? '(Tu)' : ''}
                  </option>
                ))}
              </select>

              <div className="zone-type-buttons">
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
                      zoneViewerType === zt.key ? 'active' : ''
                    }`}
                    onClick={() => setZoneViewerType(zt.key)}
                  >
                    {zt.label} (
                    {activeZonePlayer?.zones[zt.key]?.length || 0})
                  </button>
                ))}
              </div>
            </div>

            <div className="zone-cards-grid">
              {(activeZonePlayer?.zones[zoneViewerType] || []).length === 0 ? (
                <div className="sidebar-empty">Nessuna carta in questa zona.</div>
              ) : (
                (activeZonePlayer?.zones[zoneViewerType] || []).map((c) => (
                  <CardVisual
                    key={c.id}
                    card={c}
                    size="sm"
                    onClick={handleCardClick}
                    onInspect={handleInspectCard}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 4: GAME LOG & CHAT */}
        {sidebarTab === 'LOG_CHAT' && (
          <div className="sidebar-body log-chat-pane">
            <div className="game-log-box">
              <h4>Registro Azioni</h4>
              <div className="log-entries-scroll" ref={logScrollRef}>
                {gameState.gameLog.length === 0 ? (
                  <div className="muted-sm">La partita è appena iniziata.</div>
                ) : (
                  gameState.gameLog.map((entry, idx) => (
                    <div key={idx} className="log-line">
                      {entry.summary}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="ingame-chat-box">
              <h4>
                <MessageSquare size={14} /> Chat Tavolo
              </h4>
              <div className="chat-messages-list mini" ref={chatScrollRef}>
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
      </aside>

      {/* SYNCHRONOUS ENGINE CHOICE MODAL (Mulligan, Modal Spells, Scry, Tutor, Combat Damage) */}
      {gameState.pendingModal && (
        <div className="modal-backdrop">
          <div className="modal-surface game-choice-modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  <Sparkles size={18} className="gold-icon" />{' '}
                  {gameState.pendingModal.title || 'Scelta Richiesta'}
                </h3>
                {gameState.pendingModal.message && (
                  <p className="modal-subtitle">{gameState.pendingModal.message}</p>
                )}
              </div>
            </div>

            {/* 1. CHOOSE_ABILITY */}
            {gameState.pendingModal.modalType === 'CHOOSE_ABILITY' && (
              <div className="modal-choice-body">
                <div className="ability-options-list">
                  {(gameState.pendingModal.options || []).map((opt) => (
                    <div
                      key={opt.index}
                      className={`ability-option-item ${
                        selectedModalIndices.includes(opt.index) ? 'selected' : ''
                      }`}
                      onClick={() => setSelectedModalIndices([opt.index])}
                    >
                      <strong>{opt.label}</strong>
                      {opt.description && <p>{opt.description}</p>}
                    </div>
                  ))}
                </div>
                <div className="modal-footer-bar">
                  {(gameState.pendingModal.min || 0) === 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        submitModalResponse({ cancelled: true, selectedIndex: -1 })
                      }
                    >
                      Annulla
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={selectedModalIndices.length === 0}
                    onClick={() =>
                      submitModalResponse({
                        selectedIndex: selectedModalIndices[0],
                      })
                    }
                  >
                    Conferma Abilità
                  </button>
                </div>
              </div>
            )}

            {/* 2. GET_CHOICES (Cards or Strings) */}
            {gameState.pendingModal.modalType === 'GET_CHOICES' && (
              <div className="modal-choice-body">
                <div className="choice-counter-hint">
                  Selezionati: <strong>{selectedModalIndices.length}</strong> (Min:{' '}
                  {gameState.pendingModal.min ?? 0}, Max:{' '}
                  {gameState.pendingModal.max ?? 1})
                </div>

                <div className="choices-grid">
                  {(gameState.pendingModal.options || []).map((opt) => {
                    const isSelected = selectedModalIndices.includes(opt.index);
                    return (
                      <div
                        key={opt.index}
                        className={`choice-item-box ${isSelected ? 'selected' : ''}`}
                        onClick={() =>
                          toggleModalOptionIndex(
                            opt.index,
                            gameState.pendingModal?.max ?? 1
                          )
                        }
                      >
                        {opt.isCard && opt.card ? (
                          <CardVisual
                            card={{ ...opt.card, selected: isSelected }}
                            size="sm"
                            onInspect={handleInspectCard}
                          />
                        ) : (
                          <div className="text-choice-pill">{opt.label}</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="modal-footer-bar">
                  {(gameState.pendingModal.min || 0) === 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => submitModalResponse({ selectedIndices: [] })}
                    >
                      Nessuna Scelta / Fine
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={
                      selectedModalIndices.length < (gameState.pendingModal.min ?? 0)
                    }
                    onClick={() =>
                      submitModalResponse({
                        selectedIndices: selectedModalIndices,
                      })
                    }
                  >
                    Conferma ({selectedModalIndices.length})
                  </button>
                </div>
              </div>
            )}

            {/* 3. CONFIRM (Mulligan Keep, May Ability, etc.) */}
            {gameState.pendingModal.modalType === 'CONFIRM' && (
              <div className="modal-choice-body confirm-body">
                {gameState.pendingModal.card && (
                  <div className="confirm-card-wrap">
                    <CardVisual
                      card={gameState.pendingModal.card}
                      size="md"
                      onInspect={handleInspectCard}
                    />
                  </div>
                )}
                <div className="modal-footer-bar">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => submitModalResponse({ confirmed: false })}
                  >
                    {gameState.pendingModal.noText || 'No'}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => submitModalResponse({ confirmed: true })}
                  >
                    {gameState.pendingModal.yesText || 'Sì'}
                  </button>
                </div>
              </div>
            )}

            {/* 4. INPUT_TEXT / NUMBER */}
            {gameState.pendingModal.modalType === 'INPUT_TEXT' && (
              <div className="modal-choice-body">
                <div className="form-field">
                  <input
                    type={
                      gameState.pendingModal.inputKind === 'NUMBER'
                        ? 'number'
                        : 'text'
                    }
                    min={gameState.pendingModal.min}
                    max={gameState.pendingModal.max}
                    value={modalTextInput}
                    onChange={(e) => setModalTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitModalResponse({
                          value: String(modalTextInput),
                          text: String(modalTextInput),
                        });
                      }
                    }}
                    autoFocus
                  />
                </div>
                <div className="modal-footer-bar">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() =>
                      submitModalResponse({
                        value: String(modalTextInput),
                        text: String(modalTextInput),
                      })
                    }
                  >
                    Conferma
                  </button>
                </div>
              </div>
            )}

            {/* 5 & 6. ASSIGN_COMBAT_DAMAGE & ASSIGN_GENERIC_AMOUNT */}
            {(gameState.pendingModal.modalType === 'ASSIGN_COMBAT_DAMAGE' ||
              gameState.pendingModal.modalType === 'ASSIGN_GENERIC_AMOUNT') && (() => {
              const requiredTotal =
                gameState.pendingModal.totalDamageToAssign ??
                gameState.pendingModal.totalAmount ??
                0;
              const assignedSum = Object.values(modalDamageMap).reduce(
                (acc, v) => acc + (Number.isFinite(v) ? v : 0),
                0
              );
              const isExactSum = assignedSum === requiredTotal;
              return (
                <div className="modal-choice-body">
                  <div className="choice-counter-hint">
                    Totale richiesto: <strong>{requiredTotal}</strong>
                    <span
                      className={`damage-sum-status ${
                        isExactSum ? 'ok' : 'mismatch'
                      }`}
                    >
                      Assegnati: {assignedSum} / {requiredTotal}
                    </span>
                  </div>
                  <div className="damage-targets-list">
                    {(gameState.pendingModal.targets || []).map((t) => (
                      <div key={t.index} className="damage-target-row">
                        <span>
                          <strong>{t.label}</strong>
                          {t.lethalDamage !== undefined &&
                            ` (Letale: ${t.lethalDamage})`}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={requiredTotal}
                          value={modalDamageMap[t.index] ?? 0}
                          onChange={(e) =>
                            setModalDamageMap({
                              ...modalDamageMap,
                              [t.index]: Math.max(0, Number(e.target.value)),
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div className="modal-footer-bar">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!isExactSum}
                      onClick={() =>
                        submitModalResponse({
                          allocations: modalDamageMap,
                          assignments: modalDamageMap,
                        })
                      }
                    >
                      Conferma Assegnazione
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* GAME OVER BANNER */}
      {gameState.gameOver && (
        <div className="modal-backdrop">
          <div className="modal-surface game-over-modal">
            <Crown size={42} className="gold-icon" />
            <h2>Partita Conclusa!</h2>
            {gameState.winningPlayerName && (
              <div className="winner-banner-pill">
                🏆 Vincitore: {gameState.winningPlayerName}
              </div>
            )}
            <p>
              La partita sul tavolo <strong>{gameState.title}</strong> è terminata.
              Puoi tornare nella Lobby della stanza per una rivincita immediata o
              uscire verso la Home.
            </p>
            <div className="modal-footer-bar">
              <button
                type="button"
                className="btn-secondary"
                onClick={onLeaveRoom}
              >
                Esci dalla Stanza
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={onReturnToLobby}
              >
                <RefreshCw size={15} /> Torna alla Lobby (Rivincita)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
