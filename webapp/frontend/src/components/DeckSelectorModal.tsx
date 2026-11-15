import React, { useState, useEffect } from 'react';
import {
  CardSearchItem,
  DeckCatalogEntry,
  DeckCatalogResponse,
  DeckSummary,
  RoomState,
} from '../types';
import {
  applyDeckToRoomSlot,
  fetchDeckCatalog,
  fetchDeckPreview,
  searchCardsApi,
} from '../api';
import { ManaCostDisplay, OracleTextDisplay } from './ManaText';
import {
  BookOpen,
  Check,
  Crown,
  Dice5,
  FileText,
  Hammer,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

interface DeckSelectorModalProps {
  room: RoomState;
  slotIndex: number;
  slotName: string;
  sessionToken: string;
  onClose: () => void;
  onDeckApplied: (updatedRoom: RoomState, summary: DeckSummary) => void;
}

type TabMode = 'CATALOG' | 'IMPORT' | 'RANDOM' | 'BUILDER';

interface BuilderEntry {
  name: string;
  setCode: string;
  count: number;
  manaCost: string;
  type: string;
  imageUrl: string;
}

const SAMPLE_COMMANDER_IMPORT = `Commander
1 Atraxa, Praetors' Voice

Deck
1 Sol Ring
1 Arcane Signet
1 Command Tower
1 Swords to Plowshares
1 Counterspell
1 Cultivate
1 Kodama's Reach
1 Eternal Witness
1 Shalai, Voice of Plenty
1 Evolution Sage
1 Contagion Clasp
1Contagion Engine
1 Deepglow Skate
1 Farseek
1 Anguished Unmaking
1 Assassin's Trophy
1 Teferi's Protection
1 Cyclonic Rift
9 Plains
9 Island
8 Swamp
9 Forest`;

const SAMPLE_CONSTRUCTED_IMPORT = `Deck
4 Lightning Bolt
4 Monastery Swiftspear
4 Goblin Guide
4 Eidolon of the Great Revel
4 Lava Spike
4 Rift Bolt
4 Searing Blaze
4 Skewer the Critics
4 Light Up the Stage
4 Bonecrusher Giant
20 Mountain`;

export const DeckSelectorModal: React.FC<DeckSelectorModalProps> = ({
  room,
  slotIndex,
  slotName,
  sessionToken,
  onClose,
  onDeckApplied,
}) => {
  const [activeTab, setActiveTab] = useState<TabMode>('CATALOG');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab 1: Catalog state
  const [catalog, setCatalog] = useState<DeckCatalogResponse | null>(null);
  const [catalogCategory, setCatalogCategory] = useState<string>(
    room.isCommander ? 'COMMANDER' : 'PRECON'
  );
  const [catalogQuery, setCatalogQuery] = useState('');
  const [selectedCatalogDeck, setSelectedCatalogDeck] = useState<DeckCatalogEntry | null>(null);
  const [previewSummary, setPreviewSummary] = useState<DeckSummary | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Tab 2: Import Text state
  const [importName, setImportName] = useState(
    room.isCommander ? 'Mazzo Commander Importato' : 'Mazzo Costruito Importato'
  );
  const [importCommander, setImportCommander] = useState('');
  const [importText, setImportText] = useState(
    room.isCommander ? SAMPLE_COMMANDER_IMPORT : SAMPLE_CONSTRUCTED_IMPORT
  );

  // Tab 3: Random Generator state
  const [randomColors, setRandomColors] = useState<string[]>(['U', 'R']);
  const [randomCommanderQuery, setRandomCommanderQuery] = useState('');
  const [randomCommanderResults, setRandomCommanderResults] = useState<CardSearchItem[]>([]);
  const [selectedRandomCommander, setSelectedRandomCommander] = useState<string>('');

  // Tab 4: Full Deckbuilder state
  const [builderDeckName, setBuilderDeckName] = useState(
    room.isCommander ? 'Nuovo Mazzo Commander' : 'Nuovo Mazzo Costruito'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchColors, setSearchColors] = useState<string[]>([]);
  const [searchType, setSearchType] = useState('');
  const [commanderOnlyFilter, setCommanderOnlyFilter] = useState(false);
  const [searchResults, setSearchResults] = useState<CardSearchItem[]>([]);
  const [searchingCards, setSearchingCards] = useState(false);
  const [inspectedSearchCard, setInspectedSearchCard] = useState<CardSearchItem | null>(null);

  const [builderCommanders, setBuilderCommanders] = useState<BuilderEntry[]>([]);
  const [builderMain, setBuilderMain] = useState<BuilderEntry[]>([
    { name: 'Plains', setCode: '', count: 12, manaCost: '', type: 'Basic Land', imageUrl: '' },
    { name: 'Island', setCode: '', count: 12, manaCost: '', type: 'Basic Land', imageUrl: '' },
  ]);

  useEffect(() => {
    fetchDeckCatalog()
      .then((data) => {
        setCatalog(data);
        const initialList = room.isCommander ? data.commanderDecks : data.preconDecks;
        if (initialList && initialList.length > 0) {
          handleSelectCatalogItem(initialList[0]);
        }
      })
      .catch((err) => setError(err.message));
  }, [room.isCommander]);

  const handleSelectCatalogItem = async (entry: DeckCatalogEntry) => {
    setSelectedCatalogDeck(entry);
    setLoadingPreview(true);
    try {
      const res = await fetchDeckPreview(entry.id);
      setPreviewSummary(res.deck);
    } catch {
      setPreviewSummary(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const getFilteredCatalogList = (): DeckCatalogEntry[] => {
    if (!catalog) return [];
    let list: DeckCatalogEntry[] = [];
    if (catalogCategory === 'COMMANDER') list = catalog.commanderDecks || [];
    else if (catalogCategory === 'PRECON') list = catalog.preconDecks || [];
    else if (catalogCategory === 'THEME') list = catalog.themeDecks || [];
    else if (catalogCategory === 'COMPETITIVE') list = catalog.competitiveDecks || [];

    const q = catalogQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.commanderName && d.commanderName.toLowerCase().includes(q)) ||
        (d.description && d.description.toLowerCase().includes(q))
    );
  };

  const handleApplyCatalogDeck = async () => {
    if (!selectedCatalogDeck) return;
    setLoading(true);
    setError(null);
    try {
      const res = await applyDeckToRoomSlot(room.roomId, {
        sessionToken,
        slotIndex,
        mode: 'CATALOG',
        deckId: selectedCatalogDeck.id,
      });
      onDeckApplied(res.room, res.deckSummary);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyImportDeck = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await applyDeckToRoomSlot(room.roomId, {
        sessionToken,
        slotIndex,
        mode: 'IMPORT_TEXT',
        deckName: importName,
        commanderName: importCommander,
        deckText: importText,
      });
      onDeckApplied(res.room, res.deckSummary);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchRandomCommanders = async () => {
    try {
      const cards = await searchCardsApi({
        q: randomCommanderQuery,
        commanderOnly: true,
        limit: 24,
      });
      setRandomCommanderResults(cards);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleApplyRandomDeck = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await applyDeckToRoomSlot(room.roomId, {
        sessionToken,
        slotIndex,
        mode: 'RANDOM',
        colors: randomColors,
        commanderName: selectedRandomCommander,
      });
      onDeckApplied(res.room, res.deckSummary);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const runDeckbuilderSearch = async () => {
    setSearchingCards(true);
    try {
      const cards = await searchCardsApi({
        q: searchQuery,
        colors: searchColors.join(','),
        type: searchType,
        commanderOnly: commanderOnlyFilter,
        limit: 48,
      });
      setSearchResults(cards);
      if (cards.length > 0 && !inspectedSearchCard) {
        setInspectedSearchCard(cards[0]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSearchingCards(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'BUILDER' && searchResults.length === 0) {
      runDeckbuilderSearch();
    }
  }, [activeTab]);

  const addCardToBuilderMain = (card: CardSearchItem, qty = 1) => {
    setBuilderMain((prev) => {
      const existing = prev.find((x) => x.name === card.name);
      if (existing) {
        return prev.map((x) =>
          x.name === card.name ? { ...x, count: x.count + qty } : x
        );
      }
      return [
        ...prev,
        {
          name: card.name,
          setCode: card.setCode,
          count: qty,
          manaCost: card.manaCost,
          type: card.type,
          imageUrl: card.imageUrl,
        },
      ];
    });
  };

  const setCardAsBuilderCommander = (card: CardSearchItem) => {
    setBuilderCommanders([
      {
        name: card.name,
        setCode: card.setCode,
        count: 1,
        manaCost: card.manaCost,
        type: card.type,
        imageUrl: card.imageUrl,
      },
    ]);
  };

  const updateBuilderMainCount = (name: string, delta: number) => {
    setBuilderMain((prev) =>
      prev
        .map((x) => (x.name === name ? { ...x, count: x.count + delta } : x))
        .filter((x) => x.count > 0)
    );
  };

  const autoFillLandsInBuilder = () => {
    const targetSize = room.isCommander ? 99 : 60;
    const currentMainTotal = builderMain.reduce((acc, c) => acc + c.count, 0);
    const needed = Math.max(0, targetSize - currentMainTotal);
    if (needed === 0) return;
    const basics = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
    const perBasic = Math.floor(needed / basics.length);
    const rem = needed % basics.length;
    basics.forEach((bName, i) => {
      const addCount = perBasic + (i < rem ? 1 : 0);
      if (addCount > 0) {
        addCardToBuilderMain(
          {
            name: bName,
            setCode: '',
            collectorNumber: '',
            manaCost: '',
            cmc: 0,
            type: 'Basic Land',
            oracleText: '',
            power: '',
            toughness: '',
            loyalty: '',
            canBeCommander: false,
            isCreature: false,
            isLand: true,
            colors: [],
            colorIdentity: [],
            imageUrl: '',
            scryfallFallbackUrl: '',
          },
          addCount
        );
      }
    });
  };

  const handleApplyBuilderDeck = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await applyDeckToRoomSlot(room.roomId, {
        sessionToken,
        slotIndex,
        mode: 'CUSTOM_JSON',
        deckName: builderDeckName,
        commander: builderCommanders.map((c) => ({
          name: c.name,
          setCode: c.setCode,
          count: c.count,
        })),
        main: builderMain.map((c) => ({
          name: c.name,
          setCode: c.setCode,
          count: c.count,
        })),
        sideboard: [],
      });
      onDeckApplied(res.room, res.deckSummary);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleColorInList = (
    color: string,
    list: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (list.includes(color)) {
      setter(list.filter((c) => c !== color));
    } else {
      setter([...list, color]);
    }
  };

  const totalBuilderMain = builderMain.reduce((acc, c) => acc + c.count, 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-surface deck-selector-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">
              <Sparkles size={20} className="gold-icon" /> Selezione Mazzo — Posto #
              {slotIndex + 1} ({slotName})
            </h2>
            <p className="modal-subtitle">
              Formato stanza:{' '}
              <strong>
                {room.isCommander
                  ? 'Commander / EDH (100 carte + Comandante, 40 PV)'
                  : 'Costruito (60+ carte, 20 PV)'}
              </strong>
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* 4 Mode Tabs */}
        <div className="deck-tabs">
          <button
            type="button"
            className={`deck-tab-btn ${activeTab === 'CATALOG' ? 'active' : ''}`}
            onClick={() => setActiveTab('CATALOG')}
          >
            <BookOpen size={16} />
            1. Precostruiti &amp; Commander
          </button>
          <button
            type="button"
            className={`deck-tab-btn ${activeTab === 'IMPORT' ? 'active' : ''}`}
            onClick={() => setActiveTab('IMPORT')}
          >
            <FileText size={16} />
            2. Importa / Incolla Lista
          </button>
          <button
            type="button"
            className={`deck-tab-btn ${activeTab === 'RANDOM' ? 'active' : ''}`}
            onClick={() => setActiveTab('RANDOM')}
          >
            <Dice5 size={16} />
            3. Generatore Casuale
          </button>
          <button
            type="button"
            className={`deck-tab-btn ${activeTab === 'BUILDER' ? 'active' : ''}`}
            onClick={() => setActiveTab('BUILDER')}
          >
            <Hammer size={16} />
            4. Deckbuilder Completo
          </button>
        </div>

        {error && <div className="alert-error">{error}</div>}

        {/* TAB 1: BUILT-IN CATALOG */}
        {activeTab === 'CATALOG' && (
          <div className="deck-tab-body catalog-layout">
            <div className="catalog-left">
              <div className="catalog-filters">
                <div className="category-pills">
                  <button
                    type="button"
                    className={`pill-btn ${
                      catalogCategory === 'COMMANDER' ? 'active' : ''
                    }`}
                    onClick={() => setCatalogCategory('COMMANDER')}
                  >
                    <Crown size={14} /> Commander ({catalog?.commanderDecks.length || 0})
                  </button>
                  <button
                    type="button"
                    className={`pill-btn ${catalogCategory === 'PRECON' ? 'active' : ''}`}
                    onClick={() => setCatalogCategory('PRECON')}
                  >
                    Precon ({catalog?.preconDecks.length || 0})
                  </button>
                  <button
                    type="button"
                    className={`pill-btn ${catalogCategory === 'THEME' ? 'active' : ''}`}
                    onClick={() => setCatalogCategory('THEME')}
                  >
                    Tematici ({catalog?.themeDecks.length || 0})
                  </button>
                  <button
                    type="button"
                    className={`pill-btn ${
                      catalogCategory === 'COMPETITIVE' ? 'active' : ''
                    }`}
                    onClick={() => setCatalogCategory('COMPETITIVE')}
                  >
                    AI / Competitivi ({catalog?.competitiveDecks.length || 0})
                  </button>
                </div>
                <div className="search-input-wrap">
                  <Search size={15} />
                  <input
                    type="text"
                    placeholder="Filtra mazzi per nome o Comandante..."
                    value={catalogQuery}
                    onChange={(e) => setCatalogQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="catalog-list">
                {getFilteredCatalogList().map((entry) => (
                  <div
                    key={entry.id}
                    className={`catalog-item ${
                      selectedCatalogDeck?.id === entry.id ? 'selected' : ''
                    }`}
                    onClick={() => handleSelectCatalogItem(entry)}
                  >
                    <div className="catalog-item-main">
                      <span className="catalog-item-title">{entry.name}</span>
                      {entry.commanderName && (
                        <span className="catalog-item-cmd">
                          <Crown size={12} /> {entry.commanderName}
                        </span>
                      )}
                    </div>
                    <span className="catalog-badge">{entry.category}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="catalog-right">
              {selectedCatalogDeck ? (
                <div className="deck-preview-card">
                  <div className="deck-preview-header">
                    <div>
                      <h3>{selectedCatalogDeck.name}</h3>
                      {selectedCatalogDeck.commanderName && (
                        <div className="cmd-subtitle">
                          <Crown size={15} /> Comandante:{' '}
                          <strong>{selectedCatalogDeck.commanderName}</strong>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={loading}
                      onClick={handleApplyCatalogDeck}
                    >
                      <Check size={16} />{' '}
                      {loading ? 'Caricamento...' : 'Scegli Questo Mazzo'}
                    </button>
                  </div>

                  {selectedCatalogDeck.commanderImageUrl && (
                    <div className="cmd-preview-banner">
                      <img
                        src={selectedCatalogDeck.commanderImageUrl}
                        alt={selectedCatalogDeck.commanderName}
                        className="cmd-preview-img"
                      />
                      <div className="cmd-preview-meta">
                        <p>{selectedCatalogDeck.description}</p>
                        {previewSummary && (
                          <div className="deck-counts-row">
                            <span className="stat-chip">
                              Main: <strong>{previewSummary.mainCount}</strong> carte
                            </span>
                            {previewSummary.commanderCount > 0 && (
                              <span className="stat-chip gold">
                                Commander: <strong>{previewSummary.commanderCount}</strong>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {loadingPreview ? (
                    <div className="preview-loading">Lettura lista carte in corso...</div>
                  ) : (
                    previewSummary && (
                      <div className="deck-cardlist-scroll">
                        {previewSummary.commanders.length > 0 && (
                          <div className="deck-section-group">
                            <h4>Zona di Comando</h4>
                            {previewSummary.commanders.map((c, idx) => (
                              <div key={idx} className="deck-line-row commander-row">
                                <span className="deck-line-qty">1x</span>
                                <span className="deck-line-name">{c.name}</span>
                                <ManaCostDisplay text={c.manaCost} size="sm" />
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="deck-section-group">
                          <h4>Mazzo Principale ({previewSummary.mainCount})</h4>
                          {previewSummary.main.map((c, idx) => (
                            <div key={idx} className="deck-line-row">
                              <span className="deck-line-qty">{c.count}x</span>
                              <span className="deck-line-name">{c.name}</span>
                              <ManaCostDisplay text={c.manaCost} size="sm" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="empty-preview">
                  Seleziona un mazzo dall&apos;elenco a sinistra per vedere l&apos;anteprima.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: IMPORT / PASTE LIST */}
        {activeTab === 'IMPORT' && (
          <div className="deck-tab-body import-layout">
            <div className="form-grid-2">
              <div className="form-field">
                <label>Nome del Mazzo</label>
                <input
                  type="text"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder="Es. Atraxa Superfriends"
                />
              </div>
              <div className="form-field">
                <label>
                  Nome Comandante (opzionale se già indicato sotto `[Commander]`)
                </label>
                <input
                  type="text"
                  value={importCommander}
                  onChange={(e) => setImportCommander(e.target.value)}
                  placeholder="Es. Atraxa, Praetors' Voice"
                />
              </div>
            </div>

            <div className="form-field">
              <div className="field-header-row">
                <label>
                  Lista Carte (Formato MTG Arena, MTGO o Forge `.dck` — es.{' '}
                  <code>1 Sol Ring</code>)
                </label>
                <div className="sample-btns">
                  <button
                    type="button"
                    className="btn-ghost-sm"
                    onClick={() => setImportText(SAMPLE_COMMANDER_IMPORT)}
                  >
                    Carica Esempio Commander
                  </button>
                  <button
                    type="button"
                    className="btn-ghost-sm"
                    onClick={() => setImportText(SAMPLE_CONSTRUCTED_IMPORT)}
                  >
                    Carica Esempio 60 Carte
                  </button>
                </div>
              </div>
              <textarea
                rows={13}
                className="decklist-textarea"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Incolla qui la lista del tuo mazzo..."
              />
            </div>

            <div className="modal-footer-bar">
              <button
                type="button"
                className="btn-primary"
                disabled={loading}
                onClick={handleApplyImportDeck}
              >
                <Check size={16} />{' '}
                {loading ? 'Importazione in corso...' : 'Importa e Assegna al Posto'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: RANDOM DECK GENERATOR */}
        {activeTab === 'RANDOM' && (
          <div className="deck-tab-body random-layout">
            <div className="random-card-box">
              <h3>
                <Dice5 size={20} className="gold-icon" /> Generatore Automatico Forge (
                <code>DeckgenUtil</code>)
              </h3>
              <p className="muted-p">
                Genera istantaneamente un mazzo bilanciato scegliendo i colori di Mana
                oppure (in modalità Commander) scegliendo una Creatura Leggendaria specifica.
              </p>

              <div className="form-field">
                <label>Seleziona Identità di Colore</label>
                <div className="color-selector-row">
                  {[
                    { code: 'W', label: 'Bianco (W)', cls: 'mana-w' },
                    { code: 'U', label: 'Blu (U)', cls: 'mana-u' },
                    { code: 'B', label: 'Nero (B)', cls: 'mana-b' },
                    { code: 'R', label: 'Rosso (R)', cls: 'mana-r' },
                    { code: 'G', label: 'Verde (G)', cls: 'mana-g' },
                  ].map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      className={`color-toggle-btn ${c.cls} ${
                        randomColors.includes(c.code) ? 'selected' : ''
                      }`}
                      onClick={() =>
                        toggleColorInList(c.code, randomColors, setRandomColors)
                      }
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {room.isCommander && (
                <div className="form-field">
                  <label>
                    Oppure scegli un Comandante specifico (lascia vuoto per casuale)
                  </label>
                  <div className="search-bar-inline">
                    <input
                      type="text"
                      placeholder="Cerca creatura leggendaria (es. Kaalia, Lathril, Ur-Dragon)..."
                      value={randomCommanderQuery}
                      onChange={(e) => setRandomCommanderQuery(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === 'Enter' && handleSearchRandomCommanders()
                      }
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleSearchRandomCommanders}
                    >
                      <Search size={15} /> Cerca Leggendarie
                    </button>
                  </div>

                  {selectedRandomCommander && (
                    <div className="selected-cmd-pill">
                      <Crown size={14} /> Comandante scelto:{' '}
                      <strong>{selectedRandomCommander}</strong>
                      <button
                        type="button"
                        className="btn-clear-inline"
                        onClick={() => setSelectedRandomCommander('')}
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {randomCommanderResults.length > 0 && (
                    <div className="random-cmd-grid">
                      {randomCommanderResults.map((c) => (
                        <div
                          key={c.name}
                          className={`random-cmd-card ${
                            selectedRandomCommander === c.name ? 'active' : ''
                          }`}
                          onClick={() => setSelectedRandomCommander(c.name)}
                        >
                          <img src={c.imageUrl} alt={c.name} loading="lazy" />
                          <div className="random-cmd-info">
                            <strong>{c.name}</strong>
                            <ManaCostDisplay text={c.manaCost} size="sm" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="modal-footer-bar">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={loading}
                  onClick={handleApplyRandomDeck}
                >
                  <Dice5 size={16} />{' '}
                  {loading
                    ? 'Generazione Mazzo in corso...'
                    : room.isCommander
                    ? 'Genera Mazzo Commander 100 Carte'
                    : 'Genera Mazzo Casuale 60 Carte'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: FULL DECKBUILDER */}
        {activeTab === 'BUILDER' && (
          <div className="deck-tab-body builder-layout">
            {/* Left: Card Database Search */}
            <div className="builder-search-pane">
              <div className="builder-filters-bar">
                <input
                  type="text"
                  placeholder="Cerca per nome o testo Oracle (es. Counterspell, Sol Ring, Dragon)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runDeckbuilderSearch()}
                />
                <select
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value)}
                >
                  <option value="">Tutti i Tipi</option>
                  <option value="Creature">Creature</option>
                  <option value="Instant">Istantanei</option>
                  <option value="Sorcery">Stregonerie</option>
                  <option value="Artifact">Artefatti</option>
                  <option value="Enchantment">Incantesimi</option>
                  <option value="Planeswalker">Planeswalker</option>
                  <option value="Land">Terre</option>
                </select>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={commanderOnlyFilter}
                    onChange={(e) => setCommanderOnlyFilter(e.target.checked)}
                  />
                  Solo Comandanti
                </label>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={runDeckbuilderSearch}
                  disabled={searchingCards}
                >
                  <Search size={15} /> Cerca
                </button>
              </div>

              <div className="color-filter-mini">
                {['W', 'U', 'B', 'R', 'G', 'C'].map((col) => (
                  <button
                    key={col}
                    type="button"
                    className={`mini-color-btn ${
                      searchColors.includes(col) ? 'active' : ''
                    }`}
                    onClick={() =>
                      toggleColorInList(col, searchColors, setSearchColors)
                    }
                  >
                    {col}
                  </button>
                ))}
              </div>

              <div className="builder-results-grid">
                {searchResults.map((card) => (
                  <div
                    key={`${card.name}-${card.setCode}`}
                    className={`builder-card-tile ${
                      inspectedSearchCard?.name === card.name ? 'inspected' : ''
                    }`}
                    onClick={() => setInspectedSearchCard(card)}
                  >
                    <div className="tile-img-wrap">
                      <img
                        src={card.imageUrl}
                        alt={card.name}
                        loading="lazy"
                        onError={(e) => {
                          if (
                            card.scryfallFallbackUrl &&
                            e.currentTarget.src !== card.scryfallFallbackUrl
                          ) {
                            e.currentTarget.src = card.scryfallFallbackUrl;
                          }
                        }}
                      />
                    </div>
                    <div className="tile-meta">
                      <div className="tile-title-row">
                        <span className="tile-name">{card.name}</span>
                        <ManaCostDisplay text={card.manaCost} size="sm" />
                      </div>
                      <span className="tile-type">{card.type}</span>
                      <div className="tile-actions">
                        <button
                          type="button"
                          className="btn-tile-add"
                          onClick={(e) => {
                            e.stopPropagation();
                            addCardToBuilderMain(card, 1);
                          }}
                        >
                          <Plus size={12} /> Mazzo
                        </button>
                        {card.canBeCommander && (
                          <button
                            type="button"
                            className="btn-tile-cmd"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCardAsBuilderCommander(card);
                            }}
                          >
                            <Crown size={12} /> Cmd
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Current Deck in Construction & Inspector */}
            <div className="builder-deck-pane">
              {inspectedSearchCard && (
                <div className="builder-inspector-mini">
                  <img
                    src={inspectedSearchCard.imageUrl}
                    alt={inspectedSearchCard.name}
                    onError={(e) => {
                      if (inspectedSearchCard.scryfallFallbackUrl) {
                        e.currentTarget.src = inspectedSearchCard.scryfallFallbackUrl;
                      }
                    }}
                  />
                  <div className="builder-inspector-text">
                    <h4>{inspectedSearchCard.name}</h4>
                    <div className="inspector-sub">
                      <span>{inspectedSearchCard.type}</span>
                      <ManaCostDisplay text={inspectedSearchCard.manaCost} size="sm" />
                    </div>
                    <OracleTextDisplay text={inspectedSearchCard.oracleText} />
                  </div>
                </div>
              )}

              <div className="builder-deck-header">
                <input
                  type="text"
                  value={builderDeckName}
                  onChange={(e) => setBuilderDeckName(e.target.value)}
                  className="builder-name-input"
                />
                <button
                  type="button"
                  className="btn-ghost-sm"
                  onClick={autoFillLandsInBuilder}
                  title="Riempie i posti rimanenti con terre base"
                >
                  + Riempi Terre Base
                </button>
              </div>

              <div className="builder-list-scroll">
                <div className="deck-section-group">
                  <h4>
                    Comandante ({builderCommanders.length})
                  </h4>
                  {builderCommanders.length === 0 ? (
                    <p className="muted-hint">
                      Nessun Comandante selezionato. Clicca &quot;Cmd&quot; su una creatura
                      leggendaria.
                    </p>
                  ) : (
                    builderCommanders.map((c) => (
                      <div key={c.name} className="deck-line-row commander-row">
                        <Crown size={13} className="gold-icon" />
                        <span className="deck-line-name">{c.name}</span>
                        <button
                          type="button"
                          className="btn-line-del"
                          onClick={() => setBuilderCommanders([])}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="deck-section-group">
                  <h4>
                    Mazzo Principale ({totalBuilderMain} /{' '}
                    {room.isCommander ? 99 : 60} carte)
                  </h4>
                  {builderMain.map((c) => (
                    <div key={c.name} className="deck-line-row">
                      <div className="qty-controls">
                        <button
                          type="button"
                          onClick={() => updateBuilderMainCount(c.name, -1)}
                        >
                          -
                        </button>
                        <span>{c.count}</span>
                        <button
                          type="button"
                          onClick={() => updateBuilderMainCount(c.name, 1)}
                        >
                          +
                        </button>
                      </div>
                      <span className="deck-line-name">{c.name}</span>
                      <ManaCostDisplay text={c.manaCost} size="sm" />
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="btn-primary full-width"
                disabled={loading}
                onClick={handleApplyBuilderDeck}
              >
                <Check size={16} /> Salva e Usa Questo Mazzo ({totalBuilderMain + builderCommanders.length} carte)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
