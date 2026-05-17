import { useState, useEffect, useRef, useCallback } from 'react';
import { useRoute, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Search as SearchIcon, User, Lock, ArrowLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useListConversations, useGetMe, getListConversationsQueryKey, getGetMeQueryKey } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { ConversationList } from '../components/ConversationList';
import { ChatWindow } from '../components/ChatWindow';
import { EndBoxLogo } from '../components/EndBoxLogo';
import SearchPage from './search';
import ProfilePage from './profile';

type Tab = 'chat' | 'search' | 'profile';
const tabOrder: Tab[] = ['search', 'chat', 'profile'];
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 420;
const SIDEBAR_DEFAULT = 300;

export default function MainPage() {
  const [, navigate] = useLocation();
  const [matchChat, paramsChat] = useRoute('/chat/:id');
  const { user, setUser, token } = useAuthStore();
  const { setConversations } = useChatStore();
  const queryClient = useQueryClient();
  const activeConvId = matchChat ? paramsChat?.id ?? null : null;

  const [tab, setTab] = useState<Tab>('chat');
  const [prevTabIndex, setPrevTabIndex] = useState(1);
  const [requestCount, setRequestCount] = useState(0);
  const [sidebarW, setSidebarW] = useState(SIDEBAR_DEFAULT);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; w: number } | null>(null);

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), enabled: !!token } });
  const { data: conversations, isLoading: convsLoading } = useListConversations({ query: { queryKey: getListConversationsQueryKey() } });

  useEffect(() => { if (me) setUser(me); }, [me, setUser]);
  useEffect(() => { if (conversations) setConversations(conversations); }, [conversations, setConversations]);
  useEffect(() => { if (me?.theme) document.documentElement.classList.toggle('dark', me.theme !== 'light'); }, [me?.theme]);

  useEffect(() => {
    const handler = () => {
      setRequestCount(c => c + 1);
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    };
    window.addEventListener('endbox:request', handler);
    window.addEventListener('endbox:request_accepted', handler);
    return () => { window.removeEventListener('endbox:request', handler); window.removeEventListener('endbox:request_accepted', handler); };
  }, [queryClient]);

  useEffect(() => { if (tab === 'search') setRequestCount(0); }, [tab]);

  // ── Resize drag ──────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStart.current = { x: e.clientX, w: sidebarW };
    setDragging(true);
  }, [sidebarW]);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      if (!dragStart.current) return;
      const delta = e.clientX - dragStart.current.x;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStart.current.w + delta));
      setSidebarW(next);
    }
    function onUp() { setDragging(false); dragStart.current = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging]);

  function handleSelectConversation(id: string) { setTab('chat'); navigate(`/chat/${id}`); }
  function handleTabChange(t: Tab) {
    setPrevTabIndex(tabOrder.indexOf(tab));
    setTab(t);
    if (t === 'chat' && !activeConvId) navigate('/');
  }
  function handleBack() { navigate('/'); setTab('chat'); }

  const tabs: { id: Tab; icon: typeof MessageSquare; label: string; badge?: number }[] = [
    { id: 'search', icon: SearchIcon, label: 'Search', badge: requestCount > 0 ? requestCount : undefined },
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  const convs = conversations ?? [];
  const currentIdx = tabOrder.indexOf(tab);
  const direction = currentIdx > prevTabIndex ? 'right' : 'left';

  const tabContent = (key: string, content: React.ReactNode, dir: 'left' | 'right' | 'none' = 'none') => (
    <motion.div key={key}
      initial={dir === 'right' ? { x: 20, opacity: 0 } : dir === 'left' ? { x: -20, opacity: 0 } : { opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 38 }}
      className="h-full">
      {content}
    </motion.div>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)', userSelect: dragging ? 'none' : undefined }}>
      <div className="flex-1 flex min-h-0">

        {/* ── Desktop sidebar ── */}
        <div className="hidden md:flex flex-col shrink-0 relative"
          style={{ width: sidebarW, borderRight: '1px solid var(--glass-border)', background: 'var(--glass-1)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}>

          {/* Logo */}
          <div className="flex items-center gap-3 px-4 py-3.5 shrink-0"
            style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <EndBoxLogo size={28} pulse={false} />
            <div>
              <p className="text-sm font-black text-white tracking-wider">ENDBOX</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Lock size={8} style={{ color: 'var(--accent)' }} />
                <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>E2E Encrypted</p>
              </div>
            </div>
          </div>

          {/* Tab nav */}
          <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--glass-border)' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => handleTabChange(t.id)}
                className="flex-1 py-2.5 relative flex flex-col items-center gap-0.5 transition-all text-xs"
                style={{ color: tab === t.id ? 'var(--accent)' : 'var(--muted)', background: tab === t.id ? 'rgba(0,149,246,0.06)' : 'transparent' }}>
                {tab === t.id && (
                  <motion.div layoutId="desktop-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ background: 'var(--accent)' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
                )}
                <t.icon size={14} />
                <span className="text-[9px] font-bold uppercase tracking-widest">{t.label}</span>
                {t.badge !== undefined && (
                  <span className="absolute top-1 right-1.5 min-w-[16px] h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-1"
                    style={{ background: 'var(--accent)' }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            <AnimatePresence mode="wait">
              {tab === 'chat' && tabContent('dc', <ConversationList conversations={convs} activeId={activeConvId} onSelect={handleSelectConversation} isLoading={convsLoading} />, direction)}
              {tab === 'search' && tabContent('ds', <SearchPage />, direction)}
              {tab === 'profile' && tabContent('dp', <ProfilePage />, direction)}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Resize handle ── */}
        <div className={`resize-handle hidden md:block ${dragging ? 'dragging' : ''}`} onMouseDown={onMouseDown} />

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">

          {/* Mobile top bar */}
          <div className="md:hidden flex items-center gap-3 px-4 py-3 shrink-0"
            style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--glass-1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
            {tab === 'chat' && activeConvId ? (
              <>
                <button onClick={handleBack} className="transition-colors p-0.5 hover:text-white" style={{ color: 'var(--muted)' }}>
                  <ArrowLeft size={18} />
                </button>
                <p className="text-sm font-bold text-white flex-1 truncate">
                  {convs.find(c => c.id === activeConvId)?.otherUser.userId ?? '—'}
                </p>
                <div className="flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                  <Lock size={9} /><span className="text-[9px] font-bold uppercase">E2E</span>
                </div>
              </>
            ) : (
              <>
                <EndBoxLogo size={22} pulse={false} />
                <p className="text-sm font-black text-white flex-1 tracking-wider">ENDBOX</p>
                <div className="flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                  <Lock size={9} /><span className="text-[9px] font-bold uppercase">E2E</span>
                </div>
              </>
            )}
          </div>

          {/* Content area */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {activeConvId ? (
              <div className={`h-full ${tab !== 'chat' ? 'hidden md:block' : ''}`}>
                <AnimatePresence mode="wait">
                  <motion.div key={activeConvId}
                    initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 38 }}
                    className="h-full">
                    <ChatWindow conversationId={activeConvId} />
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="hidden md:flex h-full flex-col items-center justify-center gap-5">
                <div className="flex flex-col items-center gap-4 p-8 rounded-3xl"
                  style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(20px)' }}>
                  <EndBoxLogo size={52} />
                  <div className="text-center">
                    <p className="font-black text-white text-lg tracking-wider">ENDBOX</p>
                    <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Select a conversation to start</p>
                    <div className="flex items-center justify-center gap-1.5 mt-3" style={{ color: 'var(--accent)' }}>
                      <Lock size={10} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">End-to-end encrypted</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Mobile tab content */}
            <div className="md:hidden h-full">
              <AnimatePresence mode="wait">
                {tab === 'chat' && !activeConvId && tabContent('mc', (
                  <div className="h-full overflow-y-auto">
                    <ConversationList conversations={convs} activeId={null} onSelect={handleSelectConversation} isLoading={convsLoading} />
                  </div>
                ), 'none')}
                {tab === 'search' && tabContent('ms', <SearchPage />, direction)}
                {tab === 'profile' && tabContent('mp', <ProfilePage />, direction)}
              </AnimatePresence>
            </div>
          </div>

          {/* Mobile bottom tab bar */}
          <div className="md:hidden flex shrink-0"
            style={{ borderTop: '1px solid var(--glass-border)', background: 'var(--glass-1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => handleTabChange(t.id)}
                className="flex-1 pt-3 pb-5 relative flex flex-col items-center gap-1.5 transition-all"
                style={{ color: tab === t.id ? 'var(--accent)' : 'var(--muted)' }}>
                {tab === t.id && (
                  <motion.div layoutId="mobile-tab-indicator"
                    className="absolute top-0 left-0 right-0 h-0.5"
                    style={{ background: 'var(--accent)' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
                )}
                <motion.div animate={{ scale: tab === t.id ? 1.12 : 1 }} transition={{ type: 'spring', stiffness: 500, damping: 35 }}>
                  <t.icon size={21} />
                </motion.div>
                <span className="text-[9px] font-bold uppercase tracking-widest">{t.label}</span>
                {t.badge !== undefined && (
                  <span className="absolute top-2 right-[calc(50%-20px)] min-w-[16px] h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-1"
                    style={{ background: 'var(--accent)' }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
