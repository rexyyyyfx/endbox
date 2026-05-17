import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Lock, MoreHorizontal, X, Edit2, Trash2, ChevronDown, Reply, Copy, Slash, Info, Paperclip } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetConversation, useGetPublicKey, useGetMessages,
  useSendMessage, useEditMessage, useRemoveMessage, useRemoveMessageForAll,
  getGetMessagesQueryKey, getGetConversationQueryKey, getGetPublicKeyQueryKey,
} from '../lib/api';
import type { Message } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { joinConversation, leaveConversation, emitTyping, emitRead } from '../lib/socket';
import { importPublicKey, deriveSharedSecret, encryptMessage, decryptMessage } from '../lib/crypto';

interface Props { conversationId: string; onClose?: () => void; }

function formatTime(d: string) { return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function formatDate(d: string) {
  const date = new Date(d), now = new Date(), diff = now.getTime() - date.getTime();
  if (diff < 86400000) return 'Today';
  if (diff < 172800000) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'long', day: 'numeric' });
}

function Avatar({ name, avatarUrl, size = 32 }: { name: string; avatarUrl?: string | null; size?: number }) {
  return (
    <div className="rounded-full overflow-hidden flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: avatarUrl ? undefined : 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }}>
      {avatarUrl
        ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        : <span className="text-white font-bold" style={{ fontSize: size * 0.33 }}>{name.slice(0,2).toUpperCase()}</span>}
    </div>
  );
}

type MenuItem = { label: string; icon: React.ReactNode; action: () => void; danger?: boolean; };

