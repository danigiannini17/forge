package forge.web;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import forge.deck.Deck;
import forge.gui.GuiBase;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import io.netty.bootstrap.ServerBootstrap;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.*;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.http.*;
import io.netty.handler.codec.http.websocketx.*;
import io.netty.util.AttributeKey;
import io.netty.util.CharsetUtil;

import java.io.File;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;

/**
 * Main entrypoint and Netty HTTP + WebSocket server for Forge WebApp.
 */
public class ForgeWebServer {

    private static final Gson GSON = new Gson();
    private static final AttributeKey<String> ATTR_ROOM_ID = AttributeKey.valueOf("roomId");
    private static final AttributeKey<String> ATTR_SESSION_TOKEN = AttributeKey.valueOf("sessionToken");

    private final int port;
    private final DeckCatalogService deckService;
    private final RoomManager roomManager;
    private final File staticDistDir;

    public ForgeWebServer(int port, DeckCatalogService deckService, RoomManager roomManager, File staticDistDir) {
        this.port = port;
        this.deckService = deckService;
        this.roomManager = roomManager;
        this.staticDistDir = staticDistDir;
    }

    public static void main(String[] args) throws Exception {
        System.setProperty("java.awt.headless", "true");

        int port = 8080;
        String envPort = System.getenv("PORT");
        if (envPort != null && !envPort.isBlank()) {
            try { port = Integer.parseInt(envPort.trim()); } catch (NumberFormatException ignored) {}
        }
        for (int i = 0; i < args.length; i++) {
            if ("--port".equals(args[i]) && i + 1 < args.length) {
                port = Integer.parseInt(args[++i]);
            }
        }

        String assetsDir = resolveForgeGuiDir();
        System.out.println("[ForgeWebServer] Using forge-gui assets dir: " + assetsDir);

        GuiBase.setInterface(new HeadlessWebGuiBase(assetsDir));
        System.out.println("[ForgeWebServer] Initializing FModel...");
        FModel.initialize(null, prefs -> {
            prefs.setPref(FPref.PLAYER_NAME, "Planeswalker");
            prefs.setPref(FPref.LOAD_CARD_SCRIPTS_LAZILY, true);
            prefs.setPref(FPref.ENFORCE_DECK_LEGALITY, false);
            prefs.setPref(FPref.UI_SHOW_ACTIONABLE_HIGHLIGHTS, true);
            prefs.setPref(FPref.UI_SHOW_AUTOTAP_PREVIEW, true);
            prefs.setPref(FPref.DECKGEN_CARDBASED, false);
            return null;
        });

        DeckCatalogService deckService = new DeckCatalogService();
        deckService.initializeCatalog(assetsDir);

        RoomManager roomManager = new RoomManager(deckService);

        // Background warm-up of full card database for instant deckbuilder search & random generation
        Thread preloadThread = new Thread(() -> {
            try {
                System.out.println("[ForgeWebServer] Background preloading all card scripts...");
                FModel.getMagicDb().ensureAllCardsLoaded();
                deckService.rebuildCardNameIndex();
                System.out.println("[ForgeWebServer] All card scripts loaded ("
                        + FModel.getMagicDb().getCommonCards().getUniqueCards().size() + " unique cards).");
            } catch (Exception e) {
                System.err.println("[ForgeWebServer] Background card preload warning: " + e.getMessage());
            }
        }, "CardDb-Preloader");
        preloadThread.setDaemon(true);
        preloadThread.start();

        File distDir = resolveFrontendDistDir();
        ForgeWebServer server = new ForgeWebServer(port, deckService, roomManager, distDir);
        server.start();
    }

