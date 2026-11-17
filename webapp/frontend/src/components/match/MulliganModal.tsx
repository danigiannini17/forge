import React, { useEffect, useState } from 'react';
import { CardViewState, GameStatePayload } from '../../types';
import { Check, Crown, Eye, Maximize2, RefreshCw, Sparkles } from 'lucide-react';

interface MulliganModalProps {
  gameState: GameStatePayload;
  onCardClick: (
    card: CardViewState,
    e: React.MouseEvent | React.TouchEvent
  ) => void;
  onInspectCard: (card: CardViewState) => void;
  onZoomCard: (card: CardViewState, list?: CardViewState[]) => void;
  onButtonOk: () => void;
  onButtonCancel: () => void;
}

export const MulliganModal: React.FC<MulliganModalProps> = ({
  gameState,
  onCardClick,
  onInspectCard,
  onZoomCard,
  onButtonOk,
  onButtonCancel,
}) => {
  const [isPeeking, setIsPeeking] = useState(false);

  const mState = gameState.mulliganState;
  const localPlayer =
    gameState.players.find((p) => p.isLocalViewer) || gameState.players[0];

  // Reset peek mode whenever step changes (e.g. from DECIDE -> TUCK)
  useEffect(() => {
    setIsPeeking(false);
  }, [mState?.step, mState?.cardsToBottom]);

  if (!mState || !mState.active || !localPlayer) {
    return null;
  }

  const hand = localPlayer.zones.hand || [];
  const commanders = localPlayer.zones.command || [];
  const isTuckStep = mState.step === 'TUCK';
  const cardsToBottom = mState.cardsToBottom || 0;
  const selectedInHand = hand.filter((c) => c.selected).length;
  const chosenCount = Math.max(selectedInHand, mState.selectedCount || 0);

  if (isPeeking) {
    return (
      <div className="modal-peek-dock mulligan-peek-dock">
        <div className="modal-peek-info">
          <Sparkles size={16} className="gold-icon" />
          <span>
            <strong>
              {isTuckStep
                ? `London Mulligan — Metti ${cardsToBottom} in fondo (${chosenCount}/${cardsToBottom})`
                : `Mulligan Iniziale — ${localPlayer.name}`}
            </strong>{' '}
            (Visualizzazione Campo)
          </span>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setIsPeeking(false)}
        >
          ▲ Torna alla Mano ({hand.length})
        </button>
      </div>
    );
  }

  const mid = (hand.length - 1) / 2;
  const maxAnglePerCard = hand.length > 5 ? 3.8 : 4.5;
  const startersText = mState.startingPlayerName
    ? mState.startingPlayerName === localPlayer.name
      ? 'Inizi TU per primo in questa partita!'
      : `Inizia per primo: ${mState.startingPlayerName}`
    : '';

  return (
    <div className="mulligan-modal-backdrop">
      <div className="mulligan-modal-container">
        {/* Top Player & Mulligan Header (EdhPlay-inspired) */}
        <header className="mulligan-top-header">
          <div className="mulligan-player-title">
            {(localPlayer.name || 'PLAYER 1').toUpperCase()}
          </div>

          {startersText && (
            <div className="mulligan-starter-pill">{startersText}</div>
          )}

          <div className="mulligan-subtitle-banner">
            {isTuckStep ? (
              <>
                <strong>London Mulligan:</strong> Clicca{' '}
                <span className="mulligan-highlight-num">
                  {cardsToBottom} {cardsToBottom === 1 ? 'carta' : 'carte'}
                </span>{' '}
                da mettere <strong>IN FONDO</strong> al grimorio (
                {chosenCount}/{cardsToBottom} selezionate).
              </>
            ) : cardsToBottom === 0 ? (
              <>
                Mano iniziale da <strong>{hand.length} carte</strong> — Nessuna
                carta da mettere in fondo se tieni!
              </>
            ) : (
              <>
                Mano da <strong>{hand.length} carte</strong> — Se decidi di{' '}
                <strong>Tenere</strong>, sceglierai{' '}
                <span className="mulligan-highlight-num">
                  {cardsToBottom} {cardsToBottom === 1 ? 'carta' : 'carte'}
                </span>{' '}
                da mettere in fondo al grimorio (resterai con{' '}
                <strong>{Math.max(1, hand.length - cardsToBottom)}</strong> in
                mano).
              </>
            )}
          </div>

          {commanders.length > 0 && (
            <div className="mulligan-commander-tag">
              <Crown size={13} className="gold-icon" /> Comandante:{' '}
              {commanders.map((cmd, idx) => (
                <button
                  key={cmd.id}
                  type="button"
                  className="mulligan-cmd-link"
                  onClick={() => onZoomCard(cmd, commanders)}
                >
                  {cmd.name}
                  {idx < commanders.length - 1 ? ' / ' : ''}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* Center Fanned Hand Stage ("Ventaglio" EdhPlay style) */}
        <div className="mulligan-fan-stage">
          {hand.map((card, idx) => {
            const offset = idx - mid;
            const rotDeg = offset * maxAnglePerCard;
            const arcDropPx = Math.pow(Math.abs(offset), 1.45) * 6;
            const imgSrc = card.imageUrl || card.scryfallFallbackUrl || '';
            const isChosen = Boolean(card.selected);

            return (
              <div
                key={card.id}
                className={`mulligan-fan-card ${
                  isTuckStep ? 'is-tuck-selectable' : ''
                } ${isChosen ? 'is-tuck-chosen' : ''}`}
                style={
                  {
                    '--fan-rot': `${rotDeg}deg`,
                    '--fan-y': `${arcDropPx}px`,
                    zIndex: 10 + idx,
                  } as React.CSSProperties
                }
                onMouseEnter={() => onInspectCard(card)}
                onClick={(e) => {
                  if (isTuckStep) {
                    onCardClick(card, e);
                  } else {
                    onZoomCard(card, hand);
                  }
                }}
              >
                <div className="mulligan-fan-card-inner">
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={card.name}
                      draggable={false}
                      onError={(e) => {
                        if (
                          card.scryfallFallbackUrl &&
                          e.currentTarget.src !== card.scryfallFallbackUrl
                        ) {
                          e.currentTarget.src = card.scryfallFallbackUrl;
                        }
                      }}
                    />
                  ) : (
                    <div className="mulligan-card-fallback">
                      <strong>{card.name}</strong>
                      <span>{card.type}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    className="mulligan-card-zoom-btn"
                    title="Ingrandisci carta"
                    onClick={(e) => {
                      e.stopPropagation();
                      onZoomCard(card, hand);
                    }}
                  >
                    <Maximize2 size={13} />
                  </button>

                  {isChosen && (
                    <div className="tuck-selected-ribbon">⬇ IN FONDO</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Centered EdhPlay Action Bar */}
        <footer className="mulligan-actions-bar">
          <button
            type="button"
            className="btn-mulligan-view"
            onClick={() => setIsPeeking(true)}
          >
            <Eye size={16} /> Vedi Campo
          </button>

          {isTuckStep ? (
            <>
              <button
                type="button"
                className="btn-mulligan-orange"
                disabled={!gameState.prompt?.cancelEnabled}
                onClick={onButtonCancel}
                title="Seleziona automaticamente le carte rimanenti"
              >
                Scelta Auto
              </button>
              <button
                type="button"
                className="btn-mulligan-keep"
                disabled={!gameState.prompt?.okEnabled}
                onClick={onButtonOk}
              >
                <Check size={17} /> Conferma ({chosenCount}/{cardsToBottom} in
                fondo)
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-mulligan-orange"
                disabled={!gameState.prompt?.cancelEnabled}
                onClick={onButtonCancel}
              >
                <RefreshCw size={16} /> Mulligan
              </button>
              <button
                type="button"
                className="btn-mulligan-keep"
                disabled={!gameState.prompt?.okEnabled}
                onClick={onButtonOk}
              >
                <Check size={17} /> Tieni Mano (
                {Math.max(1, hand.length - cardsToBottom)}{' '}
                {Math.max(1, hand.length - cardsToBottom) === 1
                  ? 'carta'
                  : 'carte'}
                )
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
};
