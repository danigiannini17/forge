import React, { useState, useRef, useEffect } from 'react';
import { ChatEntry, RoomSlotInfo, RoomState } from '../types';
import { DeckSelectorModal } from './DeckSelectorModal';
import {
  startRoomMatch,
  updateRoomFormatApi,
  updateRoomSlotsCountApi,
} from '../api';
import {
  Bot,
  Check,
  Copy,
  Crown,
  Layers,
  Lock,
  LogOut,
  MessageSquare,
  Minus,
  Play,
  Plus,
  Send,
  Shield,
  Sparkles,
  Trash2,
  User,
  UserPlus,
  Users,
} from 'lucide-react';

interface LobbyViewProps {
  room: RoomState;
  sessionToken: string;
  nickname: string;
  chatMessages: ChatEntry[];
  onSendWs: (payload: Record<string, any>) => void;
  onRoomUpdated: (room: RoomState) => void;
  onLeaveRoom: () => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  room,
  sessionToken,
  nickname,
  chatMessages,
  onSendWs,
  onRoomUpdated,
  onLeaveRoom,
}) => {
  const [editingDeckSlot, setEditingDeckSlot] = useState<RoomSlotInfo | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [updatingRoomCfg, setUpdatingRoomCfg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  }, [chatMessages.length]);

  const handleCopyRoomId = () => {
    navigator.clipboard?.writeText(room.roomId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleToggleReady = (slot: RoomSlotInfo) => {
    onSendWs({
      type: 'SET_READY',
      slotIndex: slot.slotIndex,
      ready: !slot.isReady,
    });
  };

  const handleClaimSeat = (slotIndex: number) => {
    onSendWs({
      type: 'CLAIM_SLOT',
      slotIndex,
      nickname,
    });
  };

  const handleAddBot = (slotIndex: number) => {
    onSendWs({
      type: 'ADD_BOT',
      slotIndex,
    });
  };

  const handleRemoveBotOrOpen = (slotIndex: number) => {
    onSendWs({
      type: 'REMOVE_BOT',
      slotIndex,
    });
  };

  const handleChangeTeam = (slotIndex: number, uiTeam: number) => {
    onSendWs({
      type: 'CHANGE_TEAM',
      slotIndex,
      team: Math.max(0, Math.min(7, uiTeam - 1)),
    });
  };

  const handleToggleFormat = async () => {
    if (!room.isHost || updatingRoomCfg) return;
    setUpdatingRoomCfg(true);
    setErrorMsg(null);
    try {
      const updated = await updateRoomFormatApi(
        room.roomId,
        sessionToken,
        !room.isCommander
      );
      onRoomUpdated(updated);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setUpdatingRoomCfg(false);
    }
  };

  const handleAdjustSlotsCount = async (delta: number) => {
    if (!room.isHost || updatingRoomCfg) return;
    const nextCount = Math.max(2, Math.min(8, room.maxPlayers + delta));
    if (nextCount === room.maxPlayers) return;
    setUpdatingRoomCfg(true);
    setErrorMsg(null);
    try {
      const updated = await updateRoomSlotsCountApi(
        room.roomId,
        sessionToken,
        delta > 0
      );
      onRoomUpdated(updated);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setUpdatingRoomCfg(false);
    }
  };

  const handleStartMatch = async () => {
    setStartingGame(true);
    setErrorMsg(null);
    try {
      const res = await startRoomMatch(room.roomId, sessionToken);
      onRoomUpdated(res.room);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setStartingGame(false);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendWs({
      type: 'CHAT',
      message: chatInput.trim(),
    });
    setChatInput('');
  };

  const activeParticipantCount = room.slots.filter(
    (s) => s.type === 'REMOTE' || s.type === 'AI'
  ).length;

  return (
    <div className="lobby-container">
      {/* Top Room Banner */}
      <header className="lobby-header-card">
        <div className="lobby-header-left">
          <div className="room-id-badge" onClick={handleCopyRoomId} title="Clicca per copiare l'ID Stanza">
            <span className="room-id-label">STANZA ID</span>
            <span className="room-id-code">{room.roomId}</span>
            {copiedId ? <Check size={15} className="emerald-icon" /> : <Copy size={15} />}
          </div>
          <div>
            <h1 className="lobby-room-title">
              {room.roomName}
              {room.hasPassword && (
                <span className="lock-pill" title="Protetta da Password">
                  <Lock size={13} /> Password
                </span>
              )}
            </h1>
            <div className="lobby-meta-tags">
              <span className={`format-pill ${room.isCommander ? 'commander' : 'constructed'}`}>
                {room.isCommander ? (
                  <>
                    <Crown size={13} /> Commander / EDH (100 Carte • 40 PV)
                  </>
                ) : (
                  <>
                    <Layers size={13} /> Costruito (60 Carte • 20 PV)
                  </>
                )}
              </span>
              <span className="players-pill">
                <Users size={13} /> {activeParticipantCount} / {room.maxPlayers} Giocatori al Tavolo
              </span>
              {room.isHost && (
                <span className="host-pill">
                  <Sparkles size={13} /> Sei l&apos;Host della Stanza
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="lobby-header-actions">
          <button type="button" className="btn-secondary" onClick={onLeaveRoom}>
            <LogOut size={16} /> Esci dalla Stanza
          </button>
          {room.isHost && (
            <button
              type="button"
              className="btn-primary btn-lg"
              disabled={startingGame || activeParticipantCount < 2}
              onClick={handleStartMatch}
            >
              <Play size={18} />{' '}
              {startingGame ? 'Avvio Partita in corso...' : 'Avvia Partita sul Tavolo'}
            </button>
          )}
        </div>
      </header>

      {errorMsg && <div className="alert-error">{errorMsg}</div>}

      <div className="lobby-main-grid">
        {/* Seats Panel */}
        <section className="seats-section">
          <div className="section-heading between-wrap">
            <div>
              <h2>Posti al Tavolo ({room.maxPlayers} Slot)</h2>
              <p className="muted-p">
                Scegli il tuo posto, seleziona o costruisci il tuo mazzo e premi{' '}
                <strong>Pronto</strong>. L&apos;Host può anche aggiungere Bot IA negli slot
                liberi.
              </p>
            </div>
            {room.isHost && (
              <div className="host-lobby-controls">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={updatingRoomCfg}
                  onClick={handleToggleFormat}
                  title="Cambia formato tra Commander (100 carte, 40 PV) e Costruito (60 carte, 20 PV)"
                >
                  {room.isCommander ? 'Passa a Costruito' : 'Passa a Commander'}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={updatingRoomCfg || room.maxPlayers <= 2}
                  onClick={() => handleAdjustSlotsCount(-1)}
                  title="Riduci numero posti al tavolo"
                >
                  <Minus size={13} /> Posto
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={updatingRoomCfg || room.maxPlayers >= 8}
                  onClick={() => handleAdjustSlotsCount(1)}
                  title="Aggiungi un posto al tavolo (fino a 8 giocatori)"
                >
                  <Plus size={13} /> Posto
                </button>
              </div>
            )}
          </div>

          <div className="seats-grid">
            {room.slots.map((slot) => {
              const canEditSlot = slot.isMe || (room.isHost && slot.type === 'AI');
              return (
                <div
                  key={slot.slotIndex}
                  className={`seat-card seat-${slot.type.toLowerCase()} ${
                    slot.isMe ? 'seat-me' : ''
                  } ${slot.isReady ? 'seat-ready' : ''}`}
                >
                  <div className="seat-card-top">
                    <div className="seat-identity">
                      <span className="seat-number">#{slot.slotIndex + 1}</span>
                      {slot.type === 'REMOTE' && <User size={18} className="seat-icon human" />}
                      {slot.type === 'AI' && <Bot size={18} className="seat-icon bot" />}
                      {slot.type === 'OPEN' && <UserPlus size={18} className="seat-icon open" />}

                      <div>
                        <div className="seat-player-name">
                          {slot.type === 'OPEN' ? 'Posto Libero' : slot.name}
                          {slot.isMe && <span className="you-tag">TU</span>}
                        </div>
                        <div className="seat-status-sub">
                          {slot.type === 'REMOTE' && (
                            <span
                              className={`conn-dot ${
                                slot.isOnline ? 'online' : 'offline'
                              }`}
                            >
                              {slot.isOnline ? 'Connesso' : 'Riconnessione in attesa...'}
                            </span>
                          )}
                          {slot.type === 'AI' && <span>Bot IA</span>}
                          {slot.type === 'OPEN' && (
                            <span>In attesa di un giocatore o Bot IA</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {slot.type !== 'OPEN' && (
                      <div className="seat-team-selector">
                        <Shield size={13} />
                        <select
                          value={slot.team}
                          disabled={!canEditSlot && !room.isHost}
                          onChange={(e) =>
                            handleChangeTeam(slot.slotIndex, Number(e.target.value))
                          }
                          title="Squadra / Team (diverso per Tutti contro Tutti)"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((t) => (
                            <option key={t} value={t}>
                              Team {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Deck Info Box */}
                  {slot.type !== 'OPEN' ? (
                    <div className="seat-deck-box">
                      <div className="seat-deck-info">
                        <span className="seat-deck-label">Mazzo Selezionato</span>
                        <strong className="seat-deck-name">{slot.deckName}</strong>
                        <span className="seat-deck-summary">{slot.deckSummary}</span>
                        {slot.commanderCards && slot.commanderCards.length > 0 && (
                          <div className="seat-commander-chips">
                            {slot.commanderCards.map((cName) => (
                              <span key={cName} className="cmd-chip">
                                <Crown size={12} /> {cName}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {canEditSlot && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => setEditingDeckSlot(slot)}
                        >
                          <Layers size={14} /> Cambia / Costruisci Mazzo
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="seat-open-placeholder">
                      <p>Questo posto è aperto per altri giocatori che entrano con l&apos;ID stanza.</p>
                    </div>
                  )}

                  {/* Seat Footer Actions */}
                  <div className="seat-card-footer">
                    {slot.type === 'OPEN' && (
                      <div className="seat-open-btns">
                        {room.mySlotIndex === -1 && (
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={() => handleClaimSeat(slot.slotIndex)}
                          >
                            <UserPlus size={14} /> Siediti Qui
                          </button>
                        )}
                        {room.isHost && (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => handleAddBot(slot.slotIndex)}
                          >
                            <Bot size={14} /> + Aggiungi Bot IA
                          </button>
                        )}
                      </div>
                    )}

                    {slot.type === 'REMOTE' && (
                      <>
                        <div className={`ready-indicator ${slot.isReady ? 'ready' : 'not-ready'}`}>
                          {slot.isReady ? '✓ PRONTO' : 'In preparazione...'}
                        </div>
                        {slot.isMe && (
                          <button
                            type="button"
                            className={slot.isReady ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
                            onClick={() => handleToggleReady(slot)}
                          >
                            <Check size={14} />{' '}
                            {slot.isReady ? 'Annulla Pronto' : 'Sono Pronto!'}
                          </button>
                        )}
                      </>
                    )}

                    {slot.type === 'AI' && (
                      <>
                        <div className="ready-indicator ready">✓ BOT PRONTO</div>
                        {room.isHost && (
                          <button
                            type="button"
                            className="btn-ghost-danger btn-sm"
                            onClick={() => handleRemoveBotOrOpen(slot.slotIndex)}
                          >
                            <Trash2 size={14} /> Rimuovi Bot
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Chat & Room Invite Sidebar */}
        <aside className="lobby-sidebar">
          <div className="invite-info-box">
            <h3>Invita Altri Giocatori</h3>
            <p>
              Condividi il codice stanza <strong>{room.roomId}</strong>{' '}
              {room.hasPassword ? 'e la password ' : ''}con i tuoi amici. Se un giocatore aggiorna
              la pagina, il sistema lo riconosce automaticamente e gli restituisce il suo posto e
              la sua mano!
            </p>
          </div>

          <div className="chat-panel">
            <div className="chat-panel-header">
              <MessageSquare size={16} /> Chat della Stanza
            </div>
            <div className="chat-messages-list" ref={chatListRef}>
              {chatMessages.length === 0 ? (
                <div className="chat-empty">Nessun messaggio ancora. Saluta il tavolo!</div>
              ) : (
                chatMessages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`chat-bubble ${
                      m.sender === 'Sistema' ? 'chat-system' : ''
                    }`}
                  >
                    <span className="chat-sender">{m.sender}:</span>{' '}
                    <span className="chat-text">{m.message}</span>
                  </div>
                ))
              )}
            </div>
            <form className="chat-input-row" onSubmit={handleSendChat}>
              <input
                type="text"
                placeholder="Scrivi un messaggio in chat..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button type="submit" className="btn-primary btn-sm">
                <Send size={14} />
              </button>
            </form>
          </div>
        </aside>
      </div>

      {/* 4-Mode Deck Selector Modal */}
      {editingDeckSlot && (
        <DeckSelectorModal
          room={room}
          slotIndex={editingDeckSlot.slotIndex}
          slotName={editingDeckSlot.name}
          sessionToken={sessionToken}
          onClose={() => setEditingDeckSlot(null)}
          onDeckApplied={(updatedRoom) => {
            onRoomUpdated(updatedRoom);
          }}
        />
      )}
    </div>
  );
};
