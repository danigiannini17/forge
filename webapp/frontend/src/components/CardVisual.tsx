import React, { useState, useEffect } from 'react';
import { CardViewState } from '../types';
import { ManaCostDisplay } from './ManaText';
import { Info, Shield, Sword, Crown, Sparkles } from 'lucide-react';

interface CardVisualProps {
  card: CardViewState;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  onClick?: (card: CardViewState, e: React.MouseEvent) => void;
  onInspect?: (card: CardViewState) => void;
  showInfoButton?: boolean;
  badgeText?: string;
}

export const CardVisual: React.FC<CardVisualProps> = ({
  card,
  size = 'md',
  onClick,
  onInspect,
  showInfoButton = true,
  badgeText,
}) => {
  const [imgSrc, setImgSrc] = useState<string | null>(card.imageUrl || null);
  const [triedFallback, setTriedFallback] = useState(false);
  const [imgFailed, setImgFailed] = useState(!card.imageUrl);

  useEffect(() => {
    setImgSrc(card.imageUrl || card.scryfallFallbackUrl || null);
    setTriedFallback(false);
    setImgFailed(!card.imageUrl && !card.scryfallFallbackUrl);
  }, [card.imageUrl, card.scryfallFallbackUrl, card.name]);

  const handleImgError = () => {
    if (!triedFallback && card.scryfallFallbackUrl && imgSrc !== card.scryfallFallbackUrl) {
      setTriedFallback(true);
      setImgSrc(card.scryfallFallbackUrl);
    } else {
      setImgFailed(true);
    }
  };

  const getFrameTint = (): string => {
    if (card.hidden) return 'frame-hidden';
    const colors = card.colors || [];
    if (colors.length > 1) return 'frame-gold';
    if (colors.includes('W')) return 'frame-white';
    if (colors.includes('U')) return 'frame-blue';
    if (colors.includes('B')) return 'frame-black';
    if (colors.includes('R')) return 'frame-red';
    if (colors.includes('G')) return 'frame-green';
    if (card.isLand) return 'frame-land';
    return 'frame-artifact';
  };

  const actionableClass =
    card.actionableStrength === 1
      ? 'card-actionable'
      : card.actionableStrength === 2
      ? 'card-autotap'
      : '';

  const counterEntries = card.counters ? Object.entries(card.counters) : [];

  return (
    <div
      className={`mtg-card mtg-card-${size} ${getFrameTint()} ${
        card.tapped ? 'card-tapped' : ''
      } ${card.selected ? 'card-selected' : ''} ${actionableClass} ${
        card.attacking ? 'card-attacking' : ''
      } ${card.blocking ? 'card-blocking' : ''}`}
      onClick={(e) => {
        if (onClick) onClick(card, e);
      }}
      onContextMenu={(e) => {
        if (onInspect) {
          e.preventDefault();
          onInspect(card);
        }
      }}
      title={`${card.name}${card.type ? ` — ${card.type}` : ''}${
        card.oracleText ? `\n${card.oracleText}` : ''
      }`}
    >
      {/* Artwork / Scryfall Image or Structured MTG Frame Fallback */}
      {!card.hidden && !imgFailed && imgSrc ? (
        <div className="mtg-card-art-wrapper">
          <img
            src={imgSrc}
            alt={card.name}
            className="mtg-card-img"
            loading="lazy"
            onError={handleImgError}
          />
          <div className="mtg-card-overlay-header">
            <span className="mtg-card-overlay-name">{card.name}</span>
          </div>
        </div>
      ) : (
        <div className="mtg-card-fallback">
          <div className="mtg-card-header">
            <span className="mtg-card-title">
              {card.hidden ? 'Carta Coperta' : card.name}
            </span>
            {!card.hidden && <ManaCostDisplay text={card.manaCost} size="sm" />}
          </div>
          <div className="mtg-card-art-placeholder">
            {card.commander && <Crown size={18} className="placeholder-icon gold" />}
            {!card.commander && <Sparkles size={16} className="placeholder-icon" />}
            <span className="mtg-card-type-line">
              {card.hidden ? 'Mistero' : card.type || (card.token ? 'Pedina' : 'Magia')}
            </span>
          </div>
          {!card.hidden && (
            <div className="mtg-card-textbox">
              {card.oracleText
                ? card.oracleText.slice(0, 120) + (card.oracleText.length > 120 ? '…' : '')
                : ''}
            </div>
          )}
        </div>
      )}

      {/* Top-Left Status Badges */}
      <div className="mtg-card-badges-top">
        {card.commander && (
          <span className="card-chip chip-commander" title="Commander">
            <Crown size={11} /> CMD
          </span>
        )}
        {card.token && (
          <span className="card-chip chip-token" title="Pedina">
            TOKEN
          </span>
        )}
        {card.sickness && card.isCreature && (
          <span className="card-chip chip-sick" title="Debolezza da evocazione">
            💤
          </span>
        )}
        {card.attacking && (
          <span className="card-chip chip-attack" title="In Attacco">
            <Sword size={11} /> ATK
          </span>
        )}
        {card.blocking && (
          <span className="card-chip chip-block" title="In Blocco">
            <Shield size={11} /> BLK
          </span>
        )}
        {badgeText && <span className="card-chip chip-custom">{badgeText}</span>}
      </div>

      {/* Info inspect quick button */}
      {showInfoButton && onInspect && !card.hidden && (
        <button
          type="button"
          className="card-info-btn"
          title="Ispeziona carta (o clic destro)"
          onClick={(e) => {
            e.stopPropagation();
            onInspect(card);
          }}
        >
          <Info size={13} />
        </button>
      )}

      {/* Counters overlay */}
      {counterEntries.length > 0 && (
        <div className="mtg-card-counters">
          {counterEntries.map(([k, v]) => (
            <span key={k} className="counter-pill">
              {v} {k}
            </span>
          ))}
        </div>
      )}

      {/* Bottom-Right Power/Toughness or Loyalty badge */}
      {!card.hidden && card.isCreature && (
        <div
          className={`mtg-card-pt ${
            (card.damage || 0) > 0 ? 'pt-damaged' : ''
          }`}
        >
          {card.power ?? 0}/{card.toughness ?? 0}
          {(card.damage || 0) > 0 && (
            <span className="pt-dmg-tag">-{card.damage}</span>
          )}
        </div>
      )}
      {!card.hidden && card.isPlaneswalker && card.loyalty && (
        <div className="mtg-card-loyalty" title="Fedeltà Planeswalker">
          ❖ {card.loyalty}
        </div>
      )}
    </div>
  );
};
