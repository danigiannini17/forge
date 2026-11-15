package forge.web;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.deck.CardPool;
import forge.deck.Deck;
import forge.deck.DeckSection;
import forge.game.GameType;
import forge.game.GameView;
import forge.gamemodes.match.HostedMatch;
import forge.gamemodes.match.LobbySlot;
import forge.gamemodes.match.LobbySlotType;
import forge.item.PaperCard;
import forge.util.NameGenerator;
import io.netty.channel.Channel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Represents a single multiplayer room / instance identified by {@code roomId} and protected by an optional {@code password}.
 * Manages the room's {@link WebGameLobby}, active {@link HostedMatch}, player seats by {@code sessionToken},
 * per-player {@link WebGuiGame} bridges, and real-time WebSocket broadcasts.
 */
public class GameRoom {

    public record ChatMessage(String sender, String text, long timestamp, boolean system) {}

    private static final Gson GSON = new Gson();
    private static final ScheduledExecutorService BROADCAST_SCHEDULER = Executors.newScheduledThreadPool(2, r -> {
        Thread t = new Thread(r, "RoomBroadcastScheduler");
        t.setDaemon(true);
        return t;
    });

    private final String roomId;
    private String roomName;
    private final String password;
    private String hostSessionToken;
    private boolean commanderFormat;
    private final long createdAt;

    private final DeckCatalogService deckService;
    private final WebGameLobby lobby;

    // Maps slotIndex (0..N-1) -> human player's sessionToken
    private final Map<Integer, String> slotToToken = new ConcurrentHashMap<>();
    // Maps sessionToken -> latest nickname
    private final Map<String, String> tokenToNickname = new ConcurrentHashMap<>();
    // Maps slotIndex -> active WebGuiGame for that seat
    private final Map<Integer, WebGuiGame> slotToGui = new ConcurrentHashMap<>();
    // Maps sessionToken -> connected WebSocket channels
    private final Map<String, Set<Channel>> sessionChannels = new ConcurrentHashMap<>();

    private final List<ChatMessage> chatHistory = Collections.synchronizedList(new ArrayList<>());
    private final AtomicBoolean broadcastScheduled = new AtomicBoolean(false);

    public GameRoom(String roomId, String roomName, String password, String hostSessionToken,
                    String hostNickname, boolean commanderFormat, int maxPlayers, DeckCatalogService deckService) {
        this.roomId = roomId;
        this.roomName = (roomName != null && !roomName.isBlank()) ? roomName.trim() : ("Stanza " + roomId);
        this.password = password != null ? password.trim() : "";
        this.hostSessionToken = hostSessionToken;
        this.commanderFormat = commanderFormat;
        this.createdAt = Instant.now().toEpochMilli();
        this.deckService = deckService;
        this.lobby = new WebGameLobby(this, maxPlayers);

        if (commanderFormat) {
            this.lobby.applyVariant(GameType.Commander);
        } else {
            this.lobby.clearVariants();
            this.lobby.setGameType(GameType.Constructed);
        }

        // Seat the creator in Slot 0
        joinOrReconnect(hostSessionToken, hostNickname, this.password);
        addSystemChat("Stanza \"" + this.roomName + "\" (" + roomId + ") creata da " + hostNickname
                + " in formato " + (commanderFormat ? "Commander (EDH)" : "Constructed") + ".");
    }

    public String getRoomId() {
        return roomId;
    }

    public String getRoomName() {
        return roomName;
    }

    public boolean hasPassword() {
        return !password.isEmpty();
    }

    public boolean checkPassword(String candidate) {
        if (password.isEmpty()) {
            return true;
        }
        return password.equals(candidate != null ? candidate.trim() : "");
    }

    public boolean isSessionInRoom(String sessionToken) {
        return sessionToken != null && (slotToToken.containsValue(sessionToken) || sessionToken.equals(hostSessionToken));
    }

    public boolean isCommanderFormat() {
        return commanderFormat;
    }

    public WebGameLobby getLobby() {
        return lobby;
    }

    public Integer getSlotForSession(String sessionToken) {
        if (sessionToken == null) return null;
        for (Map.Entry<Integer, String> entry : slotToToken.entrySet()) {
            if (sessionToken.equals(entry.getValue())) {
                return entry.getKey();
            }
        }
        return null;
    }

