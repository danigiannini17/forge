import React, { useState, useRef, useEffect } from 'react';
import { ChatEntry, RoomSlotInfo, RoomState } from '../types';
import { DeckSelectorModal } from './DeckSelectorModal';
import { ManaSymbolBadge } from './ManaText';
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

function getCommanderArtFallbackUrl(commanderName?: string): string {
  if (!commanderName) return '';
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(
    commanderName
  )}&format=image&version=art_crop`;
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

  const mySlot =
    room.slots.find((s) => s.isMe) ||
    (room.mySlotIndex >= 0 ? room.slots[room.mySlotIndex] : undefined);
  const myCommanderName = mySlot?.commanderCards?.[0] || '';
  const myCommanderBannerArt =
    mySlot?.commanderArtCropUrl ||
    getCommanderArtFallbackUrl(myCommanderName) ||
    mySlot?.commanderImageUrl ||
    '';

  return (
    <div className="lobby-container">
      {/* Top Room Header Bar */}
      <header className="lobby-header-card">
        <div className="lobby-header-left">
          <button
            type="button"
            className="room-id-badge"
            onClick={handleCopyRoomId}
            title="Clicca per copiare l'ID Stanza"
          >
            <span className="room-id-label">CODICE STANZA</span>
            <span className="room-id-code-row">
              <span className="room-id-code">{room.roomId}</span>
              {copiedId ? (
                <Check size={14} className="emerald-icon" />
              ) : (
                <Copy size={14} className="cyan-icon" />
              )}
            </span>
          </button>

          <div className="lobby-title-block">
            <h1 className="lobby-room-title">
              {room.roomName}
              {room.hasPassword && (
                <span className="lock-pill" title="Protetta da Password">
                  <Lock size={12} /> Privata
                </span>
              )}
            </h1>
            <div className="lobby-meta-tags">
              <span
                className={`format-pill ${
                  room.isCommander ? 'commander' : 'constructed'
                }`}
              >
                {room.isCommander ? (
                  <>
                    <Crown size={12} /> Commander / EDH • 40 PV
                  </>
                ) : (
                  <>
                    <Layers size={12} /> Costruito • 20 PV
                  </>
                )}
              </span>
              <span className="players-pill">
                <Users size={12} /> {activeParticipantCount}/{room.maxPlayers}{' '}
                Giocatori
              </span>
              {room.isHost && (
                <span className="host-pill">
                  <Sparkles size={12} /> Host
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="lobby-header-actions">
          {room.isHost && (
            <div className="host-lobby-controls">
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={updatingRoomCfg}
                onClick={handleToggleFormat}
                title="Cambia formato tra Commander (100 carte, 40 PV) e Costruito (60 carte, 20 PV)"
              >
                {room.isCommander ? 'Costruito' : 'Commander'}
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={updatingRoomCfg || room.maxPlayers <= 2}
                onClick={() => handleAdjustSlotsCount(-1)}
                title="Riduci posti"
              >
                <Minus size={13} />
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={updatingRoomCfg || room.maxPlayers >= 8}
                onClick={() => handleAdjustSlotsCount(1)}
                title="Aggiungi posto (fino a 8)"
              >
                <Plus size={13} />
              </button>
            </div>
          )}

          <button type="button" className="btn-secondary btn-sm" onClick={onLeaveRoom}>
            <LogOut size={15} /> Esci
          </button>

          {room.isHost && (
            <button
              type="button"
              className="btn-primary"
              disabled={startingGame || activeParticipantCount < 2}
              onClick={handleStartMatch}
            >
              <Play size={16} />{' '}
              {startingGame ? 'Avvio in corso...' : 'Avvia Partita'}
            </button>
          )}
        </div>
      </header>

      {errorMsg && <div className="alert-error">{errorMsg}</div>}

      {/* Main Split: Left Scrollable Commander Banner + Seats | Right Always-Visible Chat */}
      <div className="lobby-main-grid">
        <section className="lobby-left-workspace">
          {/* EDHPlay-style Commander Hero Banner for local player */}
          {mySlot && (
            <div className="lobby-commander-banner">
              {myCommanderBannerArt && (
                <img
                  src={myCommanderBannerArt}
                  alt={myCommanderName || mySlot.deckName}
                  className="lobby-cmd-banner-bg"
                  onError={(e) => {
                    if (
                      mySlot.commanderImageUrl &&
                      e.currentTarget.src !== mySlot.commanderImageUrl
                    ) {
                      e.currentTarget.src = mySlot.commanderImageUrl;
                    } else {
                      e.currentTarget.style.display = 'none';
                    }
                  }}
                />
              )}
              <div className="lobby-cmd-banner-scrim" />

              <div className="lobby-cmd-banner-content">
                <div className="lobby-cmd-banner-left">
                  {mySlot.commanderImageUrl && (
                    <img
                      src={mySlot.commanderImageUrl}
                      alt={myCommanderName || mySlot.deckName}
                      className="lobby-cmd-mini-card"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <div className="lobby-cmd-banner-meta">
                    <span className="lobby-cmd-eyebrow">
                      <Crown size={12} className="cyan-icon" />{' '}
                      {room.isCommander ? 'IL TUO COMANDANTE' : 'IL TUO MAZZO'}
                    </span>
                    <h2 className="lobby-cmd-name">
                      {myCommanderName || mySlot.deckName}
                    </h2>
                    <div className="lobby-cmd-subrow">
                      <span>{mySlot.deckName}</span>
                      {mySlot.deckSummary && (
                        <>
                          <span>•</span>
                          <span>{mySlot.deckSummary}</span>
                        </>
                      )}
                      {mySlot.colorIdentity && mySlot.colorIdentity.length > 0 && (
                        <span className="lobby-cmd-pips">
                          {mySlot.colorIdentity.map((col) => (
                            <ManaSymbolBadge key={col} symbol={col} size="sm" />
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="lobby-cmd-banner-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setEditingDeckSlot(mySlot)}
                  >
                    <Layers size={14} /> Cambia Mazzo
                  </button>
                  <button
                    type="button"
                    className={
                      mySlot.isReady ? 'btn-ready-active btn-sm' : 'btn-primary btn-sm'
                    }
                    onClick={() => handleToggleReady(mySlot)}
                  >
                    <Check size={14} />{' '}
                    {mySlot.isReady ? 'Pronto ✓' : 'Sono Pronto'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Seats Pod Grid */}
          <div className="lobby-seats-scroll">
            <div className="seats-grid">
              {room.slots.map((slot) => {
                const canEditSlot = slot.isMe || (room.isHost && slot.type === 'AI');
                const slotCmdName = slot.commanderCards?.[0] || '';
                const slotArtUrl =
                  slot.commanderArtCropUrl ||
                  getCommanderArtFallbackUrl(slotCmdName) ||
                  slot.commanderImageUrl ||
                  '';

                return (
                  <div
                    key={slot.slotIndex}
                    className={`seat-card seat-${slot.type.toLowerCase()} ${
                      slot.isMe ? 'seat-me' : ''
                    } ${slot.isReady ? 'seat-ready' : ''}`}
                  >
                    {/* Commander Art Strip Header on occupied seats */}
                    {slot.type !== 'OPEN' && (
                      <div className="seat-art-banner">
                        {slotArtUrl && (
                          <img
                            src={slotArtUrl}
                            alt={slotCmdName || slot.deckName}
                            className="seat-art-img"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                        <div className="seat-art-scrim" />
                        <div className="seat-art-top-overlay">
                          <span className="seat-number-chip">
                            Posto #{slot.slotIndex + 1}
                          </span>
                          <div className="seat-team-selector">
                            <Shield size={12} />
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
                        </div>

                        <div className="seat-art-bottom-overlay">
                          <div className="seat-identity">
                            {slot.type === 'REMOTE' && (
                              <User size={15} className="cyan-icon" />
                            )}
                            {slot.type === 'AI' && (
                              <Bot size={15} className="amber-icon" />
                            )}
                            <div>
                              <div className="seat-player-name">
                                {slot.name}
                                {slot.isMe && <span className="you-tag">TU</span>}
                              </div>
                              <div className="seat-status-sub">
                                {slot.type === 'REMOTE' ? (
                                  <span
                                    className={`conn-dot ${
                                      slot.isOnline ? 'online' : 'offline'
                                    }`}
                                  >
                                    {slot.isOnline ? '● Connesso' : '○ Riconnessione...'}
                                  </span>
                                ) : (
                                  <span>Bot IA • Pronto</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {slot.colorIdentity && slot.colorIdentity.length > 0 && (
                            <div className="seat-identity-pips">
                              {slot.colorIdentity.map((col) => (
                                <ManaSymbolBadge key={col} symbol={col} size="sm" />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Body for Occupied vs Open Seat */}
                    {slot.type !== 'OPEN' ? (
                      <div className="seat-card-body">
                        <div className="seat-deck-info">
                          <strong className="seat-deck-name">{slot.deckName}</strong>
                          <span className="seat-deck-summary">{slot.deckSummary}</span>
                          {slot.commanderCards && slot.commanderCards.length > 0 && (
                            <div className="seat-commander-chips">
                              {slot.commanderCards.map((cName) => (
                                <span key={cName} className="cmd-chip">
                                  <Crown size={11} /> {cName}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {canEditSlot && (
                          <button
                            type="button"
                            className="btn-secondary btn-sm full-width"
                            onClick={() => setEditingDeckSlot(slot)}
                          >
                            <Layers size={13} /> Cambia / Costruisci Mazzo
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="seat-open-body">
                        <div className="seat-open-head">
                          <span className="seat-number-chip">
                            Posto #{slot.slotIndex + 1}
                          </span>
                          <UserPlus size={16} className="muted-icon" />
                        </div>
                        <p className="seat-open-hint">
                          Posto libero per amici con codice{' '}
                          <strong>{room.roomId}</strong> o Bot IA.
                        </p>
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
                              <Bot size={14} /> + Bot IA
                            </button>
                          )}
                        </div>
                      )}

                      {slot.type === 'REMOTE' && (
                        <>
                          <div
                            className={`ready-indicator ${
                              slot.isReady ? 'ready' : 'not-ready'
                            }`}
                          >
                            {slot.isReady ? '✓ PRONTO' : 'In preparazione...'}
                          </div>
                          {slot.isMe && (
                            <button
                              type="button"
                              className={
                                slot.isReady
                                  ? 'btn-secondary btn-sm'
                                  : 'btn-primary btn-sm'
                              }
                              onClick={() => handleToggleReady(slot)}
                            >
                              <Check size={14} />{' '}
                              {slot.isReady ? 'Annulla' : 'Pronto!'}
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
                              <Trash2 size={13} /> Rimuovi
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Always-Visible Lobby Chat & Quick Invite Sidebar */}
        <aside className="lobby-sidebar">
          <div className="invite-compact-bar">
            <div className="invite-compact-text">
              <span className="invite-eyebrow">INVITA IL TUO GRUPPO</span>
              <span>
                Codice: <code>{room.roomId}</code>
                {room.hasPassword ? ' (con password)' : ''}
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={handleCopyRoomId}
            >
              {copiedId ? <Check size={13} /> : <Copy size={13} />}{' '}
              {copiedId ? 'Copiato' : 'Copia'}
            </button>
          </div>

          <div className="chat-panel always-visible-chat">
            <div className="chat-panel-header">
              <MessageSquare size={15} className="cyan-icon" />
              <span>Chat della Stanza</span>
              <span className="chat-count-pill">{chatMessages.length}</span>
            </div>
            <div className="chat-messages-list" ref={chatListRef}>
              {chatMessages.length === 0 ? (
                <div className="chat-empty">
                  Nessun messaggio ancora. Saluta il tavolo o accordatevi sul
                  livello dei mazzi!
                </div>
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
                placeholder="Scrivi in chat al tavolo..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button
                type="submit"
                className="btn-primary btn-sm"
                aria-label="Invia messaggio"
              >
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
