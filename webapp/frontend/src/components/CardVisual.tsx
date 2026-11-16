import React, { useState, useEffect, useRef } from 'react';
import { CardViewState } from '../types';
import { ManaCostDisplay } from './ManaText';
import {
  Info,
  Shield,
  Sword,
  Crown,
  Sparkles,
  RotateCcw,
  Crosshair,
  Zap,
} from 'lucide-react';

interface CardVisualProps {
  card: CardViewState;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  onClick?: (card: CardViewState, e: React.MouseEvent) => void;
  onInspect?: (card: CardViewState) => void;
  showInfoButton?: boolean;
  badgeText?: string;
  stackCount?: number;
  isStackSource?: boolean;
  isStackTarget?: boolean;
  attachedCards?: CardViewState[];
  inHand?: boolean;
}

const KEYWORD_BADGES: { match: string; icon: string; label: string }[] = [
  { match: 'flying', icon: '🪽', label: 'Volare (Flying)' },
  { match: 'first strike', icon: '⚡', label: 'Attacco Improvviso (First Strike)' },
  { match: 'double strike', icon: '⚔️', label: 'Doppio Attacco (Double Strike)' },
  { match: 'deathtouch', icon: '☠️', label: 'Tocco Letale (Deathtouch)' },
  { match: 'lifelink', icon: '💗', label: 'Legame Vitale (Lifelink)' },
  { match: 'vigilance', icon: '👁️', label: 'Cautela (Vigilance)' },
  { match: 'trample', icon: '🦶', label: 'Travolgere (Trample)' },
  { match: 'haste', icon: '🔥', label: 'Rapidità (Haste)' },
  { match: 'reach', icon: '🏹', label: 'Raggiungere (Reach)' },
  { match: 'hexproof', icon: '🛡️', label: 'Anti-Malocchio (Hexproof)' },
  { match: 'indestructible', icon: '💎', label: 'Indistruttibile (Indestructible)' },
  { match: 'ward', icon: '✨', label: 'Egida (Ward)' },
  { match: 'menace', icon: '👹', label: 'Minacciare (Menace)' },
];

