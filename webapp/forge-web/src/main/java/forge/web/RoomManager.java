package forge.web;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.gamemodes.match.LobbySlot;
import forge.gamemodes.match.LobbySlotType;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Manages all active multiplayer rooms in the Forge Web Server.
 */
public class RoomManager {

    private final Map<String, GameRoom> rooms = new ConcurrentHashMap<>();
    private final DeckCatalogService deckService;

    public RoomManager(DeckCatalogService deckService) {
        this.deckService = deckService;
    }

    public static String normalizeRoomId(String rawId) {
        if (rawId == null) return "";
        return rawId.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9_-]", "");
    }

    public String generateRoomId() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        while (true) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 6; i++) {
                sb.append(chars.charAt(ThreadLocalRandom.current().nextInt(chars.length())));
            }
            String id = sb.toString();
            if (!rooms.containsKey(id)) {
                return id;
            }
        }
    }

    public synchronized GameRoom createRoom(String requestedRoomId, String roomName, String password,
                                            String hostSessionToken, String hostNickname,
                                            boolean isCommander, int maxPlayers) {
        String roomId = normalizeRoomId(requestedRoomId);
        if (roomId.isEmpty()) {
            roomId = generateRoomId();
        }
        if (rooms.containsKey(roomId)) {
            throw new IllegalArgumentException("Esiste già una stanza con ID \"" + roomId + "\". Scegli un altro ID o unisciti a quella stanza.");
        }
        int clampedPlayers = Math.max(2, Math.min(8, maxPlayers));
        GameRoom room = new GameRoom(
                roomId,
                roomName,
                password,
                hostSessionToken,
                hostNickname,
                isCommander,
                clampedPlayers,
                deckService
        );
        rooms.put(roomId, room);
        return room;
    }

    public GameRoom getRoom(String roomId) {
        if (roomId == null) return null;
        return rooms.get(normalizeRoomId(roomId));
    }

    public JsonArray listRoomsJson(String viewerSessionToken) {
        JsonArray arr = new JsonArray();
        List<GameRoom> sorted = new ArrayList<>(rooms.values());
        sorted.sort((a, b) -> a.getRoomId().compareToIgnoreCase(b.getRoomId()));

        for (GameRoom room : sorted) {
            JsonObject obj = new JsonObject();
            obj.addProperty("roomId", room.getRoomId());
            obj.addProperty("roomName", room.getRoomName());
            obj.addProperty("hasPassword", room.hasPassword());
            obj.addProperty("isCommander", room.isCommanderFormat());
            obj.addProperty("format", room.isCommanderFormat() ? "Commander (EDH)" : "Constructed");
            obj.addProperty("matchActive", room.getLobby().isMatchActive());
            obj.addProperty("isMember", room.isSessionInRoom(viewerSessionToken));

            int humanCount = 0;
            int aiCount = 0;
            int openCount = 0;
            int totalSlots = room.getLobby().getNumberOfSlots();
            for (int i = 0; i < totalSlots; i++) {
                LobbySlot slot = room.getLobby().getSlot(i);
                if (slot == null) continue;
                if (slot.getType() == LobbySlotType.REMOTE || slot.getType() == LobbySlotType.LOCAL) humanCount++;
                else if (slot.getType() == LobbySlotType.AI) aiCount++;
                else if (slot.getType() == LobbySlotType.OPEN) openCount++;
            }
            obj.addProperty("humanCount", humanCount);
            obj.addProperty("aiCount", aiCount);
            obj.addProperty("openSlots", openCount);
            obj.addProperty("totalSlots", totalSlots);
            arr.add(obj);
        }
        return arr;
    }
}
