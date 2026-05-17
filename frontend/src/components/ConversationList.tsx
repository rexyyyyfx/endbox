import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Pin } from 'lucide-react';
import type { Conversation } from '../lib/api';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * 86400000) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Avatar({ name, avatarUrl, size = 56, online }: { name: string; avatarUrl?: string | null; size?: number; online?: boolean }) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
        style={{ background: avatarUrl ? undefined : 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }}>
        {avatarUrl
          ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          : <span className="text-white font-bold" style={{ fontSize: size * 0.3 }}>{initials}</span>}
      </div>
      <AnimatePresence>
        {online && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
            className="absolute bottom-0.5 right-0.5 rounded-full border-2"
            style={{ width: size * 0.22, height: size * 0.22, background: 'var(--green)', borderColor: 'var(--surface)' }} />
        )}
      </AnimatePresence>
    </div>
  );
}

export function ConversationList({ conversations, activeId, onSelect, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="p-3 space-y-1">
        {[1,2,3,4,5].map((i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2.5 rounded-2xl">
            <div className="w-14 h-14 rounded-full shrink-0 animate-pulse" style={{ background: 'var(--elevated)' }} />
            <div className="flex-1 space-y-2">
              <div className="h-3 rounded-full animate-pulse w-28" style={{ background: 'var(--elevated)' }} />
              <div className="h-2.5 rounded-full animate-pulse w-40" style={{ background: 'var(--elevated)' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 p-8 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'var(--elevated)' }}>
          <MessageCircle size={26} style={{ color: 'var(--muted)' }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">No messages yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Search for someone to start a conversation</p>
        </div>
      </div>
    );
  }

  const sorted = [...conversations].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    const aTime = a.lastMessage?.createdAt ?? a.createdAt;
    const bTime = b.lastMessage?.createdAt ?? b.createdAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  return (
    <div className="overflow-y-auto h-full py-2">
      {sorted.map((conv, i) => {
        const isActive = conv.id === activeId;
        const hasUnread = (conv.unreadCount ?? 0) > 0;
        const name = conv.otherUser.userId;
        const lastText = conv.lastMessage?.isDeleted
          ? 'Message unsent'
          : conv.lastMessage ? '🔒 Encrypted message'
          : 'No messages yet';

        return (
          <motion.button key={conv.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.025 }}
            onClick={() => onSelect(conv.id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 mx-1 rounded-2xl text-left transition-all"
            style={{
              width: 'calc(100% - 8px)',
              background: isActive ? 'var(--elevated)' : 'transparent',
            }}
            onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--card)'; }}
            onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <Avatar name={name} avatarUrl={conv.otherUser.avatarUrl} online={conv.otherUserOnline} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`text-sm truncate ${hasUnread ? 'font-bold text-white' : 'font-semibold text-white'}`}>
                    {name}
                  </span>
                  {conv.isPinned && <Pin size={10} style={{ color: 'var(--muted)' }} className="shrink-0" />}
                </div>
                {conv.lastMessage && (
                  <span className="text-xs shrink-0" style={{ color: hasUnread ? 'var(--accent)' : 'var(--muted)' }}>
                    {formatTime(conv.lastMessage.createdAt)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className={`text-sm truncate ${hasUnread ? 'text-white' : ''}`}
                  style={{ color: hasUnread ? 'var(--text)' : 'var(--muted)', fontSize: 13 }}>
                  {lastText}
                </span>
                <AnimatePresence>
                  {hasUnread && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                      className="shrink-0 min-w-[20px] h-5 rounded-full text-white text-xs font-bold flex items-center justify-center px-1.5"
                      style={{ background: 'var(--accent)', fontSize: 11 }}>
                      {conv.unreadCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