    /**
     * Connects or reconnects a player identified by {@code sessionToken} and {@code nickname}.
     */
    public synchronized int joinOrReconnect(String sessionToken, String nickname, String suppliedPassword) {
        String cleanNick = (nickname != null && !nickname.isBlank()) ? nickname.trim() : "Planeswalker";
        tokenToNickname.put(sessionToken, cleanNick);

        // 1. Check if this sessionToken already has a slot in this room
        Integer existingSlot = getSlotForSession(sessionToken);
        if (existingSlot != null) {
            LobbySlot slot = lobby.getSlot(existingSlot);
            if (slot != null && !lobby.isMatchActive()) {
                slot.setName(cleanNick);
            }
            broadcastRoomState();
            return existingSlot;
        }

        // 2. Verify password for new entrants
        if (!checkPassword(suppliedPassword)) {
            return -2; // Wrong password
        }

        // 3. Find first OPEN slot if match hasn't started
        if (!lobby.isMatchActive()) {
            for (int i = 0; i < lobby.getNumberOfSlots(); i++) {
                LobbySlot slot = lobby.getSlot(i);
                if (slot != null && slot.getType() == LobbySlotType.OPEN) {
                    slot.setType(LobbySlotType.REMOTE);
                    slot.setName(cleanNick);
                    slot.setTeam(i);
                    slot.setIsReady(true);
                    Deck defaultDeck = deckService.getDefaultDeckForFormat(commanderFormat);
                    if (defaultDeck != null) {
                        slot.setDeck(defaultDeck);
                        slot.setDeckName(defaultDeck.getName());
                    }
                    slotToToken.put(i, sessionToken);
                    addSystemChat(cleanNick + " è entrato nella stanza (Posto " + (i + 1) + ").");
                    broadcastRoomState();
                    return i;
                }
            }
        }

        // Room is full or match is already active -> spectator (-1)
        broadcastRoomState();
        return -1;
    }

    public synchronized void leaveRoom(String sessionToken) {
        Integer slotIdx = getSlotForSession(sessionToken);
        if (slotIdx != null && !lobby.isMatchActive()) {
            LobbySlot slot = lobby.getSlot(slotIdx);
            String oldName = slot != null ? slot.getName() : "Giocatore";
            if (slot != null) {
                slot.setType(LobbySlotType.OPEN);
                slot.setName(null);
                slot.setDeck(null);
                slot.setDeckName(null);
                slot.setIsReady(false);
            }
            slotToToken.remove(slotIdx);
            slotToGui.remove(slotIdx);
            addSystemChat(oldName + " ha lasciato il posto " + (slotIdx + 1) + ".");
            if (sessionToken.equals(hostSessionToken) && !slotToToken.isEmpty()) {
                hostSessionToken = slotToToken.values().iterator().next();
            }
            broadcastRoomState();
        }
    }

    public synchronized void setFormat(String sessionToken, boolean commander) {
        if (lobby.isMatchActive()) return;
        if (this.commanderFormat == commander) return;
        this.commanderFormat = commander;
        if (commander) {
            lobby.applyVariant(GameType.Commander);
        } else {
            lobby.clearVariants();
            lobby.setGameType(GameType.Constructed);
        }
        // Re-assign default decks to slots whose decks don't match the new format
        for (int i = 0; i < lobby.getNumberOfSlots(); i++) {
            LobbySlot slot = lobby.getSlot(i);
            if (slot != null && (slot.getType() == LobbySlotType.REMOTE || slot.getType() == LobbySlotType.AI)) {
                Deck d = deckService.getDefaultDeckForFormat(commander);
                if (d != null) {
                    slot.setDeck(d);
                    slot.setDeckName(d.getName());
                }
            }
        }
        addSystemChat("Formato della stanza cambiato in " + (commander ? "Commander (EDH - 100 carte, 40 PV)" : "Constructed (60 carte, 20 PV)") + ".");
        broadcastRoomState();
    }

