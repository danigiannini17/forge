package forge.web;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import forge.StaticData;
import forge.card.CardDb;
import forge.card.CardEdition;
import forge.card.CardRules;
import forge.card.ColorSet;
import forge.card.MagicColor;
import forge.deck.CardPool;
import forge.deck.Deck;
import forge.deck.DeckFormat;
import forge.deck.DeckSection;
import forge.deck.DeckgenUtil;
import forge.deck.io.DeckSerializer;
import forge.game.GameType;
import forge.item.PaperCard;
import forge.localinstance.properties.ForgeConstants;
import forge.model.FModel;
import forge.util.ImageUtil;
import forge.util.MyRandom;
import org.apache.commons.lang3.StringUtils;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Manages all deck operations for the WebApp:
 * 1. Preconstructed / Commander / Theme / AI deck catalog from Forge's {@code res/} directory.
 * 2. Importing/parsing text decklists (MTG Arena, MTGO, Moxfield, Forge .dck).
 * 3. Generating random Commander or Constructed decks via {@link DeckgenUtil} and color identity builders.
 * 4. Card database search and custom Deckbuilder serialization.
 */
public class DeckCatalogService {

    public record CatalogDeckEntry(
            String id,
            String name,
            String category,
            String commanderName,
            String edition,
            File file
    ) {}

    private static final Pattern LINE_PATTERN = Pattern.compile(
            "^\\s*(\\d+)\\s*x?\\s+([^(\\[|]+?)(?:\\s*\\(([A-Za-z0-9]+)\\)\\s*([A-Za-z0-9★†-]+)?)?(?:\\|([A-Za-z0-9]+)(?:\\|(\\d+))?)?\\s*$"
    );

    private final Map<String, CatalogDeckEntry> catalogById = new LinkedHashMap<>();
    private final List<CatalogDeckEntry> commanderDecks = new ArrayList<>();
    private final List<CatalogDeckEntry> preconDecks = new ArrayList<>();
    private final List<CatalogDeckEntry> themeDecks = new ArrayList<>();
    private final Map<String, File> cardScriptFilesByLowerName = new ConcurrentHashMap<>();
    private final Map<String, PaperCard> cardByLowerName = new ConcurrentHashMap<>();
    private volatile boolean catalogInitialized = false;

    public synchronized void initializeCatalog(String assetsDir) {
        if (catalogInitialized) {
            return;
        }
        File resDir = new File(assetsDir, "res");
        scanDeckFolder(new File(resDir, "quest/commanderprecons"), "Commander", commanderDecks);
        scanDeckFolder(new File(resDir, "quest/precons"), "Precon", preconDecks);
        scanDeckFolder(new File(resDir, "quest/themes"), "Theme", themeDecks);
        scanDeckFolder(new File(resDir, "geneticaidecks"), "Competitive", preconDecks);

        // Index card script files for instant lookup even while background full load is running
        File cardsFolder = new File(resDir, "cardsfolder");
        if (cardsFolder.isDirectory()) {
            File[] subDirs = cardsFolder.listFiles();
            if (subDirs != null) {
                for (File sub : subDirs) {
                    if (sub.isDirectory()) {
                        File[] scripts = sub.listFiles((d, name) -> name.endsWith(".txt"));
                        if (scripts != null) {
                            for (File script : scripts) {
                                String base = script.getName().substring(0, script.getName().length() - 4).replace('_', ' ');
                                cardScriptFilesByLowerName.put(base.toLowerCase(Locale.ROOT), script);
                            }
                        }
                    }
                }
            }
        }
        catalogInitialized = true;
        System.out.println("[DeckCatalogService] Indexed " + catalogById.size() + " built-in decks ("
                + commanderDecks.size() + " Commander, " + preconDecks.size() + " Precon/Competitive, "
                + themeDecks.size() + " Theme).");
    }

