import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Search as SearchIcon, User, Lock, ArrowLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListConversations,
  useGetMe,
  getListConversationsQueryKey,
  getGetMeQueryKey,
} from '../lib/api';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { ConversationList } from '../components/ConversationList';
import { ChatWindow } from '../components/ChatWindow';
import { EndBoxLogo } from '../components/EndBoxLogo';
import SearchPage from './search';
import ProfilePage from './profile';

type Tab = 'chat' | 'search' | 'profile';

const slideVariants = {
  enterRight: { x: 24, opacity: 0 },
  enterLeft: { x: -24, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { opacity: 0, scale: 0.98 },
};

const tabOrder: Tab[] = ['search', 'chat', 'profile'];

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

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), enabled: !!token } });
  const { data: conversations, isLoading: convsLoading } = useListConversations({
    query: { queryKey: getListConversationsQueryKey() },
  });

  useEffect(() => { if (me) setUser(me); }, [me, setUser]);
  useEffect(() => { if (conversations) setConversations(conversations); }, [conversations, setConversations]);
  useEffect(() => {
    if (me?.theme) document.documentElement.classList.toggle('dark', me.theme !== 'light');
  }, [me?.theme]);

  useEffect(() => {
    const handler = () => {
      setRequestCount((c) => c + 1);
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    };
    window.addEventListener('endbox:request', handler);
    window.addEventListener('endbox:request_accepted', handler);
    return () => {
      window.removeEventListener('endbox:request', handler);
      window.removeEventListener('endbox:request_accepted', handler);
    };
  }, [queryClient]);

  useEffect(() => { if (tab === 'search') setRequestCount(0); }, [tab]);

  function handleSelectConversation(id: string) {
    setTab('chat');
    navigate(`/chat/${id}`);
  }

  function handleTabChange(t: Tab) {
    const oldIdx = tabOrder.indexOf(tab);
    const newIdx = tabOrder.indexOf(t);
    setPrevTabIndex(oldIdx);
    setTab(t);
    if (t === 'chat' && !activeConvId) navigate('/');
  }

  function handleBack() {
    navigate('/');
    setTab('chat');
  }

  const tabs: { id: Tab; icon: typeof MessageSquare; label: string; badge?: number }[] = [
    { id: 'search', icon: SearchIcon, label: 'Search', badge: requestCount > 0 ? requestCount : undefined },
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  const convs = conversations ?? [];
  const currentIdx = tabOrder.indexOf(tab);

  // Direction for slide animation
  const direction = currentIdx > prevTabIndex ? 'right' : 'left';

  const tabContent = (key: string, content: React.ReactNode, dir: 'left' | 'right' | 'none' = 'none') => (
    <motion.div
      key={key}
      initial={dir === 'right' ? slideVariants.enterRight : dir === 'left' ? slideVariants.enterLeft : { opacity: 0 }}
      animate={slideVariants.center}
      exit={slideVariants.exit}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      className="h-full"
    >
      {content}
    </motion.div>
  );

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden dark">
      <div className="flex-1 flex min-h-0">

        {/* ─── Desktop sidebar ─── */}
        <div className="hidden md:flex flex-col w-[280px] border-r border-border bg-card/40 shrink-0">
          {/* Logo */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
            <EndBoxLogo size={30} pulse={false} />
            <div>
              <p className="font-mono text-sm font-bold text-foreground tracking-wider">ENDBOX</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Lock size={8} className="text-primary/50" />
                <p className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-widest">E2E Encrypted</p>
              </div>
            </div>
          </div>

          {/* Tab nav */}
          <div className="flex border-b border-border">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={`flex-1 py-2.5 relative flex flex-col items-center gap-0.5 transition-all text-xs font-mono ${
                  tab === t.id
                    ? 'text-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/10'
                }`}
              >
                {tab === t.id && (
                  <motion.div
                    layoutId="desktop-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <t.icon size={14} />
                <span className="text-[9px] uppercase tracking-widest">{t.label}</span>
                {t.badge !== undefined && (
                  <span className="absolute top-1 right-1.5 min-w-[14px] h-3.5 bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center px-0.5 rounded-none">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Sidebar content — animated */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            <AnimatePresence mode="wait">
              {tab === 'chat' && tabContent('desktop-chat-list', (
                <ConversationList
                  conversations={convs}
                  activeId={activeConvId}
                  onSelect={handleSelectConversation}
                  isLoading={convsLoading}
                />
              ), direction)}
              {tab === 'search' && tabContent('desktop-search', <SearchPage />, direction)}
              {tab === 'profile' && tabContent('desktop-profile', <ProfilePage />, direction)}
            </AnimatePresence>
          </div>
        </div>

        {/* ─── Main content (desktop right / mobile full) ─── */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">

          {/* Mobile top bar */}
          <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card/40 shrink-0">
            {tab === 'chat' && activeConvId ? (
              <>
                <button
                  onClick={handleBack}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                >
                  <ArrowLeft size={18} />
                </button>
                <p className="font-mono text-sm font-bold text-foreground tracking-wider flex-1">
                  {convs.find(c => c.id === activeConvId)?.otherUser.userId ?? '—'}
                </p>
                <div className="flex items-center gap-1 text-primary/60">
                  <Lock size={9} />
                  <span className="text-[9px] font-mono uppercase">E2E</span>
                </div>
              </>
            ) : (
              <>
                <EndBoxLogo size={22} pulse={false} />
                <p className="font-mono text-sm font-bold text-foreground tracking-wider flex-1">ENDBOX</p>
                <div className="flex items-center gap-1 text-primary/60">
                  <Lock size={9} />
                  <span className="text-[9px] font-mono uppercase">E2E</span>
                </div>
              </>
            )}
          </div>

          {/* Content area */}
          <div className="flex-1 min-h-0 overflow-hidden relative">

            {/* ── Desktop: always show ChatWindow in main area ── */}
            {activeConvId ? (
              <div className={`h-full ${tab !== 'chat' ? 'hidden md:block' : ''}`}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeConvId}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                    className="h-full"
                  >
                    <ChatWindow conversationId={activeConvId} />
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : (
              /* Desktop empty state (no active chat) */
              <motion.div
                key="desktop-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="hidden md:flex h-full flex-col items-center justify-center gap-4"
              >
                <EndBoxLogo size={56} />
                <div className="text-center">
                  <p className="font-mono text-base font-bold text-foreground tracking-wider">ENDBOX</p>
                  <p className="text-xs font-mono text-muted-foreground mt-1">Select a conversation to start</p>
                  <div className="flex items-center justify-center gap-1.5 mt-3 text-primary/50">
                    <Lock size={10} />
                    <span className="text-[10px] font-mono uppercase tracking-widest">End-to-end encrypted</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Mobile-only: tab content ── */}
            <div className="md:hidden h-full">
              <AnimatePresence mode="wait">
                {tab === 'chat' && !activeConvId && tabContent('mobile-chat-list', (
                  <div className="h-full overflow-y-auto">
                    <ConversationList
                      conversations={convs}
                      activeId={null}
                      onSelect={handleSelectConversation}
                      isLoading={convsLoading}
                    />
                  </div>
                ), 'none')}
                {tab === 'search' && tabContent('mobile-search', <SearchPage />, direction)}
                {tab === 'profile' && tabContent('mobile-profile', <ProfilePage />, direction)}
              </AnimatePresence>
            </div>
          </div>

          {/* Mobile bottom tab bar */}
          <div className="md:hidden flex border-t border-border bg-card/40 shrink-0">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={`flex-1 pt-3 pb-4 relative flex flex-col items-center gap-1 transition-all ${
                  tab === t.id ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {tab === t.id && (
                  <motion.div
                    layoutId="mobile-tab-indicator"
                    className="absolute top-0 left-0 right-0 h-0.5 bg-primary"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <motion.div
                  animate={{ scale: tab === t.id ? 1.1 : 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                >
                  <t.icon size={20} />
                </motion.div>
                <span className="text-[9px] font-mono uppercase tracking-widest">{t.label}</span>
                {t.badge !== undefined && (
                  <span className="absolute top-2 right-[calc(50%-18px)] min-w-[14px] h-3.5 bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center px-0.5">
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
