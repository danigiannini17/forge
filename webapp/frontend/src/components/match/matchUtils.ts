import { CardViewState, GameStatePayload } from '../../types';

export interface Phase12Def {
  code: string;
  short: string;
  itShort: string;
  full: string;
  group: 'BEGIN' | 'MAIN1' | 'COMBAT' | 'MAIN2' | 'END';
}

export const PHASES_12: Phase12Def[] = [
  { code: 'UPKEEP', short: 'UP', itShort: 'MANT', full: 'Mantenimento (Upkeep)', group: 'BEGIN' },
  { code: 'DRAW', short: 'DR', itShort: 'PESC', full: 'Acquisizione (Draw)', group: 'BEGIN' },
  { code: 'MAIN1', short: 'M1', itShort: 'MAIN 1', full: 'Prima Fase Principale', group: 'MAIN1' },
  { code: 'COMBAT_BEGIN', short: 'BC', itShort: 'INIZ CMB', full: 'Inizio Combattimento', group: 'COMBAT' },
  { code: 'COMBAT_DECLARE_ATTACKERS', short: 'DA', itShort: 'ATTACC', full: 'Dichiarazione Attaccanti', group: 'COMBAT' },
  { code: 'COMBAT_DECLARE_BLOCKERS', short: 'DB', itShort: 'BLOCC', full: 'Dichiarazione Bloccanti', group: 'COMBAT' },
  { code: 'COMBAT_FIRST_STRIKE_DAMAGE', short: 'FS', itShort: '1° DANNO', full: 'Danno Attacco Improvviso', group: 'COMBAT' },
  { code: 'COMBAT_DAMAGE', short: 'CD', itShort: 'DANNO', full: 'Danno da Combattimento', group: 'COMBAT' },
  { code: 'COMBAT_END', short: 'EC', itShort: 'FINE CMB', full: 'Fine Combattimento', group: 'COMBAT' },
  { code: 'MAIN2', short: 'M2', itShort: 'MAIN 2', full: 'Seconda Fase Principale', group: 'MAIN2' },
  { code: 'END_OF_TURN', short: 'ET', itShort: 'FINE', full: 'Sottofase Finale (EOT)', group: 'END' },
  { code: 'CLEANUP', short: 'CL', itShort: 'CANC', full: 'Cancellazione (Cleanup)', group: 'END' },
];

export function getPhaseDisplay(phaseCode: string): Phase12Def {
  if (phaseCode === 'UNTAP') {
    return {
      code: 'UNTAP',
      short: 'STAP',
      itShort: 'STAP',
      full: 'Stappa (Untap)',
      group: 'BEGIN',
    };
  }
  return (
    PHASES_12.find((p) => p.code === phaseCode) || {
      code: phaseCode,
      short: phaseCode.slice(0, 4),
      itShort: phaseCode.slice(0, 6),
      full: phaseCode,
      group: 'MAIN1',
    }
  );
}

export interface CardStackGroup {
  key: string;
  representative: CardViewState;
  cards: CardViewState[];
  count: number;
  otherIds: number[];
}

export interface PartitionedBattlefield {
  creatureGroups: CardStackGroup[];
  creaturesCount: number;
  support: CardViewState[];
  landGroups: CardStackGroup[];
  landsCount: number;
  attachmentsByHostId: Record<number, CardViewState[]>;
}

/**
 * Forge-style Battlefield Partitioner:
 * - Tucks Auras & Equipment onto their host permanent
 * - Separates Creatures (Front Line) from Support (Artifacts/Enchantments/PW) and Lands (Back Line)
 * - Stacks identical unattached Lands and (when >4 tokens) identical unattached Creature Tokens
 */