    private void scanDeckFolder(File folder, String category, List<CatalogDeckEntry> targetList) {
        if (folder == null || !folder.isDirectory()) {
            return;
        }
        File[] files = folder.listFiles((dir, name) -> name.endsWith(".dck"));
        if (files == null) {
            return;
        }
        Arrays.sort(files, Comparator.comparing(File::getName, String.CASE_INSENSITIVE_ORDER));
        for (File f : files) {
            String fileName = f.getName();
            String baseName = fileName.substring(0, fileName.length() - 4);
            String commander = "";
            String edition = "";
            Matcher m = Pattern.compile("\\[([A-Z0-9]{2,5})]").matcher(baseName);
            if (m.find()) {
                edition = m.group(1);
            }
            // Peek first 25 lines to extract Name and [Commander]
            try (BufferedReader br = new BufferedReader(new FileReader(f, StandardCharsets.UTF_8))) {
                String line;
                boolean inCommander = false;
                int lines = 0;
                while ((line = br.readLine()) != null && lines++ < 30) {
                    line = line.trim();
                    if (line.startsWith("Name=")) {
                        baseName = line.substring(5).trim();
                    } else if (line.equalsIgnoreCase("[Commander]")) {
                        inCommander = true;
                    } else if (line.startsWith("[")) {
                        inCommander = false;
                    } else if (inCommander && !line.isEmpty()) {
                        String cleaned = line.replaceFirst("^\\d+\\s+", "");
                        int pipeIdx = cleaned.indexOf('|');
                        if (pipeIdx > 0) {
                            cleaned = cleaned.substring(0, pipeIdx);
                        }
                        commander = cleaned.trim();
                        inCommander = false;
                    }
                }
            } catch (Exception ignored) {
            }
            String id = category.toLowerCase(Locale.ROOT) + ":" + f.getName();
            CatalogDeckEntry entry = new CatalogDeckEntry(id, baseName, category, commander, edition, f);
            catalogById.put(id, entry);
            targetList.add(entry);
        }
    }

    public JsonObject getCatalogJson(String categoryFilter, String searchQuery, int limit) {
        JsonObject res = new JsonObject();
        JsonArray arr = new JsonArray();
        String q = searchQuery != null ? searchQuery.trim().toLowerCase(Locale.ROOT) : "";
        int count = 0;
        for (CatalogDeckEntry e : catalogById.values()) {
            if (categoryFilter != null && !categoryFilter.isEmpty() && !categoryFilter.equalsIgnoreCase("ALL")) {
                if (!e.category().equalsIgnoreCase(categoryFilter)) {
                    continue;
                }
            }
            if (!q.isEmpty()) {
                boolean matchName = e.name().toLowerCase(Locale.ROOT).contains(q);
                boolean matchCmdr = e.commanderName() != null && e.commanderName().toLowerCase(Locale.ROOT).contains(q);
                boolean matchEd = e.edition() != null && e.edition().toLowerCase(Locale.ROOT).contains(q);
                if (!matchName && !matchCmdr && !matchEd) {
                    continue;
                }
            }
            JsonObject obj = new JsonObject();
            obj.addProperty("id", e.id());
            obj.addProperty("name", e.name());
            obj.addProperty("category", e.category());
            obj.addProperty("commanderName", e.commanderName());
            obj.addProperty("edition", e.edition());
            if (e.commanderName() != null && !e.commanderName().isEmpty()) {
                obj.addProperty("commanderImageUrl", buildScryfallNamedUrl(e.commanderName(), false));
            }
            arr.add(obj);
            if (++count >= limit) {
                break;
            }
        }
        res.add("decks", arr);
        res.addProperty("totalCommanderDecks", commanderDecks.size());
        res.addProperty("totalPreconDecks", preconDecks.size());
        res.addProperty("totalThemeDecks", themeDecks.size());
        return res;
    }

    public Deck loadCatalogDeck(String deckId) {
        CatalogDeckEntry entry = catalogById.get(deckId);
        if (entry == null) {
            return null;
        }
        Deck deck = DeckSerializer.fromFile(entry.file());
        if (deck != null) {
            // Touch sections so deferred sections are resolved immediately
            deck.getMain().countAll();
            if (deck.has(DeckSection.Commander)) {
                deck.get(DeckSection.Commander).countAll();
            }
        }
        return deck;
    }

    public Deck getDefaultDeckForFormat(boolean isCommander) {
        if (isCommander && !commanderDecks.isEmpty()) {
            CatalogDeckEntry pick = commanderDecks.get(MyRandom.getRandom().nextInt(commanderDecks.size()));
            Deck d = loadCatalogDeck(pick.id());
            if (d != null) return d;
        }
        if (!preconDecks.isEmpty()) {
            CatalogDeckEntry pick = preconDecks.get(MyRandom.getRandom().nextInt(preconDecks.size()));
            Deck d = loadCatalogDeck(pick.id());
            if (d != null) return d;
        }
        return generateRandomDeck(isCommander, Collections.emptyList(), null);
    }

