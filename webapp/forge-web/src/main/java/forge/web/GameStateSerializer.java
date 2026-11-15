package forge.web;

import com.google.common.collect.Multiset;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.card.ColorSet;
import forge.card.mana.ManaAtom;
import forge.game.GameEntityView;
import forge.game.GameLog;
import forge.game.GameLogEntry;
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.card.CardView.CardStateView;
import forge.game.card.CounterType;
import forge.game.combat.CombatView;
import forge.game.keyword.KeywordCollectionView;
import forge.game.keyword.KeywordView;
import forge.game.phase.PhaseType;
import forge.game.player.PlayerView;
import forge.game.spellability.StackItemView;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.Selection;
import forge.item.PaperCard;
import forge.util.ImageUtil;
import forge.util.collect.FCollectionView;

import java.util.*;

/**
 * Serializes {@link GameView}, {@link PlayerView}, {@link CardView}, {@link StackItemView},
 * {@link CombatView}, and {@link WebGuiGame} prompt/selection state into JSON for a specific player.
 * Enforces hidden-information security via {@link CardView#canBeShownTo(PlayerView)} and
 * {@link CardView#canFaceDownBeShownTo(PlayerView)}.
 */
public class GameStateSerializer {

    public static JsonObject serializeForPlayer(GameView gameView, WebGuiGame gui, PlayerView viewer) {
        JsonObject root = new JsonObject();
        if (gameView == null) {
            root.addProperty("active", false);
            return root;
        }

        root.addProperty("active", true);
        root.addProperty("gameId", gameView.getId());
        root.addProperty("title", gameView.getTitle() != null ? gameView.getTitle() : "");
        root.addProperty("isCommander", gameView.isCommander());
        root.addProperty("gameType", gameView.getGameType() != null ? gameView.getGameType().name() : "Constructed");
        root.addProperty("turn", gameView.getTurn());

        PhaseType phase = gameView.getPhase();
        root.addProperty("phase", phase != null ? phase.name() : "");
        root.addProperty("phaseLabel", phase != null ? phase.nameForUi : "");

        PlayerView playerTurn = gameView.getPlayerTurn();
        root.addProperty("playerTurnId", playerTurn != null ? playerTurn.getId() : -1);
        root.addProperty("playerTurnName", playerTurn != null ? playerTurn.getName() : "");

        root.addProperty("isMulligan", gameView.isMulligan());
        root.addProperty("isGameOver", gameView.isGameOver());
        root.addProperty("isMatchOver", gameView.isMatchOver());
        root.addProperty("winningPlayerName", gameView.getWinningPlayerName() != null ? gameView.getWinningPlayerName() : "");
        root.addProperty("stormCount", gameView.getStormCount());
        root.addProperty("poisonCountersToLose", gameView.getPoisonCountersToLose());
        root.addProperty("numPlayedGamesInMatch", gameView.getNumPlayedGamesInMatch());
        root.addProperty("numGamesInMatch", gameView.getNumGamesInMatch());
        root.addProperty("viewerPlayerId", viewer != null ? viewer.getId() : -1);

        Selection selection = gui != null ? gui.getSelection() : Selection.NONE;
        Set<Integer> selectableCardIds = new HashSet<>();
        Set<Integer> selectablePlayerIds = new HashSet<>();
        Set<Integer> selectableStackIds = new HashSet<>();
        Set<Integer> chosenIds = new HashSet<>();
        Map<Integer, Integer> actionableCardStrength = new HashMap<>();

        if (selection != null) {
            if (selection.cards() != null) {
                for (CardView cv : selection.cards()) {
                    if (cv != null) selectableCardIds.add(cv.getId());
                }
            }
            if (selection.targets() != null) {
                for (Object t : selection.targets()) {
                    if (t instanceof PlayerView pv) selectablePlayerIds.add(pv.getId());
                    else if (t instanceof StackItemView siv) selectableStackIds.add(siv.getId());
                    else if (t instanceof CardView cv) selectableCardIds.add(cv.getId());
                }
            }
            if (selection.chosen() != null) {
                for (Object c : selection.chosen()) {
                    if (c instanceof GameEntityView gev) chosenIds.add(gev.getId());
                }
            }
            if (selection.actionable() != null) {
                for (CardView cv : selection.actionable()) {
                    if (cv != null) {
                        actionableCardStrength.merge(cv.getId(), 1, Integer::sum);
                    }
                }
            }
        }

        // Combat snapshot
        CombatView combat = gameView.getCombat();
        Map<Integer, Integer> attackerToDefenderId = new HashMap<>();
        Map<Integer, String> attackerToDefenderName = new HashMap<>();
        Map<Integer, List<Integer>> attackerToBlockerIds = new HashMap<>();
        Map<Integer, String> blockerToAttackerName = new HashMap<>();
        JsonArray combatBands = new JsonArray();

        if (combat != null) {
            try {
                for (CardView attacker : combat.getAttackers()) {
                    if (attacker == null) continue;
                    GameEntityView defender = combat.getDefender(attacker);
                    int defId = defender != null ? defender.getId() : -1;
                    String defName = defender != null ? defender.getName() : "";
                    attackerToDefenderId.put(attacker.getId(), defId);
                    attackerToDefenderName.put(attacker.getId(), defName);

                    List<Integer> blockerIds = new ArrayList<>();
                    JsonArray blockerObjs = new JsonArray();
                    FCollectionView<CardView> blockers = combat.getBlockers(attacker);
                    if (blockers == null || blockers.isEmpty()) {
                        blockers = combat.getPlannedBlockers(attacker);
                    }
                    if (blockers != null) {
                        for (CardView b : blockers) {
                            if (b != null) {
                                blockerIds.add(b.getId());
                                blockerToAttackerName.put(b.getId(), attacker.getName());
                                JsonObject bo = new JsonObject();
                                bo.addProperty("id", b.getId());
                                bo.addProperty("name", b.getName());
                                CardStateView bs = b.getCurrentState();
                                bo.addProperty("power", bs != null ? bs.getPower() : 0);
                                bo.addProperty("toughness", bs != null ? bs.getToughness() : 0);
                                blockerObjs.add(bo);
                            }
                        }
                    }
                    attackerToBlockerIds.put(attacker.getId(), blockerIds);

                    CardStateView as = attacker.getCurrentState();
                    JsonObject bandObj = new JsonObject();
                    bandObj.addProperty("attackerId", attacker.getId());
                    bandObj.addProperty("attackerName", attacker.getName());
                    bandObj.addProperty("attackerPower", as != null ? as.getPower() : 0);
                    bandObj.addProperty("attackerToughness", as != null ? as.getToughness() : 0);
                    bandObj.addProperty("defenderId", defId);
                    bandObj.addProperty("defenderName", defName);
                    JsonArray bArr = new JsonArray();
                    for (int bid : blockerIds) bArr.add(bid);
                    bandObj.add("blockerIds", bArr);
                    bandObj.add("blockers", blockerObjs);
                    combatBands.add(bandObj);
                }
            } catch (Exception ignored) {
            }
        }
        root.add("combat", combatBands);

        // Players
        JsonArray playersArr = new JsonArray();
        FCollectionView<PlayerView> allPlayers = gameView.getPlayers();
        if (allPlayers != null) {
            for (PlayerView pv : allPlayers) {
                if (pv == null) continue;
                playersArr.add(serializePlayer(
                        pv,
                        allPlayers,
                        viewer,
                        playerTurn,
                        selectableCardIds,
                        selectablePlayerIds,
                        chosenIds,
                        actionableCardStrength,
                        attackerToDefenderId,
                        attackerToDefenderName,
                        attackerToBlockerIds,
                        blockerToAttackerName
                ));
            }
        }
        root.add("players", playersArr);

        // Stack
        JsonArray stackArr = new JsonArray();
        FCollectionView<StackItemView> stack = gameView.getStack();
        if (stack != null) {
            for (StackItemView siv : stack) {
                if (siv == null) continue;
                stackArr.add(serializeStackItem(siv, viewer, selectableStackIds));
            }
        }
        root.add("stack", stackArr);

        // Game Log (last 60 chronological entries)
        JsonArray logArr = new JsonArray();
        GameLog gameLog = gameView.getGameLog();
        if (gameLog != null) {
            List<GameLogEntry> entries = gameLog.getAllEntries();
            int start = Math.max(0, entries.size() - 60);
            for (int i = start; i < entries.size(); i++) {
                GameLogEntry entry = entries.get(i);
                if (entry == null) continue;
                JsonObject lObj = new JsonObject();
                lObj.addProperty("type", entry.type() != null ? entry.type().name() : "INFO");
                lObj.addProperty("message", entry.message() != null ? entry.message() : "");
                logArr.add(lObj);
            }
        }
        root.add("gameLog", logArr);

        // Active prompt & controls for this viewer
        if (gui != null) {
            root.add("prompt", gui.serializePromptState());
            JsonObject modal = gui.serializePendingModal(viewer);
            if (modal != null) {
                root.add("pendingModal", modal);
            }
            root.add("yieldState", gui.serializeYieldState());
        }

        return root;
    }

