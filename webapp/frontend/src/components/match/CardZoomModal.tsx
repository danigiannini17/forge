import React, { useEffect, useRef, useState } from 'react';
import { CardViewState } from '../../types';
import { ManaCostDisplay, OracleTextDisplay } from '../ManaText';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  X,
  Zap,
} from 'lucide-react';

interface CardZoomModalProps {
  card: CardViewState | null;
  cardList?: CardViewState[];
  onClose: () => void;
  onSelectCard?: (card: CardViewState) => void;
}

export const CardZoomModal: React.FC<CardZoomModalProps> = ({
  card,
  cardList = [],
  onClose,
  onSelectCard,
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [viewMode, setViewMode] = useState<'IMAGE' | 'DETAILS'>('IMAGE');
  const [showAlternateFace, setShowAlternateFace] = useState(false);
  const touchStartXRef = useRef<number | null>(null);

  const list = cardList.length > 0 ? cardList : card ? [card] : [];

  useEffect(() => {
    if (!card) return;
    const found = list.findIndex((c) => c.id === card.id);
    setCurrentIdx(found >= 0 ? found : 0);
    setShowAlternateFace(false);
    setViewMode('IMAGE');
  }, [card?.id]);

  const currentCard = list[currentIdx] || card;

  const goPrev = () => {
    if (list.length <= 1) return;
    setCurrentIdx((prev) => (prev - 1 + list.length) % list.length);
    setShowAlternateFace(false);
  };

  const goNext = () => {
    if (list.length <= 1) return;
    setCurrentIdx((prev) => (prev + 1) % list.length);
    setShowAlternateFace(false);
  };

  useEffect(() => {
    if (!card) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [card, list.length, onClose]);

  if (!card || !currentCard || currentCard.hidden) return null;

  const displayName =
    showAlternateFace && currentCard.alternateName
      ? currentCard.alternateName
      : currentCard.name;
  const displayMana =
    showAlternateFace && currentCard.alternateManaCost
      ? currentCard.alternateManaCost
      : currentCard.manaCost;
  const displayType =
    showAlternateFace && currentCard.alternateType
      ? currentCard.alternateType
      : currentCard.type;
  const displayOracle =
    showAlternateFace && currentCard.alternateOracleText
      ? currentCard.alternateOracleText
      : currentCard.oracleText || currentCard.abilityText || currentCard.fullText;
  const displayImg =
    showAlternateFace && currentCard.alternateImageUrl
      ? currentCard.alternateImageUrl
      : currentCard.imageUrl || currentCard.scryfallFallbackUrl || '';

  const canAct = Boolean(
    onSelectCard &&
      (currentCard.isActionable ||
        (currentCard.actionableStrength || 0) > 0 ||
        currentCard.isSelectable ||
        currentCard.selected)
  );

  return (
    <div
      className="card-zoom-backdrop"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartXRef.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartXRef.current === null) return;
        const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
        const dx = endX - touchStartXRef.current;
        touchStartXRef.current = null;
        if (Math.abs(dx) > 48) {
          if (dx > 0) goPrev();
          else goNext();
        }
      }}
    >
      <div className="card-zoom-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="card-zoom-topbar">
          <span className="card-zoom-counter">
            {list.length > 1 ? `${currentIdx + 1} / ${list.length}` : 'Ispezione Carta'}
          </span>
          <div className="card-zoom-top-actions">
            <button
              type="button"
              className={`zoom-pill-btn ${viewMode === 'DETAILS' ? 'active' : ''}`}
              onClick={() =>
                setViewMode((prev) => (prev === 'IMAGE' ? 'DETAILS' : 'IMAGE'))
              }
            >
              {viewMode === 'IMAGE' ? (
                <>
                  <FileText size={14} /> Testo Oracle
                </>
              ) : (
                <>
                  <ImageIcon size={14} /> Immagine
                </>
              )}
            </button>
            {currentCard.hasAlternateState && (
              <button
                type="button"
                className="zoom-pill-btn"
                onClick={() => setShowAlternateFace((prev) => !prev)}
              >
                <RefreshCw size={14} /> Gira Faccia
              </button>
            )}
            <button
              type="button"
              className="zoom-close-btn"
              onClick={onClose}
              aria-label="Chiudi Zoom"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="card-zoom-stage">
          {list.length > 1 && (
            <button
              type="button"
              className="zoom-nav-arrow left"
              onClick={goPrev}
              aria-label="Carta Precedente"
            >
              <ChevronLeft size={26} />
            </button>
          )}

          {viewMode === 'IMAGE' && displayImg ? (
            <div className="zoom-image-wrap">
              <img
                src={displayImg}
                alt={displayName}
                className="zoom-card-img"
                onError={(e) => {
                  if (
                    currentCard.scryfallFallbackUrl &&
                    e.currentTarget.src !== currentCard.scryfallFallbackUrl
                  ) {
                    e.currentTarget.src = currentCard.scryfallFallbackUrl;
                  } else {
                    setViewMode('DETAILS');
                  }
                }}
              />
            </div>
          ) : (
            <div className="zoom-detail-sheet">
              <div className="zoom-detail-header">
                <h3>{displayName}</h3>
                <ManaCostDisplay text={displayMana} size="md" />
              </div>
              <div className="zoom-detail-type">
                <span>{displayType}</span>
                {currentCard.setCode && (
                  <span className="set-tag">{currentCard.setCode}</span>
                )}
              </div>
              {currentCard.isCreature && (
                <div className="zoom-detail-pt">
                  F/C:{' '}
                  <strong>
                    {showAlternateFace && currentCard.alternatePower !== undefined
                      ? `${currentCard.alternatePower}/${currentCard.alternateToughness}`
                      : `${currentCard.power ?? 0}/${currentCard.toughness ?? 0}`}
                  </strong>
                  {(currentCard.damage || 0) > 0 && (
                    <span className="dmg-warn"> ({currentCard.damage} danni)</span>
                  )}
                </div>
              )}
              {currentCard.isPlaneswalker && currentCard.loyalty && (
                <div className="zoom-detail-pt">
                  Fedeltà: <strong>❖ {currentCard.loyalty}</strong>
                </div>
              )}
              <div className="zoom-detail-oracle">
                <OracleTextDisplay
                  text={displayOracle || 'Nessun testo aggiuntivo.'}
                />
              </div>
              {currentCard.keywords && (
                <div className="zoom-detail-keywords">
                  <strong>Abilità:</strong> {currentCard.keywords}
                </div>
              )}
              {currentCard.counters &&
                Object.keys(currentCard.counters).length > 0 && (
                  <div className="zoom-detail-counters">
                    {Object.entries(currentCard.counters).map(([k, v]) => (
                      <span key={k} className="counter-pill">
                        {v}x {k}
                      </span>
                    ))}
                  </div>
                )}
            </div>
          )}

          {list.length > 1 && (
            <button
              type="button"
              className="zoom-nav-arrow right"
              onClick={goNext}
              aria-label="Carta Successiva"
            >
              <ChevronRight size={26} />
            </button>
          )}
        </div>

        <div className="card-zoom-bottombar">
          <div className="zoom-card-caption">
            <strong>{displayName}</strong>
            {displayType && <span> • {displayType}</span>}
          </div>
          <div className="zoom-bottom-buttons">
            {canAct && (
              <button
                type="button"
                className="btn-prompt-ok"
                onClick={() => {
                  onSelectCard?.(currentCard);
                  onClose();
                }}
              >
                <Zap size={15} />{' '}
                {currentCard.isSelectable ? 'Seleziona Bersaglio' : 'Gioca / Attiva'}
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onClose}>
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