    /**
     * Generates a random deck for either Commander or Constructed.
     */
    public Deck generateRandomDeck(boolean isCommander, List<String> colors, String specificCommanderName) {
        if (isCommander) {
            // If specific commander was requested, build around that commander
            if (specificCommanderName != null && !specificCommanderName.isBlank()) {
                PaperCard cmdr = resolvePaperCard(specificCommanderName.trim(), null);
                if (cmdr != null) {
                    return buildFastCommanderDeck(cmdr);
                }
            }
            // If user wants a random Commander deck and didn't specify custom colors, or if we want fast generation:
            if ((colors == null || colors.isEmpty()) && !commanderDecks.isEmpty() && MyRandom.getRandom().nextBoolean()) {
                CatalogDeckEntry pick = commanderDecks.get(MyRandom.getRandom().nextInt(commanderDecks.size()));
                Deck precon = loadCatalogDeck(pick.id());
                if (precon != null) {
                    return precon;
                }
            }
            try {
                Deck generated = DeckgenUtil.generateCommanderDeck(true, GameType.Commander);
                if (generated != null && generated.getMain().countAll() >= 90) {
                    return generated;
                }
            } catch (Exception e) {
                System.err.println("[DeckCatalogService] Fallback to fast Commander builder: " + e.getMessage());
            }
            if (!commanderDecks.isEmpty()) {
                CatalogDeckEntry pick = commanderDecks.get(MyRandom.getRandom().nextInt(commanderDecks.size()));
                return loadCatalogDeck(pick.id());
            }
        }

        // Constructed deck generation
        List<String> colorSelection = new ArrayList<>();
        if (colors != null && !colors.isEmpty()) {
            for (String c : colors) {
                switch (c.trim().toUpperCase(Locale.ROOT)) {
                    case "W", "WHITE" -> colorSelection.add("White");
                    case "U", "BLUE" -> colorSelection.add("Blue");
                    case "B", "BLACK" -> colorSelection.add("Black");
                    case "R", "RED" -> colorSelection.add("Red");
                    case "G", "GREEN" -> colorSelection.add("Green");
                }
            }
        }
        if (colorSelection.isEmpty()) {
            colorSelection.add("Random");
            colorSelection.add("Random");
        } else if (colorSelection.size() == 4) {
            colorSelection.remove(3); // Forge DeckGenerator supports 1, 2, 3, or 5 colors
        }
        try {
            return DeckgenUtil.buildColorDeck(colorSelection, null, true);
        } catch (Exception e) {
            if (!preconDecks.isEmpty()) {
                return loadCatalogDeck(preconDecks.get(0).id());
            }
            return buildBasicFallbackDeck();
        }
    }

    /**
     * Builds a 99+1 Commander deck matching a specific Commander's color identity.
     */
    private Deck buildFastCommanderDeck(PaperCard commander) {
        Deck deck = new Deck("Commander - " + commander.getName());
        deck.getOrCreate(DeckSection.Commander).add(commander, 1);

        ColorSet identity = commander.getRules().getColorIdentity();
        List<PaperCard> candidates = new ArrayList<>();
        for (PaperCard pc : FModel.getMagicDb().getCommonCards().getUniqueCards()) {
            CardRules rules = pc.getRules();
            if (rules == null || rules.getType().isLand() || rules.isVariant() || rules.isUnsupported()) {
                continue;
            }
            if (pc.getName().equalsIgnoreCase(commander.getName())) {
                continue;
            }
            if (rules.getColorIdentity().hasNoColorsExcept(identity)) {
                candidates.add(pc);
            }
        }
        Collections.shuffle(candidates, MyRandom.getRandom());
        int nonLandsNeeded = 62;
        Set<String> usedNames = new HashSet<>();
        usedNames.add(commander.getName());
        for (PaperCard pc : candidates) {
            if (deck.getMain().countAll() >= nonLandsNeeded) {
                break;
            }
            if (usedNames.add(pc.getName())) {
                deck.getMain().add(pc, 1);
            }
        }
        // Add basic lands matching identity
        List<String> basicNames = new ArrayList<>();
        if (identity.hasWhite()) basicNames.add("Plains");
        if (identity.hasBlue()) basicNames.add("Island");
        if (identity.hasBlack()) basicNames.add("Swamp");
        if (identity.hasRed()) basicNames.add("Mountain");
        if (identity.hasGreen()) basicNames.add("Forest");
        if (basicNames.isEmpty()) basicNames.add("Wastes");

        int remainingLands = 99 - deck.getMain().countAll();
        for (int i = 0; i < remainingLands; i++) {
            String basic = basicNames.get(i % basicNames.size());
            PaperCard land = resolvePaperCard(basic, null);
            if (land != null) {
                deck.getMain().add(land, 1);
            }
        }
        return deck;
    }

