import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, MessageSquare, Phone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ChatService } from '../../services/chat';
import type { Conversation, ChatMessage } from '../../types';
import styles from './ChatPage.module.css';

export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch real conversations from Supabase
  useEffect(() => {
    async function loadConversations() {
      if (!user) return;
      try {
        const dbConvs = await ChatService.getUserConversations(user.id);
        setConversations(dbConvs);
        if (conversationId && dbConvs.some((c) => c.id === conversationId)) {
          setActiveConvId(conversationId);
        } else if (dbConvs.length > 0) {
          setActiveConvId(dbConvs[0].id);
        } else {
          setActiveConvId(null);
        }
      } catch {
        setConversations([]);
        setActiveConvId(null);
      }
    }
    loadConversations();
  }, [user, conversationId]);

  // 2. Fetch messages & subscribe to realtime incoming messages (deduplicated)
  useEffect(() => {
    if (!activeConvId || !user) {
      setMessages([]);
      return;
    }

    ChatService.getMessages(activeConvId).then((msgs) => {
      setMessages(msgs);
      ChatService.markMessagesAsRead(activeConvId, user.id);
    });

    const sub = ChatService.subscribeToMessages(activeConvId, (newMsg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      if (newMsg.senderId !== user.id) {
        ChatService.markMessagesAsRead(activeConvId, user.id);
      }
    });

    return () => {
      sub.unsubscribe();
    };
  }, [activeConvId, user]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const otherParticipant = activeConv?.participants?.find(
    (p) => p.userId !== user?.id
  )?.user;

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !activeConvId || !user) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    const optId = `opt-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: optId,
      conversationId: activeConvId,
      senderId: user.id,
      content: text,
      messageType: 'text',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const saved = await ChatService.sendMessage({
        conversationId: activeConvId,
        senderId: user.id,
        content: text,
      });
      setMessages((prev) => {
        const withoutOpt = prev.filter((m) => m.id !== optId);
        if (withoutOpt.some((m) => m.id === saved.id)) return withoutOpt;
        return [...withoutOpt, saved];
      });
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages((prev) => prev.filter((m) => m.id !== optId));
    } finally {
      setSending(false);
    }
  };

  const handleQuickReply = (text: string) => {
    setInputText(text);
  };

  return (
    <div className={styles.chatContainer}>
      <div className={styles.chatWrapper}>
        {/* Left Sidebar: Conversations */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2 className={styles.sidebarTitle}>Messages</h2>
          </div>
          <div className={styles.convList}>
            {conversations.map((c) => {
              const other = c.participants?.find((p) => p.userId !== user?.id)?.user;
              const title = c.title || other?.name || (other as any)?.fullName || 'Conversation';
              const lastText = c.lastMessage?.content || 'No messages yet';
              const isSelected = c.id === activeConvId;

              return (
                <div
                  key={c.id}
                  className={`${styles.convItem} ${isSelected ? styles.convItemActive : ''}`}
                  onClick={() => {
                    setActiveConvId(c.id);
                    navigate(`/chat/${c.id}`);
                  }}
                >
                  <div className={styles.avatarWrap}>
                    {other?.avatar ? (
                      <img src={other.avatar} alt={title} className={styles.avatarImg} />
                    ) : (
                      <span>{(title || 'C').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className={styles.convMeta}>
                    <div className={styles.convTopRow}>
                      <span className={styles.convName}>{title}</span>
                      <span className={styles.convTime}>
                        {new Date(c.lastMessageAt || c.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className={styles.convBottomRow}>
                      <p className={styles.convSnippet}>{lastText}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Main Chat Thread */}
        <div className={styles.chatMain}>
          {activeConv ? (
            <>
              {/* Header */}
              <div className={styles.chatHeader}>
                <div className={styles.headerUserInfo}>
                  <div className={styles.avatarWrap}>
                    {otherParticipant?.avatar ? (
                      <img
                        src={otherParticipant.avatar}
                        alt="Contact"
                        className={styles.avatarImg}
                      />
                    ) : (
                      <span>{otherParticipant?.name?.charAt(0) || 'C'}</span>
                    )}
                  </div>
                  <div>
                    <h3 className={styles.headerName}>
                      {activeConv.title || otherParticipant?.name || 'ShareBite Coordinator'}
                    </h3>
                    <span className={styles.headerRole}>
                      {otherParticipant?.role || 'Verified Partner'}
                    </span>
                  </div>
                </div>

                {otherParticipant?.phone && (
                  <a
                    href={`tel:${otherParticipant.phone}`}
                    className={styles.quickReplyBtn}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Phone size={14} /> Call Contact
                  </a>
                )}
              </div>

              {/* Messages feed */}
              <div className={styles.messagesFeed}>
                {messages.map((m) => {
                  if (m.messageType === 'system') {
                    return (
                      <div key={m.id} className={styles.systemMsg}>
                        {m.content}
                      </div>
                    );
                  }

                  const isMine =
                    m.senderId === user?.id || m.senderId === 'current-user';

                  return (
                    <div
                      key={m.id}
                      className={`${styles.msgRow} ${
                        isMine ? styles.msgRowMine : styles.msgRowOther
                      }`}
                    >
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
                      </span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Replies row */}
              <div className={styles.quickReplies}>
                <button
                  type="button"
                  className={styles.quickReplyBtn}
                  onClick={() => handleQuickReply('Food is packed and ready for pickup.')}
                >
                  📦 Food is packed
                </button>
                <button
                  type="button"
                  className={styles.quickReplyBtn}
                  onClick={() => handleQuickReply('Volunteer is on the way.')}
                >
                  🛵 On the way
                </button>
                <button
                  type="button"
                  className={styles.quickReplyBtn}
                  onClick={() => handleQuickReply('Arrived at the pickup point.')}
                >
                  📍 Arrived at pickup
                </button>
              </div>

              {/* Input Form */}
              <form className={styles.inputForm} onSubmit={handleSend}>
                <input
                  type="text"
                  className={styles.msgInput}
                  placeholder="Type a message..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
                <button
                  type="submit"
                  className={styles.sendBtn}
                  disabled={!inputText.trim() || sending}
                >
                  <Send size={18} />
                </button>
              </form>
            </>
          ) : (
            <div className={styles.emptyState}>
              <MessageSquare size={48} />
              <p>Select a conversation to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
