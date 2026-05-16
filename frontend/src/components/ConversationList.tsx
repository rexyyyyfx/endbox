import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import type { Conversation } from '../lib/api';

interface ConversationListProps {
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
  if (diff < 7 * 86400000) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function ConversationList({ conversations, activeId, onSelect, isLoading }: ConversationListProps) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <div className="w-14 h-14 rounded-full bg-ig-elevated animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-ig-elevated animate-pulse rounded-full w-24" />
              <div className="h-2.5 bg-ig-elevated animate-pulse rounded-full w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-ig-elevated flex items-center justify-center">
          <MessageCircle size={28} className="text-ig-muted" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">No messages yet</p>
          <p className="text-xs text-ig-muted mt-1">Search for someone to start a conversation</p>
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
    <div className="overflow-y-auto h-full">
      {sorted.map((conv, i) => {
        const isActive = conv.id === activeId;
        const hasUnread = (conv.unreadCount ?? 0) > 0;
        const name = conv.otherUser.userId;

        return (
          <motion.button
            key={conv.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => onSelect(conv.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
              isActive ? 'bg-ig-elevated' : 'hover:bg-ig-elevated/50'
            }`}
          >
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className={`w-14 h-14 rounded-full overflow-hidden flex items-center justify-center ${conv.otherUser.avatarUrl ? '' : 'bg-gradient-to-br from-purple-500 to-pink-500'}`}>
                {conv.otherUser.avatarUrl ? (
                  <img src={conv.otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-lg font-semibold">
                    {name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <AnimatePresence>
                {conv.otherUserOnline && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2"
                    style={{ borderColor: 'var(--ig-surface)' }}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-semibold truncate ${hasUnread ? 'text-white' : 'text-white/90'}`}>
                  {name}
                </span>
                {conv.lastMessage && (
                  <span className="text-xs text-ig-muted shrink-0">
                    {formatTime(conv.lastMessage.createdAt)}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className={`text-sm truncate ${hasUnread ? 'text-white' : 'text-ig-muted'}`}>
                  {conv.lastMessage?.isDeleted
                    ? 'Message deleted'
                    : conv.lastMessage
                      ? '🔒 Encrypted message'
                      : 'No messages yet'}
                </span>
                <AnimatePresence>
                  {hasUnread && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-ig-accent text-white text-[10px] font-bold flex items-center justify-center px-1"
                    >
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
