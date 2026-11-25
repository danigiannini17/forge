import React, { useState, useEffect, useRef } from 'react';
import { CardViewState } from '../types';
import { ManaCostDisplay } from './ManaText';
import { SLEEVE_THEMES, SleeveTheme } from './match/playmats';
import {
  Maximize2,
  Shield,
  Sword,
  Crown,
  Sparkles,
  RotateCcw,
} from 'lucide-react';

export interface CardVisualProps {
  card: CardViewState;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  onClick?: (
    card: CardViewState,
    e: React.MouseEvent | React.TouchEvent,
    otherCardIds?: number[]
  ) => void;
  onInspect?: (card: CardViewState) => void;
  onZoom?: (card: CardViewState) => void;
  showInfoButton?: boolean;
  badgeText?: string;
  stackCount?: number;
  otherStackCardIds?: number[];
  isStackSource?: boolean;
  isStackTarget?: boolean;
  attachedCards?: CardViewState[];
  inHand?: boolean;
  dimNonSelectable?: boolean;
  isTouchMode?: boolean;
  compact?: boolean;
  sleeveTheme?: SleeveTheme;
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
  onZoom,
  showInfoButton = true,
  badgeText,
  stackCount = 1,
  otherStackCardIds,
  isStackSource = false,
  isStackTarget = false,
  attachedCards = [],
  inHand = false,
  dimNonSelectable = false,
  isTouchMode = false,
  compact = false,
  sleeveTheme = SLEEVE_THEMES[0],
}) => {
  const [imgSrc, setImgSrc] = useState<string | null>(
    card.imageUrl || card.scryfallFallbackUrl || null
  );
  const [triedFallback, setTriedFallback] = useState(false);
  const [imgFailed, setImgFailed] = useState(
    !card.imageUrl && !card.scryfallFallbackUrl
  );
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Track Tap / Untap / Damage transitions
  const prevTappedRef = useRef<boolean>(card.tapped);
  const prevDamageRef = useRef<number>(card.damage || 0);
  const [justUntapped, setJustUntapped] = useState(false);
  const [justTapped, setJustTapped] = useState(false);
  const [justDamaged, setJustDamaged] = useState(false);

  // Touch long-press tracking (420ms -> CardZoomModal)
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef<boolean>(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const handledTouchTapRef = useRef<boolean>(false);

  useEffect(() => {
    const nextSrc = card.imageUrl || card.scryfallFallbackUrl || null;
    setImgSrc(nextSrc);
    setTriedFallback(false);
    setImgFailed(!nextSrc);
    setImgLoaded(false);
  }, [card.imageUrl, card.scryfallFallbackUrl, card.name]);

  useEffect(() => {
    if (
      imgRef.current &&
      imgRef.current.complete &&
      imgRef.current.naturalWidth > 0
    ) {
      setImgLoaded(true);
    }
  }, [imgSrc]);

  useEffect(() => {
    if (prevTappedRef.current && !card.tapped) {
      setJustUntapped(true);
      setJustTapped(false);
      const t = window.setTimeout(() => setJustUntapped(false), 850);
      prevTappedRef.current = card.tapped;
      return () => window.clearTimeout(t);
    } else if (!prevTappedRef.current && card.tapped) {
      setJustTapped(true);
      setJustUntapped(false);
      const t = window.setTimeout(() => setJustTapped(false), 450);
      prevTappedRef.current = card.tapped;
      return () => window.clearTimeout(t);
    }
    prevTappedRef.current = card.tapped;
  }, [card.tapped]);

  useEffect(() => {
    const curDmg = card.damage || 0;
    if (curDmg > prevDamageRef.current) {
      setJustDamaged(true);
      const t = window.setTimeout(() => setJustDamaged(false), 750);
      prevDamageRef.current = curDmg;
      return () => window.clearTimeout(t);
    }
    prevDamageRef.current = curDmg;
  }, [card.damage]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const handleImgError = () => {
    if (
      !triedFallback &&
      card.scryfallFallbackUrl &&
      imgSrc !== card.scryfallFallbackUrl
    ) {
      setTriedFallback(true);
      setImgLoaded(false);
      setImgSrc(card.scryfallFallbackUrl);
    } else {
      setImgFailed(true);
      setImgLoaded(true);
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

  const isDimmed = dimNonSelectable && !card.isSelectable && !card.selected;
  const strength = card.actionableStrength || 0;
  const actionableClass = isDimmed
    ? ''
    : card.isSelectable
    ? 'card-selectable-target'
    : strength >= 2
    ? 'card-autotap'
    : strength === 1 || card.isActionable
    ? 'card-actionable'
    : '';

  const counterEntries = card.counters ? Object.entries(card.counters) : [];

  const activeKeywords = React.useMemo(() => {
    if (!card.keywords || card.hidden) return [];
    const lower = card.keywords.toLowerCase();
    return KEYWORD_BADGES.filter((kb) => lower.includes(kb.match)).slice(0, 3);
  }, [card.keywords, card.hidden]);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (card.hidden) return;
    longPressTriggeredRef.current = false;
    const touch = e.touches[0];
    if (touch) {
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    }
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15);
      }
      if (onZoom) {
        onZoom(card);
      } else if (onInspect) {
        onInspect(card);
      }
    }, 420);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > 10 || dy > 10) {
      clearLongPress();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    clearLongPress();
    if (longPressTriggeredRef.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressTriggeredRef.current = false;
      return;
    }
    // Mark so synthetic mouse click doesn't double-fire
    handledTouchTapRef.current = true;
    window.setTimeout(() => {
      handledTouchTapRef.current = false;
    }, 350);

    const canAct = Boolean(
      card.isActionable ||
        (card.actionableStrength || 0) > 0 ||
        card.isSelectable ||
        card.selected
    );

    if (canAct) {
      onClick?.(card, e, otherStackCardIds);
    } else if (!dimNonSelectable) {
      if (onZoom && !card.hidden) {
        onZoom(card);
      } else {
        onClick?.(card, e, otherStackCardIds);
      }
    } else {
      onClick?.(card, e, otherStackCardIds);
    }
  };

  const handleDesktopClick = (e: React.MouseEvent) => {
    if (handledTouchTapRef.current) return;
    if (isTouchMode) {
      const canAct = Boolean(
        card.isActionable ||
          (card.actionableStrength || 0) > 0 ||
          card.isSelectable ||
          card.selected
      );
      if (!canAct && !dimNonSelectable && onZoom && !card.hidden) {
        onZoom(card);
        return;
      }
    }
    onClick?.(card, e, otherStackCardIds);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (
      !card.hidden &&
      !card.isActionable &&
      !card.isSelectable &&
      (card.actionableStrength || 0) === 0 &&
      onZoom
    ) {
      e.stopPropagation();
      onZoom(card);
    }
  };

  const isUnitTapped = card.tapped && !inHand;

  return (
    <div
      data-card-id={card.id}
      className={`mtg-card-unit ${
        attachedCards.length > 0 ? 'has-attachments' : ''
      } ${stackCount > 1 ? 'has-stack-count' : ''} ${
        inHand ? 'in-hand-unit' : ''
      } ${isUnitTapped ? `unit-tapped unit-tapped-${size}` : ''} ${
        compact ? 'unit-compact' : ''
      }`}
    >
      {/* Tucked Auras / Equipment behind host permanent */}
      {attachedCards.length > 0 && (
        <div className="attached-cards-tuck">
          {attachedCards.map((att, idx) => (
            <div
              key={att.id}
              data-card-id={att.id}
              className={`attached-mini-peek ${
                att.isSelectable ? 'peek-selectable' : ''
              } ${att.selected ? 'peek-selected' : ''}`}
              style={{ top: `${-16 - idx * 15}px` }}
              onClick={(e) => {
                e.stopPropagation();
                onClick?.(att, e);
              }}
              onMouseEnter={() => {
                if (onInspect && !att.hidden) onInspect(att);
              }}
              title={`Assegnato: ${att.name} (${att.type || 'Permanente'})`}
            >
              <span className="attached-peek-name">🔗 {att.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Visual duplicate layer for grouped land/token stacks */}
      {stackCount > 1 && <div className="card-stack-shadow-1" />}
      {stackCount > 2 && <div className="card-stack-shadow-2" />}

      <div
        className={`mtg-card mtg-card-${size} ${getFrameTint()} ${
          card.tapped && !inHand ? 'card-tapped' : 'card-untapped'
        } ${justUntapped ? 'card-untapping' : ''} ${
          justTapped ? 'card-tapping' : ''
        } ${justDamaged ? 'card-damaged-flash' : ''} ${
          card.selected ? 'card-selected' : ''
        } ${actionableClass} ${isDimmed ? 'card-dimmed-nonselectable' : ''} ${
          card.attacking ? 'card-attacking' : ''
        } ${card.blocking ? 'card-blocking' : ''} ${
          isStackSource ? 'card-stack-source' : ''
        } ${isStackTarget ? 'card-stack-target' : ''}`}
        onClick={handleDesktopClick}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={clearLongPress}
        onMouseEnter={() => {
          if (onInspect && !card.hidden) onInspect(card);
        }}
        onContextMenu={(e) => {
          if (onZoom && !card.hidden) {
            e.preventDefault();
            onZoom(card);
          } else if (onInspect && !card.hidden) {
            e.preventDefault();
            onInspect(card);
          }
        }}
        title={`${card.name}${card.type ? ` — ${card.type}` : ''}${
          card.oracleText ? `\n${card.oracleText}` : ''
        }`}
      >
        {/* Artwork / Card Sleeve during loading or hidden / Structured MTG Frame Fallback */}
        {card.hidden ? (
          <div
            className="mtg-card-sleeve is-static"
            style={
              {
                '--sleeve-primary': sleeveTheme.primary,
                '--sleeve-secondary': sleeveTheme.secondary,
                '--sleeve-border': sleeveTheme.border,
                '--sleeve-emblem': sleeveTheme.emblem,
              } as React.CSSProperties
            }
            aria-label="Carta coperta"
          >
            <div className="sleeve-inner-frame">
              <div className="sleeve-emblem-diamond">
                <span>L</span>
              </div>
            </div>
          </div>
        ) : !imgFailed && imgSrc ? (
          <div className="mtg-card-art-wrapper">
            {!imgLoaded && (
              <div
                className="mtg-card-sleeve is-loading"
                style={
                  {
                    '--sleeve-primary': sleeveTheme.primary,
                    '--sleeve-secondary': sleeveTheme.secondary,
                    '--sleeve-border': sleeveTheme.border,
                    '--sleeve-emblem': sleeveTheme.emblem,
                  } as React.CSSProperties
                }
              >
                <div className="sleeve-inner-frame">
                  <div className="sleeve-emblem-diamond">
                    <span>L</span>
                  </div>
                </div>
              </div>
            )}
            <img
              ref={imgRef}
              src={imgSrc}
              alt={card.name}
              className={`mtg-card-img ${imgLoaded ? 'is-loaded' : 'is-loading'}`}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
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
              <span className="mtg-card-title">{card.name}</span>
              <ManaCostDisplay text={card.manaCost} size="sm" />
            </div>
            <div className="mtg-card-art-placeholder">
              {card.commander ? (
                <Crown size={18} className="placeholder-icon gold" />
              ) : (
                <Sparkles size={15} className="placeholder-icon" />
              )}
              <span className="mtg-card-type-line">
                {card.type || (card.token ? 'Pedina' : 'Magia')}
              </span>
            </div>
            <div className="mtg-card-textbox">
              {card.oracleText
                ? card.oracleText.slice(0, 100) +
                  (card.oracleText.length > 100 ? '…' : '')
                : ''}
            </div>
          </div>
        )}

        {/* Untap Shimmer Banner */}
        {justUntapped && (
          <div className="untap-flash-overlay">
            <RotateCcw size={12} /> STAP
          </div>
        )}

        {/* Top-Left Clean Visual Badges */}
        <div className="mtg-card-badges-top">
          {stackCount > 1 && (
            <span
              className="card-chip chip-stack-qty"
              title={`${stackCount}x ${card.name} (Shift+Click per selezionare tutto)`}
            >
              ×{stackCount}
            </span>
          )}
          {card.commander && (
            <span className="card-chip chip-commander" title="Comandante">
              <Crown size={10} />
            </span>
          )}
          {card.token && imgFailed && (
            <span className="card-chip chip-token" title="Pedina">
              TOKEN
            </span>
          )}
          {badgeText && <span className="card-chip chip-custom">{badgeText}</span>}
        </div>

        {/* Zoom Quick Button (Top-Right) */}
        {showInfoButton && (onZoom || onInspect) && !card.hidden && (
          <button
            type="button"
            className="card-info-btn"
            title="Ingrandisci carta (Zoom / Testo Oracle)"
            onClick={(e) => {
              e.stopPropagation();
              if (onZoom) onZoom(card);
              else if (onInspect) onInspect(card);
            }}
          >
            <Maximize2 size={10} />
          </button>
        )}

        {/* Left Edge Counters */}
        {counterEntries.length > 0 && (
          <div className="mtg-card-counters-left">
            {counterEntries.slice(0, 3).map(([k, v]) => (
              <span key={k} className="counter-pill">
                {v} {k.replace('P1P1', '+1/+1').replace('M1M1', '-1/-1').slice(0, 8)}
              </span>
            ))}
          </div>
        )}

        {/* Right Edge Keyword Micro-Icons */}
        {!inHand && activeKeywords.length > 0 && (
          <div className="mtg-card-keywords-col">
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

        {/* Bottom-Left Combat & Summoning Sickness Icons */}
        {!card.hidden &&
          !inHand &&
          (card.attacking || card.blocking || (card.sickness && card.isCreature)) && (
            <div className="mtg-card-status-bl">
              {card.attacking && (
                <span
                  className="status-orb status-atk"
                  title={
                    card.defendingEntityName
                      ? `Attacca ${card.defendingEntityName}`
                      : 'In Attacco'
                  }
                >
                  <Sword size={10} />
                </span>
              )}
              {card.blocking && (
                <span
                  className="status-orb status-blk"
                  title={
                    card.blockingAttackerName
                      ? `Blocca ${card.blockingAttackerName}`
                      : 'In Blocco'
                  }
                >
                  <Shield size={10} />
                </span>
              )}
              {card.sickness && card.isCreature && (
                <span
                  className="status-orb status-sick"
                  title="Debolezza da Evocazione (Summoning Sickness)"
                >
                  🌀
                </span>
              )}
            </div>
          )}

        {/* Bottom-Right Power/Toughness, Loyalty or Defense */}
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
