import React, { useEffect, useState, useCallback } from 'react';
import { GameStatePayload } from '../../types';

export type ArcMode = 'ALL' | 'HOVER' | 'OFF';

interface ArrowDescriptor {
  id: string;
  fromSelector: string;
  fallbackFromSelector?: string;
  toSelector: string;
  kind: 'attack' | 'block' | 'stack-hostile' | 'stack-friendly';
  sourceCardId?: number;
  stackKey?: string;
  targetCardId?: number;
  targetPlayerId?: number;
}

interface ComputedArrow {
  id: string;
  pathD: string;
  kind: ArrowDescriptor['kind'];
}

interface TargetingArrowsOverlayProps {
  gameState: GameStatePayload;
  arcMode: ArcMode;
  hoveredStackKey: string | null;
  hoveredCardId: number | null;
}

function centerOfRect(r: DOMRect): { x: number; y: number } {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function isRectVisible(r: DOMRect | undefined | null): r is DOMRect {
  if (!r) return false;
  if (r.width <= 2 || r.height <= 2) return false;
  if (r.bottom < 0 || r.right < 0) return false;
  if (r.top > window.innerHeight || r.left > window.innerWidth) return false;
  return true;
}

export const TargetingArrowsOverlay: React.FC<TargetingArrowsOverlayProps> = ({
  gameState,
  arcMode,
  hoveredStackKey,
  hoveredCardId,
}) => {
  const [arrows, setArrows] = useState<ComputedArrow[]>([]);

  const computeArrows = useCallback(() => {
    if (arcMode === 'OFF') {
      setArrows([]);
      return;
    }

    const descriptors: ArrowDescriptor[] = [];
    const seenIds = new Set<string>();
    const addDesc = (d: ArrowDescriptor) => {
      if (!seenIds.has(d.id)) {
        seenIds.add(d.id);
        descriptors.push(d);
      }
    };

    // 1. Combat bands (Attackers -> Defenders, Blockers -> Attackers)
    if (gameState.combat && gameState.combat.bands.length > 0) {
      gameState.combat.bands.forEach((band) => {
        band.attackers.forEach((att) => {
          if (band.defenderId > 0) {
            const isPlayerDef = gameState.players.some(
              (p) => p.id === band.defenderId
            );
            addDesc({
              id: `atk_${att.id}_to_${band.defenderId}`,
              fromSelector: `[data-card-id="${att.id}"]`,
              toSelector: isPlayerDef
                ? `[data-player-avatar="${band.defenderId}"]`
                : `[data-card-id="${band.defenderId}"]`,
              kind: 'attack',
              sourceCardId: att.id,
              targetCardId: isPlayerDef ? undefined : band.defenderId,
              targetPlayerId: isPlayerDef ? band.defenderId : undefined,
            });
          }
          band.blockers.forEach((blk) => {
            addDesc({
              id: `blk_${blk.id}_to_${att.id}`,
              fromSelector: `[data-card-id="${blk.id}"]`,
              toSelector: `[data-card-id="${att.id}"]`,
              kind: 'block',
              sourceCardId: blk.id,
              targetCardId: att.id,
            });
          });
        });
      });
    }

    // Also include per-card combat links if present
    const localPlayer = gameState.players.find((p) => p.isLocalViewer);
    gameState.players.forEach((p) => {
      p.zones.battlefield.forEach((c) => {
        if (c.attacking && c.defendingEntityId && c.defendingEntityId > 0) {
          const isPlayerDef = gameState.players.some(
            (pl) => pl.id === c.defendingEntityId
          );
          addDesc({
            id: `atk_${c.id}_to_${c.defendingEntityId}`,
            fromSelector: `[data-card-id="${c.id}"]`,
            toSelector: isPlayerDef
              ? `[data-player-avatar="${c.defendingEntityId}"]`
              : `[data-card-id="${c.defendingEntityId}"]`,
            kind: 'attack',
            sourceCardId: c.id,
            targetCardId: isPlayerDef ? undefined : c.defendingEntityId,
            targetPlayerId: isPlayerDef ? c.defendingEntityId : undefined,
          });
        }
        if (c.blockedByIds && c.blockedByIds.length > 0) {
          c.blockedByIds.forEach((blkId) => {
            addDesc({
              id: `blk_${blkId}_to_${c.id}`,
              fromSelector: `[data-card-id="${blkId}"]`,
              toSelector: `[data-card-id="${c.id}"]`,
              kind: 'block',
              sourceCardId: blkId,
              targetCardId: c.id,
            });
          });
        }
      });
    });

    // 2. Stack item targeting arrows
    gameState.stack.forEach((item) => {
      const isFriendly =
        localPlayer && item.activatingPlayerId === localPlayer.id;
      const stackKind: ArrowDescriptor['kind'] = isFriendly
        ? 'stack-friendly'
        : 'stack-hostile';

      item.targetCards.forEach((tc) => {
        addDesc({
          id: `stk_${item.key}_card_${tc.id}`,
          fromSelector: `[data-stack-key="${item.key}"]`,
          fallbackFromSelector: item.sourceCard
            ? `[data-card-id="${item.sourceCard.id}"]`
            : undefined,
          toSelector: `[data-card-id="${tc.id}"]`,
          kind: stackKind,
          stackKey: item.key,
          sourceCardId: item.sourceCard?.id,
          targetCardId: tc.id,
        });
      });

      item.targetPlayers.forEach((tp) => {
        addDesc({
          id: `stk_${item.key}_player_${tp.id}`,
          fromSelector: `[data-stack-key="${item.key}"]`,
          fallbackFromSelector: item.sourceCard
            ? `[data-card-id="${item.sourceCard.id}"]`
            : undefined,
          toSelector: `[data-player-avatar="${tp.id}"]`,
          kind: stackKind,
          stackKey: item.key,
          sourceCardId: item.sourceCard?.id,
          targetPlayerId: tp.id,
        });
      });
    });

    const filtered =
      arcMode === 'HOVER'
        ? descriptors.filter((d) => {
            if (hoveredStackKey && d.stackKey === hoveredStackKey) return true;
            if (
              hoveredCardId &&
              (d.sourceCardId === hoveredCardId || d.targetCardId === hoveredCardId)
            ) {
              return true;
            }
            return false;
          })
        : descriptors;

    const computed: ComputedArrow[] = [];
    filtered.forEach((d) => {
      let fromEl = document.querySelector(d.fromSelector);
      let fromRect = fromEl?.getBoundingClientRect();
      if (!isRectVisible(fromRect) && d.fallbackFromSelector) {
        fromEl = document.querySelector(d.fallbackFromSelector);
        fromRect = fromEl?.getBoundingClientRect();
      }
      const toEl = document.querySelector(d.toSelector);
      const toRect = toEl?.getBoundingClientRect();

      if (!isRectVisible(fromRect) || !isRectVisible(toRect)) return;

      const p1 = centerOfRect(fromRect);
      const p2 = centerOfRect(toRect);
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 14) return;

      // Shorten tip slightly so arrowhead touches target edge neatly
      const shrink = Math.min(20, dist * 0.14);
      const tx = p2.x - (dx / dist) * shrink;
      const ty = p2.y - (dy / dist) * shrink;

      // Perpendicular quadratic Bezier arc
      const bend = Math.min(72, Math.max(22, dist * 0.18));
      const nx = -dy / dist;
      const ny = dx / dist;
      const cx = (p1.x + tx) / 2 + nx * bend;
      const cy = (p1.y + ty) / 2 + ny * bend;

      computed.push({
        id: d.id,
        pathD: `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(
          1
        )} ${tx.toFixed(1)} ${ty.toFixed(1)}`,
        kind: d.kind,
      });
    });

    setArrows(computed);
  }, [gameState, arcMode, hoveredStackKey, hoveredCardId]);

  useEffect(() => {
    let rafId = window.requestAnimationFrame(computeArrows);
    const onReflow = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(computeArrows);
    };
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [computeArrows]);

  if (arcMode === 'OFF' || arrows.length === 0) {
    return null;
  }

  return (
    <svg className="targeting-arrows-svg" aria-hidden="true">
      <defs>
        <marker
          id="arrow-head-attack"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="#ff8a01" />
        </marker>
        <marker
          id="arrow-head-block"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="#ef4444" />
        </marker>
        <marker
          id="arrow-head-stack-hostile"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="#f43f5e" />
        </marker>
        <marker
          id="arrow-head-stack-friendly"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="#38bdf8" />
        </marker>
      </defs>

      {arrows.map((arr) => (
        <g key={arr.id}>
          <path d={arr.pathD} className="targeting-arrow-halo" />
          <path
            d={arr.pathD}
            className={`targeting-arrow-path kind-${arr.kind}`}
            markerEnd={`url(#arrow-head-${arr.kind})`}
          />
        </g>
      ))}
    </svg>
  );
};