export function partitionBattlefield(cards: CardViewState[]): PartitionedBattlefield {
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

  const rawCreatures: CardViewState[] = [];
  const support: CardViewState[] = [];
  const rawLands: CardViewState[] = [];

  standaloneCards.forEach((c) => {
    if (c.isCreature) {
      rawCreatures.push(c);
    } else if (c.isLand) {
      rawLands.push(c);
    } else {
      support.push(c);
    }
  });

  // Group identical lands
  const landGroups: CardStackGroup[] = [];
  const landMap = new Map<string, CardStackGroup>();

  rawLands.forEach((land) => {
    const hasAttachments = (attachmentsByHostId[land.id]?.length || 0) > 0;
    const hasCounters = land.counters && Object.keys(land.counters).length > 0;
    const canGroup = !hasAttachments && !hasCounters && !land.selected;
    const groupKey = canGroup
      ? `${land.name}__tap:${land.tapped}__act:${land.actionableStrength || 0}__sel:${Boolean(
          land.isSelectable
        )}`
      : `single_land_${land.id}`;

    const existing = landMap.get(groupKey);
    if (existing) {
      existing.cards.push(land);
      existing.count = existing.cards.length;
      existing.otherIds = existing.cards.slice(1).map((c) => c.id);
    } else {
      const grp: CardStackGroup = {
        key: groupKey,
        representative: land,
        cards: [land],
        count: 1,
        otherIds: [],
      };
      landMap.set(groupKey, grp);
      landGroups.push(grp);
    }
  });

  // Group identical unattached creature tokens when token count > 4
  const creatureTokensCount = rawCreatures.filter((c) => c.token).length;
  const creatureGroups: CardStackGroup[] = [];
  const creatureMap = new Map<string, CardStackGroup>();

  rawCreatures.forEach((cr) => {
    const hasAttachments = (attachmentsByHostId[cr.id]?.length || 0) > 0;
    const hasCounters = cr.counters && Object.keys(cr.counters).length > 0;
    const canGroup =
      creatureTokensCount > 4 &&
      cr.token &&
      !hasAttachments &&
      !hasCounters &&
      !cr.selected &&
      !cr.commander;

    const groupKey = canGroup
      ? `tok:${cr.name}__${cr.power}/${cr.toughness}__tap:${cr.tapped}__sick:${cr.sickness}__dmg:${
          cr.damage || 0
        }__act:${cr.actionableStrength || 0}__sel:${Boolean(
          cr.isSelectable
        )}__atk:${Boolean(cr.attacking)}__blk:${Boolean(cr.blocking)}`
      : `single_cr_${cr.id}`;

    const existing = creatureMap.get(groupKey);
    if (existing) {
      existing.cards.push(cr);
      existing.count = existing.cards.length;
      existing.otherIds = existing.cards.slice(1).map((c) => c.id);
    } else {
      const grp: CardStackGroup = {
        key: groupKey,
        representative: cr,
        cards: [cr],
        count: 1,
        otherIds: [],
      };
      creatureMap.set(groupKey, grp);
      creatureGroups.push(grp);
    }
  });

  return {
    creatureGroups,
    creaturesCount: rawCreatures.length,
    support,
    landGroups,
    landsCount: rawLands.length,
    attachmentsByHostId,
  };
}

export interface ActionContextHint {
  badge: string;
  tone: 'priority' | 'select' | 'combat' | 'mana' | 'wait';
  hint: string;
}

export function getActionContextHint(gameState: GameStatePayload): ActionContextHint {
  const msgLower = (gameState.prompt?.message || '').toLowerCase();
  const isPayMana =
    gameState.autotapCardIds.length > 0 ||
    msgLower.includes('pay ') ||
    msgLower.includes('paga ') ||
    msgLower.includes('mana cost');

  if (gameState.isMulligan || msgLower.includes('mulligan')) {
    return {
      badge: '🃏 MULLIGAN',
      tone: 'select',
      hint: 'Valuta la mano iniziale: scegli se tenere queste carte o fare Mulligan.',
    };
  }

  if (gameState.isSelecting) {
    const min = gameState.selectionMin ?? 0;
    const max = gameState.selectionMax ?? 1;
    const chosen = gameState.selectedCardIds.length;
    const rangeText =
      min === max
        ? `scegli esattamente ${min}`
        : max > 0
        ? `scegli da ${min} a ${max}`
        : 'scegli i bersagli validi';
    return {
      badge: '🎯 SELEZIONE BERSAGLI',
      tone: 'select',
      hint: `Clicca sugli elementi evidenziati (${rangeText} • selezionati: ${chosen}), poi premi "Conferma".`,
    };
  }

  if (isPayMana) {
    return {
      badge: '💎 PAGAMENTO MANA',
      tone: 'mana',
      hint:
        gameState.autotapCardIds.length > 0
          ? 'Premi "Tappa Auto" per tappare automaticamente le terre evidenziate in giallo, oppure clicca le terre manualmente.'
          : 'Clicca le tue terre o fonti di mana (o le sfere nella riserva) per pagare il costo.',
    };
  }

  if (gameState.isDeclareAttackers && gameState.isMyTurn) {
    return {
      badge: '⚔️ DICHIARA ATTACCANTI',
      tone: 'combat',
      hint: 'Clicca le tue creature per mandarle all’attacco (o usa "Attacca con Tutto"), poi premi "Conferma".',
    };
  }

  if (gameState.isDeclareBlockers && !gameState.isMyTurn) {
    return {
      badge: '🛡️ DICHIARA BLOCCANTI',
      tone: 'combat',
      hint: 'Clicca prima un attaccante avversario e poi una tua creatura per bloccarlo; quando hai finito premi "Conferma".',
    };
  }

  if (gameState.hasPriority) {
    if (gameState.stack.length > 0) {
      return {
        badge: '⚡ RISPONDI ALLA PILA',
        tone: 'priority',
        hint: 'Puoi lanciare istantanei / abilità evidenziati in verde oppure premere "Risolvi / Cedi" per far risolvere la Pila.',
      };
    }
    return {
      badge: '⚡ TUA PRIORITÀ',
      tone: 'priority',
      hint: gameState.isMyTurn
        ? 'Gioca carte dalla Mano / Comando evidenziate in verde oppure premi "Fase Succ." (o "Fine Turno").'
        : 'Puoi rispondere con istantanei o abilità evidenziate in verde, altrimenti premi "Passa Priorità".',
    };
  }

  return {
    badge: '⏳ IN ATTESA',
    tone: 'wait',
    hint: `Attendi l'azione di ${gameState.playerTurnName || 'un altro giocatore'}...`,
  };
}

