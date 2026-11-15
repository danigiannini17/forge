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
  if (!token || token.length < 8) {
    const rand = Math.random().toString(36).substring(2, 12);
    const ts = Date.now().toString(36);
    token = `pw_${ts}_${rand}`;
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
      team: (s.team ?? idx) + (s.team === 0 ? 1 : 0),
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
    actionableStrength:
      raw.actionableStrength ?? (raw.isActionable || raw.isSelectable ? 1 : 0),
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
  const stack: StackItemState[] = stackRaw.map((s) => ({
    key: String(s.key ?? s.id ?? Math.random()),
    text: s.text || '',
    optionalTrigger: Boolean(s.optionalTrigger ?? s.isTrigger),
    isTrigger: Boolean(s.isTrigger ?? s.optionalTrigger),
    ability: Boolean(s.ability ?? s.isAbility),
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
  if (pendingModal && Array.isArray(pendingModal.options)) {
    pendingModal = {
      ...pendingModal,
      modalId: pendingModal.modalId || 'modal-active',
      modalType: pendingModal.modalType || pendingModal.type,
      options: pendingModal.options.map((opt: any, idx: number) => ({
        index: opt.index ?? idx,
        label: opt.label || opt.name || String(opt),
        description: opt.description || '',
        isCard: Boolean(opt.isCard || opt.card),
        card: opt.card ? normalizeCardView(opt.card) : undefined,
      })),
    };
  } else if (pendingModal) {
    pendingModal = {
      ...pendingModal,
      modalId: pendingModal.modalId || 'modal-active',
      modalType: pendingModal.modalType || pendingModal.type,
      card: pendingModal.card ? normalizeCardView(pendingModal.card) : undefined,
    };
  }

  const phase = raw.phase || 'MAIN1';

  return {
    roomId: raw.roomId || '',
    slotIndex: raw.slotIndex ?? 0,
    localPlayerName: localViewer?.name || 'Planeswalker',
    title: raw.title || 'Tavolo Forge',
    gameFormat: raw.gameFormat || raw.gameType || 'Commander',
    isCommander: Boolean(raw.isCommander),
    turn: raw.turn ?? 1,
    phase,
    phaseLabel: raw.phaseLabel || phase,
    playerTurnName: raw.playerTurnName || '',
    playerTurnId: raw.playerTurnId ?? -1,
    isMyTurn: Boolean(
      raw.isMyTurn ?? (localViewer && raw.playerTurnId === localViewer.id)
    ),
    hasPriority: Boolean(raw.hasPriority ?? localViewer?.hasPriority),
    gameOver: Boolean(raw.gameOver ?? raw.isGameOver),
    winningTeam: raw.winningTeam ?? -1,
    stormCount: raw.stormCount ?? 0,
    undoAvailable: Boolean(raw.undoAvailable ?? promptRaw.undoAvailable),
    canSelectCards: true,
    canSelectPlayers: true,
    isDeclareAttackers: phase === 'COMBAT_DECLARE_ATTACKERS',
    isDeclareBlockers: phase === 'COMBAT_DECLARE_BLOCKERS',
    prompt: {
      message: promptRaw.message || '',
      card: promptRaw.card ? normalizeCardView(promptRaw.card) : undefined,
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
    actionableCardIds: [],
    autotapCardIds: [],
    selectedCardIds: [],
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
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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
  const data = await requestJson<{ rooms: any[] }>(
    `/api/rooms?sessionToken=${encodeURIComponent(sessionToken)}`
  );
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

export async function fetchDeckCatalog(): Promise<DeckCatalogResponse> {
  const raw = await requestJson<any>('/api/decks/catalog?limit=600');
  if (raw.commanderDecks) {
    return raw as DeckCatalogResponse;
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

  return { commanderDecks, preconDecks, themeDecks, competitiveDecks };
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
): Promise<{ ok: boolean; deckSummary: DeckSummary; room: RoomState }> {
  const raw = await requestJson<any>(`/api/rooms/${encodeURIComponent(roomId)}/deck`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    ok: true,
    deckSummary: normalizeDeckSummary(raw.deckSummary || raw.deck),
    room: normalizeRoomState(raw.room),
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
