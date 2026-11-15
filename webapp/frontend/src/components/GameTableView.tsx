import React, { useState, useEffect } from 'react';
import {
  CardViewState,
  ChatEntry,
  GameStatePayload,
  PendingModalState,
  PlayerViewState,
} from '../types';
import { CardVisual } from './CardVisual';
import { ManaCostDisplay, ManaSymbolBadge, OracleTextDisplay } from './ManaText';
import {
  Check,
  Crown,
  Eye,
  FastForward,
  Flag,
  Heart,
  Info,
  Layers,
  MessageSquare,
  PauseCircle,
  RotateCcw,
  ScrollText,
  Send,
  Shield,
  Skull,
  Sparkles,
  Sword,
  Swords,
  Zap,
} from 'lucide-react';

interface GameTableViewProps {
  gameState: GameStatePayload;
  chatMessages: ChatEntry[];
  onSendWs: (payload: Record<string, any>) => void;
  onLeaveRoom: () => void;
}

const PHASES: { code: string; short: string; full: string }[] = [
  { code: 'UNTAP', short: 'STAP', full: 'Stappa (Untap)' },
  { code: 'UPKEEP', short: 'MANT', full: 'Mantenimento (Upkeep)' },
  { code: 'DRAW', short: 'PESC', full: 'Acquisizione (Draw)' },
  { code: 'MAIN1', short: 'MAIN 1', full: 'Prima Fase Principale' },
  { code: 'COMBAT_BEGIN', short: 'INIZ CMB', full: 'Inizio Combattimento' },
  { code: 'COMBAT_DECLARE_ATTACKERS', short: 'ATTACC', full: 'Dichiarazione Attaccanti' },
  { code: 'COMBAT_DECLARE_BLOCKERS', short: 'BLOCC', full: 'Dichiarazione Bloccanti' },
  { code: 'COMBAT_FIRST_STRIKE_DAMAGE', short: 'ATT IMPR', full: 'Danno Attacco Improvviso' },
  { code: 'COMBAT_DAMAGE', short: 'DANNO', full: 'Danno da Combattimento' },
  { code: 'COMBAT_END', short: 'FINE CMB', full: 'Fine Combattimento' },
  { code: 'MAIN2', short: 'MAIN 2', full: 'Seconda Fase Principale' },
  { code: 'END_OF_TURN', short: 'FINE', full: 'Sottofase Finale (EOT)' },
  { code: 'CLEANUP', short: 'CANC', full: 'Cancellazione (Cleanup)' },
];

type SidebarTab = 'INSPECTOR' | 'COMMANDER_INFO' | 'ZONES' | 'LOG_CHAT';

