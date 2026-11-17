import {
  CardSearchItem,
  CardViewState,
  ChatEntry,
  CombatBandState,
  DeckCatalogEntry,
  DeckCatalogResponse,
  DeckSummary,
  GameStatePayload,
  PlayerViewState,
  RoomSlotInfo,
  RoomState,
  RoomSummary,
  StackItemState,
} from './types';

const STORAGE_TOKEN_KEY = 'forge_web_session_token';
const STORAGE_NICKNAME_KEY = 'forge_web_nickname';

export function getOrCreateSessionToken(): string {
  let token = localStorage.getItem(STORAGE_TOKEN_KEY);
  if (!token || token.length < 32) {
    const bytes = new Uint8Array(24);
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    token = `pw_${hex}`;
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
  }
  return token;
}

export function getSavedNickname(): string {
  return localStorage.getItem(STORAGE_NICKNAME_KEY) || 'Planeswalker';
}

export function saveNickname(nickname: string): void {
  localStorage.setItem(STORAGE_NICKNAME_KEY, nickname.trim() || 'Planeswalker');
}

export function normalizeRoomState(raw: any): RoomState {
  if (!raw) {
    throw new Error('Dati stanza mancanti');
  }
  const slotsRaw: any[] = Array.isArray(raw.slots) ? raw.slots : [];
  const slots: RoomSlotInfo[] = slotsRaw.map((s, idx) => {
    const summaryObj = s.deckSummary && typeof s.deckSummary === 'object' ? s.deckSummary : null;
    const mainCount = summaryObj?.mainCount ?? s.mainCount ?? 0;
    const cmdCount = summaryObj?.commanderCount ?? 0;
    const cmdName = summaryObj?.commanderName || '';
    const summaryStr =
      typeof s.deckSummary === 'string'
        ? s.deckSummary
        : summaryObj
        ? `${mainCount} carte${cmdCount > 0 ? ` + ${cmdCount} Cmd (${cmdName})` : ''}`
        : '';

    return {
      slotIndex: s.slotIndex ?? s.index ?? idx,
      type: s.type || 'OPEN',
      name: s.name || '',
      team: Math.max(1, Math.min(8, (s.team ?? idx) + 1)),
      isReady: Boolean(s.isReady ?? s.ready),
      isArchenemy: Boolean(s.isArchenemy),
      deckName: s.deckName || summaryObj?.name || 'Mazzo Default',
      deckSummary: summaryStr,
      claimedByToken: s.claimedByToken || '',
      isMe: Boolean(s.isMe),
      isOnline: Boolean(s.isOnline ?? s.connected ?? true),
      commanderCards: cmdName ? [cmdName] : s.commanderCards || [],
      mainCount,
    };
  });

  const chatRaw: any[] = Array.isArray(raw.chatHistory)
    ? raw.chatHistory
    : Array.isArray(raw.chat)
    ? raw.chat
    : [];
  const chatHistory: ChatEntry[] = chatRaw.map((c) => ({
    sender: c.sender || 'Giocatore',
    message: c.message ?? c.text ?? '',
    timestamp: c.timestamp || Date.now(),
  }));

  const isCommander = Boolean(raw.isCommander);
  const matchActive = Boolean(raw.matchActive || raw.status === 'IN_GAME');

  return {
    roomId: raw.roomId || '',
    roomName: raw.roomName || `Stanza ${raw.roomId}`,
    hasPassword: Boolean(raw.hasPassword),
    format: isCommander ? 'COMMANDER' : 'CONSTRUCTED',
    isCommander,
    maxPlayers: raw.maxPlayers ?? slots.length ?? 4,
    status: matchActive ? 'IN_GAME' : raw.status || 'LOBBY',
    isHost: Boolean(raw.isHost),
    mySlotIndex: raw.mySlotIndex ?? -1,
    slots,
    chatHistory,
  };
}