    private Deck buildBasicFallbackDeck() {
        Deck deck = new Deck("Fallback Red Deck");
        PaperCard mountain = resolvePaperCard("Mountain", null);
        PaperCard bolt = resolvePaperCard("Lightning Bolt", null);
        if (mountain != null) deck.getMain().add(mountain, 24);
        if (bolt != null) deck.getMain().add(bolt, 36);
        return deck;
    }

    /**
     * Parses a user-submitted decklist text (MTG Arena, MTGO, Moxfield, or .dck format).
     */
    public Deck parseDeckFromText(String deckName, String decklistText, String explicitCommander, boolean isCommanderFormat, List<String> warningsOut) {
        String finalName = GameRoom.sanitizeText(deckName, 60, "Custom Deck");
        Deck deck = new Deck(finalName);
        if (decklistText == null || decklistText.isBlank()) {
            warningsOut.add("Lista mazzo vuota.");
            return deck;
        }
        String safeText = decklistText.length() > 50_000 ? decklistText.substring(0, 50_000) : decklistText;

        DeckSection currentSection = DeckSection.Main;
        String[] lines = safeText.split("\\r?\\n");
        int maxLines = Math.min(lines.length, 400);
        int totalCardsAdded = 0;

        for (int idx = 0; idx < maxLines; idx++) {
            if (totalCardsAdded >= 250) {
                warningsOut.add("Limite massimo di 250 carte per mazzo raggiunto.");
                break;
            }
            String line = lines[idx].trim();
            if (line.isEmpty() || line.startsWith("#") || line.startsWith("//")) {
                continue;
            }
            if (line.startsWith("Name=")) {
                if (deckName == null || deckName.isBlank()) {
                    deck.setName(GameRoom.sanitizeText(line.substring(5), 60, "Custom Deck"));
                }
                continue;
            }
            if (line.equalsIgnoreCase("[metadata]") || line.contains("=")) {
                continue;
            }
            String lower = line.toLowerCase(Locale.ROOT);
            if (lower.equals("[commander]") || lower.equals("commander") || lower.equals("commander:")) {
                currentSection = DeckSection.Commander;
                continue;
            } else if (lower.equals("[main]") || lower.equals("deck") || lower.equals("deck:") || lower.equals("maindeck") || lower.equals("main:")) {
                currentSection = DeckSection.Main;
                continue;
            } else if (lower.equals("[sideboard]") || lower.equals("sideboard") || lower.equals("sideboard:")) {
                currentSection = DeckSection.Sideboard;
                continue;
            } else if (line.startsWith("[") && line.endsWith("]")) {
                currentSection = DeckSection.Main;
                continue;
            }

            int count = 1;
            String cardName = line;
            String setCode = null;
            Matcher m = LINE_PATTERN.matcher(line);
            if (m.matches()) {
                try {
                    count = Integer.parseInt(m.group(1));
                } catch (NumberFormatException e) {
                    count = 1;
                }
                cardName = m.group(2).trim();
                if (m.group(3) != null) {
                    setCode = m.group(3).trim();
                } else if (m.group(5) != null) {
                    setCode = m.group(5).trim();
                }
            } else {
                // Try simple "1 Card Name"
                Matcher simple = Pattern.compile("^(\\d+)\\s*x?\\s+(.+)$").matcher(line);
                if (simple.matches()) {
                    try {
                        count = Integer.parseInt(simple.group(1));
                    } catch (NumberFormatException e) {
                        count = 1;
                    }
                    cardName = simple.group(2).trim();
                }
            }
            count = Math.max(1, Math.min(99, count));

            // Strip any trailing tags like *CMDR* or [Commander]
            boolean markedCmdr = cardName.contains("*CMDR*") || cardName.toLowerCase(Locale.ROOT).endsWith("[commander]");
            cardName = cardName.replace("*CMDR*", "").replaceAll("(?i)\\[commander]", "").trim();

            PaperCard pc = resolvePaperCard(cardName, setCode);
            if (pc == null) {
                warningsOut.add("Carta non trovata: " + cardName);
                continue;
            }
            DeckSection targetSection = markedCmdr ? DeckSection.Commander : currentSection;
            int allowed = Math.min(count, 250 - totalCardsAdded);
            if (allowed > 0) {
                deck.getOrCreate(targetSection).add(pc, allowed);
                totalCardsAdded += allowed;
            }
        }

        if (explicitCommander != null && !explicitCommander.isBlank()) {
            PaperCard cmdr = resolvePaperCard(explicitCommander.trim(), null);
            if (cmdr != null) {
                deck.getMain().removeAll(cmdr);
                CardPool cmdPool = deck.getOrCreate(DeckSection.Commander);
                if (cmdPool.count(cmdr) == 0) {
                    cmdPool.add(cmdr, 1);
                }
            }
        } else if (isCommanderFormat && (!deck.has(DeckSection.Commander) || deck.get(DeckSection.Commander).countAll() == 0)) {
            // Auto-detect a legendary creature/planeswalker if the user pasted a 100-card list without a [Commander] header
            PaperCard candidate = null;
            for (Map.Entry<PaperCard, Integer> entry : deck.getMain()) {
                PaperCard pc = entry.getKey();
                if (pc.getRules() != null && pc.getRules().canBeCommander()) {
                    candidate = pc;
                    break;
                }
            }
            if (candidate != null) {
                deck.getMain().remove(candidate, 1);
                deck.getOrCreate(DeckSection.Commander).add(candidate, 1);
            }
        }

        return deck;
    }