export type DockZoneKey = 'graveyard' | 'exile' | 'command' | 'flashback';

export function findAutoOpenZone(
  gameState: GameStatePayload
): { playerId: number; zone: DockZoneKey } | null {
  if (!gameState.isSelecting) return null;
  const zonesToCheck: DockZoneKey[] = ['command', 'graveyard', 'exile', 'flashback'];
  for (const p of gameState.players) {
    for (const z of zonesToCheck) {
      const cards = p.zones[z] || [];
      if (cards.some((c) => c.isSelectable)) {
        return { playerId: p.id, zone: z };
      }
    }
  }
  return null;
}

export function isEndTurnLabel(label?: string): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  return l.includes('end turn') || l.includes('fine turno');
}

/**
 * Translates raw Forge English button labels into clear, context-aware Italian labels
 * so players immediately understand whether a click advances to the Next Phase,
 * resolves the Stack, confirms attackers/targets, or attacks with all creatures.
 */
export function formatPromptButtonLabel(
  rawLabel: string | undefined,
  isOk: boolean,
  gameState: GameStatePayload
): string {
  const raw = (rawLabel || '').trim();
  const lower = raw.toLowerCase();
  const msgLower = (gameState.prompt?.message || '').toLowerCase();
  const isPayMana =
    gameState.autotapCardIds.length > 0 ||
    msgLower.includes('pay ') ||
    msgLower.includes('paga ') ||
    msgLower.includes('mana cost');

  if (!raw || lower === 'ok') {
    if (!isOk) return 'Annulla';
    if (gameState.mulliganState?.active) {
      return gameState.mulliganState.step === 'TUCK' ? 'Conferma' : 'Tieni Mano';
    }
    if (
      (gameState.isDeclareAttackers && gameState.isMyTurn) ||
      (gameState.isDeclareBlockers && !gameState.isMyTurn) ||
      gameState.isSelecting
    ) {
      return 'Conferma';
    }
    if (gameState.stack.length > 0) {
      return 'Risolvi / Cedi';
    }
    if (gameState.isMyTurn) {
      if (gameState.phase === 'END_OF_TURN' || gameState.phase === 'CLEANUP') {
        return 'Passa Turno';
      }
      return 'Fase Succ.';
    }
    return 'Passa Priorità';
  }

  if (lower === 'end turn' || lower === 'pass / end turn') return 'Fine Turno';
  if (lower === 'alpha strike') return 'Attacca con Tutto';
  if (lower === 'call back') return 'Richiama Creature';
  if (lower === 'auto') {
    return isPayMana ? 'Tappa Auto' : 'Scelta Auto';
  }
  if (lower === 'keep') return 'Tieni Mano';
  if (lower === 'mulligan') return 'Mulligan';
  if (lower === 'cancel' || lower === 'abort') return 'Annulla';
  if (lower === 'undo') return 'Annulla Mossa';
  if (lower === 'done') return 'Conferma';
  if (lower === 'accept' || lower === 'yes') return 'Accetta';
  if (lower === 'decline' || lower === 'no') return 'Rifiuta';
  if (lower === 'continue') return 'Continua';
  return raw;
}