export function normalizeCardView(raw: any): CardViewState {
  if (!raw) {
    return {
      id: -1,
      name: 'Carta',
      ownerId: -1,
      ownerName: '',
      controllerId: -1,
      controllerName: '',
      hidden: true,
      tapped: false,
      sickness: false,
      token: false,
      commander: false,
      imageUrl: '',
    };
  }
  return {
    id: raw.id ?? -1,
    name: raw.name || 'Carta',
    zone: raw.zone || '',
    ownerId: raw.ownerId ?? -1,
    ownerName: raw.ownerName || '',
    controllerId: raw.controllerId ?? -1,
    controllerName: raw.controllerName || '',
    hidden: Boolean(raw.hidden),
    faceDown: Boolean(raw.faceDown),
    tapped: Boolean(raw.tapped),
    sickness: Boolean(raw.sickness ?? raw.sick),
    token: Boolean(raw.token),
    commander: Boolean(raw.commander ?? raw.isCommander),
    attacking: Boolean(raw.attacking),
    blocking: Boolean(raw.blocking),
    setCode: raw.setCode || '',
    collectorNumber: raw.collectorNumber || '',
    manaCost: raw.manaCost || '',
    type: raw.type || '',
    power: raw.power,
    toughness: raw.toughness,
    loyalty: raw.loyalty || '',
    defense: raw.defense || '',
    damage: raw.damage ?? 0,
    isCreature: Boolean(raw.isCreature),
    isLand: Boolean(raw.isLand),
    isPlaneswalker: Boolean(raw.isPlaneswalker),
    isArtifact: Boolean(raw.isArtifact),
    isEnchantment: Boolean(raw.isEnchantment),
    colors: Array.isArray(raw.colors) ? raw.colors : [],
    oracleText: raw.oracleText || '',
    abilityText: raw.abilityText || '',
    fullText: raw.fullText || '',
    keywords: Array.isArray(raw.keywords) ? raw.keywords.join(', ') : raw.keywords || '',
    imageUrl: raw.imageUrl || '',
    scryfallFallbackUrl: raw.scryfallFallbackUrl || raw.fallbackImageUrl || '',
    counters: raw.counters || {},
    attachedToId: raw.attachedToId ?? raw.attachedToCardId ?? -1,
    attachedCardIds: Array.isArray(raw.attachedCardIds) ? raw.attachedCardIds : [],
    enchantingPlayerId: raw.enchantingPlayerId ?? raw.enchantedPlayerId ?? -1,
    defendingEntityId: raw.defendingEntityId ?? -1,
    defendingEntityName: raw.defendingEntityName || '',
    blockedByIds: Array.isArray(raw.blockedByIds) ? raw.blockedByIds : [],
    blockingAttackerName: raw.blockingAttackerName || '',
    hasAlternateState: Boolean(raw.hasAlternateState),
    alternateName: raw.alternateName || '',
    alternateManaCost: raw.alternateManaCost || '',
    alternateType: raw.alternateType || '',
    alternateOracleText: raw.alternateOracleText || '',
    alternatePower: raw.alternatePower,
    alternateToughness: raw.alternateToughness,
    alternateImageUrl: raw.alternateImageUrl || '',
    artCropUrl: raw.artCropUrl || '',
    isSelectable: Boolean(raw.isSelectable),
    isActionable:
      (typeof raw.actionableStrength === 'number'
        ? raw.actionableStrength > 0
        : Boolean(raw.isActionable)),
    actionableStrength:
      typeof raw.actionableStrength === 'number'
        ? raw.actionableStrength
        : raw.isActionable
        ? 1
        : 0,
    selected: Boolean(raw.selected ?? raw.isSelected),
  };
}

