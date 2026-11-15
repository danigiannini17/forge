package forge.web;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import forge.LobbyPlayer;
import forge.card.MagicColor;
import forge.card.mana.ManaAtom;
import forge.deck.CardPool;
import forge.game.GameEntityView;
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.event.GameEvent;
import forge.game.phase.PhaseType;
import forge.game.player.DelayedReveal;
import forge.game.player.IHasIcon;
import forge.game.player.PlayerView;
import forge.game.spellability.SpellAbilityView;
import forge.game.spellability.StackItemView;
import forge.gamemodes.match.AbstractGuiGame;
import forge.gamemodes.match.Selection;
import forge.gamemodes.match.YieldController;
import forge.gamemodes.match.YieldUpdate;
import forge.interfaces.IGameController;
import forge.item.PaperCard;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.localinstance.skin.FSkinProp;
import forge.player.PlayerControllerHuman;
import forge.player.PlayerZoneUpdate;
import forge.trackable.TrackableCollection;
import forge.util.FSerializableFunction;
import forge.util.ITriggerEvent;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Per-player Web implementation of {@link forge.gui.interfaces.IGuiGame} extending {@link AbstractGuiGame}.
 * Connects a human player's browser WebSocket to their {@link PlayerControllerHuman} inside {@link forge.gamemodes.match.HostedMatch}.
 */
public class WebGuiGame extends AbstractGuiGame {

    public static class PendingModal {
        public final String requestId;
        public final String modalType;
        public final JsonObject payload;
        public final CompletableFuture<JsonObject> future = new CompletableFuture<>();

        public PendingModal(String requestId, String modalType, JsonObject payload) {
            this.requestId = requestId;
            this.modalType = modalType;
            this.payload = payload;
        }
    }

    private final GameRoom room;
    private final String sessionToken;
    private final int slotIndex;
    private final ExecutorService actionExecutor;
    private final AtomicLong modalSeq = new AtomicLong(1);

    private volatile String promptMessage = "";
    private volatile int promptCardId = -1;
    private volatile String okLabel = "OK";
    private volatile String cancelLabel = "Pass / End Turn";
    private volatile boolean okEnabled = false;
    private volatile boolean cancelEnabled = false;
    private volatile boolean focusOk = false;
    private volatile boolean undoAvailable = false;
    private volatile String lastNotification = null;

    private volatile PendingModal currentModal = null;
    private final Set<PhaseType> skippedOwnPhases = ConcurrentHashMap.newKeySet();
    private final Set<PhaseType> skippedOpponentPhases = ConcurrentHashMap.newKeySet();
    private volatile boolean autoPassNoActions = false;

