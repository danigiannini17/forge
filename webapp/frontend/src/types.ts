export interface DeckCatalogEntry {
  id: string;
  name: string;
  category: 'COMMANDER' | 'PRECON' | 'THEME' | 'COMPETITIVE' | string;
  format: 'COMMANDER' | 'CONSTRUCTED' | string;
  commanderName: string;
  commanderImageUrl: string;
  description: string;
}

export interface DeckCatalogResponse {
  commanderDecks: DeckCatalogEntry[];
  preconDecks: DeckCatalogEntry[];
  themeDecks: DeckCatalogEntry[];
  competitiveDecks: DeckCatalogEntry[];
}

export interface CardSearchItem {
  name: string;
  setCode: string;
  collectorNumber: string;
  manaCost: string;
  cmc: number;
  type: string;
  oracleText: string;
  power: string;
  toughness: string;
  loyalty: string;
  canBeCommander: boolean;
  isCreature: boolean;
  isLand: boolean;
  colors: string[];
  colorIdentity: string[];
  imageUrl: string;
  scryfallFallbackUrl: string;
}

export interface DeckCardEntry {
  name: string;
  setCode: string;
  count: number;
  manaCost?: string;
  type?: string;
  isLand?: boolean;
  imageUrl?: string;
}

export interface DeckSummary {
  name: string;
  mainCount: number;
  commanderCount: number;
  sideboardCount: number;
  commanders: { name: string; setCode: string; manaCost: string; type: string; imageUrl: string }[];
  main: DeckCardEntry[];
  sideboard: DeckCardEntry[];
}

export interface RoomSlotInfo {
  slotIndex: number;
  type: 'REMOTE' | 'AI' | 'OPEN' | 'LOCAL' | 'LEARNED';
  name: string;
  team: number;
  isReady: boolean;
  isArchenemy: boolean;
  deckName: string;
  deckSummary: string;
  claimedByToken: string;
  isMe: boolean;
  isOnline: boolean;
  commanderCards?: string[];
  mainCount?: number;
}

export interface ChatEntry {
  sender: string;
  message: string;
  timestamp: number;
}

export interface RoomState {
  roomId: string;
  roomName: string;
  hasPassword: boolean;
  format: 'COMMANDER' | 'CONSTRUCTED';
  isCommander: boolean;
  maxPlayers: number;
  status: 'LOBBY' | 'IN_GAME' | 'FINISHED';
  isHost: boolean;
  mySlotIndex: number;
  slots: RoomSlotInfo[];
  chatHistory?: ChatEntry[];
}

export interface RoomSummary {
  roomId: string;
  roomName: string;
  hasPassword: boolean;
  format: 'COMMANDER' | 'CONSTRUCTED';
  isCommander: boolean;
  maxPlayers: number;
  occupiedCount: number;
  onlineCount: number;
  status: 'LOBBY' | 'IN_GAME' | 'FINISHED';
  canReconnect: boolean;
}

export interface CardViewState {
  id: number;
  name: string;
  zone?: string;
  ownerId: number;
  ownerName: string;
  controllerId: number;
  controllerName: string;
  hidden: boolean;
  faceDown?: boolean;
  tapped: boolean;
  sickness: boolean;
  token: boolean;
  commander: boolean;
  flipped?: boolean;
  transformed?: boolean;
  attacking?: boolean;
  blocking?: boolean;
  exerted?: boolean;
  setCode?: string;
  collectorNumber?: string;
  manaCost?: string;
  type?: string;
  power?: number;
  toughness?: number;
  loyalty?: string;
  defense?: string;
  damage?: number;
  assignedDamage?: number;
  lethalDamage?: number;
  isCreature?: boolean;
  isLand?: boolean;
  isPlaneswalker?: boolean;
  isArtifact?: boolean;
  isEnchantment?: boolean;
  isInstant?: boolean;
  isSorcery?: boolean;
  colors?: string[];
  oracleText?: string;
  abilityText?: string;
  fullText?: string;
  keywords?: string;
  imageUrl: string;
  scryfallFallbackUrl?: string;
  counters?: Record<string, number>;
  attachedToId?: number;
  attachedCardIds?: number[];
  enchantingPlayerId?: number;
  defendingEntityId?: number;
  defendingEntityName?: string;
  blockedByIds?: number[];
  blockingAttackerName?: string;
  hasAlternateState?: boolean;
  alternateName?: string;
  alternateManaCost?: string;
  alternateType?: string;
  alternateOracleText?: string;
  alternatePower?: number;
  alternateToughness?: number;
  alternateImageUrl?: string;
  actionableStrength?: number; // 0 = none, 1 = playable, 2 = autotap
  selected?: boolean;
}

export interface CommanderEntryState {
  card: CardViewState;
  castCount: number;
  taxMana: number;
}

export interface CommanderDamageEntry {
  commanderId: number;
  commanderName: string;
  commanderOwnerName: string;
  damage: number;
}