    private static JsonObject serializePlayer(
            PlayerView pv,
            FCollectionView<PlayerView> allPlayers,
            PlayerView viewer,
            PlayerView playerTurn,
            Set<Integer> selectableCardIds,
            Set<Integer> selectablePlayerIds,
            Set<Integer> chosenIds,
            Map<Integer, Integer> actionableCardStrength,
            Map<Integer, Integer> attackerToDefenderId,
            Map<Integer, String> attackerToDefenderName,
            Map<Integer, List<Integer>> attackerToBlockerIds,
            Map<Integer, String> blockerToAttackerName
    ) {
        JsonObject pObj = new JsonObject();
        pObj.addProperty("id", pv.getId());
        pObj.addProperty("name", pv.getName());
        pObj.addProperty("lobbyPlayerName", pv.getLobbyPlayerName() != null ? pv.getLobbyPlayerName() : pv.getName());
        pObj.addProperty("isAI", pv.isAI());
        pObj.addProperty("isViewer", viewer != null && pv.getId() == viewer.getId());
        pObj.addProperty("life", pv.getLife());
        pObj.addProperty("hasPriority", pv.getHasPriority());
        pObj.addProperty("isTurn", playerTurn != null && pv.getId() == playerTurn.getId());
        pObj.addProperty("hasLost", pv.getHasLost());
        pObj.addProperty("hasAvailableActions", pv.hasAvailableActions());
        pObj.addProperty("landsPlayedThisTurn", pv.getNumLandThisTurn());
        pObj.addProperty("maxLandPlay", pv.getMaxLandPlay());
        pObj.addProperty("unlimitedLandPlay", pv.hasUnlimitedLandPlay());
        pObj.addProperty("numDrawnThisTurn", pv.getNumDrawnThisTurn());
        pObj.addProperty("maxHandSize", pv.getMaxHandSize());
        pObj.addProperty("unlimitedHandSize", pv.hasUnlimitedHandSize());
        pObj.addProperty("preventNextDamage", pv.getPreventNextDamage());
        pObj.addProperty("isSelectable", selectablePlayerIds.contains(pv.getId()));
        pObj.addProperty("isSelected", chosenIds.contains(pv.getId()));
        pObj.addProperty("details", pv.getDetails() != null ? pv.getDetails() : "");

        // Player counters (Poison, Energy, Experience, etc.)
        JsonObject countersObj = new JsonObject();
        Multiset<CounterType> counters = pv.getCounters();
        int poison = 0;
        int energy = 0;
        int experience = 0;
        if (counters != null) {
            for (Multiset.Entry<CounterType> entry : counters.entrySet()) {
                if (entry.getCount() > 0 && entry.getElement() != null) {
                    String cName = entry.getElement().getName();
                    countersObj.addProperty(cName, entry.getCount());
                    if ("POISON".equalsIgnoreCase(cName)) poison = entry.getCount();
                    else if ("ENERGY".equalsIgnoreCase(cName)) energy = entry.getCount();
                    else if ("EXPERIENCE".equalsIgnoreCase(cName)) experience = entry.getCount();
                }
            }
        }
        pObj.add("counters", countersObj);
        pObj.addProperty("poisonCounters", poison);
        pObj.addProperty("energyCounters", energy);
        pObj.addProperty("experienceCounters", experience);

        // Mana pool
        JsonObject manaObj = new JsonObject();
        int w = pv.getMana((byte) ManaAtom.WHITE);
        int u = pv.getMana((byte) ManaAtom.BLUE);
        int b = pv.getMana((byte) ManaAtom.BLACK);
        int r = pv.getMana((byte) ManaAtom.RED);
        int g = pv.getMana((byte) ManaAtom.GREEN);
        int c = pv.getMana((byte) ManaAtom.COLORLESS);
        manaObj.addProperty("W", w);
        manaObj.addProperty("U", u);
        manaObj.addProperty("B", b);
        manaObj.addProperty("R", r);
        manaObj.addProperty("G", g);
        manaObj.addProperty("C", c);
        manaObj.addProperty("total", w + u + b + r + g + c);
        pObj.add("manaPool", manaObj);

        // Commanders & Commander Damage received by this player
        JsonArray commandersArr = new JsonArray();
        List<CardView> commanders = pv.getCommanders();
        if (commanders != null) {
            for (CardView cmdr : commanders) {
                if (cmdr == null) continue;
                JsonObject cObj = serializeCard(
                        cmdr, viewer, selectableCardIds, chosenIds, actionableCardStrength,
                        attackerToDefenderId, attackerToDefenderName, attackerToBlockerIds, blockerToAttackerName, true
                );
                int castCount = pv.getCommanderCast(cmdr);
                cObj.addProperty("commanderCastCount", castCount);
                cObj.addProperty("commanderTax", castCount * 2);
                commandersArr.add(cObj);
            }
        }
        pObj.add("commanders", commandersArr);

        JsonArray cmdDamageArr = new JsonArray();
        if (allPlayers != null) {
            for (PlayerView other : allPlayers) {
                if (other == null || other.getCommanders() == null) continue;
                for (CardView cmdr : other.getCommanders()) {
                    if (cmdr == null) continue;
                    int dmg = pv.getCommanderDamage(cmdr);
                    if (dmg > 0 || other.getId() != pv.getId()) {
                        JsonObject dObj = new JsonObject();
                        dObj.addProperty("commanderId", cmdr.getId());
                        dObj.addProperty("commanderName", cmdr.getName());
                        dObj.addProperty("ownerId", other.getId());
                        dObj.addProperty("ownerName", other.getName());
                        dObj.addProperty("damage", dmg);
                        cmdDamageArr.add(dObj);
                    }
                }
            }
        }
        pObj.add("commanderDamage", cmdDamageArr);

        // Zone counts
        pObj.addProperty("handCount", pv.getZoneSize(ZoneType.Hand));
        pObj.addProperty("libraryCount", pv.getZoneSize(ZoneType.Library));
        pObj.addProperty("graveyardCount", pv.getZoneSize(ZoneType.Graveyard));
        pObj.addProperty("exileCount", pv.getZoneSize(ZoneType.Exile));
        pObj.addProperty("commandCount", pv.getZoneSize(ZoneType.Command));
        pObj.addProperty("flashbackCount", pv.getZoneSize(ZoneType.Flashback));
        pObj.addProperty("sideboardCount", pv.getZoneSize(ZoneType.Sideboard));

        // Zones
        pObj.add("hand", serializeZoneCards(
                pv.getHand(), viewer, selectableCardIds, chosenIds, actionableCardStrength,
                attackerToDefenderId, attackerToDefenderName, attackerToBlockerIds, blockerToAttackerName
        ));
        pObj.add("battlefield", serializeZoneCards(
                pv.getBattlefield(), viewer, selectableCardIds, chosenIds, actionableCardStrength,
                attackerToDefenderId, attackerToDefenderName, attackerToBlockerIds, blockerToAttackerName
        ));
        pObj.add("command", serializeZoneCards(
                pv.getCommand(), viewer, selectableCardIds, chosenIds, actionableCardStrength,
                attackerToDefenderId, attackerToDefenderName, attackerToBlockerIds, blockerToAttackerName
        ));
        pObj.add("graveyard", serializeZoneCards(
                pv.getGraveyard(), viewer, selectableCardIds, chosenIds, actionableCardStrength,
                attackerToDefenderId, attackerToDefenderName, attackerToBlockerIds, blockerToAttackerName
        ));
        pObj.add("exile", serializeZoneCards(
                pv.getExile(), viewer, selectableCardIds, chosenIds, actionableCardStrength,
                attackerToDefenderId, attackerToDefenderName, attackerToBlockerIds, blockerToAttackerName
        ));
        pObj.add("flashback", serializeZoneCards(
                pv.getFlashback(), viewer, selectableCardIds, chosenIds, actionableCardStrength,
                attackerToDefenderId, attackerToDefenderName, attackerToBlockerIds, blockerToAttackerName
        ));

        return pObj;
    }