    private static File detectRepoRoot() {
        try {
            var cs = ForgeWebServer.class.getProtectionDomain().getCodeSource();
            if (cs != null && cs.getLocation() != null) {
                File loc = new File(cs.getLocation().toURI()).getCanonicalFile();
                // Typical path: <repo>/webapp/forge-web/target/classes
                File cursor = loc.isFile() ? loc.getParentFile() : loc;
                for (int i = 0; i < 6 && cursor != null; i++) {
                    if (new File(cursor, "forge-gui/res/cardsfolder").isDirectory()) {
                        return cursor;
                    }
                    cursor = cursor.getParentFile();
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private static String resolveForgeGuiDir() {
        String env = System.getenv("FORGE_ASSETS_DIR");
        if (env != null && new File(env, "res").isDirectory()) {
            return new File(env).getAbsolutePath() + "/";
        }
        File repoRoot = detectRepoRoot();
        if (repoRoot != null) {
            File guiDir = new File(repoRoot, "forge-gui");
            if (new File(guiDir, "res/cardsfolder").isDirectory()) {
                return guiDir.getAbsolutePath() + "/";
            }
        }
        String[] candidates = {
                "../../forge-gui",
                "../forge-gui",
                "./forge-gui"
        };
        for (String c : candidates) {
            File f = new File(c);
            if (new File(f, "res/cardsfolder").isDirectory()) {
                return f.getAbsolutePath() + "/";
            }
        }
        throw new IllegalStateException("Impossibile trovare la directory forge-gui/res/cardsfolder");
    }

    private static File resolveFrontendDistDir() {
        String env = System.getenv("FRONTEND_DIST_DIR");
        if (env != null && new File(env).isDirectory()) {
            return new File(env).getAbsoluteFile();
        }
        File repoRoot = detectRepoRoot();
        if (repoRoot != null) {
            File dist = new File(repoRoot, "webapp/frontend/dist");
            if (dist.isDirectory()) {
                return dist.getAbsoluteFile();
            }
        }
        String[] candidates = {
                "../frontend/dist",
                "./frontend/dist",
                "./webapp/frontend/dist"
        };
        for (String c : candidates) {
            File f = new File(c);
            if (f.isDirectory()) return f.getAbsoluteFile();
        }
        return repoRoot != null
                ? new File(repoRoot, "webapp/frontend/dist")
                : new File("../frontend/dist");
    }

    public void start() throws InterruptedException {
        EventLoopGroup bossGroup = new NioEventLoopGroup(1);
        EventLoopGroup workerGroup = new NioEventLoopGroup();
        try {
            ServerBootstrap b = new ServerBootstrap();
            b.group(bossGroup, workerGroup)
                    .channel(NioServerSocketChannel.class)
                    .childHandler(new ChannelInitializer<SocketChannel>() {
                        @Override
                        protected void initChannel(SocketChannel ch) {
                            ChannelPipeline p = ch.pipeline();
                            p.addLast(new HttpServerCodec());
                            p.addLast(new HttpObjectAggregator(4 * 1024 * 1024));
                            p.addLast(new WebServerHandler());
                        }
                    });

            Channel ch = b.bind(port).sync().channel();
            System.out.println("=============================================================");
            System.out.println("  Lozzander Online — Web Server listening on port " + port);
            System.out.println("  API: http://localhost:" + port + "/api/status");
            System.out.println("  WS:  ws://localhost:" + port + "/ws");
            System.out.println("=============================================================");
            ch.closeFuture().sync();
        } finally {
            bossGroup.shutdownGracefully();
            workerGroup.shutdownGracefully();
        }
    }

    private class WebServerHandler extends SimpleChannelInboundHandler<Object> {

        private WebSocketServerHandshaker handshaker;

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, Object msg) {
            if (msg instanceof FullHttpRequest req) {
                handleHttpRequest(ctx, req);
            } else if (msg instanceof WebSocketFrame frame) {
                handleWebSocketFrame(ctx, frame);
            }
        }

        private void handleHttpRequest(ChannelHandlerContext ctx, FullHttpRequest req) {
            if (!req.decoderResult().isSuccess()) {
                sendJsonError(ctx, HttpResponseStatus.BAD_REQUEST, "Richiesta HTTP non valida");
                return;
            }

            if (req.method() == HttpMethod.OPTIONS) {
                FullHttpResponse res = new DefaultFullHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.NO_CONTENT);
                addCorsHeaders(res);
                ctx.writeAndFlush(res);
                return;
            }

            QueryStringDecoder decoder = new QueryStringDecoder(req.uri());
            String path = decoder.path();

            // Check for WebSocket upgrade on /ws
            if (path.equals("/ws") || path.startsWith("/ws/")) {
                String roomId = getParam(decoder, "roomId", "");
                String sessionToken = getParam(decoder, "sessionToken", "");
                String nickname = getParam(decoder, "nickname", "Planeswalker");
                String password = getParam(decoder, "password", "");

                if (!roomId.isEmpty()) {
                    ctx.channel().attr(ATTR_ROOM_ID).set(RoomManager.normalizeRoomId(roomId));
                }
                if (!sessionToken.isEmpty()) {
                    ctx.channel().attr(ATTR_SESSION_TOKEN).set(sessionToken);
                }

                WebSocketServerHandshakerFactory wsFactory = new WebSocketServerHandshakerFactory(
                        getWebSocketLocation(req), null, true, 1024 * 1024
                );
                handshaker = wsFactory.newHandshaker(req);
                if (handshaker == null) {
                    WebSocketServerHandshakerFactory.sendUnsupportedVersionResponse(ctx.channel());
                } else {
                    handshaker.handshake(ctx.channel(), req).addListener((ChannelFutureListener) future -> {
                        if (future.isSuccess() && !roomId.isEmpty() && !sessionToken.isEmpty()) {
                            GameRoom room = roomManager.getRoom(roomId);
                            if (room != null) {
                                int slotRes = room.joinOrReconnect(sessionToken, nickname, password);
                                if (slotRes == -2) {
                                    JsonObject err = new JsonObject();
                                    err.addProperty("type", "AUTH_ERROR");
                                    err.addProperty("message", "Password della stanza errata o sessione non valida.");
                                    ctx.channel().writeAndFlush(new TextWebSocketFrame(GSON.toJson(err)))
                                            .addListener(ChannelFutureListener.CLOSE);
                                    return;
                                }
                                room.registerWebSocket(sessionToken, ctx.channel());
                            }
                        }
                    });
                }
                return;
            }

            if (path.startsWith("/api/")) {
                try {
                    handleApiRequest(ctx, req, decoder, path);
                } catch (IllegalArgumentException e) {
                    sendJsonError(ctx, HttpResponseStatus.BAD_REQUEST, e.getMessage());
                } catch (Exception e) {
                    System.err.println("[ForgeWebServer] Internal API error on " + path + ": " + e.getMessage());
                    sendJsonError(ctx, HttpResponseStatus.INTERNAL_SERVER_ERROR, "Errore interno del server.");
                }
                return;
            }

            // Serve static frontend files if built
            serveStaticFile(ctx, path);
        }

        private void handleApiRequest(ChannelHandlerContext ctx, FullHttpRequest req,
                                      QueryStringDecoder decoder, String path) {
            HttpMethod method = req.method();
            JsonObject body = parseJsonBody(req);
            String reqToken = extractSessionToken(req, decoder, body);

            if (path.equals("/api/status") && method == HttpMethod.GET) {
                JsonObject res = new JsonObject();
                res.addProperty("status", "ok");
                res.addProperty("version", GuiBase.getInterface().getCurrentVersion());
                res.addProperty("loadedCards", FModel.getMagicDb().getCommonCards().getUniqueCards().size());
                sendJson(ctx, HttpResponseStatus.OK, res);
                return;
            }

            if (path.equals("/api/rooms") && method == HttpMethod.GET) {
                JsonObject res = new JsonObject();
                res.add("rooms", roomManager.listRoomsJson(reqToken));
                sendJson(ctx, HttpResponseStatus.OK, res);
                return;
            }

            if (path.equals("/api/rooms") && method == HttpMethod.POST) {
                String roomId = getStr(body, "roomId", "");
                String roomName = getStr(body, "roomName", "");
                String password = getStr(body, "password", "");
                String sessionToken = !reqToken.isEmpty() ? reqToken : UUID.randomUUID().toString();
                String nickname = getStr(body, "nickname", "Planeswalker");
                boolean isCommander = true;
                if (body.has("isCommander")) {
                    isCommander = body.get("isCommander").getAsBoolean();
                } else if (body.has("format")) {
                    isCommander = "COMMANDER".equalsIgnoreCase(getStr(body, "format", "COMMANDER"));
                }
                int maxPlayers = body.has("maxPlayers") ? body.get("maxPlayers").getAsInt() : (isCommander ? 4 : 2);

                GameRoom room = roomManager.createRoom(roomId, roomName, password, sessionToken, nickname, isCommander, maxPlayers);
                JsonObject res = new JsonObject();
                res.addProperty("success", true);
                res.addProperty("roomId", room.getRoomId());
                res.add("room", room.toRoomJson(sessionToken));
                sendJson(ctx, HttpResponseStatus.OK, res);
                return;
            }

            if (path.equals("/api/rooms/join") && method == HttpMethod.POST) {
                String roomId = getStr(body, "roomId", "");
                String password = getStr(body, "password", "");
                String sessionToken = reqToken;
                String nickname = getStr(body, "nickname", "Planeswalker");

                GameRoom room = roomManager.getRoom(roomId);
                if (room == null) {
                    sendJsonError(ctx, HttpResponseStatus.NOT_FOUND, "Stanza \"" + roomId + "\" non trovata.");
                    return;
                }
                int slotIdx = room.joinOrReconnect(sessionToken, nickname, password);
                if (slotIdx == -2) {
                    sendJsonError(ctx, HttpResponseStatus.UNAUTHORIZED, "Password della stanza errata.");
                    return;
                }
                JsonObject res = new JsonObject();
                res.addProperty("success", true);
                res.addProperty("slotIndex", slotIdx);
                res.addProperty("hasActiveGame", room.getLobby().isMatchActive());
                res.add("room", room.toRoomJson(sessionToken));
                sendJson(ctx, HttpResponseStatus.OK, res);
                return;
            }

            if (path.startsWith("/api/rooms/")) {
                String[] parts = path.substring("/api/rooms/".length()).split("/");
                String roomId = URLDecoder.decode(parts[0], StandardCharsets.UTF_8);
                GameRoom room = roomManager.getRoom(roomId);
                if (room == null) {
                    sendJsonError(ctx, HttpResponseStatus.NOT_FOUND, "Stanza \"" + roomId + "\" non trovata.");
                    return;
                }

                if (parts.length == 2 && "join".equals(parts[1]) && method == HttpMethod.POST) {
                    String password = getStr(body, "password", "");
                    String sessionToken = reqToken;
                    String nickname = getStr(body, "nickname", "Planeswalker");
                    int slotIdx = room.joinOrReconnect(sessionToken, nickname, password);
                    if (slotIdx == -2) {
                        sendJsonError(ctx, HttpResponseStatus.UNAUTHORIZED, "Password della stanza errata.");
                        return;
                    }
                    JsonObject res = new JsonObject();
                    res.addProperty("success", true);
                    res.addProperty("slotIndex", slotIdx);
                    res.addProperty("hasActiveGame", room.getLobby().isMatchActive());
                    res.add("room", room.toRoomJson(sessionToken));
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                // All other /api/rooms/{roomId}/* endpoints require room authorization
                if (!room.isAuthorized(reqToken)) {
                    sendJsonError(ctx, HttpResponseStatus.FORBIDDEN, "Non sei autorizzato ad accedere a questa stanza.");
                    return;
                }

                if (parts.length == 1 && method == HttpMethod.GET) {
                    JsonObject res = new JsonObject();
                    res.add("room", room.toRoomJson(reqToken));
                    if (room.getLobby().isMatchActive()) {
                        res.add("game", room.buildGameStateEnvelope(reqToken).getAsJsonObject("game"));
                    }
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                if (parts.length == 2 && "slot".equals(parts[1]) && method == HttpMethod.POST) {
                    int slotIndex = body.has("slotIndex") ? body.get("slotIndex").getAsInt() : 0;
                    String slotType = body.has("slotType") && !body.get("slotType").isJsonNull() ? body.get("slotType").getAsString() : null;
                    Integer team = body.has("team") && !body.get("team").isJsonNull() ? body.get("team").getAsInt() : null;
                    Boolean ready = body.has("ready") && !body.get("ready").isJsonNull() ? body.get("ready").getAsBoolean() : null;

                    if (!room.configureSlot(reqToken, slotIndex, slotType, team, ready)) {
                        sendJsonError(ctx, HttpResponseStatus.FORBIDDEN, "Operazione non consentita su questo posto.");
                        return;
                    }
                    JsonObject res = new JsonObject();
                    res.addProperty("success", true);
                    res.add("room", room.toRoomJson(reqToken));
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                if (parts.length == 2 && "slots-count".equals(parts[1]) && method == HttpMethod.POST) {
                    boolean add = !body.has("add") || body.get("add").getAsBoolean();
                    if (!room.addOrRemoveSlot(reqToken, add)) {
                        sendJsonError(ctx, HttpResponseStatus.FORBIDDEN, "Solo l'Host può modificare il numero di posti.");
                        return;
                    }
                    JsonObject res = new JsonObject();
                    res.addProperty("success", true);
                    res.add("room", room.toRoomJson(reqToken));
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                if (parts.length == 2 && "format".equals(parts[1]) && method == HttpMethod.POST) {
                    boolean isCommander = !body.has("isCommander") || body.get("isCommander").getAsBoolean();
                    if (!room.setFormat(reqToken, isCommander)) {
                        sendJsonError(ctx, HttpResponseStatus.FORBIDDEN, "Solo l'Host può cambiare il formato della stanza.");
                        return;
                    }
                    JsonObject res = new JsonObject();
                    res.addProperty("success", true);
                    res.add("room", room.toRoomJson(reqToken));
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                if (parts.length == 2 && "deck".equals(parts[1]) && method == HttpMethod.POST) {
                    Integer mySlot = room.getSlotForSession(reqToken);
                    int slotIndex = body.has("slotIndex") ? body.get("slotIndex").getAsInt() : (mySlot != null ? mySlot : -1);
                    if (!room.canModifySlot(reqToken, slotIndex)) {
                        sendJsonError(ctx, HttpResponseStatus.FORBIDDEN, "Non puoi modificare il mazzo di un altro giocatore.");
                        return;
                    }
                    String mode = getStr(body, "mode", "CATALOG").toUpperCase(Locale.ROOT);

                    Deck chosenDeck = null;
                    List<String> warnings = new ArrayList<>();

                    switch (mode) {
                        case "CATALOG" -> {
                            String deckId = getStr(body, "deckId", "");
                            chosenDeck = deckService.loadCatalogDeck(deckId);
                            if (chosenDeck == null) {
                                sendJsonError(ctx, HttpResponseStatus.BAD_REQUEST, "Mazzo del catalogo non trovato.");
                                return;
                            }
                        }
                        case "TEXT", "IMPORT_TEXT" -> {
                            String deckName = getStr(body, "deckName", "Mazzo Importato");
                            String deckText = getStr(body, "deckText", "");
                            String commanderName = getStr(body, "commanderName", "");
                            chosenDeck = deckService.parseDeckFromText(deckName, deckText, commanderName, room.isCommanderFormat(), warnings);
                        }
                        case "RANDOM" -> {
                            List<String> colors = new ArrayList<>();
                            if (body.has("colors") && body.get("colors").isJsonArray()) {
                                for (JsonElement el : body.getAsJsonArray("colors")) {
                                    colors.add(el.getAsString());
                                }
                            }
                            String commanderName = getStr(body, "commanderName", "");
                            chosenDeck = deckService.generateRandomDeck(room.isCommanderFormat(), colors, commanderName);
                        }
                        case "BUILDER", "CUSTOM_JSON" -> {
                            JsonObject deckJson = body.has("deck") && body.get("deck").isJsonObject()
                                    ? body.getAsJsonObject("deck")
                                    : body;
                            if (!deckJson.has("name") && body.has("deckName")) {
                                deckJson.addProperty("name", getStr(body, "deckName", "Custom Deck"));
                            }
                            chosenDeck = deckService.buildDeckFromJson(deckJson, warnings);
                        }
                    }

                    if (chosenDeck == null || (chosenDeck.getMain().countAll() == 0)) {
                        sendJsonError(ctx, HttpResponseStatus.BAD_REQUEST, "Il mazzo selezionato non contiene carte valide.");
                        return;
                    }

                    if (!room.setSlotDeck(reqToken, slotIndex, chosenDeck)) {
                        sendJsonError(ctx, HttpResponseStatus.FORBIDDEN, "Impossibile assegnare il mazzo a questo posto.");
                        return;
                    }
                    JsonObject serializedDeck = DeckCatalogService.serializeDeck(chosenDeck);
                    JsonObject res = new JsonObject();
                    res.addProperty("success", true);
                    res.addProperty("ok", true);
                    res.add("room", room.toRoomJson(reqToken));
                    res.add("deck", serializedDeck);
                    res.add("deckSummary", serializedDeck);
                    JsonArray warnArr = new JsonArray();
                    for (String w : warnings) warnArr.add(w);
                    res.add("warnings", warnArr);
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                if (parts.length == 4 && "slot".equals(parts[1]) && "deck".equals(parts[3]) && method == HttpMethod.GET) {
                    int slotIdx;
                    try {
                        slotIdx = Integer.parseInt(parts[2]);
                    } catch (NumberFormatException e) {
                        sendJsonError(ctx, HttpResponseStatus.BAD_REQUEST, "Indice posto non valido.");
                        return;
                    }
                    if (!room.canInspectSlotDeck(reqToken, slotIdx)) {
                        sendJsonError(ctx, HttpResponseStatus.FORBIDDEN, "Non puoi ispezionare la lista del mazzo di un avversario.");
                        return;
                    }
                    var slot = room.getLobby().getSlot(slotIdx);
                    Deck d = slot != null ? slot.getDeck() : null;
                    JsonObject res = new JsonObject();
                    res.add("deck", DeckCatalogService.serializeDeck(d));
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                if (parts.length == 2 && "start".equals(parts[1]) && method == HttpMethod.POST) {
                    if (!room.isHost(reqToken)) {
                        sendJsonError(ctx, HttpResponseStatus.FORBIDDEN, "Solo l'Host della stanza può avviare la partita.");
                        return;
                    }
                    String error = room.startMatch();
                    if (error != null) {
                        sendJsonError(ctx, HttpResponseStatus.BAD_REQUEST, error);
                        return;
                    }
                    JsonObject res = new JsonObject();
                    res.addProperty("success", true);
                    res.addProperty("ok", true);
                    res.add("room", room.toRoomJson(reqToken));
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                if (parts.length == 2 && "leave".equals(parts[1]) && method == HttpMethod.POST) {
                    room.leaveRoom(reqToken);
                    JsonObject res = new JsonObject();
                    res.addProperty("success", true);
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }
            }

            if (path.equals("/api/decks/catalog") && method == HttpMethod.GET) {
                String category = getParam(decoder, "category", "ALL");
                String q = getParam(decoder, "q", "");
                int limit = Math.max(1, Math.min(600, getIntParam(decoder, "limit", 500)));
                sendJson(ctx, HttpResponseStatus.OK, deckService.getCatalogJson(category, q, limit));
                return;
            }

            if ((path.equals("/api/decks/catalog/load") || path.equals("/api/decks/preview")) && method == HttpMethod.GET) {
                String id = getParam(decoder, "id", "");
                Deck d = deckService.loadCatalogDeck(id);
                if (d == null) {
                    sendJsonError(ctx, HttpResponseStatus.NOT_FOUND, "Mazzo non trovato.");
                    return;
                }
                JsonObject res = new JsonObject();
                res.add("deck", DeckCatalogService.serializeDeck(d));
                sendJson(ctx, HttpResponseStatus.OK, res);
                return;
            }

            if (path.equals("/api/cards/search") && method == HttpMethod.GET) {
                String q = getParam(decoder, "q", "");
                String colors = getParam(decoder, "colors", "");
                String type = getParam(decoder, "type", "");
                boolean commanderOnly = Boolean.parseBoolean(getParam(decoder, "commanderOnly", "false"));
                int limit = Math.max(1, Math.min(100, getIntParam(decoder, "limit", 48)));

                JsonObject res = new JsonObject();
                res.add("cards", deckService.searchCards(q, colors, type, commanderOnly, limit));
                sendJson(ctx, HttpResponseStatus.OK, res);
                return;
            }

            sendJsonError(ctx, HttpResponseStatus.NOT_FOUND, "Endpoint API non trovato.");
        }

        private void handleWebSocketFrame(ChannelHandlerContext ctx, WebSocketFrame frame) {
            if (frame instanceof CloseWebSocketFrame) {
                if (handshaker != null) {
                    handshaker.close(ctx.channel(), (CloseWebSocketFrame) frame.retain());
                } else {
                    ctx.close();
                }
                return;
            }
            if (frame instanceof PingWebSocketFrame) {
                ctx.channel().writeAndFlush(new PongWebSocketFrame(frame.content().retain()));
                return;
            }
            if (!(frame instanceof TextWebSocketFrame textFrame)) {
                return;
            }

            try {
                String rawText = textFrame.text();
                if (rawText == null || rawText.length() > 65536) {
                    return;
                }
                JsonObject msg = JsonParser.parseString(rawText).getAsJsonObject();
                String type = getStr(msg, "type", "");
                if ("AUTH".equals(type)) {
                    String roomId = RoomManager.normalizeRoomId(getStr(msg, "roomId", ""));
                    String sessionToken = getStr(msg, "sessionToken", "");
                    String nickname = getStr(msg, "nickname", "Planeswalker");
                    String password = getStr(msg, "password", "");
                    GameRoom room = roomManager.getRoom(roomId);
                    if (room == null || sessionToken.isEmpty()) {
                        JsonObject err = new JsonObject();
                        err.addProperty("type", "AUTH_ERROR");
                        err.addProperty("message", "Stanza non trovata o sessione non valida.");
                        ctx.channel().writeAndFlush(new TextWebSocketFrame(GSON.toJson(err)))
                                .addListener(ChannelFutureListener.CLOSE);
                        return;
                    }
                    int slotRes = room.joinOrReconnect(sessionToken, nickname, password);
                    if (slotRes == -2) {
                        JsonObject err = new JsonObject();
                        err.addProperty("type", "AUTH_ERROR");
                        err.addProperty("message", "Password della stanza errata.");
                        ctx.channel().writeAndFlush(new TextWebSocketFrame(GSON.toJson(err)))
                                .addListener(ChannelFutureListener.CLOSE);
                        return;
                    }
                    ctx.channel().attr(ATTR_ROOM_ID).set(roomId);
                    ctx.channel().attr(ATTR_SESSION_TOKEN).set(sessionToken);
                    room.registerWebSocket(sessionToken, ctx.channel());
                    return;
                }

                String roomId = ctx.channel().attr(ATTR_ROOM_ID).get();
                String sessionToken = ctx.channel().attr(ATTR_SESSION_TOKEN).get();
                if (roomId == null || roomId.isEmpty() || sessionToken == null || sessionToken.isEmpty()) {
                    return;
                }

                GameRoom room = roomManager.getRoom(roomId);
                if (room != null) {
                    room.handleWebSocketMessage(sessionToken, msg);
                }
            } catch (Exception e) {
                System.err.println("[ForgeWebServer] Error handling WS message: " + e.getMessage());
            }
        }

        private void serveStaticFile(ChannelHandlerContext ctx, String requestPath) {
            if (staticDistDir == null || !staticDistDir.isDirectory()) {
                JsonObject info = new JsonObject();
                info.addProperty("message", "Lozzander Online Backend attivo.");
                sendJson(ctx, HttpResponseStatus.OK, info);
                return;
            }
            try {
                String cleanPath = requestPath.equals("/") ? "/index.html" : requestPath;
                File target = new File(staticDistDir, cleanPath).getCanonicalFile();
                boolean isHashedAsset = cleanPath.startsWith("/assets/");
                if (!target.getPath().startsWith(staticDistDir.getCanonicalPath()) || !target.isFile()) {
                    // SPA fallback to index.html
                    target = new File(staticDistDir, "index.html");
                    isHashedAsset = false;
                }
                if (!target.isFile()) {
                    sendJsonError(ctx, HttpResponseStatus.NOT_FOUND, "File non trovato");
                    return;
                }
                byte[] bytes = Files.readAllBytes(target.toPath());
                ByteBuf content = Unpooled.wrappedBuffer(bytes);
                FullHttpResponse res = new DefaultFullHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.OK, content);
                res.headers().set(HttpHeaderNames.CONTENT_TYPE, guessMimeType(target.getName()));
                res.headers().setInt(HttpHeaderNames.CONTENT_LENGTH, bytes.length);
                addSecurityAndCorsHeaders(res, false);
                res.headers().set(
                        HttpHeaderNames.CACHE_CONTROL,
                        isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache"
                );
                ctx.writeAndFlush(res);
            } catch (Exception e) {
                sendJsonError(ctx, HttpResponseStatus.INTERNAL_SERVER_ERROR, "Errore caricamento risorsa.");
            }
        }
    }

    private static String extractSessionToken(FullHttpRequest req, QueryStringDecoder decoder, JsonObject body) {
        String headerToken = req.headers().get("X-Session-Token");
        if (headerToken != null && !headerToken.isBlank()) {
            return headerToken.trim();
        }
        String bodyToken = getStr(body, "sessionToken", "");
        if (!bodyToken.isBlank()) {
            return bodyToken.trim();
        }
        return getParam(decoder, "sessionToken", "").trim();
    }

    private static String guessMimeType(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html; charset=UTF-8";
        if (lower.endsWith(".js")) return "application/javascript; charset=UTF-8";
        if (lower.endsWith(".css")) return "text/css; charset=UTF-8";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".json")) return "application/json; charset=UTF-8";
        return "application/octet-stream";
    }

    private static JsonObject parseJsonBody(FullHttpRequest req) {
        if (req.content().readableBytes() > 512 * 1024) {
            throw new IllegalArgumentException("Payload JSON troppo grande.");
        }
        String content = req.content().toString(CharsetUtil.UTF_8);
        if (content == null || content.isBlank()) {
            return new JsonObject();
        }
        try {
            JsonElement el = JsonParser.parseString(content);
            return el.isJsonObject() ? el.getAsJsonObject() : new JsonObject();
        } catch (Exception e) {
            return new JsonObject();
        }
    }

    private static String getParam(QueryStringDecoder decoder, String key, String defaultVal) {
        List<String> vals = decoder.parameters().get(key);
        return (vals != null && !vals.isEmpty()) ? vals.get(0) : defaultVal;
    }

    private static int getIntParam(QueryStringDecoder decoder, String key, int defaultVal) {
        String v = getParam(decoder, key, "");
        if (v.isEmpty()) return defaultVal;
        try { return Integer.parseInt(v); } catch (NumberFormatException e) { return defaultVal; }
    }

    private static String getStr(JsonObject obj, String key, String defaultVal) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) {
            return defaultVal;
        }
        return obj.get(key).getAsString();
    }

    private static void sendJson(ChannelHandlerContext ctx, HttpResponseStatus status, JsonObject body) {
        byte[] bytes = GSON.toJson(body).getBytes(StandardCharsets.UTF_8);
        ByteBuf buf = Unpooled.wrappedBuffer(bytes);
        FullHttpResponse res = new DefaultFullHttpResponse(HttpVersion.HTTP_1_1, status, buf);
        res.headers().set(HttpHeaderNames.CONTENT_TYPE, "application/json; charset=UTF-8");
        res.headers().setInt(HttpHeaderNames.CONTENT_LENGTH, bytes.length);
        addSecurityAndCorsHeaders(res, true);
        ctx.writeAndFlush(res);
    }

    private static void sendJsonError(ChannelHandlerContext ctx, HttpResponseStatus status, String errorMsg) {
        JsonObject err = new JsonObject();
        err.addProperty("error", errorMsg != null ? errorMsg : "Errore richiesta.");
        sendJson(ctx, status, err);
    }

    private static void addCorsHeaders(HttpResponse res) {
        addSecurityAndCorsHeaders(res, true);
    }

    private static void addSecurityAndCorsHeaders(HttpResponse res, boolean isApi) {
        res.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_ORIGIN, "*");
        res.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, PUT, DELETE, OPTIONS");
        res.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_HEADERS, "Content-Type, Authorization, X-Session-Token");
        res.headers().set("X-Content-Type-Options", "nosniff");
        res.headers().set("X-Frame-Options", "DENY");
        res.headers().set("Referrer-Policy", "no-referrer");
        res.headers().set("X-XSS-Protection", "1; mode=block");
        if (isApi) {
            res.headers().set(HttpHeaderNames.CACHE_CONTROL, "no-store, no-cache, must-revalidate");
        }
    }

    private static String getWebSocketLocation(FullHttpRequest req) {
        String host = req.headers().get(HttpHeaderNames.HOST, "localhost:8080");
        return "ws://" + host + req.uri();
    }
}
