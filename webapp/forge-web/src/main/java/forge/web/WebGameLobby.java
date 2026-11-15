package forge.web;

import forge.gamemodes.match.GameLobby;
import forge.gamemodes.match.LobbySlot;
import forge.gamemodes.match.LobbySlotType;
import forge.gui.interfaces.IGuiGame;

import java.util.Collections;

/**
 * Server-side {@link GameLobby} for a multi-player web room.
 * Supports up to 8 players (human {@link LobbySlotType#REMOTE} or bot {@link LobbySlotType#AI})
 * and variants such as {@link forge.game.GameType#Commander}.
 */
public class WebGameLobby extends GameLobby {

    private final GameRoom room;

    public WebGameLobby(GameRoom room, int initialSlots) {
        super();
        this.room = room;
        int count = Math.max(2, Math.min(8, initialSlots));
        for (int i = 0; i < count; i++) {
            addSlot(new LobbySlot(
                    LobbySlotType.OPEN,
                    null,
                    i,
                    i,
                    i,
                    false,
                    false,
                    Collections.emptySet()
            ));
        }
    }

    @Override
    public boolean hasControl() {
        return true;
    }

    @Override
    public boolean mayEdit(int index) {
        return true;
    }

    @Override
    public boolean mayControl(int index) {
        return true;
    }

    @Override
    public boolean mayRemove(int index) {
        return getNumberOfSlots() > 2;
    }

    @Override
    protected IGuiGame getGui(int index) {
        return room.getOrCreateGuiForSlot(index);
    }

    @Override
    protected void onGameStarted() {
        room.onGameStarted();
    }

    @Override
    protected void onMatchOver() {
        super.onMatchOver();
        room.onMatchOver();
    }
}
