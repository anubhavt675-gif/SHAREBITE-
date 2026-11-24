import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Send,
  MessageSquare,
  Phone,
  Check,
  CheckCheck,
  ArrowLeft,
  ShieldCheck,
  Lock,
  Loader2,
  MapPin,
  WifiOff,
  ChevronUp,
  Truck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { normalizeRole } from '../../services/auth';
import {
  ChatService,
  MAX_CHAT_MESSAGE_LENGTH,
  CLOSED_CHAT_NOTICE,
} from '../../services/chat';
import type { Conversation, ChatMessage } from '../../types';
import styles from './ChatPage.module.css';

const RIDER_QUICK_MESSAGES = [
  'Hello, I have accepted your food donation.',
  'I am reaching your location.',
  'I am on my way.',
  'Please share the pickup location details.',
  'I have reached your location.',
  'Food collected successfully.',
];

const DONOR_QUICK_MESSAGES = [
  'Hello, where are you right now?',
  'How much time will you take to reach?',
  'I am waiting at the pickup location.',
  'Please call me when you arrive.',
  'Food is packed and ready for pickup.',
];

const NGO_QUICK_MESSAGES = [
  'Our NGO team is ready to receive the food.',
  'Please share the pickup/handover gate details.',
  'Our volunteer is on the way for direct collection.',
  'Thank you! We will record receipt upon handover.',
];

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  rider_assigned: 'Active Delivery · Rider Assigned',
  going_to_pickup: 'Active Delivery · On the Way',
  arrived_at_pickup: 'Active Delivery · Arrived at Pickup',
  food_collected: 'Active Delivery · Food Collected',
  in_transit: 'Active Delivery · In Transit',
  delivered: 'Active Delivery · Delivered',
  completed: 'Delivery Completed',
  reserved: 'Active Delivery',
  picked_up: 'Active Delivery · Food Collected',
};