    public synchronized void configureSlot(String sessionToken, int slotIndex, String slotType, Integer team, Boolean ready) {
        if (lobby.isMatchActive()) return;
        if (slotIndex < 0 || slotIndex >= lobby.getNumberOfSlots()) return;
        LobbySlot slot = lobby.getSlot(slotIndex);
        if (slot == null) return;

        if (slotType != null) {
            if ("AI".equalsIgnoreCase(slotType)) {
                slotToToken.remove(slotIndex);
                slot.setType(LobbySlotType.AI);
                String aiName = "Bot " + NameGenerator.getRandomName("Any", "Any", new ArrayList<>());
                slot.setName(aiName);
                slot.setTeam(slotIndex);
                slot.setIsReady(true);
                if (slot.getDeck() == null) {
                    Deck d = deckService.getDefaultDeckForFormat(commanderFormat);
                    if (d != null) {
                        slot.setDeck(d);
                        slot.setDeckName(d.getName());
                    }
                }
                addSystemChat("Aggiunto " + aiName + " (IA) al Posto " + (slotIndex + 1) + ".");
            } else if ("OPEN".equalsIgnoreCase(slotType)) {
                slotToToken.remove(slotIndex);
                slot.setType(LobbySlotType.OPEN);
                slot.setName(null);
                slot.setDeck(null);
                slot.setDeckName(null);
                slot.setIsReady(false);
            } else if ("CLAIM".equalsIgnoreCase(slotType)) {
                // Move this human player to this open slot
                Integer prev = getSlotForSession(sessionToken);
                Deck prevDeck = null;
                if (prev != null && prev != slotIndex) {
                    LobbySlot prevSlot = lobby.getSlot(prev);
                    if (prevSlot != null) {
                        prevDeck = prevSlot.getDeck();
                        prevSlot.setType(LobbySlotType.OPEN);
                        prevSlot.setName(null);
                        prevSlot.setDeck(null);
                        prevSlot.setDeckName(null);
                        prevSlot.setIsReady(false);
                    }
                    slotToToken.remove(prev);
                }
                String nick = tokenToNickname.getOrDefault(sessionToken, "Planeswalker");
                slot.setType(LobbySlotType.REMOTE);
                slot.setName(nick);
                slot.setTeam(slotIndex);
                slot.setIsReady(true);
                Deck deckToUse = prevDeck != null ? prevDeck : deckService.getDefaultDeckForFormat(commanderFormat);
                if (deckToUse != null) {
                    slot.setDeck(deckToUse);
                    slot.setDeckName(deckToUse.getName());
                }
                slotToToken.put(slotIndex, sessionToken);
            }
        }

        if (team != null && team >= 0 && team < 8) {
            slot.setTeam(team);
        }
        if (ready != null) {
            slot.setIsReady(ready);
        }
        broadcastRoomState();
    }

    public synchronized void addOrRemoveSlot(boolean add) {
        if (lobby.isMatchActive()) return;
        if (add && lobby.getNumberOfSlots() < 8) {
            lobby.addSlot();
        } else if (!add && lobby.getNumberOfSlots() > 2) {
            int lastIdx = lobby.getNumberOfSlots() - 1;
            slotToToken.remove(lastIdx);
            lobby.removeSlot(lastIdx);
        }
        broadcastRoomState();
    }

    public synchronized void setSlotDeck(int slotIndex, Deck deck) {
        if (slotIndex < 0 || slotIndex >= lobby.getNumberOfSlots() || deck == null) {
            return;
        }
        LobbySlot slot = lobby.getSlot(slotIndex);
        if (slot == null) return;

        ensureCommanderSectionIfNeeded(deck);
        slot.setDeck(deck);
        slot.setDeckName(deck.getName());
        slot.setIsReady(true);
        addSystemChat((slot.getName() != null ? slot.getName() : ("Posto " + (slotIndex + 1)))
                + " ha selezionato il mazzo: " + deck.getName() + ".");
        broadcastRoomState();
    }

    private void ensureCommanderSectionIfNeeded(Deck deck) {
        if (!commanderFormat || deck == null) return;
        CardPool cmdPool = deck.get(DeckSection.Commander);
        if (cmdPool != null && cmdPool.countAll() > 0) {
            return;
        }
        // Find a legendary creature/planeswalker or fallback to first creature in main
        PaperCard chosen = null;
        for (Map.Entry<PaperCard, Integer> e : deck.getMain()) {
            PaperCard pc = e.getKey();
            if (pc.getRules() != null && pc.getRules().canBeCommander()) {
                chosen = pc;
                break;
            }
        }
        if (chosen == null) {
            for (Map.Entry<PaperCard, Integer> e : deck.getMain()) {
                PaperCard pc = e.getKey();
                if (pc.getRules() != null && pc.getRules().getType().isCreature()) {
                    chosen = pc;
                    break;
                }
            }
        }
        if (chosen == null && deck.getMain().countAll() > 0) {
            chosen = deck.getMain().get(0);
        }
        if (chosen != null) {
            deck.getMain().remove(chosen, 1);
            deck.getOrCreate(DeckSection.Commander).add(chosen, 1);
        }
    }

