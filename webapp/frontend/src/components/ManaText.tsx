import React from 'react';

interface ManaTextProps {
  text?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SYMBOL_MAP: Record<string, { bg: string; fg: string; label: string }> = {
  W: { bg: '#f7f1d5', fg: '#2b2416', label: 'W' },
  U: { bg: '#1e6fb8', fg: '#ffffff', label: 'U' },
  B: { bg: '#2d282c', fg: '#e5dcd8', label: 'B' },
  R: { bg: '#c93a2b', fg: '#ffffff', label: 'R' },
  G: { bg: '#1e7d46', fg: '#ffffff', label: 'G' },
  C: { bg: '#8a8f99', fg: '#15181e', label: '◊' },
  T: { bg: '#5a606c', fg: '#ffffff', label: '⟳' },
  Q: { bg: '#31496b', fg: '#ffffff', label: '⟲' },
  S: { bg: '#9fd7e8', fg: '#162936', label: '❄' },
  X: { bg: '#737985', fg: '#ffffff', label: 'X' },
};

export const ManaSymbolBadge: React.FC<{
  symbol: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ symbol, size = 'sm' }) => {
  const clean = symbol.replace(/[{}]/g, '').trim().toUpperCase();
  const cfg = SYMBOL_MAP[clean] || {
    bg: '#6d7380',
    fg: '#ffffff',
    label: clean,
  };

  return (
    <span
      className={`mana-pip mana-pip-${size}`}
      style={{
        backgroundColor: cfg.bg,
        color: cfg.fg,
      }}
      title={`{${clean}}`}
    >
      {cfg.label}
    </span>
  );
};

export const ManaCostDisplay: React.FC<ManaTextProps> = ({
  text,
  className = '',
  size = 'sm',
}) => {
  if (!text || text === 'no cost') return null;
  const matches = text.match(/\{[^}]+\}/g);
  if (!matches) {
    return <span className={`mana-cost-inline ${className}`}>{text}</span>;
  }
  return (
    <span className={`mana-cost-inline ${className}`}>
      {matches.map((sym, idx) => (
        <ManaSymbolBadge key={idx} symbol={sym} size={size} />
      ))}
    </span>
  );
};

export const OracleTextDisplay: React.FC<{ text?: string }> = ({ text }) => {
  if (!text) return null;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  return (
    <div className="oracle-text-block">
      {lines.map((line, lIdx) => {
        const parts = line.split(/(\{[^}]+\})/g);
        return (
          <p key={lIdx} className="oracle-line">
            {parts.map((part, pIdx) => {
              if (part.startsWith('{') && part.endsWith('}')) {
                return <ManaSymbolBadge key={pIdx} symbol={part} size="sm" />;
              }
              return <React.Fragment key={pIdx}>{part}</React.Fragment>;
            })}
          </p>
        );
      })}
    </div>
  );
};