export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;
  const userRole = normalizeRole(user?.role);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [activeConvId, setActiveConvId] = useState<string | null>(conversationId || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [mobileShowThread, setMobileShowThread] = useState(Boolean(conversationId));
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);

  const loadConversations = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoadingConvs(true);
    try {
      const dbConvs = await ChatService.getUserConversations(userId);
      setConversations(dbConvs);
      if (conversationId && dbConvs.some((c) => c.id === conversationId)) {
        setActiveConvId(conversationId);
        setMobileShowThread(true);
      } else {
        setActiveConvId((prev) => {
          if (prev && dbConvs.some((c) => c.id === prev)) return prev;
          return dbConvs.length > 0 ? dbConvs[0].id : null;
        });
      }
    } catch {
      if (!silent) {
        setConversations([]);
        setActiveConvId(null);
      }
    } finally {
      if (!silent) setLoadingConvs(false);
    }
  }, [userId, conversationId]);

  useEffect(() => {
    loadConversations(false);
    if (!userId) return;
    const sub = ChatService.subscribeToUserConversations(userId, () => {
      loadConversations(true);
    });
    return () => {
      sub.unsubscribe();
    };
  }, [userId, loadConversations]);

  // Monitor browser online/offline transitions and re-sync on reconnect
  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      loadConversations(true);
    };
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [loadConversations]);

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const activeTaskId = activeConv?.relatedTaskId;
  const isClosed = activeConv?.status === 'CLOSED';

  // Fetch messages & subscribe to realtime incoming messages + read receipts + closure updates
  useEffect(() => {
    if (!activeConvId || !userId) {
      return;
    }

    let active = true;
    setLoadingMessages(true);
    setSendError('');
    shouldAutoScrollRef.current = true;

    ChatService.getMessages(activeConvId, { limit: 100 })
      .then(({ messages: msgs, hasMore }) => {
        if (!active) return;
        setMessages(msgs);
        setHasMoreHistory(hasMore);
        setLoadingMessages(false);
        ChatService.markMessagesAsRead(activeConvId, userId).then(() => {
          if (!active) return;
          setConversations((prev) =>
            prev.map((c) => (c.id === activeConvId ? { ...c, unreadCount: 0 } : c))
          );
          window.dispatchEvent(new CustomEvent('sharebite:chat-unread-sync'));
        });
      })
      .catch(() => {
        if (active) setLoadingMessages(false);
      });

    const sub = ChatService.subscribeToMessages(
      activeConvId,
      (newMsg) => {
        if (!active) return;
        shouldAutoScrollRef.current = true;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConvId
              ? { ...c, lastMessage: newMsg, lastMessageAt: newMsg.createdAt }
              : c
          )
        );
        if (newMsg.senderId !== userId) {
          ChatService.markMessagesAsRead(activeConvId, userId).then(() => {
            window.dispatchEvent(new CustomEvent('sharebite:chat-unread-sync'));
          });
        }
      },
      (updated) => {
        if (!active) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === updated.id
              ? { ...m, isRead: updated.isRead, readAt: updated.readAt || m.readAt }
              : m
          )
        );
      },
      {
        relatedTaskId: activeTaskId,
        onConversationStatusChanged: (update) => {
          if (!active) return;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeConvId
                ? {
                    ...c,
                    status: update.status,
                    closedAt: update.closedAt || c.closedAt,
                    deliveryStatus: update.deliveryStatus || c.deliveryStatus,
                  }
                : c
            )
          );
        },
      }
    );

    return () => {
      active = false;
      sub.unsubscribe();
    };
  }, [activeConvId, activeTaskId, userId]);

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleLoadOlderMessages = async () => {
    if (!activeConvId || loadingOlder || !hasMoreHistory || messages.length === 0) return;
    setLoadingOlder(true);
    shouldAutoScrollRef.current = false;
    try {
      const oldestTs = messages[0].createdAt;
      const { messages: older, hasMore } = await ChatService.getMessages(activeConvId, {
        limit: 50,
        before: oldestTs,
      });
      setHasMoreHistory(hasMore);
      if (older.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const uniqueOlder = older.filter((m) => !existingIds.has(m.id));
          return [...uniqueOlder, ...prev];
        });
      }
    } finally {
      setLoadingOlder(false);
    }
  };

  const otherParticipant = activeConv?.participants?.find(
    (p) => p.userId !== userId
  )?.user;

  const dispatchMessage = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || !activeConvId || !userId || sendingRef.current || isOffline) return;

    if (isClosed) {
      setSendError(CLOSED_CHAT_NOTICE);
      return;
    }

    if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
      setSendError(`Message cannot exceed ${MAX_CHAT_MESSAGE_LENGTH} characters.`);
      return;
    }

    sendingRef.current = true;
    setSendError('');
    setSending(true);
    shouldAutoScrollRef.current = true;

    const optId = `opt-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: optId,
      conversationId: activeConvId,
      senderId: userId,
      content: text,
      messageType: 'text',
      isRead: false,
      createdAt: new Date().toISOString(),
      sender: user || undefined,
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const saved = await ChatService.sendMessage({
        conversationId: activeConvId,
        senderId: userId,
        content: text,
      });
      setMessages((prev) => {
        const withoutOpt = prev.filter((m) => m.id !== optId);
        if (withoutOpt.some((m) => m.id === saved.id)) return withoutOpt;
        return [...withoutOpt, saved];
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConvId
            ? { ...c, lastMessage: saved, lastMessageAt: saved.createdAt }
            : c
        )
      );
    } catch (err: any) {
      const msg = err?.message || 'Could not send message.';
      setSendError(msg);
      setMessages((prev) => prev.filter((m) => m.id !== optId));
      // If backend rejected due to completion/closure, sync conversation state immediately
      if (/closed|completed/i.test(msg)) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConvId
              ? { ...c, status: 'CLOSED', closedAt: new Date().toISOString(), deliveryStatus: 'completed' }
              : c
          )
        );
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isClosed || sendingRef.current || isOffline) return;
    const msg = inputText;
    setInputText('');
    await dispatchMessage(msg);
  };

  const quickOptions =
    userRole === 'donor'
      ? DONOR_QUICK_MESSAGES
      : userRole === 'ngo'
      ? NGO_QUICK_MESSAGES
      : RIDER_QUICK_MESSAGES;
  const activeDeliveryRoute =
    userRole === 'ngo'
      ? '/ngo/collections'
      : userRole === 'rider'
      ? '/rider-dashboard'
      : '/donor-dashboard';
  const activeStatusLabel = activeConv
    ? activeConv.status === 'CLOSED'
      ? 'Delivery Completed'
      : DELIVERY_STATUS_LABELS[activeConv.deliveryStatus || ''] || 'Active Delivery'
    : '';

  return (
    <div className={styles.chatContainer}>
      {isOffline && (
        <div className={styles.offlineBanner} role="alert">
          <WifiOff size={15} />
          <span>You are currently offline. Live messages will reconnect automatically once your internet is back.</span>
        </div>
      )}

      <div className={styles.chatWrapper}>
        {/* Left Sidebar: Conversations */}
        <div className={`${styles.sidebar} ${mobileShowThread ? styles.hideOnMobile : ''}`}>
          <div className={styles.sidebarHeader}>
            <div>
              <h2 className={styles.sidebarTitle}>Pickup & Delivery Chat</h2>
              <p className={styles.sidebarSub}>
                {userRole === 'ngo'
                  ? 'Private coordination with assigned Riders & Donors'
                  : 'Private channel between Donor & assigned Rider'}
              </p>
            </div>
          </div>
          <div className={styles.convList}>
            {loadingConvs ? (
              <div className={styles.emptyConvList}>
                <Loader2 size={24} className="animate-spin" style={{ color: '#ea580c' }} />
                <p>Loading conversations...</p>
              </div>
            ) : conversations.length === 0 ? (
              <div className={styles.emptyConvList}>
                <MessageSquare size={28} />
                <p>No pickup conversations yet</p>
                <span>
                  {userRole === 'rider'
                    ? 'Accept an available food pickup to unlock direct private chat with the donor.'
                    : userRole === 'ngo'
                    ? 'Claim an available food donation or wait for a rider assignment to unlock direct coordination chat.'
                    : 'Once a rider accepts your food donation, your private coordination chat appears here automatically.'}
                </span>
              </div>
            ) : (
              conversations.map((c) => {
                const other = c.participants?.find((p) => p.userId !== userId)?.user;
                const partnerName = other?.name || 'ShareBite Partner';
                const donationName = c.title || 'Food Donation';
                const lastText = c.lastMessage?.content || 'Pickup channel ready';
                const isSelected = c.id === activeConvId;
                const convClosed = c.status === 'CLOSED';

                return (
                  <div
                    key={c.id}
                    className={`${styles.convItem} ${isSelected ? styles.convItemActive : ''}`}
                    onClick={() => {
                      setActiveConvId(c.id);
                      setMobileShowThread(true);
                      navigate(`/chat/${c.id}`);
                    }}
                  >
                    <div className={styles.avatarWrap}>
                      {other?.avatar ? (
                        <img src={other.avatar} alt={partnerName} className={styles.avatarImg} />
                      ) : (
                        <span>{(partnerName || 'P').charAt(0).toUpperCase()}</span>
                      )}
                      {c.partnerIsOnline && !convClosed && (
                        <span className={styles.onlineDot} title="Online" />
                      )}
                    </div>
                    <div className={styles.convMeta}>
                      <div className={styles.convTopRow}>
                        <span className={styles.convName}>{partnerName}</span>
                        <span className={styles.convTime}>
                          {new Date(c.lastMessageAt || c.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className={styles.convDonationRow}>
                        <span className={styles.convDonationTitle}>{donationName}</span>
                        <span
                          className={
                            convClosed ? styles.convStatusClosed : styles.convStatusActive
                          }
                        >
                          {convClosed ? (
                            <>
                              <Lock size={9} /> Closed
                            </>
                          ) : (
                            'Active'
                          )}
                        </span>
                      </div>
                      <div className={styles.convBottomRow}>
                        <p className={styles.convSnippet}>{lastText}</p>
                        {(c.unreadCount ?? 0) > 0 && (
                          <span className={styles.unreadBadge}>{c.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Main Chat Thread */}
        <div className={`${styles.chatMain} ${!mobileShowThread ? styles.hideOnMobile : ''}`}>
          {activeConv ? (
            <>
              {/* Header */}
              <div className={styles.chatHeader}>
                <div className={styles.headerUserInfo}>
                  <button
                    type="button"
                    className={styles.mobileBackBtn}
                    onClick={() => setMobileShowThread(false)}
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className={styles.avatarWrap}>
                    {otherParticipant?.avatar ? (
                      <img
                        src={otherParticipant.avatar}
                        alt={otherParticipant.name || 'Contact'}
                        className={styles.avatarImg}
                      />
                    ) : (
                      <span>{otherParticipant?.name?.charAt(0).toUpperCase() || 'P'}</span>
                    )}
                    {activeConv.partnerIsOnline && !isClosed && (
                      <span className={styles.onlineDot} title="Online" />
                    )}
                  </div>
                  <div className={styles.headerTextCol}>
                    <div className={styles.headerTitleRow}>
                      <h3 className={styles.headerName}>
                        {otherParticipant?.name || 'Assigned Partner'}
                      </h3>
                      <span
                        className={
                          isClosed ? styles.headerStatusClosed : styles.headerStatusActive
                        }
                      >
                        {isClosed ? <Lock size={11} /> : <span className={styles.liveDot} />}
                        {activeStatusLabel}
                      </span>
                    </div>
                    <div className={styles.headerSubRow}>
                      <span className={styles.headerDonationRef}>
                        <ShieldCheck
                          size={12}
                          style={{ color: '#16a34a', flexShrink: 0 }}
                        />
                        <strong>{activeConv.title || 'Food Donation'}</strong>
                        {activeConv.donationServings
                          ? ` · ${activeConv.donationServings} servings`
                          : ''}
                        {activeConv.pickupAddress ? (
                          <span className={styles.headerAddr}>
                            <MapPin size={11} /> {activeConv.pickupAddress}
                          </span>
                        ) : null}
                      </span>
                      {typeof activeConv.partnerIsOnline === 'boolean' && !isClosed && (
                        <span
                          className={
                            activeConv.partnerIsOnline
                              ? styles.presenceOnline
                              : styles.presenceOffline
                          }
                        >
                          · {activeConv.partnerIsOnline ? 'Online' : 'Offline'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.headerActions}>
                  {!isClosed && (
                    <Link
                      to={activeDeliveryRoute}
                      className={styles.deliveryShortcutBtn}
                      title="Return to Active Delivery & Live Map"
                    >
                      <Truck size={14} />
                      <span>Active Delivery</span>
                    </Link>
                  )}
                  {otherParticipant?.phone && !isClosed && (
                    <a
                      href={`tel:${otherParticipant.phone}`}
                      className={styles.callBtn}
                    >
                      <Phone size={14} /> Call
                    </a>
                  )}
                </div>
              </div>

              {/* Messages feed */}
              <div className={styles.messagesFeed}>
                {hasMoreHistory && (
                  <div className={styles.loadMoreWrap}>
                    <button
                      type="button"
                      className={styles.loadMoreBtn}
                      onClick={handleLoadOlderMessages}
                      disabled={loadingOlder}
                    >
                      {loadingOlder ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <ChevronUp size={13} />
                      )}
                      {loadingOlder ? 'Loading earlier messages...' : 'Load earlier messages'}
                    </button>
                  </div>
                )}

                {loadingMessages ? (
                  <div className={styles.loadingFeed}>
                    <Loader2 size={24} className="animate-spin" style={{ color: '#ea580c' }} />
                    <span>Loading conversation history...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className={styles.emptyFeedNote}>
                    Private chat unlocked for <strong>{activeConv.title || 'this delivery'}</strong>.
                    Send a message below to coordinate pickup.
                  </div>
                ) : (
                  messages.map((m) => {
                    if (m.messageType === 'system') {
                      return (
                        <div key={m.id} className={styles.systemMsg}>
                          {m.content}
                        </div>
                      );
                    }

                    const isMine = m.senderId === userId;
                    const senderLabel = isMine
                      ? 'You'
                      : m.sender?.name || otherParticipant?.name || 'Partner';

                    return (
                      <div
                        key={m.id}
                        className={`${styles.msgRow} ${isMine ? styles.msgRowMine : styles.msgRowOther}`}
                      >
                        <span className={styles.senderTag}>{senderLabel}</span>
                        <div
                          className={`${styles.msgBubble} ${
                            isMine ? styles.msgBubbleMine : styles.msgBubbleOther
                          }`}
                        >
                          {m.content}
                        </div>
                        <span className={styles.msgTime}>
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {isMine && (
                            <span
                              className={styles.readReceipt}
                              title={m.isRead ? 'Read' : 'Delivered'}
                            >
                              {m.isRead ? (
                                <>
                                  <CheckCheck size={12} style={{ color: '#16a34a' }} /> Read
                                </>
                              ) : (
                                <>
                                  <Check size={12} /> Sent
                                </>
                              )}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {sendError && <div className={styles.errorBanner}>{sendError}</div>}

              {/* Closed Conversation Read-Only Lock Banner vs Active Quick Replies + Input */}
              {isClosed ? (
                <div className={styles.closedFooter} role="status" aria-live="polite">
                  <div className={styles.closedBanner}>
                    <div className={styles.closedIconWrap}>
                      <Lock size={18} />
                    </div>
                    <div className={styles.closedTextWrap}>
                      <div className={styles.closedTitle}>Delivery Completed</div>
                      <p className={styles.closedDesc}>
                        This conversation is closed because the delivery has been completed. You can
                        still view your previous messages.
                      </p>
                    </div>
                  </div>
                  <div className={styles.inputFormLocked}>
                    <input
                      type="text"
                      className={styles.msgInput}
                      placeholder="Conversation closed — read-only message history"
                      value=""
                      disabled
                      readOnly
                      aria-label="Conversation closed"
                    />
                    <button
                      type="button"
                      className={styles.sendBtn}
                      disabled
                      aria-label="Send message"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Quick Messages Bar */}
                  <div className={styles.quickReplies} aria-label="Quick messages">
                    {quickOptions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        className={styles.quickReplyBtn}
                        disabled={sending || isOffline}
                        onClick={() => dispatchMessage(q)}
                      >
                        {q}
                      </button>
                    ))}
                  </div>

                  {/* Input Form */}
                  <form className={styles.inputForm} onSubmit={handleSend}>
                    <input
                      type="text"
                      className={styles.msgInput}
                      placeholder="Type a message to coordinate pickup..."
                      value={inputText}
                      maxLength={MAX_CHAT_MESSAGE_LENGTH}
                      disabled={sending || isOffline}
                      onChange={(e) => setInputText(e.target.value)}
                    />
                    {inputText.length > MAX_CHAT_MESSAGE_LENGTH - 200 && (
                      <span className={styles.charCounter}>
                        {inputText.length}/{MAX_CHAT_MESSAGE_LENGTH}
                      </span>
                    )}
                    <button
                      type="submit"
                      className={styles.sendBtn}
                      disabled={!inputText.trim() || sending || isOffline}
                      aria-label="Send message"
                    >
                      {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                  </form>
                </>
              )}
            </>
          ) : (
            <div className={styles.emptyState}>
              <MessageSquare size={48} />
              <p style={{ margin: 0, fontWeight: 600, color: '#475569' }}>
                Select a pickup conversation
              </p>
              <span style={{ fontSize: 13, textAlign: 'center', maxWidth: 360 }}>
                Only the original Donor and the assigned Rider can view or exchange messages in a
                delivery thread.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