    public synchronized WebGuiGame getOrCreateGuiForSlot(int slotIndex) {
        return slotToGui.computeIfAbsent(slotIndex, idx -> {
            String token = slotToToken.getOrDefault(idx, "slot-" + idx);
            return new WebGuiGame(this, token, idx);
        });
    }

    /**
     * Starts the match using Forge's {@link WebGameLobby#startGame()} and {@link HostedMatch}.
     */
    public synchronized String startMatch() {
        if (lobby.isMatchActive()) {
            return "La partita è già in corso.";
        }

        // Count active players and ensure decks & ready flags
        int activeCount = 0;
        Set<Integer> distinctTeams = new HashSet<>();
        for (int i = 0; i < lobby.getNumberOfSlots(); i++) {
            LobbySlot slot = lobby.getSlot(i);
            if (slot == null || slot.getType() == LobbySlotType.OPEN) {
                continue;
            }
            activeCount++;
            distinctTeams.add(slot.getTeam());
            slot.setIsReady(true);
            if (slot.getName() == null || slot.getName().isBlank()) {
                slot.setName(slot.getType() == LobbySlotType.AI ? ("Bot IA " + (i + 1)) : ("Giocatore " + (i + 1)));
            }
            if (slot.getDeck() == null) {
                Deck d = deckService.getDefaultDeckForFormat(commanderFormat);
                slot.setDeck(d);
                slot.setDeckName(d != null ? d.getName() : "Default Deck");
            }
            ensureCommanderSectionIfNeeded(slot.getDeck());
        }

        if (activeCount < 2) {
            return "Servono almeno 2 giocatori (umani o Bot IA) per avviare la partita.";
        }
        if (distinctTeams.size() < 2) {
            for (int i = 0; i < lobby.getNumberOfSlots(); i++) {
                LobbySlot slot = lobby.getSlot(i);
                if (slot != null) slot.setTeam(i);
            }
        }

        // Reset and create fresh WebGuiGame instances for all human slots
        for (WebGuiGame oldGui : slotToGui.values()) {
            oldGui.shutdown();
        }
        slotToGui.clear();
        for (int i = 0; i < lobby.getNumberOfSlots(); i++) {
            LobbySlot slot = lobby.getSlot(i);
            if (slot != null && slot.getType() == LobbySlotType.REMOTE) {
                String token = slotToToken.getOrDefault(i, "slot-" + i);
                slotToGui.put(i, new WebGuiGame(this, token, i));
            }
        }

        Runnable startTask = lobby.startGame();
        if (startTask == null) {
            return "Impossibile avviare la partita: verifica la configurazione degli slot e dei mazzi.";
        }

        addSystemChat("La partita sta iniziando! Buona fortuna!");
        startTask.run();
        broadcastRoomState();
        broadcastGameStateImmediate();
        return null; // success
    }

    public void onGameStarted() {
        broadcastRoomState();
        broadcastGameState();
    }

    public void onMatchOver() {
        addSystemChat("La partita è terminata!");
        broadcastRoomState();
        broadcastGameState();
    }

    public void addChatMessage(String sender, String text) {
        if (text == null || text.isBlank()) return;
        chatHistory.add(new ChatMessage(
                sender != null && !sender.isBlank() ? sender : "Giocatore",
                text.trim(),
                System.currentTimeMillis(),
                false
        ));
        if (chatHistory.size() > 100) {
            chatHistory.remove(0);
        }
        broadcastRoomState();
    }

    public void addSystemChat(String text) {
        chatHistory.add(new ChatMessage("Sistema", text, System.currentTimeMillis(), true));
        if (chatHistory.size() > 100) {
            chatHistory.remove(0);
        }
    }

    // =========================================================================
    // WEBSOCKET SESSION REGISTRATION & BROADCASTS
    // =========================================================================

    public void registerWebSocket(String sessionToken, Channel channel) {
        sessionChannels.computeIfAbsent(sessionToken, k -> ConcurrentHashMap.newKeySet()).add(channel);
        channel.closeFuture().addListener(f -> {
            Set<Channel> set = sessionChannels.get(sessionToken);
            if (set != null) {
                set.remove(channel);
            }
        });
        // Send initial room state & game state immediately
        sendToChannel(channel, buildRoomStateEnvelope(sessionToken));
        if (lobby.isMatchActive() || lobby.getHostedMatch() != null) {
            sendToChannel(channel, buildGameStateEnvelope(sessionToken));
        }
    }