    public WebGuiGame(GameRoom room, String sessionToken, int slotIndex) {
        this.room = room;
        this.sessionToken = sessionToken;
        this.slotIndex = slotIndex;
        this.actionExecutor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "WebGuiGame-Action-" + room.getRoomId() + "-Slot" + slotIndex);
            t.setDaemon(true);
            return t;
        });
        // Default phase skips for smooth gameplay (can be toggled by user in UI)
        skippedOwnPhases.add(PhaseType.UPKEEP);
        skippedOwnPhases.add(PhaseType.DRAW);
        skippedOwnPhases.add(PhaseType.COMBAT_BEGIN);
        skippedOwnPhases.add(PhaseType.COMBAT_END);
        skippedOwnPhases.add(PhaseType.END_OF_TURN);
        skippedOwnPhases.add(PhaseType.CLEANUP);

        skippedOpponentPhases.add(PhaseType.UPKEEP);
        skippedOpponentPhases.add(PhaseType.DRAW);
        skippedOpponentPhases.add(PhaseType.MAIN1);
        skippedOpponentPhases.add(PhaseType.COMBAT_BEGIN);
        skippedOpponentPhases.add(PhaseType.COMBAT_END);
        skippedOpponentPhases.add(PhaseType.MAIN2);
        skippedOpponentPhases.add(PhaseType.CLEANUP);
    }

    public String getSessionToken() {
        return sessionToken;
    }

    public int getSlotIndex() {
        return slotIndex;
    }

    public void shutdown() {
        PendingModal modal = this.currentModal;
        if (modal != null && !modal.future.isDone()) {
            JsonObject cancelObj = new JsonObject();
            cancelObj.addProperty("cancelled", true);
            modal.future.complete(cancelObj);
        }
        actionExecutor.shutdownNow();
    }

    private void notifyStateChanged() {
        room.broadcastGameState();
    }

    @Override
    protected void updateCurrentPlayer(PlayerView player) {
        notifyStateChanged();
    }

    @Override
    public void openView(TrackableCollection<PlayerView> myPlayers) {
        GameView gv = getGameView();
        if (gv != null && gv.getGameLog() == null) {
            gv.initGameLog();
        }
        if (myPlayers != null && !myPlayers.isEmpty()) {
            PlayerView first = myPlayers.get(0);
            if (first != null && getCurrentPlayer() == null) {
                try {
                    setCurrentPlayer(first);
                } catch (Exception ignored) {
                }
            }
        }
        notifyStateChanged();
    }

    @Override
    public void showCombat() {
        notifyStateChanged();
    }

    @Override
    public void showPromptMessage(PlayerView playerView, String message, CardView card) {
        this.promptMessage = message != null ? message : "";
        this.promptCardId = card != null ? card.getId() : -1;
        notifyStateChanged();
    }

    @Override
    public void showPromptMessageNoCancel(PlayerView playerView, String message) {
        this.promptMessage = message != null ? message : "";
        notifyStateChanged();
    }

    @Override
    public void updateButtons(PlayerView owner, String label1, String label2, boolean enable1, boolean enable2, boolean focus1) {
        updateButtons(owner, label1, label2, enable1, enable2, focus1, false);
    }

    @Override
    public void updateButtons(PlayerView owner, String label1, String label2, boolean enable1, boolean enable2, boolean focus1, boolean undoAvailable) {
        this.okLabel = label1 != null ? label1 : "OK";
        this.cancelLabel = label2 != null ? label2 : "Annulla";
        this.okEnabled = enable1;
        this.cancelEnabled = enable2;
        this.focusOk = focus1;
        this.undoAvailable = undoAvailable;
        notifyStateChanged();
    }

    @Override
    public void setSelection(Selection next) {
        super.setSelection(next != null ? next : Selection.NONE);
        notifyStateChanged();
    }

    @Override
    public void flashIncorrectAction() {
        notifyStateChanged();
    }

    @Override
    public void alertUser() {
        notifyStateChanged();
    }

    @Override
    public void finishGame() {
        notifyStateChanged();
    }

    @Override
    public void updatePhase(boolean saveState) {
        notifyStateChanged();
    }

    @Override
    public void updateTurn(PlayerView player) {
        notifyStateChanged();
    }

    @Override
    public void updatePlayerControl() {
        notifyStateChanged();
    }

    @Override
    public void updateStack() {
        notifyStateChanged();
    }

    @Override
    public void updateZones(Iterable<PlayerZoneUpdate> zonesToUpdate) {
        notifyStateChanged();
    }

    @Override
    public void updateCards(Iterable<CardView> cards) {
        notifyStateChanged();
    }

    @Override
    public void updateManaPool(Iterable<PlayerView> manaPoolUpdate) {
        notifyStateChanged();
    }

    @Override
    public void updateLives(Iterable<PlayerView> livesUpdate) {
        notifyStateChanged();
    }

    @Override
    public void refreshField() {
        notifyStateChanged();
    }

    @Override
    public void handleGameEvent(GameEvent event) {
        super.handleGameEvent(event);
        notifyStateChanged();
    }

    @Override
    public void setPanelSelection(CardView hostCard) {
    }

    @Override
    public void setCard(CardView card) {
    }

    @Override
    public void setPlayerAvatar(LobbyPlayer player, IHasIcon ihi) {
    }

    @Override
    public boolean isUiSetToSkipPhase(PlayerView playerTurn, PhaseType phase) {
        if (phase == null) return false;
        PlayerView me = getCurrentPlayer();
        boolean isMyTurn = me != null && playerTurn != null && me.getId() == playerTurn.getId();
        return isMyTurn ? skippedOwnPhases.contains(phase) : skippedOpponentPhases.contains(phase);
    }

    // =========================================================================
    // SYNCHRONOUS MODAL CHOICES (Pattern B)
    // =========================================================================

    private JsonObject waitForModalResponse(String modalType, JsonObject payload) {
        String reqId = "modal-" + modalSeq.getAndIncrement();
        payload.addProperty("requestId", reqId);
        payload.addProperty("modalType", modalType);
        PendingModal modal = new PendingModal(reqId, modalType, payload);
        this.currentModal = modal;
        notifyStateChanged();
        try {
            return modal.future.get(15, TimeUnit.MINUTES);
        } catch (Exception e) {
            JsonObject fallback = new JsonObject();
            fallback.addProperty("cancelled", true);
            return fallback;
        } finally {
            if (this.currentModal == modal) {
                this.currentModal = null;
                notifyStateChanged();
            }
        }
    }

    @Override
    public SpellAbilityView getAbilityToPlay(CardView hostCard, List<SpellAbilityView> abilities, ITriggerEvent triggerEvent) {
        if (abilities == null || abilities.isEmpty()) {
            return null;
        }
        if (abilities.size() == 1) {
            return abilities.get(0);
        }

        JsonObject payload = new JsonObject();
        payload.addProperty("title", "Scegli Abilità / Magia da giocare");
        payload.addProperty("message", hostCard != null ? hostCard.getName() : "Seleziona l'abilità:");
        if (hostCard != null) {
            payload.add("card", GameStateSerializer.serializeCard(
                    hostCard, getCurrentPlayer(), null, null, null, null, null, null, true
            ));
        }

        JsonArray opts = new JsonArray();
        for (int i = 0; i < abilities.size(); i++) {
            SpellAbilityView sav = abilities.get(i);
            JsonObject opt = new JsonObject();
            opt.addProperty("index", i);
            opt.addProperty("label", sav.toString());
            opt.addProperty("description", sav.getDescription() != null ? sav.getDescription() : sav.toString());
            opt.addProperty("canPlay", sav.canPlay());
            opts.add(opt);
        }
        payload.add("options", opts);

        JsonObject resp = waitForModalResponse("CHOOSE_ABILITY", payload);
        if (resp == null || (resp.has("cancelled") && resp.get("cancelled").getAsBoolean())) {
            return null;
        }
        int idx = resp.has("selectedIndex") ? resp.get("selectedIndex").getAsInt() : 0;
        if (idx >= 0 && idx < abilities.size()) {
            return abilities.get(idx);
        }
        return null;
    }

    @Override
    public <T> List<T> getChoices(String message, int min, int max, List<T> choices, List<T> selected, FSerializableFunction<T, String> display) {
        if (choices == null || choices.isEmpty() || max < 0) {
            return Collections.emptyList();
        }

        JsonObject payload = new JsonObject();
        payload.addProperty("title", message != null ? message : "Effettua una scelta");
        payload.addProperty("message", message != null ? message : "Effettua una scelta");
        payload.addProperty("min", min);
        payload.addProperty("max", max);

        JsonArray opts = new JsonArray();
        PlayerView viewer = getCurrentPlayer();
        for (int i = 0; i < choices.size(); i++) {
            T item = choices.get(i);
            JsonObject opt = new JsonObject();
            opt.addProperty("index", i);
            String label;
            try {
                label = (display != null && item != null) ? display.apply(item) : String.valueOf(item);
            } catch (Exception e) {
                label = String.valueOf(item);
            }
            opt.addProperty("label", label != null ? label : "");
            opt.addProperty("preselected", selected != null && selected.contains(item));

            if (item instanceof CardView cv) {
                opt.add("card", GameStateSerializer.serializeCard(cv, viewer, null, null, null, null, null, null, true));
            } else if (item instanceof PaperCard pc) {
                opt.add("card", DeckCatalogService.serializePaperCard(pc));
            } else if (item instanceof PlayerView pv) {
                opt.addProperty("playerId", pv.getId());
                opt.addProperty("playerName", pv.getName());
            }
            opts.add(opt);
        }
        payload.add("options", opts);

        JsonObject resp = waitForModalResponse("GET_CHOICES", payload);
        if (resp == null || (resp.has("cancelled") && resp.get("cancelled").getAsBoolean())) {
            if (min <= 0) {
                return Collections.emptyList();
            }
            // If mandatory choice and cancelled, return first min items
            List<T> fallback = new ArrayList<>();
            for (int i = 0; i < Math.min(min, choices.size()); i++) {
                fallback.add(choices.get(i));
            }
            return fallback;
        }

        List<T> result = new ArrayList<>();
        if (resp.has("selectedIndices") && resp.get("selectedIndices").isJsonArray()) {
            JsonArray selArr = resp.getAsJsonArray("selectedIndices");
            for (JsonElement el : selArr) {
                int idx = el.getAsInt();
                if (idx >= 0 && idx < choices.size()) {
                    result.add(choices.get(idx));
                }
            }
        } else if (resp.has("selectedIndex")) {
            int idx = resp.get("selectedIndex").getAsInt();
            if (idx >= 0 && idx < choices.size()) {
                result.add(choices.get(idx));
            }
        }

        if (result.size() < min && min > 0) {
            for (int i = 0; i < choices.size() && result.size() < min; i++) {
                T candidate = choices.get(i);
                if (!result.contains(candidate)) {
                    result.add(candidate);
                }
            }
        }
        return result;
    }

    @Override
    public boolean confirm(CardView c, String question, boolean defaultIsYes, List<String> options) {
        JsonObject payload = new JsonObject();
        payload.addProperty("title", c != null ? c.getName() : "Conferma");
        payload.addProperty("message", question != null ? question : "Confermi?");
        payload.addProperty("defaultIsYes", defaultIsYes);
        String yesText = (options != null && !options.isEmpty()) ? options.get(0) : "Sì";
        String noText = (options != null && options.size() > 1) ? options.get(1) : "No";
        payload.addProperty("yesLabel", yesText);
        payload.addProperty("noLabel", noText);
        if (c != null) {
            payload.add("card", GameStateSerializer.serializeCard(c, getCurrentPlayer(), null, null, null, null, null, null, true));
        }

        JsonObject resp = waitForModalResponse("CONFIRM", payload);
        if (resp == null || !resp.has("confirmed")) {
            return defaultIsYes;
        }
        return resp.get("confirmed").getAsBoolean();
    }

    @Override
    public boolean showConfirmDialog(String message, String title, String yesButtonText, String noButtonText, boolean defaultYes) {
        return confirm(null, message, defaultYes, Arrays.asList(
                yesButtonText != null ? yesButtonText : "Sì",
                noButtonText != null ? noButtonText : "No"
        ));
    }

    @Override
    public int showOptionDialog(String message, String title, FSkinProp icon, List<String> options, int defaultOption) {
        if (options == null || options.isEmpty()) {
            return defaultOption;
        }
        List<String> chosen = getChoices(
                (title != null ? title + " - " : "") + (message != null ? message : ""),
                1, 1, options, null, null
        );
        if (chosen.isEmpty()) {
            return defaultOption;
        }
        int idx = options.indexOf(chosen.get(0));
        return idx >= 0 ? idx : defaultOption;
    }

    @Override
    public String showInputDialog(String message, String title, FSkinProp icon, String initialInput, List<String> inputOptions, boolean isNumeric) {
        if (inputOptions != null && !inputOptions.isEmpty()) {
            List<String> chosen = getChoices(message != null ? message : title, 1, 1, inputOptions, null, null);
            return chosen.isEmpty() ? initialInput : chosen.get(0);
        }
        JsonObject payload = new JsonObject();
        payload.addProperty("title", title != null ? title : "Inserisci valore");
        payload.addProperty("message", message != null ? message : "");
        payload.addProperty("initialInput", initialInput != null ? initialInput : "");
        payload.addProperty("isNumeric", isNumeric);

        JsonObject resp = waitForModalResponse("INPUT_TEXT", payload);
        if (resp == null || (resp.has("cancelled") && resp.get("cancelled").getAsBoolean())) {
            return null;
        }
        return resp.has("value") ? resp.get("value").getAsString() : initialInput;
    }

    @Override
    public <T> OrderResult<T> order(String title, String top, int remainingObjectsMin, int remainingObjectsMax,
                                    List<T> sourceChoices, List<T> destChoices, CardView referenceCard,
                                    boolean sideboardingMode, boolean showRememberCheckbox) {
        if (sourceChoices == null || sourceChoices.isEmpty()) {
            return new OrderResult<>(destChoices != null ? new ArrayList<>(destChoices) : Collections.emptyList(), false);
        }
        List<T> combined = new ArrayList<>(sourceChoices);
        if (destChoices != null) {
            for (T d : destChoices) {
                if (!combined.contains(d)) combined.add(d);
            }
        }
        int minPick = Math.max(0, combined.size() - Math.max(0, remainingObjectsMax));
        int maxPick = Math.max(minPick, combined.size() - Math.max(0, remainingObjectsMin));
        List<T> picked = getChoices(
                (title != null ? title : "Ordina elementi") + (top != null ? " (" + top + ")" : ""),
                minPick, maxPick, combined, destChoices, null
        );
        return new OrderResult<>(picked, false);
    }

    @Override
    public Map<CardView, Integer> assignCombatDamage(CardView attacker, List<CardView> blockers, int damage,
                                                     GameEntityView defender, boolean overrideOrder, boolean maySkip) {
        Map<CardView, Integer> defaultMap = new LinkedHashMap<>();
        if (blockers == null || blockers.isEmpty()) {
            return defaultMap;
        }

        // Compute standard lethal damage distribution as default
        int remaining = damage;
        for (int i = 0; i < blockers.size(); i++) {
            CardView b = blockers.get(i);
            int toughness = b.getCurrentState() != null ? b.getCurrentState().getToughness() : 1;
            int alreadyMarked = b.getDamage();
            int lethal = Math.max(1, toughness - alreadyMarked);
            int assigned = (i == blockers.size() - 1 && defender == null)
                    ? remaining
                    : Math.min(remaining, lethal);
            defaultMap.put(b, assigned);
            remaining -= assigned;
        }
        if (defender instanceof CardView defCard) {
            defaultMap.put(defCard, Math.max(0, remaining));
        } else if (defender == null && remaining > 0 && !blockers.isEmpty()) {
            CardView last = blockers.get(blockers.size() - 1);
            defaultMap.put(last, defaultMap.getOrDefault(last, 0) + remaining);
        }

        if (blockers.size() == 1 && defender == null) {
            defaultMap.put(blockers.get(0), damage);
            return defaultMap;
        }

        JsonObject payload = new JsonObject();
        payload.addProperty("title", "Assegna " + damage + " danni da combattimento");
        payload.addProperty("totalDamage", damage);
        PlayerView viewer = getCurrentPlayer();
        if (attacker != null) {
            payload.add("attacker", GameStateSerializer.serializeCard(attacker, viewer, null, null, null, null, null, null, true));
        }
        JsonArray targetsArr = new JsonArray();
        for (CardView b : blockers) {
            JsonObject tObj = new JsonObject();
            tObj.addProperty("id", b.getId());
            tObj.addProperty("name", b.getName());
            tObj.addProperty("defaultDamage", defaultMap.getOrDefault(b, 0));
            tObj.add("card", GameStateSerializer.serializeCard(b, viewer, null, null, null, null, null, null, true));
            targetsArr.add(tObj);
        }
        if (defender != null) {
            JsonObject defObj = new JsonObject();
            defObj.addProperty("id", defender.getId());
            defObj.addProperty("name", defender.getName() + " (Difensore / Trample)");
            defObj.addProperty("isDefender", true);
            defObj.addProperty("defaultDamage", Math.max(0, remaining));
            targetsArr.add(defObj);
        }
        payload.add("targets", targetsArr);

        JsonObject resp = waitForModalResponse("ASSIGN_COMBAT_DAMAGE", payload);
        if (resp != null && resp.has("allocations") && resp.get("allocations").isJsonObject()) {
            JsonObject alloc = resp.getAsJsonObject("allocations");
            Map<CardView, Integer> customMap = new LinkedHashMap<>();
            int sum = 0;
            for (CardView b : blockers) {
                String key = String.valueOf(b.getId());
                int val = alloc.has(key) ? Math.max(0, alloc.get(key).getAsInt()) : defaultMap.getOrDefault(b, 0);
                customMap.put(b, val);
                sum += val;
            }
            if (defender != null && alloc.has(String.valueOf(defender.getId()))) {
                int defVal = Math.max(0, alloc.get(String.valueOf(defender.getId())).getAsInt());
                customMap.put(defender instanceof CardView cv ? cv : null, defVal);
                sum += defVal;
            }
            if (sum == damage) {
                return customMap;
            }
        }
        if (defender != null && remaining > 0) {
            defaultMap.put(defender instanceof CardView cv ? cv : null, remaining);
        }
        return defaultMap;
    }

    @Override
    public Map<Object, Integer> assignGenericAmount(CardView effectSource, Map<Object, Integer> targets,
                                                    int amount, boolean atLeastOne, String amountLabel) {
        Map<Object, Integer> result = new LinkedHashMap<>();
        if (targets == null || targets.isEmpty()) {
            return result;
        }
        List<Object> keys = new ArrayList<>(targets.keySet());
        if (keys.size() == 1) {
            result.put(keys.get(0), amount);
            return result;
        }

        // Default distribution
        int rem = amount;
        for (int i = 0; i < keys.size(); i++) {
            Object k = keys.get(i);
            int v = (i == keys.size() - 1) ? rem : (atLeastOne && rem > 0 ? 1 : 0);
            result.put(k, v);
            rem -= v;
        }

        JsonObject payload = new JsonObject();
        payload.addProperty("title", "Distribuisci " + amount + " " + (amountLabel != null ? amountLabel : ""));
        payload.addProperty("totalAmount", amount);
        payload.addProperty("atLeastOne", atLeastOne);
        JsonArray tArr = new JsonArray();
        for (int i = 0; i < keys.size(); i++) {
            Object k = keys.get(i);
            JsonObject tObj = new JsonObject();
            tObj.addProperty("index", i);
            String label = k instanceof Byte colorByte
                    ? MagicColor.toLongString(colorByte)
                    : String.valueOf(k);
            tObj.addProperty("label", label);
            tObj.addProperty("defaultAmount", result.getOrDefault(k, 0));
            tArr.add(tObj);
        }
        payload.add("targets", tArr);

        JsonObject resp = waitForModalResponse("ASSIGN_GENERIC_AMOUNT", payload);
        if (resp != null && resp.has("allocations") && resp.get("allocations").isJsonObject()) {
            JsonObject alloc = resp.getAsJsonObject("allocations");
            Map<Object, Integer> custom = new LinkedHashMap<>();
            int sum = 0;
            for (int i = 0; i < keys.size(); i++) {
                String kStr = String.valueOf(i);
                int v = alloc.has(kStr) ? Math.max(0, alloc.get(kStr).getAsInt()) : 0;
                custom.put(keys.get(i), v);
                sum += v;
            }
            if (sum == amount) {
                return custom;
            }
        }
        return result;
    }

    @Override
    public GameEntityView chooseSingleEntityForEffect(String title, List<? extends GameEntityView> optionList,
                                                      DelayedReveal delayedReveal, boolean isOptional) {
        if (optionList == null || optionList.isEmpty()) {
            return null;
        }
        List<GameEntityView> list = new ArrayList<>(optionList);
        List<GameEntityView> picked = getChoices(title, isOptional ? 0 : 1, 1, list, null, null);
        return picked.isEmpty() ? null : picked.get(0);
    }

    @Override
    public List<GameEntityView> chooseEntitiesForEffect(String title, List<? extends GameEntityView> optionList,
                                                        int min, int max, DelayedReveal delayedReveal) {
        if (optionList == null || optionList.isEmpty()) {
            return Collections.emptyList();
        }
        List<GameEntityView> list = new ArrayList<>(optionList);
        return getChoices(title, min, max, list, null, null);
    }

    @Override
    public List<CardView> manipulateCardList(String title, Iterable<CardView> cards, Iterable<CardView> manipulable,
                                             boolean toTop, boolean toBottom, boolean toAnywhere) {
        List<CardView> all = new ArrayList<>();
        if (cards != null) {
            for (CardView c : cards) all.add(c);
        }
        List<CardView> manip = new ArrayList<>();
        if (manipulable != null) {
            for (CardView c : manipulable) manip.add(c);
        }
        if (manip.isEmpty()) {
            return all;
        }
        if (toTop && toBottom) {
            // e.g. Scry / Surveil: choose which cards to put on the bottom (or graveyard)
            List<CardView> toBottomCards = getChoices(
                    title + " - Seleziona le carte da mettere in fondo (le non selezionate restano in cima)",
                    0, manip.size(), manip, null, null
            );
            List<CardView> result = new ArrayList<>();
            for (CardView c : all) {
                if (!toBottomCards.contains(c)) {
                    result.add(c);
                }
            }
            result.addAll(toBottomCards);
            return result;
        }
        return getChoices(title, manip.size(), manip.size(), manip, null, null);
    }

    @Override
    public List<PaperCard> sideboard(CardPool sideboard, CardPool main, String message) {
        return main != null ? main.toFlatList() : Collections.emptyList();
    }

    @Override
    public void message(String message, String title) {
        this.lastNotification = (title != null && !title.equals("Forge") ? title + ": " : "") + message;
        notifyStateChanged();
    }

    @Override
    public void showErrorDialog(String message, String title) {
        this.lastNotification = "Attenzione: " + message;
        notifyStateChanged();
    }

    // =========================================================================
    // SERIALIZATION HELPERS FOR PROMPT, MODAL, AND YIELD STATE
    // =========================================================================

    public JsonObject serializePromptState() {
        JsonObject p = new JsonObject();
        p.addProperty("message", promptMessage);
        p.addProperty("promptCardId", promptCardId);
        p.addProperty("okLabel", okLabel);
        p.addProperty("cancelLabel", cancelLabel);
        p.addProperty("okEnabled", okEnabled);
        p.addProperty("cancelEnabled", cancelEnabled);
        p.addProperty("focusOk", focusOk);
        boolean canUndo = undoAvailable;
        if (!canUndo && getGameController() instanceof PlayerControllerHuman pch) {
            try {
                canUndo = pch.canUndoLastAction();
            } catch (Exception ignored) {
            }
        }
        p.addProperty("undoAvailable", canUndo);
        if (lastNotification != null) {
            p.addProperty("notification", lastNotification);
        }
        return p;
    }

    public JsonObject serializePendingModal(PlayerView viewer) {
        PendingModal modal = this.currentModal;
        if (modal == null) {
            return null;
        }
        return modal.payload;
    }

    public JsonObject serializeYieldState() {
        JsonObject y = new JsonObject();
        IGameController ctrl = getGameController();
        boolean autoPassEot = false;
        boolean stackYield = false;
        if (ctrl != null && ctrl.getYieldController() != null) {
            YieldController yc = ctrl.getYieldController();
            autoPassEot = yc.autoPassUntilEndOfTurn();
            stackYield = yc.autoPassUntilStackEmpty();
        }
        y.addProperty("autoPassUntilEndOfTurn", autoPassEot);
        y.addProperty("autoPassUntilStackEmpty", stackYield);
        y.addProperty("autoPassNoActions", autoPassNoActions);

        JsonArray ownSkipped = new JsonArray();
        for (PhaseType pt : skippedOwnPhases) ownSkipped.add(pt.name());
        y.add("skippedOwnPhases", ownSkipped);

        JsonArray oppSkipped = new JsonArray();
        for (PhaseType pt : skippedOpponentPhases) oppSkipped.add(pt.name());
        y.add("skippedOpponentPhases", oppSkipped);
        return y;
    }

    // =========================================================================
    // CLIENT ACTION DISPATCH (FROM WEBSOCKET)
    // =========================================================================

    public void handleClientAction(JsonObject msg) {
        String action = msg.has("action") ? msg.get("action").getAsString()
                : (msg.has("type") ? msg.get("type").getAsString() : "");
        if ("MODAL_RESPONSE".equals(action)) {
            PendingModal modal = this.currentModal;
            if (modal != null) {
                modal.future.complete(msg);
            }
            return;
        }

        // Clear transient notification on action
        this.lastNotification = null;

        actionExecutor.submit(() -> {
            try {
                executeControllerAction(action, msg);
            } catch (Exception e) {
                System.err.println("[WebGuiGame] Error executing action " + action + ": " + e.getMessage());
                e.printStackTrace();
            }
        });
    }

    private void executeControllerAction(String action, JsonObject msg) {
        IGameController controller = getGameController();
        GameView gv = getGameView();
        if (controller == null || gv == null) {
            return;
        }

        switch (action) {
            case "BUTTON_OK" -> controller.selectButtonOk();
            case "BUTTON_CANCEL" -> controller.selectButtonCancel();
            case "UNDO" -> {
                if (controller instanceof PlayerControllerHuman pch) {
                    if (!pch.tryUndoLastAction()) {
                        pch.selectButtonCancel();
                    }
                } else {
                    controller.undoLastAction();
                }
                notifyStateChanged();
            }
            case "ALPHA_STRIKE" -> controller.alphaStrike();
            case "CONCEDE" -> controller.concede();
            case "USE_MANA" -> {
                String colorStr = msg.has("color") ? msg.get("color").getAsString().toUpperCase(Locale.ROOT) : "C";
                byte manaByte = switch (colorStr) {
                    case "W" -> (byte) ManaAtom.WHITE;
                    case "U" -> (byte) ManaAtom.BLUE;
                    case "B" -> (byte) ManaAtom.BLACK;
                    case "R" -> (byte) ManaAtom.RED;
                    case "G" -> (byte) ManaAtom.GREEN;
                    default -> (byte) ManaAtom.COLORLESS;
                };
                controller.useMana(manaByte);
            }
            case "SELECT_PLAYER" -> {
                int playerId = msg.has("playerId") ? msg.get("playerId").getAsInt() : -1;
                if (gv.getPlayers() != null) {
                    for (PlayerView pv : gv.getPlayers()) {
                        if (pv != null && pv.getId() == playerId) {
                            controller.selectPlayer(pv, null);
                            break;
                        }
                    }
                }
            }
            case "SELECT_STACK_ITEM" -> {
                int stackItemId = msg.has("stackItemId") ? msg.get("stackItemId").getAsInt()
                        : (msg.has("sourceCardId") ? msg.get("sourceCardId").getAsInt() : -1);
                if (gv.getStack() != null) {
                    for (StackItemView siv : gv.getStack()) {
                        if (siv != null && (siv.getId() == stackItemId
                                || (siv.getSourceCard() != null && siv.getSourceCard().getId() == stackItemId))) {
                            controller.selectStackItem(siv);
                            break;
                        }
                    }
                }
            }
            case "SELECT_CARD" -> {
                int cardId = msg.has("cardId") ? msg.get("cardId").getAsInt() : -1;
                CardView targetCard = findCardViewById(gv, cardId);
                if (targetCard != null) {
                    controller.selectCard(targetCard, null, null);
                }
            }
            case "AUTO_PASS_EOT", "AUTO_PASS_UNTIL_END_OF_TURN" -> {
                PlayerView me = getCurrentPlayer();
                if (me != null) {
                    controller.applyYieldUpdate(new YieldUpdate.SetAutoPassUntilEndOfTurn(me, true));
                }
            }
            case "STACK_YIELD", "YIELD_UNTIL_STACK_EMPTY" -> {
                PlayerView me = getCurrentPlayer();
                if (me != null) {
                    controller.applyYieldUpdate(new YieldUpdate.StackYield(me, true, true));
                }
            }
            case "CANCEL_AUTO_PASS" -> {
                PlayerView me = getCurrentPlayer();
                if (me != null) {
                    controller.applyYieldUpdate(new YieldUpdate.SetAutoPassUntilEndOfTurn(me, false));
                    controller.applyYieldUpdate(new YieldUpdate.StackYield(me, false, true));
                    controller.applyYieldUpdate(new YieldUpdate.ClearMarker(me));
                }
                if (controller instanceof PlayerControllerHuman pch) {
                    pch.autoPassCancel();
                }
                notifyStateChanged();
            }
            case "TOGGLE_AUTO_PASS_NO_ACTIONS", "SET_AUTO_PASS_NO_ACTIONS" -> {
                boolean enabled = msg.has("enabled") ? msg.get("enabled").getAsBoolean() : !autoPassNoActions;
                this.autoPassNoActions = enabled;
                controller.applyYieldUpdate(new YieldUpdate.SetYieldPref(FPref.YIELD_AUTO_PASS_NO_ACTIONS, String.valueOf(enabled)));
                notifyStateChanged();
            }
            case "TOGGLE_SKIP_PHASE" -> {
                String phaseStr = msg.has("phase") ? msg.get("phase").getAsString() : "";
                boolean isOwnTurn = msg.has("isOwnTurn") ? msg.get("isOwnTurn").getAsBoolean()
                        : (!msg.has("ownTurn") || msg.get("ownTurn").getAsBoolean());
                try {
                    PhaseType pt = PhaseType.valueOf(phaseStr);
                    Set<PhaseType> targetSet = isOwnTurn ? skippedOwnPhases : skippedOpponentPhases;
                    boolean nowSkipped;
                    if (targetSet.contains(pt)) {
                        targetSet.remove(pt);
                        nowSkipped = false;
                    } else {
                        targetSet.add(pt);
                        nowSkipped = true;
                    }
                    PlayerView turnPlayer = gv.getPlayerTurn();
                    if (turnPlayer != null) {
                        controller.applyYieldUpdate(new YieldUpdate.SkipPhase(turnPlayer, pt, nowSkipped));
                    }
                    notifyStateChanged();
                } catch (Exception ignored) {
                }
            }
        }
    }

    private CardView findCardViewById(GameView gv, int cardId) {
        if (gv == null || cardId == -1) return null;
        if (gv.getPlayers() != null) {
            for (PlayerView pv : gv.getPlayers()) {
                if (pv == null) continue;
                for (CardView cv : pv.getHand()) if (cv != null && cv.getId() == cardId) return cv;
                for (CardView cv : pv.getBattlefield()) if (cv != null && cv.getId() == cardId) return cv;
                for (CardView cv : pv.getCommand()) if (cv != null && cv.getId() == cardId) return cv;
                for (CardView cv : pv.getGraveyard()) if (cv != null && cv.getId() == cardId) return cv;
                for (CardView cv : pv.getExile()) if (cv != null && cv.getId() == cardId) return cv;
                for (CardView cv : pv.getFlashback()) if (cv != null && cv.getId() == cardId) return cv;
                if (pv.getCommanders() != null) {
                    for (CardView cv : pv.getCommanders()) if (cv != null && cv.getId() == cardId) return cv;
                }
            }
        }
        return null;
    }
}