    /**
     * Builds a Deck from a structured JSON object sent by the Deckbuilder UI.
     */
    public Deck buildDeckFromJson(JsonObject payload, List<String> warningsOut) {
        String rawName = payload.has("name") && !payload.get("name").isJsonNull()
                ? payload.get("name").getAsString()
                : "Custom Deck";
        String name = GameRoom.sanitizeText(rawName, 60, "Custom Deck");
        Deck deck = new Deck(name);

        addSectionFromJson(deck, DeckSection.Commander, payload.getAsJsonArray("commander"), warningsOut);
        addSectionFromJson(deck, DeckSection.Main, payload.getAsJsonArray("main"), warningsOut);
        addSectionFromJson(deck, DeckSection.Sideboard, payload.getAsJsonArray("sideboard"), warningsOut);
        return deck;
    }

    private void addSectionFromJson(Deck deck, DeckSection section, JsonArray arr, List<String> warningsOut) {
        if (arr == null) return;
        int totalInSection = 0;
        int maxEntries = Math.min(arr.size(), 250);
        for (int i = 0; i < maxEntries; i++) {
            if (totalInSection >= 250) break;
            JsonElement el = arr.get(i);
            if (!el.isJsonObject()) continue;
            JsonObject item = el.getAsJsonObject();
            String cardName = item.has("name") ? item.get("name").getAsString() : "";
            int count = item.has("count") ? item.get("count").getAsInt() : 1;
            String setCode = item.has("setCode") && !item.get("setCode").isJsonNull() ? item.get("setCode").getAsString() : null;
            if (cardName.isEmpty() || count <= 0) continue;
            int clamped = Math.min(Math.max(1, count), Math.min(99, 250 - totalInSection));
            PaperCard pc = resolvePaperCard(cardName, setCode);
            if (pc != null) {
                deck.getOrCreate(section).add(pc, clamped);
                totalInSection += clamped;
            } else {
                warningsOut.add("Carta non trovata: " + cardName);
            }
        }
    }

    public void rebuildCardNameIndex() {
        try {
            CardDb common = FModel.getMagicDb().getCommonCards();
            for (PaperCard pc : common.getUniqueCards()) {
                if (pc != null && pc.getName() != null) {
                    cardByLowerName.putIfAbsent(pc.getName().toLowerCase(Locale.ROOT), pc);
                }
            }
        } catch (Exception ignored) {
        }
    }