export interface PlayerViewState {
  id: number;
  name: string;
  isAI: boolean;
  isLocalViewer: boolean;
  isSelectable?: boolean;
  isSelected?: boolean;
  isTurn?: boolean;
  life: number;
  hasLost: boolean;
  hasPriority: boolean;
  hasAvailableActions: boolean;
  maxHandSize: number;
  unlimitedHandSize: boolean;
  numDrawnThisTurn: number;
  numLandsPlayed: number;
  maxLandsToPlay: number;
  details: string;
  keywords: string[];
  counters: Record<string, number>;
  poisonCounters: number;
  energyCounters: number;
  experienceCounters: number;
  manaPool: {
    W: number;
    U: number;
    B: number;
    R: number;
    G: number;
    C: number;
    total: number;
  };
  commanders: CommanderEntryState[];
  commanderDamageTaken: CommanderDamageEntry[];
  zoneSizes: {
    hand: number;
    library: number;
    graveyard: number;
    exile: number;
    command: number;
    flashback: number;
    battlefield: number;
  };
  zones: {
    battlefield: CardViewState[];
    hand: CardViewState[];
    graveyard: CardViewState[];
    exile: CardViewState[];
    command: CardViewState[];
    flashback: CardViewState[];
  };
}

export interface StackItemState {
  key: string;
  text: string;
  optionalTrigger: boolean;
  isTrigger: boolean;
  ability: boolean;
  activatingPlayerId: number;
  activatingPlayerName: string;
  sourceCard?: CardViewState;
  targetCards: { id: number; name: string }[];
  targetPlayers: { id: number; name: string }[];
}

export interface CombatBandState {
  defenderId: number;
  defenderName: string;
  defenderType: 'PLAYER' | 'PLANESWALKER' | 'BATTLE';
  blocked: boolean;
  trample?: boolean;
  attackers: { id: number; name: string; power: number; toughness: number }[];
  blockers: { id: number; name: string; power: number; toughness: number }[];
}

export interface CombatState {
  numAttackers: number;
  bands: CombatBandState[];
}

export interface PromptState {
  message: string;
  card?: CardViewState;
  okEnabled: boolean;
  cancelEnabled: boolean;
  okText: string;
  cancelText: string;
  focusOk: boolean;
}

export interface YieldState {
  autoYieldAll: boolean;
  autoYieldEndOfStep: boolean;
  autoYieldStackEmpty: boolean;
  autoPassNoActions: boolean;
  skippedOwnPhases: string[];
  skippedOpponentPhases: string[];
}

export interface ModalChoiceOption {
  index: number;
  label: string;
  description?: string;
  isCard?: boolean;
  card?: CardViewState;
}

export interface PendingModalState {
  modalId: string;
  modalType:
    | 'CHOOSE_ABILITY'
    | 'GET_CHOICES'
    | 'CONFIRM'
    | 'INPUT_TEXT'
    | 'ASSIGN_COMBAT_DAMAGE'
    | 'ASSIGN_GENERIC_AMOUNT';
  title: string;
  message?: string;
  min?: number;
  max?: number;
  yesText?: string;
  noText?: string;
  defaultYes?: boolean;
  card?: CardViewState;
  options?: ModalChoiceOption[];
  inputKind?: 'NUMBER' | 'TEXT';
  initialValue?: number;
  defaultText?: string;
  attacker?: CardViewState;
  source?: CardViewState;
  totalDamageToAssign?: number;
  totalAmount?: number;
  overrideOrder?: boolean;
  maySkip?: boolean;
  payManaCost?: boolean;
  targets?: {
    index: number;
    label: string;
    isCard: boolean;
    id: number;
    lethalDamage?: number;
    existingDamage?: number;
    minDamage?: number;
    card?: CardViewState;
  }[];
}

export interface GameLogEntry {
  type: string;
  summary: string;
}

export interface GameStatePayload {
  roomId: string;
  slotIndex: number;
  localPlayerName: string;
  title: string;
  gameFormat: string;
  isCommander: boolean;
  turn: number;
  phase: string;
  phaseLabel: string;
  playerTurnName: string;
  playerTurnId: number;
  isMyTurn: boolean;
  hasPriority: boolean;
  gameOver: boolean;
  winningTeam: number;
  stormCount: number;
  monarchName?: string;
  initiativeName?: string;
  dayTime?: boolean;
  undoAvailable: boolean;
  canSelectCards: boolean;
  canSelectPlayers: boolean;
  isDeclareAttackers: boolean;
  isDeclareBlockers: boolean;
  prompt: PromptState;
  yieldState: YieldState;
  pendingModal: PendingModalState | null;
  actionableCardIds: number[];
  autotapCardIds: number[];
  selectedCardIds: number[];
  stack: StackItemState[];
  combat: CombatState | null;
  players: PlayerViewState[];
  gameLog: GameLogEntry[];
}