    public void handleWebSocketMessage(String sessionToken, JsonObject msg) {
        String type = msg.has("type") ? msg.get("type").getAsString() : "";
        switch (type) {
            case "CHAT" -> {
                String sender = tokenToNickname.getOrDefault(sessionToken, "Giocatore");
                String text = msg.has("text") ? msg.get("text").getAsString()
                        : (msg.has("message") ? msg.get("message").getAsString() : "");
                addChatMessage(sender, text);
            }
            case "SET_READY" -> {
                int slotIdx = msg.has("slotIndex") ? msg.get("slotIndex").getAsInt() : -1;
                boolean ready = !msg.has("ready") || msg.get("ready").getAsBoolean();
                configureSlot(sessionToken, slotIdx, null, null, ready);
            }
            case "CLAIM_SLOT" -> {
                int slotIdx = msg.has("slotIndex") ? msg.get("slotIndex").getAsInt() : -1;
                configureSlot(sessionToken, slotIdx, "CLAIM", null, true);
            }
            case "ADD_BOT" -> {
                int slotIdx = msg.has("slotIndex") ? msg.get("slotIndex").getAsInt() : -1;
                configureSlot(sessionToken, slotIdx, "AI", null, true);
            }
            case "REMOVE_BOT" -> {
                int slotIdx = msg.has("slotIndex") ? msg.get("slotIndex").getAsInt() : -1;
                configureSlot(sessionToken, slotIdx, "OPEN", null, false);
            }
            case "CHANGE_TEAM" -> {
                int slotIdx = msg.has("slotIndex") ? msg.get("slotIndex").getAsInt() : -1;
                int team = msg.has("team") ? msg.get("team").getAsInt() : slotIdx;
                configureSlot(sessionToken, slotIdx, null, team, null);
            }
            case "REQUEST_STATE" -> {
                Set<Channel> channels = sessionChannels.get(sessionToken);
                if (channels != null) {
                    String roomJson = GSON.toJson(buildRoomStateEnvelope(sessionToken));
                    String gameJson = GSON.toJson(buildGameStateEnvelope(sessionToken));
                    for (Channel ch : channels) {
                        if (ch.isActive()) {
                            ch.writeAndFlush(new TextWebSocketFrame(roomJson));
                            ch.writeAndFlush(new TextWebSocketFrame(gameJson));
                        }
                    }
                }
            }
            default -> {
                // Route GAME_ACTION or direct action types (SELECT_CARD, BUTTON_OK, MODAL_RESPONSE, etc.)
                Integer slotIdx = getSlotForSession(sessionToken);
                if (slotIdx != null) {
                    WebGuiGame gui = slotToGui.get(slotIdx);
                    if (gui != null) {
                        gui.handleClientAction(msg);
                    }
                }
            }
        }
    }

    public void broadcastRoomState() {
        for (Map.Entry<String, Set<Channel>> entry : sessionChannels.entrySet()) {
            String token = entry.getKey();
            Set<Channel> channels = entry.getValue();
            if (channels == null || channels.isEmpty()) continue;
            String json = GSON.toJson(buildRoomStateEnvelope(token));
            for (Channel ch : channels) {
                if (ch.isActive()) {
                    ch.writeAndFlush(new TextWebSocketFrame(json));
                }
            }
        }
    }

    public void broadcastGameState() {
        if (broadcastScheduled.compareAndSet(false, true)) {
            BROADCAST_SCHEDULER.schedule(() -> {
                broadcastScheduled.set(false);
                broadcastGameStateImmediate();
            }, 25, TimeUnit.MILLISECONDS);
        }
    }

    public void broadcastGameStateImmediate() {
        HostedMatch hm = lobby.getHostedMatch();
        GameView gv = hm != null ? hm.getGameView() : null;
        if (gv == null) {
            return;
        }
        for (Map.Entry<String, Set<Channel>> entry : sessionChannels.entrySet()) {
            String token = entry.getKey();
            Set<Channel> channels = entry.getValue();
            if (channels == null || channels.isEmpty()) continue;
            JsonObject env = buildGameStateEnvelope(token);
            String json = GSON.toJson(env);
            for (Channel ch : channels) {
                if (ch.isActive()) {
                    ch.writeAndFlush(new TextWebSocketFrame(json));
                }
            }
        }
    }

    private void sendToChannel(Channel ch, JsonObject obj) {
        if (ch != null && ch.isActive()) {
            ch.writeAndFlush(new TextWebSocketFrame(GSON.toJson(obj)));
        }
    }