    public PaperCard resolvePaperCard(String cardName, String setCode) {
        if (cardName == null || cardName.isBlank()) {
            return null;
        }
        String clean = cardName.trim();
        String cleanLower = clean.toLowerCase(Locale.ROOT);
        StaticData data = StaticData.instance();
        CardDb common = data.getCommonCards();

        if (setCode == null || setCode.isBlank()) {
            PaperCard cached = cardByLowerName.get(cleanLower);
            if (cached != null) return cached;
        }

        try {
            if (setCode != null && !setCode.isBlank()) {
                PaperCard pc = common.getCard(clean, setCode.trim());
                if (pc != null) return pc;
            }
            PaperCard pc = data.fetchCard(clean);
            if (pc != null) {
                cardByLowerName.putIfAbsent(cleanLower, pc);
                return pc;
            }
        } catch (Exception ignored) {
        }

        PaperCard pc = common.getCard(clean);
        if (pc != null) {
            cardByLowerName.putIfAbsent(cleanLower, pc);
            return pc;
        }

        // If the card uses split syntax like "Fire // Ice", try left half or normalized name
        if (clean.contains("//")) {
            String left = clean.split("//")[0].trim();
            pc = data.fetchCard(left);
            if (pc != null) {
                cardByLowerName.putIfAbsent(cleanLower, pc);
                return pc;
            }
        }

        // Case-insensitive search across currently loaded cards (and populate cache)
        for (PaperCard candidate : common.getUniqueCards()) {
            if (candidate.getName() != null) {
                cardByLowerName.putIfAbsent(candidate.getName().toLowerCase(Locale.ROOT), candidate);
                if (candidate.getName().equalsIgnoreCase(clean)) {
                    return candidate;
                }
            }
        }
        return null;
    }

    /**
     * Searches the Forge card database for the Deckbuilder UI.
     */
    public JsonArray searchCards(String query, String colorsCsv, String typeFilter, boolean commanderOnly, int limit) {
        JsonArray results = new JsonArray();
        String q = query != null ? query.trim().toLowerCase(Locale.ROOT) : "";

        // If user typed a specific card name while lazy loading is active, pre-fetch matching scripts
        if (q.length() >= 2) {
            int preloaded = 0;
            for (Map.Entry<String, File> entry : cardScriptFilesByLowerName.entrySet()) {
                if (entry.getKey().contains(q)) {
                    StaticData.instance().attemptToLoadCard(entry.getKey());
                    if (++preloaded >= limit * 2) {
                        break;
                    }
                }
            }
        }

        byte colorMask = 0;
        boolean filterColorless = false;
        if (colorsCsv != null && !colorsCsv.isBlank()) {
            for (String part : colorsCsv.split(",")) {
                switch (part.trim().toUpperCase(Locale.ROOT)) {
                    case "W" -> colorMask |= MagicColor.WHITE;
                    case "U" -> colorMask |= MagicColor.BLUE;
                    case "B" -> colorMask |= MagicColor.BLACK;
                    case "R" -> colorMask |= MagicColor.RED;
                    case "G" -> colorMask |= MagicColor.GREEN;
                    case "C" -> filterColorless = true;
                }
            }
        }
        String tf = typeFilter != null ? typeFilter.trim().toLowerCase(Locale.ROOT) : "";

        CardDb common = FModel.getMagicDb().getCommonCards();
        List<PaperCard> matches = new ArrayList<>();

        for (PaperCard pc : common.getUniqueCards()) {
            CardRules rules = pc.getRules();
            if (rules == null || rules.isVariant() || rules.isUnsupported()) {
                continue;
            }
            if (commanderOnly && !rules.canBeCommander()) {
                continue;
            }
            if (!tf.isEmpty() && !rules.getType().toString().toLowerCase(Locale.ROOT).contains(tf)) {
                continue;
            }
            if (filterColorless && !rules.getColor().isColorless()) {
                continue;
            }
            if (colorMask != 0 && !rules.getColorIdentity().hasAllColors(colorMask)) {
                continue;
            }
            if (!q.isEmpty()) {
                String nameLower = pc.getName().toLowerCase(Locale.ROOT);
                String oracleLower = rules.getMainPart().getOracleText() != null
                        ? rules.getMainPart().getOracleText().toLowerCase(Locale.ROOT)
                        : "";
                String typeLower = rules.getType().toString().toLowerCase(Locale.ROOT);
                if (!nameLower.contains(q) && !oracleLower.contains(q) && !typeLower.contains(q)) {
                    continue;
                }
            }
            matches.add(pc);
            if (matches.size() >= limit * 3) {
                break;
            }
        }

        // Sort exact/prefix name matches first
        if (!q.isEmpty()) {
            matches.sort((a, b) -> {
                String na = a.getName().toLowerCase(Locale.ROOT);
                String nb = b.getName().toLowerCase(Locale.ROOT);
                boolean exactA = na.equals(q);
                boolean exactB = nb.equals(q);
                if (exactA != exactB) return exactA ? -1 : 1;
                boolean prefA = na.startsWith(q);
                boolean prefB = nb.startsWith(q);
                if (prefA != prefB) return prefA ? -1 : 1;
                return na.compareTo(nb);
            });
        } else {
            matches.sort(Comparator.comparing(PaperCard::getName));
        }

        int count = 0;
        for (PaperCard pc : matches) {
            results.add(serializePaperCard(pc));
            if (++count >= limit) {
                break;
            }
        }
        return results;
    }