export function ChatWindow({ conversationId, onClose }: Props) {
  const queryClient = useQueryClient();
  const { user, privateKey } = useAuthStore();
  const { messages: storeMessages, addMessage, setMessages, typingUsers } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  const [contextMenu, setContextMenu] = useState<{ msg: Message; x: number; y: number; fromBottom: boolean } | null>(null);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);
  const [decryptedTexts, setDecryptedTexts] = useState<Record<string, string>>({});
  const [atBottom, setAtBottom] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);

  const { data: conv } = useGetConversation(conversationId, { query: { queryKey: getGetConversationQueryKey(conversationId), enabled: !!conversationId } });
  const otherUserId = conv?.otherUser?.id ?? '';
  const { data: keyRecord } = useGetPublicKey(otherUserId, { query: { queryKey: getGetPublicKeyQueryKey(otherUserId), enabled: !!otherUserId } });
  const { data: msgPage, isLoading } = useGetMessages(conversationId, { query: { queryKey: getGetMessagesQueryKey(conversationId), enabled: !!conversationId } });

  const sendMessage = useSendMessage();
  const editMessage = useEditMessage();
  const removeMessage = useRemoveMessage();
  const removeForAll = useRemoveMessageForAll();

  useEffect(() => { joinConversation(conversationId); emitRead(conversationId); return () => leaveConversation(conversationId); }, [conversationId]);
  useEffect(() => { if (msgPage?.messages) setMessages(conversationId, msgPage.messages); }, [msgPage, conversationId, setMessages]);

  useEffect(() => {
    if (!privateKey || !keyRecord?.publicKey) { setSharedKey(null); return; }
    (async () => {
      try { const pk = await importPublicKey(keyRecord.publicKey); setSharedKey(await deriveSharedSecret(privateKey, pk)); }
      catch { setSharedKey(null); }
    })();
  }, [privateKey, keyRecord]);

  const messages = storeMessages[conversationId] ?? [];
  useEffect(() => {
    if (!sharedKey || messages.length === 0) return;
    const pending = messages.filter(m => m.encryptedContent && m.iv && !decryptedTexts[m.id] && !m.isDeleted);
    if (!pending.length) return;
    (async () => {
      const results: Record<string, string> = {};
      for (const m of pending) {
        try { results[m.id] = await decryptMessage(sharedKey, m.encryptedContent!, m.iv!); }
        catch { results[m.id] = '[Encrypted]'; }
      }
      setDecryptedTexts(prev => ({ ...prev, ...results }));
    })();
  }, [sharedKey, messages]); // eslint-disable-line

  useEffect(() => { if (atBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, atBottom]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  async function handleSend() {
    if (editingMsg) { await handleEditSubmit(); return; }
    if (!text.trim() || !sharedKey) return;
    try {
      const { encryptedContent, iv } = await encryptMessage(sharedKey, text.trim());
      const result = await sendMessage.mutateAsync({ conversationId, data: { type: 'text', encryptedContent, iv, replyToId: replyTo?.id } });
      addMessage(conversationId, result);
      setDecryptedTexts(prev => ({ ...prev, [result.id]: text.trim() }));
      setText(''); setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(conversationId) });
    } catch {}
  }

  async function handleEditSubmit() {
    if (!editingMsg || !sharedKey || !editText.trim()) return;
    try {
      const { encryptedContent, iv } = await encryptMessage(sharedKey, editText.trim());
      const result = await editMessage.mutateAsync({ conversationId, messageId: editingMsg.id, data: { encryptedContent, iv } });
      setDecryptedTexts(prev => ({ ...prev, [result.id]: editText.trim() }));
      queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(conversationId) });
    } catch {}
    setEditingMsg(null); setEditText(''); setText('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    emitTyping(conversationId);
    typingTimeout.current = setTimeout(() => {}, 2000);
  }

  function openContextMenu(e: React.MouseEvent | React.TouchEvent, msg: Message) {
    e.preventDefault();
    let x = 0, y = 0;
    if ('touches' in e && e.touches.length > 0) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
      x = e.changedTouches[0].clientX;
      y = e.changedTouches[0].clientY;
    } else if ('clientX' in e) {
      x = e.clientX;
      y = e.clientY;
    }
    const menuWidth = 200;
    const menuHeight = buildContextItemCount(msg) * 48 + 16;
    // Clamp X so it never goes off screen right
    x = Math.min(x, window.innerWidth - menuWidth - 8);
    x = Math.max(x, 8);
    // If tap is in bottom half, render menu ABOVE tap point
    const fromBottom = y > window.innerHeight * 0.55;
    const safeY = fromBottom
      ? Math.max(window.innerHeight - y, 8)  // distance from bottom
      : Math.min(y, window.innerHeight - menuHeight - 8);
    setContextMenu({ msg, x, y: safeY, fromBottom });
  }

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleTouchStart(e: React.TouchEvent, msg: Message) {
    longPressTimer.current = setTimeout(() => {
      openContextMenu(e, msg);
    }, 500);
  }

  function handleTouchEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }

  function buildContextItemCount(msg: Message): number {
    const isOwn = msg.senderId === user?.id;
    let count = 1; // reply always
    if (!msg.isDeleted) count++; // copy
    if (isOwn && !msg.isDeleted) count++; // edit
    count++; // delete for me
    if (isOwn && !msg.isDeleted) count++; // unsend
    return count;
  }

  async function handleUnsend() {
    if (!contextMenu) return;
    await removeForAll.mutateAsync({ conversationId, messageId: contextMenu.msg.id });
    setContextMenu(null);
    queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(conversationId) });
  }
  async function handleDeleteForMe() {
    if (!contextMenu) return;
    await removeMessage.mutateAsync({ conversationId, messageId: contextMenu.msg.id });
    setContextMenu(null);
    queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(conversationId) });
  }
  function startEdit(msg: Message) {
    setEditingMsg(msg); setEditText(decryptedTexts[msg.id] ?? ''); setText(decryptedTexts[msg.id] ?? '');
    setContextMenu(null); setTimeout(() => inputRef.current?.focus(), 50);
  }
  function copyText(msg: Message) {
    navigator.clipboard.writeText(decryptedTexts[msg.id] ?? '');
    setContextMenu(null);
  }

  const typingList = typingUsers[conversationId]?.filter(uid => uid !== user?.id) ?? [];
  const otherUser = conv?.otherUser;
  const otherName = otherUser?.userId ?? '...';
  const msgCount = messages.length;

  function buildContextItems(): MenuItem[] {
    if (!contextMenu) return [];
    const msg = contextMenu.msg;
    const isOwn = msg.senderId === user?.id;
    const items: MenuItem[] = [];
    if (!msg.isDeleted) {
      items.push({ label: 'Reply', icon: <Reply size={15} />, action: () => { setReplyTo(msg); setContextMenu(null); } });
      if (!msg.isDeleted) items.push({ label: 'Copy', icon: <Copy size={15} />, action: () => copyText(msg) });
      if (isOwn && !msg.isDeleted) items.push({ label: 'Edit', icon: <Edit2 size={15} />, action: () => startEdit(msg) });
    }
    items.push({ label: 'Delete for me', icon: <Trash2 size={15} />, action: handleDeleteForMe, danger: true });
    if (isOwn && !msg.isDeleted) items.push({ label: 'Unsend', icon: <Slash size={15} />, action: handleUnsend, danger: true });
    return items;
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}
      onClick={() => { contextMenu && setContextMenu(null); headerMenu && setHeaderMenu(false); }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ background: 'var(--glass-1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid var(--glass-border)' }}>
        <div className="relative">
          <Avatar name={otherName} avatarUrl={otherUser?.avatarUrl} size={42} />
          {conv?.otherUserOnline && (
            <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
              style={{ background: 'var(--green)', borderColor: 'var(--surface)' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm truncate">{otherName}</p>
          <div className="flex items-center gap-1.5">
            <Lock size={9} style={{ color: 'var(--accent)' }} />
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {conv?.otherUserOnline ? <span style={{ color: 'var(--green)' }}>Active now</span> : 'End-to-end encrypted'}
            </p>
          </div>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); setInfoOpen(v => !v); }}
            className="p-2 rounded-full transition-colors hover:bg-white/5">
            <Info size={18} style={{ color: 'var(--muted)' }} />
          </button>
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setHeaderMenu(v => !v); }}
              className="p-2 rounded-full transition-colors hover:bg-white/5">
              <MoreHorizontal size={18} style={{ color: 'var(--muted)' }} />
            </button>
            <AnimatePresence>
              {headerMenu && (
                <motion.div initial={{ opacity: 0, scale: 0.92, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: -6 }}
                  className="absolute right-0 top-10 rounded-2xl shadow-2xl overflow-hidden z-50 min-w-[180px]"
                  style={{ background: 'var(--glass-2)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid var(--glass-border)' }}
                  onClick={e => e.stopPropagation()}>
                  {onClose && (
                    <button onClick={() => { onClose(); setHeaderMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-white/5 text-white">
                      <X size={15} style={{ color: 'var(--muted)' }} /> Close DM
                    </button>
                  )}
                  <button className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-white/5"
                    style={{ color: 'var(--red)' }}>
                    <Trash2 size={15} /> Clear chat
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Info panel ── */}
      <AnimatePresence>
        {infoOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0" style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <Lock size={13} style={{ color: 'var(--accent)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  ECDH P-256 + AES-GCM-256 encryption · {msgCount} messages
                </span>
              </div>
              <button onClick={() => setInfoOpen(false)} style={{ color: 'var(--muted)' }}><X size={14} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5" onScroll={handleScroll}>
        {isLoading ? (
          <div className="space-y-4 pt-4">
            {[60,40,72,48,56].map((w, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <div className="h-9 rounded-3xl animate-pulse" style={{ width: `${w}%`, background: 'var(--glass-3)', maxWidth: 240 }} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center py-16">
            <div className="p-1" style={{ background: 'var(--gradient)', borderRadius: '50%' }}>
              <div className="p-1 rounded-full" style={{ background: 'var(--bg)' }}>
                <Avatar name={otherName} avatarUrl={otherUser?.avatarUrl} size={72} />
              </div>
            </div>
            <div>
              <p className="font-bold text-white text-lg">{otherName}</p>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Say hi! Messages are end-to-end encrypted.</p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOwn = msg.senderId === user?.id;
            const decrypted = decryptedTexts[msg.id];
            const showDate = i === 0 || new Date(msg.createdAt).toDateString() !== new Date(messages[i-1].createdAt).toDateString();
            const prevSame = i > 0 && messages[i-1].senderId === msg.senderId;
            const nextSame = i < messages.length - 1 && messages[i+1].senderId === msg.senderId;

            // Bubble border radius logic (Instagram-style grouping)
            const r = 20;
            const rs = 4;
            const borderRadius = isOwn
              ? `${prevSame ? rs : r}px ${r}px ${nextSame ? rs : r}px ${r}px`
              : `${r}px ${prevSame ? rs : r}px ${r}px ${nextSame ? rs : r}px`;

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex items-center justify-center my-4">
                    <span className="text-xs px-3 py-1 rounded-full" style={{ color: 'var(--muted)', background: 'var(--glass-3)' }}>
                      {formatDate(msg.createdAt)}
                    </span>
                  </div>
                )}

                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'} items-end gap-2 group ${prevSame ? 'mt-0.5' : 'mt-3'}`}
                  onContextMenu={e => openContextMenu(e, msg)}
                  onTouchStart={e => handleTouchStart(e, msg)}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchEnd}>

                  {/* Other user avatar — only last in group */}
                  {!isOwn && (
                    <div className="shrink-0 mb-0.5" style={{ width: 28 }}>
                      {!nextSame && <Avatar name={otherName} avatarUrl={otherUser?.avatarUrl} size={28} />}
                    </div>
                  )}

                  <div className={`max-w-[72%] relative ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                    {/* Reply preview */}
                    {msg.replyTo && (
                      <div className={`text-xs mb-1 px-3 py-1.5 rounded-2xl max-w-full truncate ${isOwn ? 'self-end' : 'self-start'}`}
                        style={{ background: 'var(--glass-3)', color: 'var(--muted)', borderLeft: `2px solid var(--accent)` }}>
                        {decryptedTexts[msg.replyTo.id] ?? '(encrypted)'}
                      </div>
                    )}

                    {/* Bubble */}
                    <div className="relative"
                      style={{
                        background: isOwn ? 'var(--accent)' : 'var(--elevated)',
                        borderRadius,
                        padding: '10px 14px',
                        cursor: 'default',
                      }}>
                      {msg.isDeleted ? (
                        <p className="text-sm italic" style={{ color: isOwn ? 'rgba(255,255,255,0.5)' : 'var(--muted)' }}>Message unsent</p>
                      ) : msg.type === 'text' ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-white">
                          {decrypted ?? (
                            <span className="text-xs italic" style={{ opacity: 0.5 }}>
                              {sharedKey ? 'Decrypting...' : '🔒 Encrypted'}
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="text-sm text-white/60">[attachment]</p>
                      )}
                    </div>

                    {/* Time — shown on last in group */}
                    {!nextSame && (
                      <span className="text-xs mt-1 px-1" style={{ color: 'var(--muted)' }}>
                        {formatTime(msg.createdAt)}{msg.isEdited ? ' · edited' : ''}
                      </span>
                    )}

                    {/* Hover quick actions */}
                    <div className={`absolute top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 ${isOwn ? '-left-16' : '-right-16'}`}>
                      <button onClick={() => setReplyTo(msg)}
                        className="p-1.5 rounded-full transition-colors hover:bg-white/10"
                        style={{ color: 'var(--muted)' }}>
                        <Reply size={13} />
                      </button>
                      <button onClick={e => openContextMenu(e, msg)}
                        className="p-1.5 rounded-full transition-colors hover:bg-white/10"
                        style={{ color: 'var(--muted)' }}>
                        <MoreHorizontal size={13} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {typingList.length > 0 && (
          <div className="flex justify-start items-end gap-2 mt-3">
            <Avatar name={otherName} avatarUrl={otherUser?.avatarUrl} size={28} />
            <div className="px-4 py-3 rounded-3xl" style={{ background: 'var(--glass-3)' }}>
              <div className="flex items-center gap-1">
                {[0,1,2].map(i => (
                  <motion.div key={i} animate={{ opacity: [0.3,1,0.3], y: [0,-3,0] }}
                    transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity }}
                    className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--muted)' }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Scroll to bottom */}
        <AnimatePresence>
          {!atBottom && (
            <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="fixed bottom-24 right-6 w-9 h-9 rounded-full flex items-center justify-center shadow-xl z-10"
              style={{ background: 'var(--glass-2)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid var(--glass-border)' }}>
              <ChevronDown size={16} className="text-white" />
            </motion.button>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* ── Context menu ── */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className="fixed z-50 rounded-2xl shadow-2xl overflow-hidden min-w-[200px]"
            style={{
              left: contextMenu.x,
              ...(contextMenu.fromBottom ? { bottom: contextMenu.y } : { top: contextMenu.y }),
              background: 'var(--glass-2)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--glass-border)'
            }}
            onClick={e => e.stopPropagation()}>
            {buildContextItems().map((item, i, arr) => (
              <div key={item.label}>
                {i > 0 && arr[i-1].danger !== item.danger && (
                  <div className="h-px mx-2" style={{ background: 'var(--border)' }} />
                )}
                <button onClick={item.action}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-white/5"
                  style={{ color: item.danger ? 'var(--red)' : 'var(--text)' }}>
                  {item.icon}
                  {item.label}
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reply / Edit bar ── */}
      <AnimatePresence>
        {replyTo && (
          <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
            className="px-4 py-2.5 flex items-center gap-3 shrink-0"
            style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--glass-1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
            <Reply size={14} style={{ color: 'var(--accent)' }} className="shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Replying</p>
              <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{decryptedTexts[replyTo.id] ?? '(encrypted)'}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="transition-colors hover:text-white" style={{ color: 'var(--muted)' }}>
              <X size={15} />
            </button>
          </motion.div>
        )}
        {editingMsg && (
          <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
            className="px-4 py-2.5 flex items-center gap-3 shrink-0"
            style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--glass-1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
            <Edit2 size={14} style={{ color: 'var(--accent)' }} className="shrink-0" />
            <p className="flex-1 text-sm" style={{ color: 'var(--accent)' }}>Editing message</p>
            <button onClick={() => { setEditingMsg(null); setEditText(''); setText(''); }}
              className="transition-colors hover:text-white" style={{ color: 'var(--muted)' }}>
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input bar ── */}
      <div className="px-3 py-3 flex items-end gap-2 shrink-0"
        style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--glass-1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <button onClick={() => fileRef.current?.click()}
          className="p-2.5 rounded-full transition-colors hover:bg-white/5 shrink-0 mb-0.5"
          style={{ color: 'var(--muted)' }}>
          <Paperclip size={20} />
        </button>
        <input ref={fileRef} type="file" className="hidden" />

        <div className="flex-1 flex items-end rounded-3xl overflow-hidden"
          style={{ background: 'var(--glass-3)', border: '1.5px solid var(--border)' }}>
          <textarea ref={inputRef}
            value={editingMsg ? editText : text}
            onChange={e => editingMsg ? setEditText(e.target.value) : setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            rows={1}
            className="flex-1 bg-transparent text-white text-sm px-4 py-2.5 outline-none resize-none overflow-y-auto"
            style={{ minHeight: 44, maxHeight: 128, fontFamily: 'var(--font)', color: 'var(--text)' }}
          />
          <div className="flex items-center pr-3 pb-2.5 shrink-0">
            <Lock size={11} style={{ color: 'var(--border-light)' }} />
          </div>
        </div>

        <button onClick={handleSend}
          disabled={sendMessage.isPending || editMessage.isPending || !(editingMsg ? editText : text).trim()}
          className="p-2.5 rounded-full transition-colors shrink-0 mb-0.5 disabled:opacity-30"
          style={{ color: 'var(--accent)' }}>
          <Send size={22} />
        </button>
      </div>
    </div>
  );
}
