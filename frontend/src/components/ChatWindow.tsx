import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Paperclip, Lock, MoreHorizontal, X, Edit2, Trash2, ChevronDown, Reply } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetConversation,
  useGetPublicKey,
  useGetMessages,
  useSendMessage,
  useEditMessage,
  useRemoveMessage,
  useRemoveMessageForAll,
  getGetMessagesQueryKey,
  getGetConversationQueryKey,
  getGetPublicKeyQueryKey,
} from '../lib/api';
import type { Message } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { joinConversation, leaveConversation, emitTyping, emitRead } from '../lib/socket';
import { importPublicKey, deriveSharedSecret, encryptMessage, decryptMessage } from '../lib/crypto';

interface ChatWindowProps {
  conversationId: string;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return 'Today';
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'long', day: 'numeric' });
}

export function ChatWindow({ conversationId }: ChatWindowProps) {
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
  const [contextMenu, setContextMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);
  const [decryptedTexts, setDecryptedTexts] = useState<Record<string, string>>({});
  const [atBottom, setAtBottom] = useState(true);

  const { data: conv } = useGetConversation(conversationId, {
    query: { queryKey: getGetConversationQueryKey(conversationId), enabled: !!conversationId },
  });
  const otherUserId = conv?.otherUser?.id ?? '';
  const { data: keyRecord } = useGetPublicKey(otherUserId, {
    query: { queryKey: getGetPublicKeyQueryKey(otherUserId), enabled: !!otherUserId },
  });
  const { data: msgPage, isLoading } = useGetMessages(conversationId, {
    query: { queryKey: getGetMessagesQueryKey(conversationId), enabled: !!conversationId },
  });

  const sendMessage = useSendMessage();
  const editMessage = useEditMessage();
  const removeMessage = useRemoveMessage();
  const removeForAll = useRemoveMessageForAll();

  useEffect(() => {
    joinConversation(conversationId);
    emitRead(conversationId);
    return () => leaveConversation(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (msgPage?.messages) setMessages(conversationId, msgPage.messages);
  }, [msgPage, conversationId, setMessages]);

  useEffect(() => {
    if (!privateKey || !keyRecord?.publicKey) { setSharedKey(null); return; }
    (async () => {
      try {
        const theirPubKey = await importPublicKey(keyRecord.publicKey);
        const sk = await deriveSharedSecret(privateKey, theirPubKey);
        setSharedKey(sk);
      } catch { setSharedKey(null); }
    })();
  }, [privateKey, keyRecord]);

  const messages = storeMessages[conversationId] ?? [];
  useEffect(() => {
    if (!sharedKey || messages.length === 0) return;
    const pending = messages.filter((m) => m.encryptedContent && m.iv && !decryptedTexts[m.id] && !m.isDeleted);
    if (pending.length === 0) return;
    (async () => {
      const results: Record<string, string> = {};
      for (const m of pending) {
        try { results[m.id] = await decryptMessage(sharedKey, m.encryptedContent!, m.iv!); }
        catch { results[m.id] = '[Encrypted message]'; }
      }
      setDecryptedTexts((prev) => ({ ...prev, ...results }));
    })();
  }, [sharedKey, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (atBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, atBottom]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  async function handleSend() {
    if (!text.trim() && !editingMsg) return;
    if (editingMsg) { await handleEditSubmit(); return; }
    if (!sharedKey) return;
    try {
      const { encryptedContent, iv } = await encryptMessage(sharedKey, text.trim());
      const result = await sendMessage.mutateAsync({
        conversationId,
        data: { type: 'text', encryptedContent, iv, replyToId: replyTo?.id },
      });
      addMessage(conversationId, result);
      setDecryptedTexts((prev) => ({ ...prev, [result.id]: text.trim() }));
      setText('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(conversationId) });
    } catch {}
  }

  async function handleEditSubmit() {
    if (!editingMsg || !sharedKey || !editText.trim()) return;
    try {
      const { encryptedContent, iv } = await encryptMessage(sharedKey, editText.trim());
      const result = await editMessage.mutateAsync({
        conversationId, messageId: editingMsg.id, data: { encryptedContent, iv },
      });
      setDecryptedTexts((prev) => ({ ...prev, [result.id]: editText.trim() }));
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

  function handleContextMenu(e: React.MouseEvent, msg: Message) {
    e.preventDefault();
    // Clamp to viewport
    const x = Math.min(e.clientX, window.innerWidth - 160);
    const y = Math.min(e.clientY, window.innerHeight - 180);
    setContextMenu({ msg, x, y });
  }

  async function handleDeleteForMe() {
    if (!contextMenu) return;
    await removeMessage.mutateAsync({ conversationId, messageId: contextMenu.msg.id });
    setContextMenu(null);
    queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(conversationId) });
  }
  async function handleDeleteForAll() {
    if (!contextMenu) return;
    await removeForAll.mutateAsync({ conversationId, messageId: contextMenu.msg.id });
    setContextMenu(null);
    queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(conversationId) });
  }
  function startEdit(msg: Message) {
    setEditingMsg(msg); setEditText(decryptedTexts[msg.id] ?? ''); setText(decryptedTexts[msg.id] ?? '');
    setContextMenu(null); inputRef.current?.focus();
  }

  const typingList = typingUsers[conversationId]?.filter((uid) => uid !== user?.id) ?? [];
  const otherUser = conv?.otherUser;
  const otherName = otherUser?.userId ?? '...';

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--ig-bg)' }} onClick={() => contextMenu && setContextMenu(null)}>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 relative" onScroll={handleScroll}>
        {isLoading ? (
          <div className="space-y-4 pt-4">
            {[1,2,3].map((i) => (
              <div key={i} className={`flex ${i%2===0?'justify-end':'justify-start'}`}>
                <div className={`h-10 rounded-2xl animate-pulse bg-ig-elevated ${i%2===0?'w-40':'w-52'}`} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-12">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              {otherUser?.avatarUrl ? (
                <img src={otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-xl font-bold">{otherName.slice(0,2).toUpperCase()}</span>
              )}
            </div>
            <div>
              <p className="font-semibold text-white">{otherName}</p>
              <p className="text-sm text-ig-muted mt-1">Messages are end-to-end encrypted</p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOwn = msg.senderId === user?.id;
            const decrypted = decryptedTexts[msg.id];
            const showDate = i === 0 || new Date(msg.createdAt).toDateString() !== new Date(messages[i-1].createdAt).toDateString();
            const prevOwn = i > 0 && messages[i-1].senderId === msg.senderId;
            const nextOwn = i < messages.length-1 && messages[i+1].senderId === msg.senderId;

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex items-center justify-center my-4">
                    <span className="text-xs text-ig-muted bg-ig-elevated px-3 py-1 rounded-full">
                      {formatDate(msg.createdAt)}
                    </span>
                  </div>
                )}

                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${prevOwn ? 'mt-0.5' : 'mt-3'}`}
                  onContextMenu={(e) => handleContextMenu(e, msg)}
                >
                  {/* Other user avatar (only for first in group) */}
                  {!isOwn && !nextOwn && (
                    <div className="w-7 h-7 rounded-full overflow-hidden mr-2 self-end shrink-0 bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      {otherUser?.avatarUrl ? (
                        <img src={otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white text-[10px] font-bold">{otherName.slice(0,2).toUpperCase()}</span>
                      )}
                    </div>
                  )}
                  {!isOwn && nextOwn && <div className="w-7 mr-2 shrink-0" />}

                  <div className={`max-w-[72%] group ${isOwn ? '' : ''}`}>
                    {/* Reply preview */}
                    {msg.replyTo && (
                      <div className={`text-xs text-ig-muted border-l-2 border-ig-muted/40 pl-2 mb-1 opacity-70 ${isOwn ? 'text-right' : ''}`}>
                        {decryptedTexts[msg.replyTo.id] ?? '(encrypted)'}
                      </div>
                    )}

                    <div
                      className={`relative px-3.5 py-2.5 ${
                        isOwn
                          ? 'bg-ig-accent text-white rounded-t-2xl rounded-l-2xl rounded-br-sm'
                          : 'text-white rounded-t-2xl rounded-r-2xl rounded-bl-sm'
                        }  ${isOwn && !prevOwn ? 'rounded-tr-2xl' : ''}`}
                      style={isOwn ? {} : { background: 'var(--ig-elevated)' }}
                    >
                      {msg.isDeleted ? (
                        <p className="text-sm italic opacity-60">Message deleted</p>
                      ) : msg.type === 'text' ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {decrypted ?? (
                            <span className="opacity-50 text-xs italic">
                              {sharedKey ? 'Decrypting...' : '🔒 Encrypted'}
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="text-sm opacity-60">[attachment]</p>
                      )}

                      {/* Timestamp + edited */}
                      <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : ''}`}>
                        <span className="text-[10px] opacity-60">{formatTime(msg.createdAt)}</span>
                        {msg.isEdited && <span className="text-[10px] opacity-50">· edited</span>}
                      </div>

                      {/* Hover actions */}
                      <div className={`absolute ${isOwn ? '-left-16' : '-right-16'} top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1`}>
                        <button onClick={() => setReplyTo(msg)} className="p-1.5 rounded-full hover:bg-ig-elevated transition-colors text-ig-muted hover:text-white">
                          <Reply size={14} />
                        </button>
                        <button onClick={(e) => handleContextMenu(e, msg)} className="p-1.5 rounded-full hover:bg-ig-elevated transition-colors text-ig-muted hover:text-white">
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {typingList.length > 0 && (
          <div className="flex justify-start mt-3 ml-9">
            <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm" style={{ background: 'var(--ig-elevated)' }}>
              <div className="flex items-center gap-1">
                {[0,1,2].map((i) => (
                  <motion.div key={i} animate={{ opacity: [0.3,1,0.3], y: [0,-3,0] }} transition={{ duration: 1, delay: i*0.2, repeat: Infinity }}
                    className="w-1.5 h-1.5 rounded-full bg-ig-muted" />
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
              className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-ig-card border border-ig flex items-center justify-center shadow-lg"
              style={{ borderColor: 'var(--ig-border)', background: 'var(--ig-card)' }}
            >
              <ChevronDown size={16} className="text-white" />
            </motion.button>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            className="fixed z-50 rounded-xl shadow-xl overflow-hidden min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y, background: 'var(--ig-card)', border: '1px solid var(--ig-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => { setReplyTo(contextMenu.msg); setContextMenu(null); }} className="w-full text-left px-4 py-3 text-sm text-white hover:bg-ig-elevated flex items-center gap-3 transition-colors">
              <Reply size={14} className="text-ig-muted" /> Reply
            </button>
            {contextMenu.msg.senderId === user?.id && !contextMenu.msg.isDeleted && (
              <button onClick={() => startEdit(contextMenu.msg)} className="w-full text-left px-4 py-3 text-sm text-white hover:bg-ig-elevated flex items-center gap-3 transition-colors">
                <Edit2 size={14} className="text-ig-muted" /> Edit
              </button>
            )}
            <div className="h-px" style={{ background: 'var(--ig-border)' }} />
            <button onClick={handleDeleteForMe} className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-ig-elevated flex items-center gap-3 transition-colors">
              <Trash2 size={14} /> Delete for me
            </button>
            {contextMenu.msg.senderId === user?.id && (
              <button onClick={handleDeleteForAll} className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-ig-elevated flex items-center gap-3 transition-colors">
                <Trash2 size={14} /> Delete for everyone
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reply / Edit bar */}
      <AnimatePresence>
        {replyTo && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
            className="px-4 py-2 border-t flex items-center gap-3" style={{ borderColor: 'var(--ig-border)', background: 'var(--ig-surface)' }}>
            <Reply size={14} className="text-ig-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ig-accent font-medium">Replying</p>
              <p className="text-xs text-ig-muted truncate">{decryptedTexts[replyTo.id] ?? '(encrypted)'}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-ig-muted hover:text-white transition-colors">
              <X size={16} />
            </button>
          </motion.div>
        )}
        {editingMsg && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
            className="px-4 py-2 border-t flex items-center gap-3" style={{ borderColor: 'var(--ig-border)', background: 'var(--ig-surface)' }}>
            <Edit2 size={14} className="text-ig-accent shrink-0" />
            <p className="flex-1 text-sm text-ig-accent">Editing message</p>
            <button onClick={() => { setEditingMsg(null); setEditText(''); setText(''); }} className="text-ig-muted hover:text-white transition-colors">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar */}
      <div className="px-3 py-3 border-t flex items-end gap-2 shrink-0" style={{ borderColor: 'var(--ig-border)', background: 'var(--ig-surface)' }}>
        <button onClick={() => fileRef.current?.click()} className="p-2 rounded-full text-ig-muted hover:text-white transition-colors shrink-0 mb-0.5">
          <Paperclip size={20} />
        </button>
        <input ref={fileRef} type="file" className="hidden" />

        <div className="flex-1 flex items-end rounded-2xl border" style={{ borderColor: 'var(--ig-border)', background: 'var(--ig-elevated)' }}>
          <textarea
            ref={inputRef}
            value={editingMsg ? editText : text}
            onChange={(e) => editingMsg ? setEditText(e.target.value) : setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            rows={1}
            className="flex-1 bg-transparent text-white text-sm px-4 py-2.5 outline-none resize-none max-h-32 overflow-y-auto placeholder:text-ig-muted"
            style={{ minHeight: '42px', fontFamily: 'Inter, sans-serif' }}
          />
          {/* E2E indicator */}
          <div className="flex items-center pr-3 pb-2.5 text-ig-muted shrink-0">
            <Lock size={12} />
          </div>
        </div>

        <button
          onClick={handleSend}
          disabled={sendMessage.isPending || editMessage.isPending || !(editingMsg ? editText : text).trim()}
          className="p-2 rounded-full text-ig-accent hover:text-ig-accent/80 transition-colors disabled:opacity-30 shrink-0 mb-0.5"
        >
          <Send size={22} />
        </button>
      </div>
    </div>
  );
}