    public static JsonObject serializePaperCard(PaperCard pc) {
        JsonObject obj = new JsonObject();
        CardRules rules = pc.getRules();
        obj.addProperty("name", pc.getName());
        obj.addProperty("setCode", pc.getEdition());
        obj.addProperty("collectorNumber", pc.getCollectorNumber());
        obj.addProperty("manaCost", rules.getManaCost() != null ? rules.getManaCost().toString() : "");
        obj.addProperty("cmc", rules.getManaCost() != null ? rules.getManaCost().getCMC() : 0);
        obj.addProperty("type", rules.getType().toString());
        obj.addProperty("oracleText", rules.getMainPart().getOracleText() != null ? rules.getMainPart().getOracleText() : "");
        obj.addProperty("power", rules.getMainPart().getPower() != null ? rules.getMainPart().getPower() : "");
        obj.addProperty("toughness", rules.getMainPart().getToughness() != null ? rules.getMainPart().getToughness() : "");
        obj.addProperty("loyalty", rules.getMainPart().getInitialLoyalty() != null ? rules.getMainPart().getInitialLoyalty() : "");
        obj.addProperty("canBeCommander", rules.canBeCommander());
        obj.addProperty("isLand", rules.getType().isLand());
        obj.addProperty("isCreature", rules.getType().isCreature());
        obj.add("colorIdentity", serializeColorSet(rules.getColorIdentity()));
        obj.addProperty("imageUrl", buildScryfallUrlForPaperCard(pc, false, false));
        obj.addProperty("fallbackImageUrl", buildScryfallNamedUrl(pc.getName(), false, false));
        return obj;
    }

    public static JsonArray serializeColorSet(ColorSet cs) {
        JsonArray arr = new JsonArray();
        if (cs == null) return arr;
        if (cs.hasWhite()) arr.add("W");
        if (cs.hasBlue()) arr.add("U");
        if (cs.hasBlack()) arr.add("B");
        if (cs.hasRed()) arr.add("R");
        if (cs.hasGreen()) arr.add("G");
        return arr;
    }

    public static String buildScryfallUrlForPaperCard(PaperCard pc, boolean artCrop) {
        return buildScryfallUrlForPaperCard(pc, artCrop, false);
    }

    public static String buildScryfallUrlForPaperCard(PaperCard pc, boolean artCrop, boolean backFace) {
        if (pc == null) return "";
        try {
            CardEdition ed = StaticData.instance().getEditions().get(pc.getEdition());
            if (ed != null && StringUtils.isNotBlank(ed.getScryfallCode())
                    && StringUtils.isNotBlank(pc.getCollectorNumber())
                    && !"-1".equals(pc.getCollectorNumber())) {
                String path = ImageUtil.getScryfallDownloadUrl(pc, backFace ? "back" : "", ed.getScryfallCode(), "en", artCrop);
                return ForgeConstants.URL_PIC_SCRYFALL_DOWNLOAD + path;
            }
        } catch (Exception ignored) {
        }
        return buildScryfallNamedUrl(pc.getName(), artCrop, backFace);
    }

