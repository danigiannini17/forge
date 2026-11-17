package forge.game.mulligan;

import forge.game.card.Card;
import forge.game.card.CardCollection;
import forge.game.player.Player;
import forge.game.zone.ZoneType;

public class LondonMulligan extends AbstractMulligan {
    public LondonMulligan(Player p, boolean firstMullFree) {
        super(p, firstMullFree);
    }

    @Override
    public boolean canMulligan() {
        int nextTimes = timesMulliganed + 1;
        int nextTuck = Math.max(0, nextTimes - (firstMulliganFree ? 1 : 0));
        return !kept && (handSizeAfterNextMulligan() - nextTuck) >= 1;
    }

    @Override
    public int handSizeAfterNextMulligan() {
        return player.getMaxHandSize();
    }

    @Override
    public void mulliganDraw() {
        player.drawCards(handSizeAfterNextMulligan());
    }

    @Override
    public void keep() {
        super.keep();
        int tuckingCards = tuckCardsDuringMulligan();
        if (tuckingCards > 0) {
            CardCollection hand = new CardCollection(player.getCardsIn(ZoneType.Hand));
            int actualTuck = Math.min(tuckingCards, Math.max(0, hand.size() - 1));
            if (actualTuck > 0) {
                for (final Card c : player.getController().tuckCardsViaMulligan(hand, actualTuck)) {
                    player.getGame().getAction().moveToLibrary(c, -1, null);
                }
            }
        }
    }

    @Override
    public int tuckCardsDuringMulligan() {
        if (timesMulliganed == 0) {
            return 0;
        }

        int extraCard = firstMulliganFree ? 1 : 0;
        return timesMulliganed - extraCard;
    }
}
