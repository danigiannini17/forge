import React, { useCallback, useEffect, useState } from 'react';
import {
  CardViewState,
  ChatEntry,
  GameStatePayload,
  PlayerViewState,
  StackItemState,
} from '../types';
import { DesktopMatchLayout, MatchLayoutProps } from './match/DesktopMatchLayout';
import { MobileMatchLayout } from './match/MobileMatchLayout';
import {
  ArcMode,
  TargetingArrowsOverlay,
} from './match/TargetingArrowsOverlay';
import { CardZoomModal } from './match/CardZoomModal';
import { ChoiceModalOverlay } from './match/ChoiceModalOverlay';
import { MulliganModal } from './match/MulliganModal';
import { isEndTurnLabel } from './match/matchUtils';
import { Crown, RefreshCw } from 'lucide-react';

interface GameTableViewProps {
  gameState: GameStatePayload;
  chatMessages: ChatEntry[];
  onSendWs: (payload: Record<string, any>) => void;
  onReturnToLobby: () => void;
  onLeaveRoom: () => void;
}

function detectMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(max-width: 900px)').matches ||
    window.matchMedia('(max-width: 1024px) and (max-height: 560px)').matches
  );
}

export const GameTableView: React.FC<GameTableViewProps> = ({
  gameState,
  chatMessages,
  onSendWs,
  onReturnToLobby,
  onLeaveRoom,
}) => {
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(
    detectMobileViewport
  );
  const [layoutMode, setLayoutMode] = useState<'AUTO' | 'DESKTOP' | 'MOBILE'>(
    'AUTO'
  );

  const [inspectedCard, setInspectedCard] = useState<CardViewState | null>(null);
  const [zoomedCard, setZoomedCard] = useState<CardViewState | null>(null);
  const [zoomCardList, setZoomCardList] = useState<CardViewState[]>([]);

  const [arcMode, setArcMode] = useState<ArcMode>('ALL');
  const [hoveredStackKey, setHoveredStackKey] = useState<string | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<number | null>(null);

  // Responsive viewport listener
  useEffect(() => {
    const updateViewport = () => {
      const nextMobile = detectMobileViewport();
      setIsMobileViewport((prev) => {
        if (prev !== nextMobile) {
          setLayoutMode('AUTO');
        }
        return nextMobile;
      });
    };
    const mq1 = window.matchMedia('(max-width: 900px)');
    const mq2 = window.matchMedia('(max-width: 1024px) and (max-height: 560px)');
    mq1.addEventListener('change', updateViewport);
    mq2.addEventListener('change', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      mq1.removeEventListener('change', updateViewport);
      mq2.removeEventListener('change', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  const useMobileLayout =
    layoutMode === 'MOBILE' || (layoutMode === 'AUTO' && isMobileViewport);

  // Sync inspected card with prompt focusedCard or prompt card
  useEffect(() => {
    const target = gameState.prompt?.focusedCard || gameState.prompt?.card;
    if (target && !target.hidden) {
      setInspectedCard(target);
    }
  }, [gameState.prompt?.focusedCard?.id, gameState.prompt?.card?.id]);

  const handleInspectCard = useCallback((card: CardViewState) => {
    if (!card.hidden) {
      setInspectedCard(card);
    }
  }, []);

  const handleZoomCard = useCallback(
    (card: CardViewState, list?: CardViewState[]) => {
      if (card.hidden) return;
      setInspectedCard(card);
      setZoomCardList(
        list && list.length > 0 ? list.filter((c) => !c.hidden) : [card]
      );
      setZoomedCard(card);
    },
    []
  );

  const handleCardClick = useCallback(
    (
      card: CardViewState,
      e: React.MouseEvent | React.TouchEvent,
      otherCardIds?: number[]
    ) => {
      if (!card.hidden) {
        setInspectedCard(card);
      }
      const isShift = 'shiftKey' in e ? Boolean(e.shiftKey) : false;
      const isCtrl =
        'ctrlKey' in e ? Boolean(e.ctrlKey || e.metaKey) : false;

      onSendWs({
        type: 'SELECT_CARD',
        cardId: card.id,
        shift: isShift,
        ctrl: isCtrl,
        otherCardIds:
          isShift && otherCardIds && otherCardIds.length > 0
            ? otherCardIds
            : undefined,
      });
    },
    [onSendWs]
  );

  const handlePlayerClick = useCallback(
    (player: PlayerViewState) => {
      onSendWs({
        type: 'SELECT_PLAYER',
        playerId: player.id,
      });
    },
    [onSendWs]
  );

  const handleStackItemClick = useCallback(
    (item: StackItemState) => {
      if (item.sourceCard && !item.sourceCard.hidden) {
        setInspectedCard(item.sourceCard);
      }
      const parsedId =
        typeof item.id === 'number' ? item.id : Number(item.key);
      onSendWs({
        type: 'SELECT_STACK_ITEM',
        stackItemId: Number.isNaN(parsedId) ? -1 : parsedId,
        sourceCardId: item.sourceCard?.id ?? -1,
      });
    },
    [onSendWs]
  );

  const handleButtonOk = useCallback(() => {
    onSendWs({ type: 'BUTTON_OK' });
  }, [onSendWs]);

  const handleButtonCancel = useCallback(() => {
    onSendWs({ type: 'BUTTON_CANCEL' });
  }, [onSendWs]);

  const handleUndo = useCallback(() => {
    onSendWs({ type: 'UNDO' });
  }, [onSendWs]);

  const handleAlphaStrike = useCallback(() => {
    onSendWs({ type: 'ALPHA_STRIKE' });
  }, [onSendWs]);

  const handleUseMana = useCallback(
    (colorCode: string) => {
      onSendWs({ type: 'USE_MANA', color: colorCode });
    },
    [onSendWs]
  );

  const handleAutoPassEot = useCallback(() => {
    onSendWs({ type: 'AUTO_PASS_UNTIL_END_OF_TURN' });
  }, [onSendWs]);

  const handleYieldStackEmpty = useCallback(() => {
    onSendWs({ type: 'YIELD_UNTIL_STACK_EMPTY' });
  }, [onSendWs]);

  const handleCancelAutoPass = useCallback(() => {
    onSendWs({ type: 'CANCEL_AUTO_PASS' });
  }, [onSendWs]);

  const handleToggleAutoPassNoActions = useCallback(() => {
    onSendWs({
      type: 'SET_AUTO_PASS_NO_ACTIONS',
      enabled: !gameState.yieldState.autoPassNoActions,
    });
  }, [onSendWs, gameState.yieldState.autoPassNoActions]);

  const handleTogglePhaseStop = useCallback(
    (phaseCode: string, ownTurn: boolean) => {
      onSendWs({
        type: 'TOGGLE_SKIP_PHASE',
        phase: phaseCode,
        ownTurn,
      });
    },
    [onSendWs]
  );

  const handleSendChat = useCallback(
    (text: string) => {
      onSendWs({ type: 'CHAT', message: text });
    },
    [onSendWs]
  );

  const handleConcede = useCallback(() => {
    onSendWs({ type: 'CONCEDE' });
  }, [onSendWs]);

  const handleCycleArcMode = useCallback(() => {
    setArcMode((prev) =>
      prev === 'ALL' ? 'HOVER' : prev === 'HOVER' ? 'OFF' : 'ALL'
    );
  }, []);

  const handleSubmitModalResponse = useCallback(
    (payload: Record<string, any>) => {
      if (!gameState.pendingModal) return;
      onSendWs({
        type: 'MODAL_RESPONSE',
        requestId: gameState.pendingModal.modalId,
        modalId: gameState.pendingModal.modalId,
        ...payload,
      });
    },
    [gameState.pendingModal, onSendWs]
  );

  // Keyboard shortcuts (Space -> OK, Esc -> Close Zoom / Cancel if not End Turn, Ctrl+Z -> Undo, Z -> Zoom)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (e.key === 'Escape') {
        if (zoomedCard) {
          e.preventDefault();
          setZoomedCard(null);
          setZoomCardList([]);
          return;
        }
        if (
          !gameState.pendingModal &&
          gameState.prompt?.cancelEnabled &&
          !isEndTurnLabel(gameState.prompt.cancelText)
        ) {
          e.preventDefault();
          handleButtonCancel();
        }
        return;
      }

      if (
        e.code === 'Space' &&
        !gameState.pendingModal &&
        !zoomedCard &&
        gameState.prompt?.okEnabled
      ) {
        e.preventDefault();
        handleButtonOk();
        return;
      }

      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'z' &&
        !gameState.pendingModal &&
        !zoomedCard
      ) {
        const toZoom =
          inspectedCard ||
          gameState.prompt?.focusedCard ||
          gameState.prompt?.card;
        if (toZoom && !toZoom.hidden) {
          e.preventDefault();
          handleZoomCard(toZoom, [toZoom]);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    gameState.pendingModal,
    gameState.prompt?.okEnabled,
    gameState.prompt?.cancelEnabled,
    gameState.prompt?.cancelText,
    gameState.prompt?.focusedCard,
    gameState.prompt?.card,
    zoomedCard,
    inspectedCard,
    handleUndo,
    handleButtonOk,
    handleButtonCancel,
    handleZoomCard,
  ]);

  const layoutProps: MatchLayoutProps = {
    gameState,
    chatMessages,
    inspectedCard,
    arcMode,
    onCycleArcMode: handleCycleArcMode,
    onInspectCard: handleInspectCard,
    onHoverCard: setHoveredCardId,
    onZoomCard: handleZoomCard,
    onCardClick: handleCardClick,
    onPlayerClick: handlePlayerClick,
    onStackItemClick: handleStackItemClick,
    hoveredStackKey,
    onHoverStackItem: setHoveredStackKey,
    onButtonOk: handleButtonOk,
    onButtonCancel: handleButtonCancel,
    onUndo: handleUndo,
    onAlphaStrike: handleAlphaStrike,
    onUseMana: handleUseMana,
    onAutoPassEot: handleAutoPassEot,
    onYieldStackEmpty: handleYieldStackEmpty,
    onCancelAutoPass: handleCancelAutoPass,
    onToggleAutoPassNoActions: handleToggleAutoPassNoActions,
    onTogglePhaseStop: handleTogglePhaseStop,
    onSendChat: handleSendChat,
    onConcede: handleConcede,
    onLeaveRoom,
    onSwitchLayoutMode: (mode) => setLayoutMode(mode),
  };

  return (
    <>
      {useMobileLayout ? (
        <MobileMatchLayout {...layoutProps} />
      ) : (
        <DesktopMatchLayout {...layoutProps} />
      )}

      <TargetingArrowsOverlay
        gameState={gameState}
        arcMode={arcMode}
        hoveredStackKey={hoveredStackKey}
        hoveredCardId={hoveredCardId}
      />

      <ChoiceModalOverlay
        gameState={gameState}
        isTouchMode={useMobileLayout}
        onSubmitModalResponse={handleSubmitModalResponse}
        onInspectCard={handleInspectCard}
        onZoomCard={handleZoomCard}
      />

      {!gameState.gameOver && gameState.mulliganState?.active && (
        <MulliganModal
          gameState={gameState}
          onCardClick={handleCardClick}
          onInspectCard={handleInspectCard}
          onZoomCard={handleZoomCard}
          onButtonOk={handleButtonOk}
          onButtonCancel={handleButtonCancel}
        />
      )}

      <CardZoomModal
        card={zoomedCard}
        cardList={zoomCardList}
        onClose={() => {
          setZoomedCard(null);
          setZoomCardList([]);
        }}
        onSelectCard={(cardItem) => {
          onSendWs({
            type: 'SELECT_CARD',
            cardId: cardItem.id,
            shift: false,
            ctrl: false,
          });
        }}
      />

      {gameState.gameOver && (
        <div className="modal-backdrop">
          <div className="modal-surface game-over-modal">
            <Crown size={42} className="gold-icon" />
            <h2>Partita Conclusa!</h2>
            {gameState.winningPlayerName && (
              <div className="winner-banner-pill">
                🏆 Vincitore: {gameState.winningPlayerName}
              </div>
            )}
            {gameState.winStandings && gameState.winStandings.length > 0 && (
              <div className="gameover-standings-row">
                {gameState.winStandings.map((st) => (
                  <div
                    key={st.name}
                    className={`gameover-standing-pill ${
                      st.name === gameState.winningPlayerName ? 'is-winner' : ''
                    }`}
                  >
                    <span>{st.name}</span>
                    <strong>
                      {st.wins} {st.wins === 1 ? 'vittoria' : 'vittorie'}
                    </strong>
                  </div>
                ))}
              </div>
            )}
            <p>
              La partita sul tavolo <strong>{gameState.title}</strong> è
              terminata. Puoi tornare nella Lobby della stanza per una rivincita
              immediata o uscire verso la Home.
            </p>
            <div className="modal-footer-bar">
              <button
                type="button"
                className="btn-secondary"
                onClick={onLeaveRoom}
              >
                Esci dalla Stanza
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={onReturnToLobby}
              >
                <RefreshCw size={15} /> Torna alla Lobby (Rivincita)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