    public JsonObject buildRoomStateEnvelope(String viewerSessionToken) {
        JsonObject env = new JsonObject();
        env.addProperty("type", "ROOM_STATE");
        env.add("room", toRoomJson(viewerSessionToken));
        return env;
    }

    public JsonObject buildGameStateEnvelope(String viewerSessionToken) {
        JsonObject env = new JsonObject();
        env.addProperty("type", "GAME_STATE");
        HostedMatch hm = lobby.getHostedMatch();
        GameView gv = hm != null ? hm.getGameView() : null;
        Integer slotIdx = getSlotForSession(viewerSessionToken);
        WebGuiGame gui = slotIdx != null ? slotToGui.get(slotIdx) : null;
        var viewerPlayer = gui != null ? gui.getCurrentPlayer() : null;
        env.add("game", GameStateSerializer.serializeForPlayer(gv, gui, viewerPlayer));
        return env;
    }

    public JsonObject toRoomJson(String viewerSessionToken) {
        JsonObject obj = new JsonObject();
        obj.addProperty("roomId", roomId);
        obj.addProperty("roomName", roomName);
        obj.addProperty("hasPassword", hasPassword());
        obj.addProperty("isCommander", commanderFormat);
        obj.addProperty("format", commanderFormat ? "Commander" : "Constructed");
        obj.addProperty("matchActive", lobby.isMatchActive());
        obj.addProperty("isHost", viewerSessionToken != null && viewerSessionToken.equals(hostSessionToken));
        Integer mySlot = getSlotForSession(viewerSessionToken);
        obj.addProperty("mySlotIndex", mySlot != null ? mySlot : -1);
        obj.addProperty("createdAt", createdAt);

        JsonArray slotsArr = new JsonArray();
        for (int i = 0; i < lobby.getNumberOfSlots(); i++) {
            LobbySlot slot = lobby.getSlot(i);
            if (slot == null) continue;
            JsonObject sObj = new JsonObject();
            sObj.addProperty("index", i);
            sObj.addProperty("type", slot.getType() != null ? slot.getType().name() : "OPEN");
            sObj.addProperty("name", slot.getName() != null ? slot.getName() : "");
            sObj.addProperty("team", slot.getTeam());
            sObj.addProperty("ready", slot.isReady());
            String occupantToken = slotToToken.get(i);
            sObj.addProperty("isMe", viewerSessionToken != null && viewerSessionToken.equals(occupantToken));
            sObj.addProperty("isHostSlot", occupantToken != null && occupantToken.equals(hostSessionToken));
            sObj.addProperty("connected", occupantToken != null && sessionChannels.containsKey(occupantToken)
                    && !sessionChannels.get(occupantToken).isEmpty());

            Deck d = slot.getDeck();
            sObj.addProperty("deckName", d != null ? d.getName() : "");
            if (d != null) {
                sObj.add("deckSummary", buildDeckBriefSummary(d));
            }
            slotsArr.add(sObj);
        }
        obj.add("slots", slotsArr);

        JsonArray chatArr = new JsonArray();
        synchronized (chatHistory) {
            for (ChatMessage cm : chatHistory) {
                JsonObject cObj = new JsonObject();
                cObj.addProperty("sender", cm.sender());
                cObj.addProperty("text", cm.text());
                cObj.addProperty("timestamp", cm.timestamp());
                cObj.addProperty("system", cm.system());
                chatArr.add(cObj);
            }
        }
        obj.add("chat", chatArr);
        return obj;
    }

    private JsonObject buildDeckBriefSummary(Deck d) {
        JsonObject summary = new JsonObject();
        summary.addProperty("name", d.getName());
        CardPool cmdPool = d.get(DeckSection.Commander);
        CardPool mainPool = d.getMain();
        summary.addProperty("mainCount", mainPool != null ? mainPool.countAll() : 0);
        summary.addProperty("commanderCount", cmdPool != null ? cmdPool.countAll() : 0);
        if (cmdPool != null && !cmdPool.isEmpty()) {
            PaperCard cmdr = cmdPool.get(0);
            summary.addProperty("commanderName", cmdr.getName());
            summary.addProperty("commanderImageUrl", DeckCatalogService.buildScryfallUrlForPaperCard(cmdr, false));
            summary.addProperty("commanderArtCropUrl", DeckCatalogService.buildScryfallNamedUrl(cmdr.getName(), true));
            if (cmdr.getRules() != null) {
                summary.add("colorIdentity", DeckCatalogService.serializeColorSet(cmdr.getRules().getColorIdentity()));
            }
        }
        return summary;
    }
}