    private static JsonArray serializeZoneCards(
            FCollectionView<CardView> cards,
            PlayerView viewer,
            Set<Integer> selectableCardIds,
            Set<Integer> chosenIds,
            Map<Integer, Integer> actionableCardStrength,
            Map<Integer, Integer> attackerToDefenderId,
            Map<Integer, String> attackerToDefenderName,
            Map<Integer, List<Integer>> attackerToBlockerIds,
            Map<Integer, String> blockerToAttackerName
    ) {
        JsonArray arr = new JsonArray();
        if (cards == null) return arr;
        for (CardView cv : cards) {
            if (cv == null) continue;
            arr.add(serializeCard(
                    cv, viewer, selectableCardIds, chosenIds, actionableCardStrength,
                    attackerToDefenderId, attackerToDefenderName, attackerToBlockerIds, blockerToAttackerName, false
            ));
        }
        return arr;
    }

    public static JsonObject serializeCard(
            CardView cv,
            PlayerView viewer,
            Set<Integer> selectableCardIds,
            Set<Integer> chosenIds,
            Map<Integer, Integer> actionableCardStrength,
            Map<Integer, Integer> attackerToDefenderId,
            Map<Integer, String> attackerToDefenderName,
            Map<Integer, List<Integer>> attackerToBlockerIds,
            boolean forceVisible
    ) {
        return serializeCard(
                cv, viewer, selectableCardIds, chosenIds, actionableCardStrength,
                attackerToDefenderId, attackerToDefenderName, attackerToBlockerIds, null, forceVisible
        );
    }

