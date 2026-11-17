import React, { useEffect, useMemo, useState } from 'react';
import { CardViewState, GameStatePayload } from '../../types';
import { CardVisual } from '../CardVisual';
import { OracleTextDisplay } from '../ManaText';
import { ChevronUp, Eye, Search, Sparkles } from 'lucide-react';

interface ChoiceModalOverlayProps {
  gameState: GameStatePayload;
  isTouchMode: boolean;
  onSubmitModalResponse: (payload: Record<string, any>) => void;
  onInspectCard: (card: CardViewState) => void;
  onZoomCard: (card: CardViewState, list?: CardViewState[]) => void;
}

export const ChoiceModalOverlay: React.FC<ChoiceModalOverlayProps> = ({
  gameState,
  isTouchMode,
  onSubmitModalResponse,
  onInspectCard,
  onZoomCard,
}) => {
  const modal = gameState.pendingModal;
  const [selectedModalIndices, setSelectedModalIndices] = useState<number[]>([]);
  const [modalTextInput, setModalTextInput] = useState<string>('');
  const [modalDamageMap, setModalDamageMap] = useState<Record<number, number>>({});
  const [isPeeking, setIsPeeking] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setIsPeeking(false);
    setSearchQuery('');
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
  }, [modal?.modalId]);

  // Keyboard 1-9 quick selection for CHOOSE_ABILITY
  useEffect(() => {
    if (!modal || modal.modalType !== 'CHOOSE_ABILITY' || isPeeking) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ) {
        return;
      }
      if (e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1;
        const opt = (modal.options || [])[idx];
        if (opt) {
          e.preventDefault();
          onSubmitModalResponse({ selectedIndex: opt.index });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modal, isPeeking, onSubmitModalResponse]);

  const filteredOptions = useMemo(() => {
    const opts = modal?.options || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return opts;
    return opts.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description && o.description.toLowerCase().includes(q))
    );
  }, [modal?.options, searchQuery]);

  const localPlayer = useMemo(
    () => gameState.players.find((p) => p.isLocalViewer) || gameState.players[0],
    [gameState.players]
  );

  if (!modal) return null;

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

  if (isPeeking) {
    return (
      <div className="modal-peek-dock">
        <div className="modal-peek-info">
          <Sparkles size={15} className="gold-icon" />
          <div>
            <strong>{modal.title || 'Scelta in sospeso'}</strong>
            {modal.message && <span> — {modal.message}</span>}
          </div>
        </div>
        <button
          type="button"
          className="btn-primary btn-sm"
          onClick={() => setIsPeeking(false)}
        >
          <ChevronUp size={15} /> Torna alla Scelta
        </button>
      </div>
    );
  }

  const isMulliganConfirm =
    modal.modalType === 'CONFIRM' &&
    (gameState.isMulligan ||
      (modal.title || '').toLowerCase().includes('mulligan') ||
      (modal.message || '').toLowerCase().includes('mulligan') ||
      (modal.message || '').toLowerCase().includes('keep'));

  const optionCardsList = (modal.options || [])
    .filter((o) => o.isCard && o.card)
    .map((o) => o.card!);

  return (
    <div className="modal-backdrop">
      <div className="modal-surface game-choice-modal">
        <div className="modal-header">
          <div className="modal-header-main">
            <h3 className="modal-title">
              <Sparkles size={17} className="gold-icon" />{' '}
              {modal.title || 'Scelta Richiesta'}
            </h3>
            {modal.message && (
              <p className="modal-subtitle">{modal.message}</p>
            )}
          </div>
          <button
            type="button"
            className="btn-peek-board"
            onClick={() => setIsPeeking(true)}
            title="Nascondi temporaneamente per ispezionare il campo di battaglia"
          >
            <Eye size={14} /> Vedi Campo
          </button>
        </div>

        {/* 1. CHOOSE_ABILITY */}
        {modal.modalType === 'CHOOSE_ABILITY' && (
          <div className="modal-choice-body">
            <div className="ability-picker-split">
              {modal.card && (
                <div className="ability-source-preview">
                  <CardVisual
                    card={modal.card}
                    size="sm"
                    onInspect={onInspectCard}
                    onZoom={(c) => onZoomCard(c, [c])}
                    isTouchMode={isTouchMode}
                  />
                </div>
              )}
              <div className="ability-options-list">
                {(modal.options || []).map((opt, idx) => (
                  <div
                    key={opt.index}
                    className={`ability-option-item ${
                      selectedModalIndices.includes(opt.index) ? 'selected' : ''
                    }`}
                    onClick={() => setSelectedModalIndices([opt.index])}
                    onDoubleClick={() =>
                      onSubmitModalResponse({ selectedIndex: opt.index })
                    }
                  >
                    <div className="ability-option-head">
                      {idx < 9 && <span className="ability-hotkey">{idx + 1}</span>}
                      <strong>{opt.label}</strong>
                    </div>
                    {opt.description && opt.description !== opt.label && (
                      <div className="ability-option-desc">
                        <OracleTextDisplay text={opt.description} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer-bar">
              {(modal.min || 0) === 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    onSubmitModalResponse({ cancelled: true, selectedIndex: -1 })
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
                  onSubmitModalResponse({
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
        {modal.modalType === 'GET_CHOICES' && (
          <div className="modal-choice-body">
            <div className="choice-toolbar-row">
              <div className="choice-counter-hint">
                Selezionati: <strong>{selectedModalIndices.length}</strong> (Min:{' '}
                {modal.min ?? 0}, Max: {modal.max ?? 1})
              </div>
              {(modal.options || []).length > 6 && (
                <div className="choice-search-box">
                  <Search size={13} />
                  <input
                    type="text"
                    placeholder="Filtra carte o opzioni..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="choices-grid">
              {filteredOptions.map((opt) => {
                const isSelected = selectedModalIndices.includes(opt.index);
                return (
                  <div
                    key={opt.index}
                    className={`choice-item-box ${isSelected ? 'selected' : ''}`}
                    onClick={() =>
                      toggleModalOptionIndex(opt.index, modal.max ?? 1)
                    }
                  >
                    {opt.isCard && opt.card ? (
                      <CardVisual
                        card={{ ...opt.card, selected: isSelected }}
                        size="sm"
                        onInspect={onInspectCard}
                        onZoom={(c) => onZoomCard(c, optionCardsList)}
                        isTouchMode={isTouchMode}
                      />
                    ) : (
                      <div className="text-choice-pill">{opt.label}</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="modal-footer-bar">
              {selectedModalIndices.length > 0 && (modal.min ?? 0) === 0 && (
                <button
                  type="button"
                  className="btn-ghost-sm"
                  onClick={() => setSelectedModalIndices([])}
                >
                  Deseleziona Tutto
                </button>
              )}
              {(modal.min || 0) === 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onSubmitModalResponse({ selectedIndices: [] })}
                >
                  Nessuna Scelta / Fine
                </button>
              )}
              <button
                type="button"
                className="btn-primary"
                disabled={selectedModalIndices.length < (modal.min ?? 0)}
                onClick={() =>
                  onSubmitModalResponse({
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
        {modal.modalType === 'CONFIRM' && (
          <div className="modal-choice-body confirm-body">
            {modal.card && (
              <div className="confirm-card-wrap">
                <CardVisual
                  card={modal.card}
                  size="md"
                  onInspect={onInspectCard}
                  onZoom={(c) => onZoomCard(c, [c])}
                  isTouchMode={isTouchMode}
                />
              </div>
            )}

            {isMulliganConfirm && localPlayer && localPlayer.zones.hand.length > 0 && (
              <div className="mulligan-hand-preview">
                <div className="mulligan-hand-label">
                  La tua mano iniziale ({localPlayer.zones.hand.length} carte):
                </div>
                <div className="mulligan-hand-strip">
                  {localPlayer.zones.hand.map((c) => (
                    <CardVisual
                      key={c.id}
                      card={c}
                      size="sm"
                      inHand={true}
                      onInspect={onInspectCard}
                      onZoom={(cardItem) =>
                        onZoomCard(cardItem, localPlayer.zones.hand)
                      }
                      isTouchMode={isTouchMode}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="modal-footer-bar">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onSubmitModalResponse({ confirmed: false })}
              >
                {modal.noText || 'No'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => onSubmitModalResponse({ confirmed: true })}
              >
                {modal.yesText || 'Sì'}
              </button>
            </div>
          </div>
        )}

        {/* 4. INPUT_TEXT / NUMBER */}
        {modal.modalType === 'INPUT_TEXT' && (
          <div className="modal-choice-body">
            <div className="form-field">
              <input
                type={modal.inputKind === 'NUMBER' ? 'number' : 'text'}
                min={modal.min}
                max={modal.max}
                value={modalTextInput}
                onChange={(e) => setModalTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSubmitModalResponse({
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
                  onSubmitModalResponse({
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
        {(modal.modalType === 'ASSIGN_COMBAT_DAMAGE' ||
          modal.modalType === 'ASSIGN_GENERIC_AMOUNT') &&
          (() => {
            const requiredTotal =
              modal.totalDamageToAssign ?? modal.totalAmount ?? 0;
            const assignedSum = Object.values(modalDamageMap).reduce(
              (acc, v) => acc + (Number.isFinite(v) ? v : 0),
              0
            );
            const isExactSum = assignedSum === requiredTotal;
            const targets = modal.targets || [];

            const handleResetDefaults = () => {
              const resetMap: Record<number, number> = {};
              targets.forEach((t, idx) => {
                resetMap[t.index] =
                  t.defaultDamage !== undefined
                    ? t.defaultDamage
                    : idx === 0
                    ? requiredTotal
                    : 0;
              });
              setModalDamageMap(resetMap);
            };

            const adjustTarget = (tIdx: number, delta: number) => {
              setModalDamageMap((prev) => {
                const cur = prev[tIdx] ?? 0;
                const next = Math.max(0, Math.min(requiredTotal, cur + delta));
                return { ...prev, [tIdx]: next };
              });
            };

            return (
              <div className="modal-choice-body">
                {modal.attacker && (
                  <div className="damage-attacker-banner">
                    <CardVisual
                      card={modal.attacker}
                      size="xs"
                      onInspect={onInspectCard}
                      onZoom={(c) => onZoomCard(c, [c])}
                      isTouchMode={isTouchMode}
                    />
                    <div>
                      <strong>{modal.attacker.name}</strong>
                      <div className="muted-sm">
                        Punti da distribuire: {requiredTotal}
                      </div>
                    </div>
                  </div>
                )}

                <div className="choice-toolbar-row">
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
                  <button
                    type="button"
                    className="btn-ghost-sm"
                    onClick={handleResetDefaults}
                  >
                    Auto (Letale)
                  </button>
                </div>

                <div className="damage-targets-list">
                  {targets.map((t) => {
                    const val = modalDamageMap[t.index] ?? 0;
                    const isLethal =
                      t.lethalDamage !== undefined && val >= t.lethalDamage;
                    return (
                      <div key={t.index} className="damage-target-row">
                        <div className="damage-target-info">
                          {t.card && (
                            <CardVisual
                              card={t.card}
                              size="xs"
                              onInspect={onInspectCard}
                              onZoom={(c) => onZoomCard(c, [c])}
                              isTouchMode={isTouchMode}
                            />
                          )}
                          <div>
                            <strong>{t.label}</strong>
                            {t.lethalDamage !== undefined && (
                              <div
                                className={`lethal-hint ${
                                  isLethal ? 'is-lethal' : ''
                                }`}
                              >
                                Letale: {t.lethalDamage}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="damage-stepper-group">
                          <button
                            type="button"
                            className="btn-stepper"
                            onClick={() => adjustTarget(t.index, -1)}
                            disabled={val <= 0}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={requiredTotal}
                            value={val}
                            onChange={(e) =>
                              setModalDamageMap({
                                ...modalDamageMap,
                                [t.index]: Math.max(0, Number(e.target.value)),
                              })
                            }
                          />
                          <button
                            type="button"
                            className="btn-stepper"
                            onClick={() => adjustTarget(t.index, 1)}
                            disabled={assignedSum >= requiredTotal}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="modal-footer-bar">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!isExactSum}
                    onClick={() =>
                      onSubmitModalResponse({
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
  );
};