    public static String buildScryfallNamedUrl(String cardName, boolean artCrop) {
        return buildScryfallNamedUrl(cardName, artCrop, false);
    }

    public static String buildScryfallNamedUrl(String cardName, boolean artCrop, boolean backFace) {
        if (cardName == null || cardName.isBlank()) return "";
        String clean = cardName.trim();
        String encoded = URLEncoder.encode(clean, StandardCharsets.UTF_8);
        String version = artCrop ? "art_crop" : "normal";
        return "https://api.scryfall.com/cards/named?exact=" + encoded + "&format=image&version=" + version
                + (backFace ? "&face=back" : "");
    }

    /**
     * Serializes a full Forge {@link Deck} into JSON for the Lobby / Deckbuilder UI.
     */
    public static JsonObject serializeDeck(Deck deck) {
        JsonObject obj = new JsonObject();
        if (deck == null) {
            return obj;
        }
        obj.addProperty("name", deck.getName());
        CardPool cmdPool = deck.get(DeckSection.Commander);
        CardPool mainPool = deck.getMain();
        CardPool sidePool = deck.get(DeckSection.Sideboard);

        JsonArray commanders = new JsonArray();
        ColorSet combinedIdentity = ColorSet.C;
        byte identityMask = 0;

        StringBuilder deckText = new StringBuilder();
        if (cmdPool != null && !cmdPool.isEmpty()) {
            deckText.append("[Commander]\n");
            for (Map.Entry<PaperCard, Integer> e : cmdPool) {
                PaperCard pc = e.getKey();
                int count = e.getValue();
                JsonObject cObj = serializePaperCard(pc);
                cObj.addProperty("count", count);
                commanders.add(cObj);
                if (pc.getRules() != null && pc.getRules().getColorIdentity() != null) {
                    identityMask |= pc.getRules().getColorIdentity().getColor();
                }
                deckText.append(count).append(" ").append(pc.getName()).append("\n");
            }
            deckText.append("\n");
        }

        JsonArray mainCards = new JsonArray();
        if (mainPool != null && !mainPool.isEmpty()) {
            deckText.append("[Main]\n");
            for (Map.Entry<PaperCard, Integer> e : mainPool) {
                PaperCard pc = e.getKey();
                int count = e.getValue();
                JsonObject cObj = serializePaperCard(pc);
                cObj.addProperty("count", count);
                mainCards.add(cObj);
                if (pc.getRules() != null && pc.getRules().getColorIdentity() != null) {
                    identityMask |= pc.getRules().getColorIdentity().getColor();
                }
                deckText.append(count).append(" ").append(pc.getName()).append("\n");
            }
        }

        JsonArray sideCards = new JsonArray();
        if (sidePool != null && !sidePool.isEmpty()) {
            deckText.append("\n[Sideboard]\n");
            for (Map.Entry<PaperCard, Integer> e : sidePool) {
                PaperCard pc = e.getKey();
                int count = e.getValue();
                JsonObject cObj = serializePaperCard(pc);
                cObj.addProperty("count", count);
                sideCards.add(cObj);
                deckText.append(count).append(" ").append(pc.getName()).append("\n");
            }
        }

        combinedIdentity = ColorSet.fromMask(identityMask);
        obj.add("commander", commanders);
        obj.add("main", mainCards);
        obj.add("sideboard", sideCards);
        obj.addProperty("commanderCount", cmdPool != null ? cmdPool.countAll() : 0);
        obj.addProperty("mainCount", mainPool != null ? mainPool.countAll() : 0);
        obj.addProperty("sideboardCount", sidePool != null ? sidePool.countAll() : 0);
        obj.add("colorIdentity", serializeColorSet(combinedIdentity));
        obj.addProperty("deckText", deckText.toString().trim());

        // Check legality hints (informational, non-blocking)
        String commanderProblem = DeckFormat.Commander.getDeckConformanceProblem(deck);
        String constructedProblem = DeckFormat.Constructed.getDeckConformanceProblem(deck);
        obj.addProperty("isCommanderLegal", commanderProblem == null);
        obj.addProperty("commanderLegalityNote", commanderProblem != null ? commanderProblem : "Valido per Commander");
        obj.addProperty("isConstructedLegal", constructedProblem == null);
        obj.addProperty("constructedLegalityNote", constructedProblem != null ? constructedProblem : "Valido per Constructed");
        return obj;
    }
}