    public static JsonObject serializeCard(
            CardView cv,
            PlayerView viewer,
            Set<Integer> selectableCardIds,
            Set<Integer> chosenIds,
            Map<Integer, Integer> actionableCardStrength,
            Map<Integer, Integer> attackerToDefenderId,
            Map<Integer, String> attackerToDefenderName,
            Map<Integer, List<Integer>> attackerToBlockerIds,
            Map<Integer, String> blockerToAttackerName,
            boolean forceVisible
    ) {
        JsonObject cObj = new JsonObject();
        cObj.addProperty("id", cv.getId());
        ZoneType zone = cv.getZone();
        cObj.addProperty("zone", zone != null ? zone.name() : "");
        cObj.addProperty("ownerId", cv.getOwner() != null ? cv.getOwner().getId() : -1);
        cObj.addProperty("controllerId", cv.getController() != null ? cv.getController().getId() : -1);
        cObj.addProperty("tapped", cv.isTapped());
        cObj.addProperty("sick", cv.isSick());
        cObj.addProperty("attacking", cv.isAttacking());
        cObj.addProperty("blocking", cv.isBlocking());
        cObj.addProperty("faceDown", cv.isFaceDown());
        cObj.addProperty("token", cv.isToken());
        cObj.addProperty("isEmblem", cv.isEmblem());
        cObj.addProperty("isCommander", cv.isCommander());
        cObj.addProperty("isSelectable", selectableCardIds != null && selectableCardIds.contains(cv.getId()));
        cObj.addProperty("isSelected", chosenIds != null && chosenIds.contains(cv.getId()));
        int actStrength = actionableCardStrength != null ? actionableCardStrength.getOrDefault(cv.getId(), 0) : 0;
        cObj.addProperty("isActionable", actStrength > 0);
        cObj.addProperty("actionableStrength", actStrength);

        boolean canShow = forceVisible || viewer == null || cv.canBeShownTo(viewer);
        if (!canShow) {
            cObj.addProperty("hidden", true);
            cObj.addProperty("name", "Carta Coperta");
            cObj.addProperty("oracleName", "");
            cObj.addProperty("manaCost", "");
            cObj.addProperty("type", "");
            cObj.addProperty("oracleText", "");
            cObj.addProperty("fullText", "");
            cObj.addProperty("imageUrl", "https://cards.scryfall.io/back.png");
            return cObj;
        }

        cObj.addProperty("hidden", false);
        CardStateView state = cv.getCurrentState();
        boolean canPeekFaceDown = cv.isFaceDown() && viewer != null && cv.canFaceDownBeShownTo(viewer);
        if (cv.isFaceDown() && !canPeekFaceDown && zone == ZoneType.Battlefield) {
            // Morph / Manifested card on battlefield controlled by opponent
            cObj.addProperty("name", "Creatura Coperta (2/2)");
            cObj.addProperty("oracleName", "");
            cObj.addProperty("manaCost", "");
            cObj.addProperty("type", "Creature");
            cObj.addProperty("power", state != null ? state.getPower() : 2);
            cObj.addProperty("toughness", state != null ? state.getToughness() : 2);
            cObj.addProperty("oracleText", "Permanente a faccia in giù");
            cObj.addProperty("fullText", "Permanente a faccia in giù");
            cObj.addProperty("imageUrl", "https://cards.scryfall.io/back.png");
            return cObj;
        }

        String displayName = cv.getName() != null && !cv.getName().isEmpty()
                ? cv.getName()
                : (state != null ? state.getName() : "");
        String oracleName = cv.getOracleName() != null && !cv.getOracleName().isEmpty()
                ? cv.getOracleName()
                : (state != null && state.getOracleName() != null ? state.getOracleName() : displayName);

        // If face-down on battlefield or exile and viewer is allowed to peek at its front face
        if (cv.isFaceDown() && canPeekFaceDown && cv.getAlternateState() != null) {
            CardStateView alt = cv.getAlternateState();
            if (displayName.isEmpty() && alt.getName() != null) {
                displayName = alt.getName() + " (Coperta)";
                oracleName = alt.getOracleName() != null ? alt.getOracleName() : alt.getName();
            }
        }

        cObj.addProperty("name", displayName);
        cObj.addProperty("oracleName", oracleName);

        if (state != null) {
            cObj.addProperty("manaCost", state.getManaCost() != null ? state.getManaCost().toString() : "");
            cObj.addProperty("cmc", state.getManaCost() != null ? state.getManaCost().getCMC() : 0);
            cObj.addProperty("type", state.getType() != null ? state.getType().toString() : "");
            cObj.addProperty("isCreature", state.isCreature());
            cObj.addProperty("isLand", state.isLand());
            cObj.addProperty("isPlaneswalker", state.isPlaneswalker());
            cObj.addProperty("isArtifact", state.isArtifact());
            cObj.addProperty("isEnchantment", state.isEnchantment());
            cObj.addProperty("power", state.getPower());
            cObj.addProperty("toughness", state.getToughness());
            cObj.addProperty("loyalty", state.getLoyalty() != null ? state.getLoyalty() : "");
            cObj.addProperty("defense", state.getDefense() != null ? state.getDefense() : "");
            cObj.addProperty("setCode", state.getSetCode() != null ? state.getSetCode() : "");
            cObj.addProperty("oracleText", state.getOracleText() != null ? state.getOracleText() : "");
            cObj.addProperty("abilityText", state.getAbilityText() != null ? state.getAbilityText() : "");
            ColorSet colors = state.getColors();
            cObj.add("colors", DeckCatalogService.serializeColorSet(colors));

            JsonArray kwArr = new JsonArray();
            KeywordCollectionView kws = state.getKeywords();
            if (kws != null) {
                for (KeywordView kw : kws.getValues()) {
                    if (kw != null && kw.title() != null) {
                        kwArr.add(kw.title());
                    }
                }
            }
            cObj.add("keywords", kwArr);

            String imageKey = state.getTrackableImageKey();
            String imageUrl = resolveImageUrl(imageKey, oracleName);
            cObj.addProperty("imageUrl", imageUrl);
            cObj.addProperty("fallbackImageUrl", DeckCatalogService.buildScryfallNamedUrl(oracleName, false));
            cObj.addProperty("artCropUrl", DeckCatalogService.buildScryfallNamedUrl(oracleName, true));
        }

        // Alternate face (DFC / Transform / Modal DFC / Adventure)
        if (cv.hasAlternateState() && cv.getAlternateState() != null) {
            CardStateView alt = cv.getAlternateState();
            String altName = alt.getName() != null ? alt.getName() : "";
            String altOracleName = alt.getOracleName() != null && !alt.getOracleName().isEmpty() ? alt.getOracleName() : altName;
            cObj.addProperty("hasAlternateState", true);
            cObj.addProperty("alternateName", altName);
            cObj.addProperty("alternateManaCost", alt.getManaCost() != null ? alt.getManaCost().toString() : "");
            cObj.addProperty("alternateType", alt.getType() != null ? alt.getType().toString() : "");
            cObj.addProperty("alternateOracleText", alt.getOracleText() != null ? alt.getOracleText() : "");
            cObj.addProperty("alternatePower", alt.getPower());
            cObj.addProperty("alternateToughness", alt.getToughness());
            cObj.addProperty("alternateImageUrl", resolveImageUrl(alt.getTrackableImageKey(), altOracleName));
        } else {
            cObj.addProperty("hasAlternateState", false);
        }

        cObj.addProperty("damage", cv.getDamage());
        cObj.addProperty("fullText", cv.getText() != null ? cv.getText() : "");

        // Counters on card (+1/+1, Loyalty, Charge, Stun, Shield, etc.)
        JsonObject countersObj = new JsonObject();
        Multiset<CounterType> counters = cv.getCounters();
        if (counters != null) {
            for (Multiset.Entry<CounterType> entry : counters.entrySet()) {
                if (entry.getCount() > 0 && entry.getElement() != null) {
                    countersObj.addProperty(entry.getElement().getName(), entry.getCount());
                }
            }
        }
        cObj.add("counters", countersObj);

        // Attachments
        CardView attachedTo = cv.getAttachedTo();
        cObj.addProperty("attachedToCardId", attachedTo != null ? attachedTo.getId() : -1);
        PlayerView enchantedPlayer = cv.getEnchantedPlayer();
        cObj.addProperty("enchantedPlayerId", enchantedPlayer != null ? enchantedPlayer.getId() : -1);

        JsonArray attachedCardsArr = new JsonArray();
        List<CardView> attached = cv.getAttachedCards();
        if (attached != null) {
            for (CardView a : attached) {
                if (a != null) attachedCardsArr.add(a.getId());
            }
        }
        cObj.add("attachedCardIds", attachedCardsArr);

        // Combat associations
        if (attackerToDefenderId != null && attackerToDefenderId.containsKey(cv.getId())) {
            cObj.addProperty("defendingEntityId", attackerToDefenderId.get(cv.getId()));
            cObj.addProperty("defendingEntityName", attackerToDefenderName.getOrDefault(cv.getId(), ""));
            JsonArray bArr = new JsonArray();
            List<Integer> bIds = attackerToBlockerIds.get(cv.getId());
            if (bIds != null) {
                for (int bid : bIds) bArr.add(bid);
            }
            cObj.add("blockedByIds", bArr);
        }
        if (blockerToAttackerName != null && blockerToAttackerName.containsKey(cv.getId())) {
            cObj.addProperty("blockingAttackerName", blockerToAttackerName.get(cv.getId()));
        }

        return cObj;
    }