export const GameTableView: React.FC<GameTableViewProps> = ({
  gameState,
  chatMessages,
  onSendWs,
  onLeaveRoom,
}) => {
  const [inspectedCard, setInspectedCard] = useState<CardViewState | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('INSPECTOR');
  const [zoneViewerPlayerId, setZoneViewerPlayerId] = useState<number | null>(null);
  const [zoneViewerType, setZoneViewerType] = useState<
    'graveyard' | 'exile' | 'command' | 'flashback'
  >('graveyard');
  const [chatInput, setChatInput] = useState('');

  // Modal local state
  const [selectedModalIndices, setSelectedModalIndices] = useState<number[]>([]);
  const [modalTextInput, setModalTextInput] = useState<string>('');
  const [modalDamageMap, setModalDamageMap] = useState<Record<number, number>>({});

  const localPlayer: PlayerViewState | undefined =
    gameState.players.find((p) => p.isLocalViewer) || gameState.players[0];
  const opponents: PlayerViewState[] = gameState.players.filter(
    (p) => p.id !== localPlayer?.id
  );

  // Sync inspected card with prompt card if none inspected yet
  useEffect(() => {
    if (!inspectedCard && gameState.prompt?.card) {
      setInspectedCard(gameState.prompt.card);
    }
  }, [gameState.prompt?.card]);

  // Reset modal selections whenever a new modalId arrives
  useEffect(() => {
    const modal = gameState.pendingModal;
    if (!modal) {
      setSelectedModalIndices([]);
      return;
    }
    if (modal.modalType === 'CHOOSE_ABILITY' || modal.modalType === 'GET_CHOICES') {
      if ((modal.min || 0) >= 1 && modal.options && modal.options.length > 0) {
        setSelectedModalIndices([0]);
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
        initMap[t.index] = idx === 0 ? total : 0;
      });
      setModalDamageMap(initMap);
    }
  }, [gameState.pendingModal?.modalId]);

  const handleInspectCard = (card: CardViewState) => {
    setInspectedCard(card);
    setSidebarTab('INSPECTOR');
  };

  const handleCardClick = (card: CardViewState, e: React.MouseEvent) => {
    setInspectedCard(card);
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

  // Partition a player's battlefield into Lands vs Creatures vs Other Permanents
  const partitionBattlefield = (cards: CardViewState[]) => {
    const creatures: CardViewState[] = [];
    const lands: CardViewState[] = [];
    const others: CardViewState[] = [];
    cards.forEach((c) => {
      if (c.isCreature) creatures.push(c);
      else if (c.isLand) lands.push(c);
      else others.push(c);
    });
    return { creatures, others, lands };
  };

  const localBf = partitionBattlefield(localPlayer?.zones.battlefield || []);
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

          {/* Interactive Phase Strip */}
          <div className="phase-strip" title="Clicca una fase per attivare/disattivare lo Stop automatico">
            {PHASES.map((ph) => {
              const isCurrent = gameState.phase === ph.code;
              const skippedList = gameState.isMyTurn
                ? gameState.yieldState.skippedOwnPhases
                : gameState.yieldState.skippedOpponentPhases;
              const isStopped = !skippedList.includes(ph.code);
              return (
                <button
                  key={ph.code}
                  type="button"
                  className={`phase-pill ${isCurrent ? 'current' : ''} ${
                    isStopped ? 'has-stop' : 'skipped'
                  }`}
                  onClick={() => handleTogglePhaseStop(ph.code)}
                  title={`${ph.full} — ${
                    isStopped
                      ? 'Stop Attivo (clicca per saltare automaticamente)'
                      : 'Salto Automatico (clicca per mettere uno Stop)'
                  }`}
                >
                  <span className="stop-dot" />
                  {ph.short}
                </button>
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
            <button
              type="button"
              className="btn-autopass ghost"
              onClick={onLeaveRoom}
              title="Torna alla Home / Concedi"
            >
              <Flag size={13} /> Esci
            </button>
          </div>
        </header>

        {/* OPPONENTS BATTLEFIELD GRID (Supports 1 to 7 Opponents in Commander!) */}
        <section
          className={`opponents-grid opponents-count-${Math.min(
            opponents.length,
            4
          )}`}
        >
          {opponents.map((opp) => {
            const oppBf = partitionBattlefield(opp.zones.battlefield || []);
            return (
              <div
                key={opp.id}
                className={`opponent-board ${
                  opp.hasPriority ? 'has-priority' : ''
                } ${opp.hasLost ? 'player-lost' : ''} ${
                  gameState.canSelectPlayers ? 'selectable-player' : ''
                }`}
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
                    <div
                      className={`life-orb ${opp.life <= 10 ? 'critical' : ''}`}
                    >
                      <Heart size={13} /> <strong>{opp.life}</strong>
                    </div>
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

                {/* Opponent Battlefield Rows */}
                <div className="opponent-battlefield-area">
                  {/* Opponent Command Zone Banner if Commander is in Command Zone */}
                  {opp.zones.command && opp.zones.command.length > 0 && (
                    <div className="opp-command-float">
                      {opp.zones.command.map((cmdCard) => (
                        <CardVisual
                          key={cmdCard.id}
                          card={cmdCard}
                          size="xs"
                          onClick={handleCardClick}
                          onInspect={handleInspectCard}
                          badgeText="ZONA CMD"
                        />
                      ))}
                    </div>
                  )}

                  <div className="bf-lanes">
                    <div className="bf-lane">
                      {oppBf.creatures.map((c) => (
                        <CardVisual
                          key={c.id}
                          card={c}
                          size="sm"
                          onClick={handleCardClick}
                          onInspect={handleInspectCard}
                        />
                      ))}
                      {oppBf.others.map((c) => (
                        <CardVisual
                          key={c.id}
                          card={c}
                          size="sm"
                          onClick={handleCardClick}
                          onInspect={handleInspectCard}
                        />
                      ))}
                    </div>
                    <div className="bf-lane lands-lane">
                      {oppBf.lands.map((c) => (
                        <CardVisual
                          key={c.id}
                          card={c}
                          size="xs"
                          onClick={handleCardClick}
                          onInspect={handleInspectCard}
                        />
                      ))}
                    </div>
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
              <span className="prompt-message">
                {gameState.prompt?.message || 'In attesa della prossima azione...'}
              </span>
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
                    {b.attackers.map((a) => `${a.name} (${a.power}/${a.toughness})`).join(', ')}{' '}
                    ➔ <strong>{b.defenderName}</strong>
                    {b.blocked && b.blockers.length > 0 && (
                      <span className="blocker-sub">
                        {' '}
                        [Bloccato da: {b.blockers.map((blk) => blk.name).join(', ')}]
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Live Magic Stack Overlay Strip */}
          {gameState.stack.length > 0 && (
            <div className="stack-strip">
              <div className="stack-strip-title">
                <Layers size={15} className="gold-icon" /> PILA (STACK) ({gameState.stack.length})
              </div>
              <div className="stack-items-row">
                {gameState.stack.map((item, idx) => (
                  <div
                    key={item.key || idx}
                    className="stack-item-card"
                    onClick={() => {
                      if (item.sourceCard) handleInspectCard(item.sourceCard);
                      onSendWs({
                        type: 'SELECT_STACK_ITEM',
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
                      <div className="stack-item-header">
                        <strong>{item.sourceCard?.name || 'Abilità'}</strong>
                        <span className="stack-owner">{item.activatingPlayerName}</span>
                      </div>
                      <p className="stack-item-text">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* LOCAL PLAYER BATTLEFIELD & ZONES */}
        {localPlayer && (
          <section className="local-player-board">
            {/* Local Battlefield */}
            <div className="local-battlefield-area">
              <div className="bf-lane creatures-lane">
                {localBf.creatures.length === 0 &&
                  localBf.others.length === 0 &&
                  localBf.lands.length === 0 && (
                    <div className="bf-empty-hint">
                      Il tuo Campo di Battaglia è vuoto. Clicca una terra o magia evidenziata in
                      verde nella tua mano per giocarla!
                    </div>
                  )}
                {localBf.creatures.map((c) => (
                  <CardVisual
                    key={c.id}
                    card={c}
                    size="md"
                    onClick={handleCardClick}
                    onInspect={handleInspectCard}
                  />
                ))}
                {localBf.others.map((c) => (
                  <CardVisual
                    key={c.id}
                    card={c}
                    size="md"
                    onClick={handleCardClick}
                    onInspect={handleInspectCard}
                  />
                ))}
              </div>

              <div className="bf-lane lands-lane">
                {localBf.lands.map((c) => (
                  <CardVisual
                    key={c.id}
                    card={c}
                    size="sm"
                    onClick={handleCardClick}
                    onInspect={handleInspectCard}
                  />
                ))}
              </div>
            </div>

            {/* Local Player Status, Mana Pool & Zone Triggers Bar */}
            <div className="player-status-bar local-bar">
              <div
                className={`player-id-group ${
                  gameState.canSelectPlayers ? 'selectable-player' : ''
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
                </div>
                <span className="land-drop-pill" title="Terre giocate in questo turno">
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
              <div className="mana-pool-bar" title="Riserva di Mana — Clicca per spendere mana">
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
              {/* Command Zone & Flashback Quick Dock (for casting Commander or Flashback cards!) */}
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

        {/* TAB 1: DETAILED CARD INSPECTOR */}
        {sidebarTab === 'INSPECTOR' && (
          <div className="sidebar-body inspector-pane">
            {inspectedCard && !inspectedCard.hidden ? (
              <div className="card-inspector-detail">
                <div className="inspector-art-frame">
                  <img
                    src={
                      inspectedCard.imageUrl ||
                      inspectedCard.scryfallFallbackUrl ||
                      ''
                    }
                    alt={inspectedCard.name}
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
                </div>
                <div className="inspector-meta-box">
                  <div className="inspector-title-line">
                    <h3>{inspectedCard.name}</h3>
                    <ManaCostDisplay text={inspectedCard.manaCost} size="md" />
                  </div>
                  <div className="inspector-type-line">
                    <span>{inspectedCard.type}</span>
                    {inspectedCard.setCode && (
                      <span className="set-tag">{inspectedCard.setCode}</span>
                    )}
                  </div>

                  {inspectedCard.isCreature && (
                    <div className="inspector-pt-bar">
                      Forza / Costituzione:{' '}
                      <strong>
                        {inspectedCard.power}/{inspectedCard.toughness}
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
                      inspectedCard.oracleText ||
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
              <h4>Registro Azioni Forge</h4>
              <div className="log-entries-scroll">
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
              <div className="chat-messages-list mini">
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
                      onClick={() => submitModalResponse({ selectedIndex: -1 })}
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
                    autoFocus
                  />
                </div>
                <div className="modal-footer-bar">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() =>
                      submitModalResponse(
                        gameState.pendingModal?.inputKind === 'NUMBER'
                          ? { value: Number(modalTextInput) }
                          : { text: modalTextInput }
                      )
                    }
                  >
                    Conferma
                  </button>
                </div>
              </div>
            )}

            {/* 5 & 6. ASSIGN_COMBAT_DAMAGE & ASSIGN_GENERIC_AMOUNT */}
            {(gameState.pendingModal.modalType === 'ASSIGN_COMBAT_DAMAGE' ||
              gameState.pendingModal.modalType === 'ASSIGN_GENERIC_AMOUNT') && (
              <div className="modal-choice-body">
                <div className="choice-counter-hint">
                  Totale da assegnare:{' '}
                  <strong>
                    {gameState.pendingModal.totalDamageToAssign ??
                      gameState.pendingModal.totalAmount ??
                      0}
                  </strong>
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
                    onClick={() =>
                      submitModalResponse({ assignments: modalDamageMap })
                    }
                  >
                    Conferma Assegnazione
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GAME OVER BANNER */}
      {gameState.gameOver && (
        <div className="modal-backdrop">
          <div className="modal-surface game-over-modal">
            <Crown size={42} className="gold-icon" />
            <h2>Partita Conclusa!</h2>
            <p>
              La partita sul tavolo <strong>{gameState.title}</strong> è terminata.
            </p>
            <div className="modal-footer-bar">
              <button
                type="button"
                className="btn-primary"
                onClick={onLeaveRoom}
              >
                Torna alla Lobby / Home
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
