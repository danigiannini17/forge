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

    private static String resolveForgeGuiDir() {
        String env = System.getenv("FORGE_ASSETS_DIR");
        if (env != null && new File(env, "res").isDirectory()) {
            return new File(env).getAbsolutePath() + "/";
        }
        String[] candidates = {
                "/home/antigravity/danigiannini17/forge/forge-gui",
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
        String[] candidates = {
                "/home/antigravity/danigiannini17/forge/webapp/frontend/dist",
                "../frontend/dist",
                "./webapp/frontend/dist"
        };
        for (String c : candidates) {
            File f = new File(c);
            if (f.isDirectory()) return f;
        }
        return new File("/home/antigravity/danigiannini17/forge/webapp/frontend/dist");
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
            System.out.println("  Forge Multiplayer Web Server listening on port " + port);
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

                ctx.channel().attr(ATTR_ROOM_ID).set(RoomManager.normalizeRoomId(roomId));
                ctx.channel().attr(ATTR_SESSION_TOKEN).set(sessionToken);

                WebSocketServerHandshakerFactory wsFactory = new WebSocketServerHandshakerFactory(
                        getWebSocketLocation(req), null, true, 4 * 1024 * 1024
                );
                handshaker = wsFactory.newHandshaker(req);
                if (handshaker == null) {
                    WebSocketServerHandshakerFactory.sendUnsupportedVersionResponse(ctx.channel());
                } else {
                    handshaker.handshake(ctx.channel(), req).addListener((ChannelFutureListener) future -> {
                        if (future.isSuccess() && !roomId.isEmpty() && !sessionToken.isEmpty()) {
                            GameRoom room = roomManager.getRoom(roomId);
                            if (room != null) {
                                room.joinOrReconnect(sessionToken, nickname, password);
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
                    e.printStackTrace();
                    sendJsonError(ctx, HttpResponseStatus.INTERNAL_SERVER_ERROR, "Errore interno: " + e.getMessage());
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

            if (path.equals("/api/status") && method == HttpMethod.GET) {
                JsonObject res = new JsonObject();
                res.addProperty("status", "ok");
                res.addProperty("version", GuiBase.getInterface().getCurrentVersion());
                res.addProperty("loadedCards", FModel.getMagicDb().getCommonCards().getUniqueCards().size());
                sendJson(ctx, HttpResponseStatus.OK, res);
                return;
            }

            if (path.equals("/api/rooms") && method == HttpMethod.GET) {
                String sessionToken = getParam(decoder, "sessionToken", "");
                JsonObject res = new JsonObject();
                res.add("rooms", roomManager.listRoomsJson(sessionToken));
                sendJson(ctx, HttpResponseStatus.OK, res);
                return;
            }

            if (path.equals("/api/rooms") && method == HttpMethod.POST) {
                String roomId = getStr(body, "roomId", "");
                String roomName = getStr(body, "roomName", "");
                String password = getStr(body, "password", "");
                String sessionToken = getStr(body, "sessionToken", UUID.randomUUID().toString());
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
                String sessionToken = getStr(body, "sessionToken", "");
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
                    String sessionToken = getStr(body, "sessionToken", "");
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

                if (parts.length == 1 && method == HttpMethod.GET) {
                    String sessionToken = getParam(decoder, "sessionToken", "");
                    JsonObject res = new JsonObject();
                    res.add("room", room.toRoomJson(sessionToken));
                    if (room.getLobby().isMatchActive() || room.getLobby().getHostedMatch() != null) {
                        res.add("game", room.buildGameStateEnvelope(sessionToken).getAsJsonObject("game"));
                    }
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                if (parts.length == 2 && "slot".equals(parts[1]) && method == HttpMethod.POST) {
                    String sessionToken = getStr(body, "sessionToken", "");
                    int slotIndex = body.has("slotIndex") ? body.get("slotIndex").getAsInt() : 0;
                    String slotType = body.has("slotType") && !body.get("slotType").isJsonNull() ? body.get("slotType").getAsString() : null;
                    Integer team = body.has("team") && !body.get("team").isJsonNull() ? body.get("team").getAsInt() : null;
                    Boolean ready = body.has("ready") && !body.get("ready").isJsonNull() ? body.get("ready").getAsBoolean() : null;

                    room.configureSlot(sessionToken, slotIndex, slotType, team, ready);
                    JsonObject res = new JsonObject();
                    res.addProperty("success", true);
                    res.add("room", room.toRoomJson(sessionToken));
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                if (parts.length == 2 && "slots-count".equals(parts[1]) && method == HttpMethod.POST) {
                    String sessionToken = getStr(body, "sessionToken", "");
                    boolean add = !body.has("add") || body.get("add").getAsBoolean();
                    room.addOrRemoveSlot(add);
                    JsonObject res = new JsonObject();
                    res.addProperty("success", true);
                    res.add("room", room.toRoomJson(sessionToken));
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                if (parts.length == 2 && "format".equals(parts[1]) && method == HttpMethod.POST) {
                    String sessionToken = getStr(body, "sessionToken", "");
                    boolean isCommander = !body.has("isCommander") || body.get("isCommander").getAsBoolean();
                    room.setFormat(sessionToken, isCommander);
                    JsonObject res = new JsonObject();
                    res.addProperty("success", true);
                    res.add("room", room.toRoomJson(sessionToken));
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                if (parts.length == 2 && "deck".equals(parts[1]) && method == HttpMethod.POST) {
                    String sessionToken = getStr(body, "sessionToken", "");
                    Integer mySlot = room.getSlotForSession(sessionToken);
                    int slotIndex = body.has("slotIndex") ? body.get("slotIndex").getAsInt() : (mySlot != null ? mySlot : 0);
                    String mode = getStr(body, "mode", "CATALOG").toUpperCase(Locale.ROOT);

                    Deck chosenDeck = null;
                    List<String> warnings = new ArrayList<>();

                    switch (mode) {
                        case "CATALOG" -> {
                            String deckId = getStr(body, "deckId", "");
                            chosenDeck = deckService.loadCatalogDeck(deckId);
                            if (chosenDeck == null) {
                                sendJsonError(ctx, HttpResponseStatus.BAD_REQUEST, "Mazzo del catalogo non trovato: " + deckId);
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

                    room.setSlotDeck(slotIndex, chosenDeck);
                    JsonObject serializedDeck = DeckCatalogService.serializeDeck(chosenDeck);
                    JsonObject res = new JsonObject();
                    res.addProperty("success", true);
                    res.addProperty("ok", true);
                    res.add("room", room.toRoomJson(sessionToken));
                    res.add("deck", serializedDeck);
                    res.add("deckSummary", serializedDeck);
                    JsonArray warnArr = new JsonArray();
                    for (String w : warnings) warnArr.add(w);
                    res.add("warnings", warnArr);
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                if (parts.length == 4 && "slot".equals(parts[1]) && "deck".equals(parts[3]) && method == HttpMethod.GET) {
                    int slotIdx = Integer.parseInt(parts[2]);
                    var slot = room.getLobby().getSlot(slotIdx);
                    Deck d = slot != null ? slot.getDeck() : null;
                    JsonObject res = new JsonObject();
                    res.add("deck", DeckCatalogService.serializeDeck(d));
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                if (parts.length == 2 && "start".equals(parts[1]) && method == HttpMethod.POST) {
                    String sessionToken = getStr(body, "sessionToken", "");
                    String error = room.startMatch();
                    if (error != null) {
                        sendJsonError(ctx, HttpResponseStatus.BAD_REQUEST, error);
                        return;
                    }
                    JsonObject res = new JsonObject();
                    res.addProperty("success", true);
                    res.addProperty("ok", true);
                    res.add("room", room.toRoomJson(sessionToken));
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }

                if (parts.length == 2 && "leave".equals(parts[1]) && method == HttpMethod.POST) {
                    String sessionToken = getStr(body, "sessionToken", "");
                    room.leaveRoom(sessionToken);
                    JsonObject res = new JsonObject();
                    res.addProperty("success", true);
                    sendJson(ctx, HttpResponseStatus.OK, res);
                    return;
                }
            }

            if (path.equals("/api/decks/catalog") && method == HttpMethod.GET) {
                String category = getParam(decoder, "category", "ALL");
                String q = getParam(decoder, "q", "");
                int limit = getIntParam(decoder, "limit", 500);
                sendJson(ctx, HttpResponseStatus.OK, deckService.getCatalogJson(category, q, limit));
                return;
            }

            if ((path.equals("/api/decks/catalog/load") || path.equals("/api/decks/preview")) && method == HttpMethod.GET) {
                String id = getParam(decoder, "id", "");
                Deck d = deckService.loadCatalogDeck(id);
                if (d == null) {
                    sendJsonError(ctx, HttpResponseStatus.NOT_FOUND, "Mazzo non trovato: " + id);
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
                int limit = getIntParam(decoder, "limit", 48);

                JsonObject res = new JsonObject();
                res.add("cards", deckService.searchCards(q, colors, type, commanderOnly, limit));
                sendJson(ctx, HttpResponseStatus.OK, res);
                return;
            }

            sendJsonError(ctx, HttpResponseStatus.NOT_FOUND, "Endpoint API non trovato: " + path);
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
                JsonObject msg = JsonParser.parseString(textFrame.text()).getAsJsonObject();
                String type = getStr(msg, "type", "");
                if ("AUTH".equals(type)) {
                    String roomId = RoomManager.normalizeRoomId(getStr(msg, "roomId", ""));
                    String sessionToken = getStr(msg, "sessionToken", "");
                    String nickname = getStr(msg, "nickname", "Planeswalker");
                    String password = getStr(msg, "password", "");
                    ctx.channel().attr(ATTR_ROOM_ID).set(roomId);
                    ctx.channel().attr(ATTR_SESSION_TOKEN).set(sessionToken);
                    GameRoom room = roomManager.getRoom(roomId);
                    if (room != null && !sessionToken.isEmpty()) {
                        room.joinOrReconnect(sessionToken, nickname, password);
                        room.registerWebSocket(sessionToken, ctx.channel());
                    }
                    return;
                }

                String roomId = ctx.channel().attr(ATTR_ROOM_ID).get();
                String sessionToken = ctx.channel().attr(ATTR_SESSION_TOKEN).get();
                if (roomId == null || roomId.isEmpty()) {
                    roomId = RoomManager.normalizeRoomId(getStr(msg, "roomId", ""));
                }
                if (sessionToken == null || sessionToken.isEmpty()) {
                    sessionToken = getStr(msg, "sessionToken", "");
                }

                GameRoom room = roomManager.getRoom(roomId);
                if (room != null && sessionToken != null) {
                    room.handleWebSocketMessage(sessionToken, msg);
                }
            } catch (Exception e) {
                System.err.println("[ForgeWebServer] Error handling WS message: " + e.getMessage());
            }
        }

        private void serveStaticFile(ChannelHandlerContext ctx, String requestPath) {
            if (staticDistDir == null || !staticDistDir.isDirectory()) {
                JsonObject info = new JsonObject();
                info.addProperty("message", "Forge Web Backend attivo. Usa il frontend React o compila webapp/frontend/dist.");
                sendJson(ctx, HttpResponseStatus.OK, info);
                return;
            }
            try {
                String cleanPath = requestPath.equals("/") ? "/index.html" : requestPath;
                File target = new File(staticDistDir, cleanPath).getCanonicalFile();
                if (!target.getPath().startsWith(staticDistDir.getCanonicalPath()) || !target.isFile()) {
                    // SPA fallback to index.html
                    target = new File(staticDistDir, "index.html");
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
                addCorsHeaders(res);
                ctx.writeAndFlush(res);
            } catch (Exception e) {
                sendJsonError(ctx, HttpResponseStatus.INTERNAL_SERVER_ERROR, e.getMessage());
            }
        }
    }

    private static String guessMimeType(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html; charset=UTF-8";
        if (lower.endsWith(".js")) return "application/javascript; charset=UTF-8";
        if (lower.endsWith(".css")) return "text/css; charset=UTF-8";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".json")) return "application/json; charset=UTF-8";
        return "application/octet-stream";
    }

    private static JsonObject parseJsonBody(FullHttpRequest req) {
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
        addCorsHeaders(res);
        ctx.writeAndFlush(res);
    }

    private static void sendJsonError(ChannelHandlerContext ctx, HttpResponseStatus status, String errorMsg) {
        JsonObject err = new JsonObject();
        err.addProperty("error", errorMsg);
        sendJson(ctx, status, err);
    }

    private static void addCorsHeaders(HttpResponse res) {
        res.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_ORIGIN, "*");
        res.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, PUT, DELETE, OPTIONS");
        res.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_HEADERS, "Content-Type, Authorization, X-Session-Token");
    }

    private static String getWebSocketLocation(FullHttpRequest req) {
        String host = req.headers().get(HttpHeaderNames.HOST, "localhost:8080");
        return "ws://" + host + req.uri();
    }
}