    private static JsonObject serializeStackItem(StackItemView siv, PlayerView viewer, Set<Integer> selectableStackIds) {
        JsonObject sObj = new JsonObject();
        sObj.addProperty("id", siv.getId());
        sObj.addProperty("text", siv.getText() != null ? siv.getText() : "");
        sObj.addProperty("isAbility", siv.isAbility());
        sObj.addProperty("isTrigger", siv.isTrigger());
        sObj.addProperty("optionalCostString", siv.getOptionalCostString() != null ? siv.getOptionalCostString() : "");
        sObj.addProperty("isSelectable", selectableStackIds != null && selectableStackIds.contains(siv.getId()));

        PlayerView activating = siv.getActivatingPlayer();
        sObj.addProperty("activatingPlayerId", activating != null ? activating.getId() : -1);
        sObj.addProperty("activatingPlayerName", activating != null ? activating.getName() : "");

        CardView source = siv.getSourceCard();
        if (source != null) {
            sObj.add("sourceCard", serializeCard(source, viewer, null, null, null, null, null, null, null, true));
        }

        JsonArray targetCardIds = new JsonArray();
        JsonArray targetCardsArr = new JsonArray();
        FCollectionView<CardView> targetCards = siv.getTargetCards();
        if (targetCards != null) {
            for (CardView tc : targetCards) {
                if (tc != null) {
                    targetCardIds.add(tc.getId());
                    JsonObject tco = new JsonObject();
                    tco.addProperty("id", tc.getId());
                    tco.addProperty("name", tc.getName() != null ? tc.getName() : "Carta");
                    targetCardsArr.add(tco);
                }
            }
        }
        sObj.add("targetCardIds", targetCardIds);
        sObj.add("targetCards", targetCardsArr);

        JsonArray targetPlayerIds = new JsonArray();
        JsonArray targetPlayersArr = new JsonArray();
        FCollectionView<PlayerView> targetPlayers = siv.getTargetPlayers();
        if (targetPlayers != null) {
            for (PlayerView tp : targetPlayers) {
                if (tp != null) {
                    targetPlayerIds.add(tp.getId());
                    JsonObject tpo = new JsonObject();
                    tpo.addProperty("id", tp.getId());
                    tpo.addProperty("name", tp.getName() != null ? tp.getName() : "Giocatore");
                    targetPlayersArr.add(tpo);
                }
            }
        }
        sObj.add("targetPlayerIds", targetPlayerIds);
        sObj.add("targetPlayers", targetPlayersArr);

        return sObj;
    }

    private static String resolveImageUrl(String imageKey, String oracleName) {
        if (imageKey != null && imageKey.startsWith("c:")) {
            try {
                PaperCard pc = ImageUtil.getPaperCardFromImageKey(imageKey);
                if (pc != null) {
                    return DeckCatalogService.buildScryfallUrlForPaperCard(pc, false);
                }
            } catch (Exception ignored) {
            }
        }
        if (oracleName != null && !oracleName.isEmpty()) {
            return DeckCatalogService.buildScryfallNamedUrl(oracleName, false);
        }
        return "https://cards.scryfall.io/back.png";
    }
}