export function normalizeGameState(raw: any): GameStatePayload | null {
  if (!raw || raw.active === false) return null;

  const playersRaw: any[] = Array.isArray(raw.players) ? raw.players : [];
  const players: PlayerViewState[] = playersRaw.map((p) => {
    const bf = Array.isArray(p.zones?.battlefield)
      ? p.zones.battlefield.map(normalizeCardView)
      : Array.isArray(p.battlefield)
      ? p.battlefield.map(normalizeCardView)
      : [];
    const hand = Array.isArray(p.zones?.hand)
      ? p.zones.hand.map(normalizeCardView)
      : Array.isArray(p.hand)
      ? p.hand.map(normalizeCardView)
      : [];
    const gy = Array.isArray(p.zones?.graveyard)
      ? p.zones.graveyard.map(normalizeCardView)
      : Array.isArray(p.graveyard)
      ? p.graveyard.map(normalizeCardView)
      : [];
    const exile = Array.isArray(p.zones?.exile)
      ? p.zones.exile.map(normalizeCardView)
      : Array.isArray(p.exile)
      ? p.exile.map(normalizeCardView)
      : [];
    const command = Array.isArray(p.zones?.command)
      ? p.zones.command.map(normalizeCardView)
      : Array.isArray(p.command)
      ? p.command.map(normalizeCardView)
      : [];
    const flashback = Array.isArray(p.zones?.flashback)
      ? p.zones.flashback.map(normalizeCardView)
      : Array.isArray(p.flashback)
      ? p.flashback.map(normalizeCardView)
      : [];

    const commandersRaw: any[] = Array.isArray(p.commanders) ? p.commanders : [];
    const commanders = commandersRaw.map((cm) => {
      if (cm.card) {
        return {
          card: normalizeCardView(cm.card),
          castCount: cm.castCount ?? 0,
          taxMana: cm.taxMana ?? 0,
        };
      }
      return {
        card: normalizeCardView(cm),
        castCount: cm.commanderCastCount ?? 0,
        taxMana: cm.commanderTax ?? (cm.commanderCastCount ?? 0) * 2,
      };
    });

    const cmdDmgRaw: any[] = Array.isArray(p.commanderDamageTaken)
      ? p.commanderDamageTaken
      : Array.isArray(p.commanderDamage)
      ? p.commanderDamage
      : [];

    return {
      id: p.id,
      name: p.lobbyPlayerName || p.name || 'Player',
      isAI: Boolean(p.isAI),
      isLocalViewer: Boolean(p.isLocalViewer ?? p.isViewer),
      isSelectable: Boolean(p.isSelectable),
      isSelected: Boolean(p.isSelected),
      isTurn: Boolean(p.isTurn),
      life: p.life ?? 20,
      hasLost: Boolean(p.hasLost),
      hasPriority: Boolean(p.hasPriority),
      hasAvailableActions: Boolean(p.hasAvailableActions),
      maxHandSize: p.maxHandSize ?? 7,
      unlimitedHandSize: Boolean(p.unlimitedHandSize),
      numDrawnThisTurn: p.numDrawnThisTurn ?? 0,
      numLandsPlayed: p.numLandsPlayed ?? p.landsPlayedThisTurn ?? 0,
      maxLandsToPlay: p.maxLandsToPlay ?? p.maxLandPlay ?? 1,
      details: p.details || '',
      keywords: Array.isArray(p.keywords) ? p.keywords : [],
      counters: p.counters || {},
      poisonCounters: p.poisonCounters ?? 0,
      energyCounters: p.energyCounters ?? 0,
      experienceCounters: p.experienceCounters ?? 0,
      manaPool: p.manaPool || { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, total: 0 },
      commanders,
      commanderDamageTaken: cmdDmgRaw.map((d) => ({
        commanderId: d.commanderId ?? -1,
        commanderName: d.commanderName || 'Commander',
        commanderOwnerName: d.commanderOwnerName || d.ownerName || '',
        damage: d.damage ?? 0,
      })),
      zoneSizes: {
        hand: p.zoneSizes?.hand ?? p.handCount ?? hand.length,
        library: p.zoneSizes?.library ?? p.libraryCount ?? 0,
        graveyard: p.zoneSizes?.graveyard ?? p.graveyardCount ?? gy.length,
        exile: p.zoneSizes?.exile ?? p.exileCount ?? exile.length,
        command: p.zoneSizes?.command ?? p.commandCount ?? command.length,
        flashback: p.zoneSizes?.flashback ?? p.flashbackCount ?? flashback.length,
        battlefield: p.zoneSizes?.battlefield ?? bf.length,
      },
      zones: {
        battlefield: bf,
        hand,
        graveyard: gy,
        exile,
        command,
        flashback,
      },
    };
  });

  const localViewer = players.find((p) => p.isLocalViewer) || players[0];
  const promptRaw = raw.prompt || {};

  const stackRaw: any[] = Array.isArray(raw.stack) ? raw.stack : [];
  const stack: StackItemState[] = stackRaw.map((s, idx) => ({
    id: typeof s.id === 'number' ? s.id : undefined,
    key: String(s.key ?? s.id ?? `stk_${idx}`),
    text: s.text || '',
    optionalTrigger: Boolean(s.optionalTrigger ?? s.isTrigger),
    isTrigger: Boolean(s.isTrigger ?? s.optionalTrigger),
    ability: Boolean(s.ability ?? s.isAbility),
    isSelectable: Boolean(s.isSelectable),
    optionalCostString: s.optionalCostString || '',
    activatingPlayerId: s.activatingPlayerId ?? -1,
    activatingPlayerName: s.activatingPlayerName || '',
    sourceCard: s.sourceCard ? normalizeCardView(s.sourceCard) : undefined,
    targetCards: Array.isArray(s.targetCards)
      ? s.targetCards.map((tc: any) =>
          typeof tc === 'object' ? { id: tc.id ?? -1, name: tc.name || 'Carta' } : { id: Number(tc), name: `#${tc}` }
        )
      : [],
    targetPlayers: Array.isArray(s.targetPlayers)
      ? s.targetPlayers.map((tp: any) =>
          typeof tp === 'object' ? { id: tp.id ?? -1, name: tp.name || 'Giocatore' } : { id: Number(tp), name: `#${tp}` }
        )
      : [],
  }));

  let combat: { numAttackers: number; bands: CombatBandState[] } | null = null;
  if (Array.isArray(raw.combat) && raw.combat.length > 0) {
    const bands: CombatBandState[] = raw.combat.map((b: any) => ({
      defenderId: b.defenderId ?? -1,
      defenderName: b.defenderName || 'Difensore',
      defenderType: 'PLAYER',
      blocked: Array.isArray(b.blockerIds) && b.blockerIds.length > 0,
      attackers: [
        {
          id: b.attackerId ?? -1,
          name: b.attackerName || 'Attaccante',
          power: b.attackerPower ?? 0,
          toughness: b.attackerToughness ?? 0,
        },
      ],
      blockers: Array.isArray(b.blockers)
        ? b.blockers.map((blk: any) => ({
            id: blk.id ?? -1,
            name: blk.name || 'Bloccante',
            power: blk.power ?? 0,
            toughness: blk.toughness ?? 0,
          }))
        : [],
    }));
    combat = { numAttackers: bands.length, bands };
  } else if (raw.combat && Array.isArray(raw.combat.bands)) {
    combat = raw.combat;
  }

  const yieldRaw = raw.yieldState || {};

  let pendingModal = raw.pendingModal || null;
  if (pendingModal) {
    const parsedInitialNum =
      pendingModal.initialValue !== undefined
        ? Number(pendingModal.initialValue)
        : pendingModal.isNumeric &&
          pendingModal.initialInput !== undefined &&
          pendingModal.initialInput !== ''
        ? Number(pendingModal.initialInput)
        : 0;

    pendingModal = {
      ...pendingModal,
      modalId: pendingModal.requestId || pendingModal.modalId || 'modal-active',
      modalType: pendingModal.modalType || pendingModal.type,
      yesText: pendingModal.yesText || pendingModal.yesLabel,
      noText: pendingModal.noText || pendingModal.noLabel,
      defaultYes: Boolean(pendingModal.defaultYes ?? pendingModal.defaultIsYes),
      inputKind:
        pendingModal.inputKind || (pendingModal.isNumeric ? 'NUMBER' : 'TEXT'),
      initialValue: Number.isNaN(parsedInitialNum) ? 0 : parsedInitialNum,
      defaultText: pendingModal.defaultText ?? pendingModal.initialInput ?? '',
      totalDamageToAssign:
        pendingModal.totalDamageToAssign ??
        pendingModal.totalDamage ??
        pendingModal.totalAmount,
      card: pendingModal.card ? normalizeCardView(pendingModal.card) : undefined,
      attacker: pendingModal.attacker
        ? normalizeCardView(pendingModal.attacker)
        : undefined,
      options: Array.isArray(pendingModal.options)
        ? pendingModal.options.map((opt: any, idx: number) => ({
            index: opt.index ?? idx,
            label: opt.label || opt.name || String(opt),
            description: opt.description || '',
            preselected: Boolean(opt.preselected),
            isCard: Boolean(opt.isCard || opt.card),
            card: opt.card ? normalizeCardView(opt.card) : undefined,
          }))
        : undefined,
      targets: Array.isArray(pendingModal.targets)
        ? pendingModal.targets.map((t: any, idx: number) => ({
            index: t.index ?? idx,
            id: t.id ?? idx,
            label: t.label || t.name || 'Bersaglio',
            isCard: Boolean(t.isCard || t.card),
            lethalDamage: t.lethalDamage,
            defaultDamage: t.defaultDamage ?? t.defaultAmount ?? 0,
            card: t.card ? normalizeCardView(t.card) : undefined,
          }))
        : undefined,
    };
  }

  const phase = raw.phase || 'MAIN1';
  const playerCount = Math.max(1, players.length);
  const rawTurn = raw.turn ?? 1;
  const computedRound =
    typeof raw.round === 'number' && raw.round >= 1
      ? raw.round
      : Math.max(1, Math.floor((Math.max(1, rawTurn) - 1) / playerCount) + 1);

  const mulliganState =
    raw.mulliganState && raw.mulliganState.active
      ? {
          active: true,
          step: (raw.mulliganState.step === 'TUCK' ? 'TUCK' : 'DECIDE') as
            | 'DECIDE'
            | 'TUCK',
          cardsToBottom: Number(raw.mulliganState.cardsToBottom ?? 0),
          startingPlayerName: raw.mulliganState.startingPlayerName || '',
          selectedCount: Number(raw.mulliganState.selectedCount ?? 0),
        }
      : null;

  const winStandings = Array.isArray(raw.winStandings)
    ? raw.winStandings.map((ws: any) => ({
        name: ws.name || 'Giocatore',
        wins: Number(ws.wins ?? 0),
      }))
    : undefined;

  return {
    roomId: raw.roomId || '',
    roomName: raw.roomName || '',
    slotIndex: raw.slotIndex ?? 0,
    localPlayerName: localViewer?.name || 'Planeswalker',
    title: raw.title || 'Tavolo Lozzander Online',
    gameFormat: raw.gameFormat || raw.gameType || 'Commander',
    isCommander: Boolean(raw.isCommander),
    turn: rawTurn,
    round: computedRound,
    phase,
    phaseLabel: raw.phaseLabel || phase,
    playerTurnName: raw.playerTurnName || '',
    playerTurnId: raw.playerTurnId ?? -1,
    isMyTurn: Boolean(
      raw.isMyTurn ?? (localViewer && raw.playerTurnId === localViewer.id)
    ),
    hasPriority: Boolean(raw.hasPriority ?? localViewer?.hasPriority),
    isMulligan: Boolean(raw.isMulligan || mulliganState?.active),
    mulliganState,
    winStandings,
    gameOver: Boolean(raw.gameOver ?? raw.isGameOver),
    winningPlayerName: raw.winningPlayerName || '',
    winningTeam: raw.winningTeam ?? -1,
    stormCount: raw.stormCount ?? 0,
    undoAvailable: Boolean(raw.undoAvailable ?? promptRaw.undoAvailable),
    isSelecting: Boolean(raw.isSelecting),
    selectionMin: raw.selectionMin ?? 0,
    selectionMax: raw.selectionMax ?? 0,
    canSelectCards: true,
    canSelectPlayers: true,
    isDeclareAttackers: phase === 'COMBAT_DECLARE_ATTACKERS',
    isDeclareBlockers: phase === 'COMBAT_DECLARE_BLOCKERS',
    prompt: {
      message: promptRaw.message || '',
      notification: promptRaw.notification || '',
      card: promptRaw.card ? normalizeCardView(promptRaw.card) : undefined,
      focusedCard: promptRaw.focusedCard
        ? normalizeCardView(promptRaw.focusedCard)
        : undefined,
      invalidActionSeq: promptRaw.invalidActionSeq ?? 0,
      okEnabled: Boolean(promptRaw.okEnabled ?? true),
      cancelEnabled: Boolean(promptRaw.cancelEnabled ?? true),
      okText: promptRaw.okText || promptRaw.okLabel || 'OK',
      cancelText: promptRaw.cancelText || promptRaw.cancelLabel || 'Passa / Annulla',
      focusOk: Boolean(promptRaw.focusOk),
    },
    yieldState: {
      autoYieldAll: Boolean(
        yieldRaw.autoYieldAll ?? yieldRaw.autoPassUntilEndOfTurn
      ),
      autoYieldEndOfStep: Boolean(yieldRaw.autoYieldEndOfStep),
      autoYieldStackEmpty: Boolean(
        yieldRaw.autoYieldStackEmpty ?? yieldRaw.autoPassUntilStackEmpty
      ),
      autoPassNoActions: Boolean(yieldRaw.autoPassNoActions),
      skippedOwnPhases: Array.isArray(yieldRaw.skippedOwnPhases)
        ? yieldRaw.skippedOwnPhases
        : [],
      skippedOpponentPhases: Array.isArray(yieldRaw.skippedOpponentPhases)
        ? yieldRaw.skippedOpponentPhases
        : [],
    },
    pendingModal,
    selectableCardIds: Array.isArray(raw.selectableCardIds)
      ? raw.selectableCardIds
      : [],
    selectablePlayerIds: Array.isArray(raw.selectablePlayerIds)
      ? raw.selectablePlayerIds
      : [],
    selectableStackIds: Array.isArray(raw.selectableStackIds)
      ? raw.selectableStackIds
      : [],
    actionableCardIds: Array.isArray(raw.actionableCardIds)
      ? raw.actionableCardIds
      : [],
    autotapCardIds: Array.isArray(raw.autotapCardIds)
      ? raw.autotapCardIds
      : [],
    selectedCardIds: Array.isArray(raw.chosenIds)
      ? raw.chosenIds
      : Array.isArray(raw.selectedCardIds)
      ? raw.selectedCardIds
      : [],
    revealedCardIds: Array.isArray(raw.revealedCardIds)
      ? raw.revealedCardIds
      : [],
    stack,
    combat,
    players,
    gameLog: Array.isArray(raw.gameLog)
      ? raw.gameLog.map((l: any) => ({
          type: l.type || 'INFO',
          summary: l.summary || l.message || '',
        }))
      : [],
  };
}