const CardVisualInner: React.FC<CardVisualProps> = ({
  card,
  size = 'md',
  onClick,
  onInspect,
  showInfoButton = true,
  badgeText,
  stackCount = 1,
  isStackSource = false,
  isStackTarget = false,
  attachedCards = [],
  inHand = false,
}) => {
  const [imgSrc, setImgSrc] = useState<string | null>(card.imageUrl || null);
  const [triedFallback, setTriedFallback] = useState(false);
  const [imgFailed, setImgFailed] = useState(!card.imageUrl);

  // Track Tap / Untap / Damage transitions for premium visual feedback
  const prevTappedRef = useRef<boolean>(card.tapped);
  const prevDamageRef = useRef<number>(card.damage || 0);
  const [justUntapped, setJustUntapped] = useState(false);
  const [justTapped, setJustTapped] = useState(false);
  const [justDamaged, setJustDamaged] = useState(false);

  useEffect(() => {
    setImgSrc(card.imageUrl || card.scryfallFallbackUrl || null);
    setTriedFallback(false);
    setImgFailed(!card.imageUrl && !card.scryfallFallbackUrl);
  }, [card.imageUrl, card.scryfallFallbackUrl, card.name]);

  useEffect(() => {
    if (prevTappedRef.current && !card.tapped) {
      // Transitioned from Tapped -> Untapped!
      setJustUntapped(true);
      setJustTapped(false);
      const t = window.setTimeout(() => setJustUntapped(false), 1000);
      prevTappedRef.current = card.tapped;
      return () => window.clearTimeout(t);
    } else if (!prevTappedRef.current && card.tapped) {
      // Transitioned from Untapped -> Tapped!
      setJustTapped(true);
      setJustUntapped(false);
      const t = window.setTimeout(() => setJustTapped(false), 650);
      prevTappedRef.current = card.tapped;
      return () => window.clearTimeout(t);
    }
    prevTappedRef.current = card.tapped;
  }, [card.tapped]);

  useEffect(() => {
    const curDmg = card.damage || 0;
    if (curDmg > prevDamageRef.current) {
      setJustDamaged(true);
      const t = window.setTimeout(() => setJustDamaged(false), 850);
      prevDamageRef.current = curDmg;
      return () => window.clearTimeout(t);
    }
    prevDamageRef.current = curDmg;
  }, [card.damage]);

  const handleImgError = () => {
    if (
      !triedFallback &&
      card.scryfallFallbackUrl &&
      imgSrc !== card.scryfallFallbackUrl
    ) {
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

  const activeKeywords = React.useMemo(() => {
    if (!card.keywords || card.hidden) return [];
    const lower = card.keywords.toLowerCase();
    return KEYWORD_BADGES.filter((kb) => lower.includes(kb.match)).slice(0, 4);
  }, [card.keywords, card.hidden]);

  return (
    <div
      className={`mtg-card-unit ${
        attachedCards.length > 0 ? 'has-attachments' : ''
      } ${stackCount > 1 ? 'has-stack-count' : ''} ${
        inHand ? 'in-hand-unit' : ''
      }`}
    >
      {/* Tucked Auras / Equipment behind host permanent */}
      {attachedCards.length > 0 && (
        <div className="attached-cards-tuck">
          {attachedCards.map((att, idx) => (
            <div
              key={att.id}
              className="attached-mini-peek"
              style={{ top: `${-16 - idx * 14}px` }}
              onClick={(e) => {
                e.stopPropagation();
                if (onClick) onClick(att, e);
              }}
              onMouseEnter={() => {
                if (onInspect) onInspect(att);
              }}
              title={`Assegnato: ${att.name} (${att.type || 'Permanente'})`}
            >
              <span className="attached-peek-name">🔗 {att.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Visual duplicate layer for grouped land stacks */}
      {stackCount > 1 && <div className="card-stack-shadow-1" />}
      {stackCount > 2 && <div className="card-stack-shadow-2" />}

      <div
        className={`mtg-card mtg-card-${size} ${getFrameTint()} ${
          card.tapped ? 'card-tapped' : 'card-untapped'
        } ${justUntapped ? 'card-untapping' : ''} ${
          justTapped ? 'card-tapping' : ''
        } ${justDamaged ? 'card-damaged-flash' : ''} ${
          card.selected ? 'card-selected' : ''
        } ${actionableClass} ${card.attacking ? 'card-attacking' : ''} ${
          card.blocking ? 'card-blocking' : ''
        } ${isStackSource ? 'card-stack-source' : ''} ${
          isStackTarget ? 'card-stack-target' : ''
        }`}
        onClick={(e) => {
          if (onClick) onClick(card, e);
        }}
        onMouseEnter={() => {
          if (onInspect && !card.hidden) onInspect(card);
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
            {inHand && card.manaCost && (
              <div className="mtg-card-hand-mana">
                <ManaCostDisplay text={card.manaCost} size="sm" />
              </div>
            )}
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
              {card.commander && (
                <Crown size={18} className="placeholder-icon gold" />
              )}
              {!card.commander && (
                <Sparkles size={16} className="placeholder-icon" />
              )}
              <span className="mtg-card-type-line">
                {card.hidden
                  ? 'Mistero'
                  : card.type || (card.token ? 'Pedina' : 'Magia')}
              </span>
            </div>
            {!card.hidden && (
              <div className="mtg-card-textbox">
                {card.oracleText
                  ? card.oracleText.slice(0, 120) +
                    (card.oracleText.length > 120 ? '…' : '')
                  : ''}
              </div>
            )}
          </div>
        )}

        {/* Untap Shimmer Banner */}
        {justUntapped && (
          <div className="untap-flash-overlay">
            <RotateCcw size={13} /> STAP
          </div>
        )}

        {/* Top-Left Status Badges */}
        <div className="mtg-card-badges-top">
          {stackCount > 1 && (
            <span
              className="card-chip chip-stack-qty"
              title={`${stackCount}x ${card.name}`}
            >
              ×{stackCount}
            </span>
          )}
          {card.commander && (
            <span className="card-chip chip-commander" title="Comandante">
              <Crown size={10} /> CMD
            </span>
          )}
          {card.token && (
            <span className="card-chip chip-token" title="Pedina">
              TOKEN
            </span>
          )}
          {card.tapped && (
            <span className="card-chip chip-tapped" title="Permanente Tappato">
              TAP
            </span>
          )}
          {card.sickness && card.isCreature && (
            <span
              className="card-chip chip-sick"
              title="Debolezza da Evocazione (Summoning Sickness)"
            >
              💤
            </span>
          )}
          {card.attacking && (
            <span className="card-chip chip-attack" title="In Attacco">
              <Sword size={10} /> ATK
            </span>
          )}
          {card.blocking && (
            <span className="card-chip chip-block" title="In Blocco">
              <Shield size={10} /> BLK
            </span>
          )}
          {isStackSource && (
            <span
              className="card-chip chip-stack-source"
              title="Sorgente di abilità/trigger attualmente in Pila"
            >
              <Zap size={10} /> IN PILA
            </span>
          )}
          {isStackTarget && (
            <span
              className="card-chip chip-stack-target"
              title="Bersaglio di una magia o abilità in Pila"
            >
              <Crosshair size={10} /> BERSAGLIO
            </span>
          )}
          {badgeText && <span className="card-chip chip-custom">{badgeText}</span>}
        </div>

        {/* Keyword micro-icons on battlefield */}
        {!inHand && activeKeywords.length > 0 && (
          <div className="mtg-card-keywords-strip">
            {activeKeywords.map((kw) => (
              <span
                key={kw.match}
                className="kw-micro-badge"
                title={kw.label}
              >
                {kw.icon}
              </span>
            ))}
          </div>
        )}

        {/* Info inspect quick button */}
        {showInfoButton && onInspect && !card.hidden && (
          <button
            type="button"
            className="card-info-btn"
            title="Ispeziona carta (o passa sopra con il mouse)"
            onClick={(e) => {
              e.stopPropagation();
              onInspect(card);
            }}
          >
            <Info size={12} />
          </button>
        )}

        {/* Counters overlay */}
        {counterEntries.length > 0 && (
          <div className="mtg-card-counters">
            {counterEntries.map(([k, v]) => (
              <span key={k} className="counter-pill">
                +{v} {k}
              </span>
            ))}
          </div>
        )}

        {/* Combat Target / Blocker Assignment Callout */}
        {card.attacking && card.defendingEntityName && (
          <div
            className="combat-assignment-ribbon attack-ribbon"
            title={`Attacca ${card.defendingEntityName}`}
          >
            ⚔️ ➔ {card.defendingEntityName}
          </div>
        )}
        {card.blocking && card.blockingAttackerName && (
          <div
            className="combat-assignment-ribbon block-ribbon"
            title={`Blocca ${card.blockingAttackerName}`}
          >
            🛡️ ➔ {card.blockingAttackerName}
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
        {!card.hidden &&
          !card.isCreature &&
          !card.isPlaneswalker &&
          card.defense &&
          card.defense !== '0' && (
            <div className="mtg-card-defense" title="Difesa Battaglia">
              🛡️ {card.defense}
            </div>
          )}
      </div>
    </div>
  );
};

export const CardVisual = React.memo(CardVisualInner);