function normalizeDeckSummary(raw: any): DeckSummary {
  const commandersRaw: any[] = Array.isArray(raw?.commanders)
    ? raw.commanders
    : Array.isArray(raw?.commander)
    ? raw.commander
    : [];
  const mainRaw: any[] = Array.isArray(raw?.main) ? raw.main : [];
  const sideRaw: any[] = Array.isArray(raw?.sideboard) ? raw.sideboard : [];

  return {
    name: raw?.name || 'Mazzo',
    mainCount: raw?.mainCount ?? mainRaw.reduce((a, c) => a + (c.count || 1), 0),
    commanderCount:
      raw?.commanderCount ?? commandersRaw.reduce((a, c) => a + (c.count || 1), 0),
    sideboardCount:
      raw?.sideboardCount ?? sideRaw.reduce((a, c) => a + (c.count || 1), 0),
    commanders: commandersRaw.map((c) => ({
      name: c.name || '',
      setCode: c.setCode || '',
      manaCost: c.manaCost || '',
      type: c.type || '',
      imageUrl: c.imageUrl || '',
    })),
    main: mainRaw.map((c) => ({
      name: c.name || '',
      setCode: c.setCode || '',
      count: c.count || 1,
      manaCost: c.manaCost || '',
      type: c.type || '',
      isLand: Boolean(c.isLand),
      imageUrl: c.imageUrl || '',
    })),
    sideboard: sideRaw.map((c) => ({
      name: c.name || '',
      setCode: c.setCode || '',
      count: c.count || 1,
      manaCost: c.manaCost || '',
      type: c.type || '',
      isLand: Boolean(c.isLand),
      imageUrl: c.imageUrl || '',
    })),
  };
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getOrCreateSessionToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Token': token,
      ...(options?.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Errore HTTP ${res.status}`);
  }
  return data as T;
}

export async function fetchServerStatus(): Promise<{
  status: string;
  version: string;
  loadedCards: number;
}> {
  return requestJson('/api/status');
}

export async function fetchRooms(sessionToken: string): Promise<RoomSummary[]> {
  const data = await requestJson<{ rooms: any[] }>('/api/rooms', {
    headers: { 'X-Session-Token': sessionToken },
  });
  return (data.rooms || []).map((r) => ({
    roomId: r.roomId,
    roomName: r.roomName,
    hasPassword: Boolean(r.hasPassword),
    format: r.isCommander ? 'COMMANDER' : 'CONSTRUCTED',
    isCommander: Boolean(r.isCommander),
    maxPlayers: r.maxPlayers ?? r.totalSlots ?? 4,
    occupiedCount: r.occupiedCount ?? (r.humanCount || 0) + (r.aiCount || 0),
    onlineCount: r.onlineCount ?? r.humanCount ?? 0,
    status: r.matchActive ? 'IN_GAME' : r.status || 'LOBBY',
    canReconnect: Boolean(r.canReconnect ?? r.isMember),
  }));
}

export async function createRoom(params: {
  roomId?: string;
  roomName: string;
  password?: string;
  format: 'COMMANDER' | 'CONSTRUCTED';
  maxPlayers: number;
  sessionToken: string;
  nickname: string;
}): Promise<{ roomId: string; room: RoomState }> {
  const raw = await requestJson<any>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({
      ...params,
      isCommander: params.format === 'COMMANDER',
    }),
  });
  const room = normalizeRoomState(raw.room);
  return { roomId: room.roomId, room };
}

export async function joinRoom(
  roomId: string,
  params: {
    sessionToken: string;
    nickname: string;
    password?: string;
  }
): Promise<{ room: RoomState; hasActiveGame: boolean }> {
  const raw = await requestJson<any>(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
    method: 'POST',
    body: JSON.stringify({ ...params, roomId }),
  });
  const room = normalizeRoomState(raw.room);
  return { room, hasActiveGame: Boolean(raw.hasActiveGame || room.status === 'IN_GAME') };
}

export async function leaveRoomApi(roomId: string, sessionToken: string): Promise<void> {
  await requestJson(`/api/rooms/${encodeURIComponent(roomId)}/leave`, {
    method: 'POST',
    body: JSON.stringify({ sessionToken }),
  });
}

export async function updateRoomFormatApi(
  roomId: string,
  sessionToken: string,
  isCommander: boolean
): Promise<RoomState> {
  const raw = await requestJson<any>(`/api/rooms/${encodeURIComponent(roomId)}/format`, {
    method: 'POST',
    body: JSON.stringify({ sessionToken, isCommander }),
  });
  return normalizeRoomState(raw.room);
}

export async function updateRoomSlotsCountApi(
  roomId: string,
  sessionToken: string,
  add: boolean
): Promise<RoomState> {
  const raw = await requestJson<any>(
    `/api/rooms/${encodeURIComponent(roomId)}/slots-count`,
    {
      method: 'POST',
      body: JSON.stringify({ sessionToken, add }),
    }
  );
  return normalizeRoomState(raw.room);
}

let cachedDeckCatalog: DeckCatalogResponse | null = null;

export async function fetchDeckCatalog(): Promise<DeckCatalogResponse> {
  if (cachedDeckCatalog) {
    return cachedDeckCatalog;
  }
  const raw = await requestJson<any>('/api/decks/catalog?limit=600');
  if (raw.commanderDecks) {
    cachedDeckCatalog = raw as DeckCatalogResponse;
    return cachedDeckCatalog;
  }
  const allDecks: any[] = Array.isArray(raw.decks) ? raw.decks : [];
  const commanderDecks: DeckCatalogEntry[] = [];
  const preconDecks: DeckCatalogEntry[] = [];
  const themeDecks: DeckCatalogEntry[] = [];
  const competitiveDecks: DeckCatalogEntry[] = [];

  allDecks.forEach((d) => {
    const cat = String(d.category || 'PRECON').toUpperCase();
    const entry: DeckCatalogEntry = {
      id: d.id,
      name: d.name,
      category: cat,
      format: cat === 'COMMANDER' ? 'COMMANDER' : 'CONSTRUCTED',
      commanderName: d.commanderName || '',
      commanderImageUrl: d.commanderImageUrl || '',
      description: d.edition ? `Edizione: ${d.edition}` : `Categoria: ${d.category}`,
    };
    if (cat === 'COMMANDER') commanderDecks.push(entry);
    else if (cat === 'THEME') themeDecks.push(entry);
    else if (cat === 'COMPETITIVE') competitiveDecks.push(entry);
    else preconDecks.push(entry);
  });

  cachedDeckCatalog = { commanderDecks, preconDecks, themeDecks, competitiveDecks };
  return cachedDeckCatalog;
}

export async function fetchDeckPreview(deckId: string): Promise<{ deck: DeckSummary }> {
  const raw = await requestJson<any>(
    `/api/decks/preview?id=${encodeURIComponent(deckId)}`
  );
  return { deck: normalizeDeckSummary(raw.deck) };
}

export async function searchCardsApi(params: {
  q?: string;
  colors?: string;
  type?: string;
  commanderOnly?: boolean;
  limit?: number;
}): Promise<CardSearchItem[]> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.colors) qs.set('colors', params.colors);
  if (params.type) qs.set('type', params.type);
  if (params.commanderOnly) qs.set('commanderOnly', 'true');
  if (params.limit) qs.set('limit', String(params.limit));
  const data = await requestJson<{ cards: any[] }>(`/api/cards/search?${qs.toString()}`);
  return (data.cards || []).map((c) => ({
    ...c,
    scryfallFallbackUrl: c.scryfallFallbackUrl || c.fallbackImageUrl || '',
  }));
}

export async function applyDeckToRoomSlot(
  roomId: string,
  payload: {
    sessionToken: string;
    slotIndex: number;
    mode: 'CATALOG' | 'IMPORT_TEXT' | 'RANDOM' | 'CUSTOM_JSON';
    deckId?: string;
    deckName?: string;
    deckText?: string;
    commanderName?: string;
    colors?: string[];
    commander?: { name: string; setCode?: string; count: number }[];
    main?: { name: string; setCode?: string; count: number }[];
    sideboard?: { name: string; setCode?: string; count: number }[];
  }
): Promise<{ ok: boolean; deckSummary: DeckSummary; room: RoomState; warnings: string[] }> {
  const raw = await requestJson<any>(`/api/rooms/${encodeURIComponent(roomId)}/deck`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    ok: true,
    deckSummary: normalizeDeckSummary(raw.deckSummary || raw.deck),
    room: normalizeRoomState(raw.room),
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
  };
}

export async function startRoomMatch(
  roomId: string,
  sessionToken: string
): Promise<{ ok: boolean; room: RoomState }> {
  const raw = await requestJson<any>(`/api/rooms/${encodeURIComponent(roomId)}/start`, {
    method: 'POST',
    body: JSON.stringify({ sessionToken }),
  });
  return {
    ok: true,
    room: normalizeRoomState(raw.room),
  };
}
