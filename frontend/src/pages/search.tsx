import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, UserPlus, Clock, Users, X, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListRequests, getListRequestsQueryKey, useSendRequest,
  useUpdateRequest, useCancelRequest, getListConversationsQueryKey, RequestUpdateAction,
} from '../lib/api';

export default function SearchPage() {
  const queryClient = useQueryClient();
  const [targetId, setTargetId] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const { data: requests, isLoading } = useListRequests();
  const sendRequest = useSendRequest();
  const updateRequest = useUpdateRequest();
  const cancelRequest = useCancelRequest();

  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey: getListRequestsQueryKey() });
    window.addEventListener('endbox:request', handler);
    window.addEventListener('endbox:request_accepted', handler);
    return () => { window.removeEventListener('endbox:request', handler); window.removeEventListener('endbox:request_accepted', handler); };
  }, [queryClient]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const id = targetId.trim().toUpperCase();
    if (!id) return;
    setFeedback(null);
    try {
      await sendRequest.mutateAsync({ data: { targetUserId: id } });
      setFeedback({ type: 'ok', msg: `Request sent to ${id}` });
      setTargetId('');
      queryClient.invalidateQueries({ queryKey: getListRequestsQueryKey() });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Failed.' });
    }
  }

  async function handleAction(requestId: string, action: 'accept' | 'decline') {
    try {
      await updateRequest.mutateAsync({ requestId, data: { action: action === 'accept' ? RequestUpdateAction.accept : RequestUpdateAction.decline } });
      queryClient.invalidateQueries({ queryKey: getListRequestsQueryKey() });
      if (action === 'accept') queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    } catch {}
  }

  async function handleCancel(requestId: string) {
    try {
      await cancelRequest.mutateAsync({ requestId });
      queryClient.invalidateQueries({ queryKey: getListRequestsQueryKey() });
    } catch {}
  }

  const received = requests?.received?.filter(r => r.status === 'pending') ?? [];
  const sent = requests?.sent?.filter(r => r.status === 'pending') ?? [];

  return (
    <div className="h-full overflow-y-auto px-4 py-5 space-y-6" style={{ background: 'transparent' }}>

      {/* ── Find people ── */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Find People</p>
        <form onSubmit={handleSend} className="flex gap-2">
          {/* Input */}
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
            <input
              placeholder="User ID (e.g. AB1234)"
              value={targetId}
              onChange={e => { setTargetId(e.target.value.toUpperCase()); setFeedback(null); }}
              maxLength={6}
              style={{
                width: '100%',
                paddingLeft: '2.25rem',
                paddingRight: '1rem',
                paddingTop: '10px',
                paddingBottom: '10px',
                background: 'var(--glass-2)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1.5px solid var(--glass-border-strong)',
                borderRadius: '12px',
                color: 'var(--text)',
                fontFamily: 'var(--font)',
                fontSize: '14px',
                fontWeight: 500,
                outline: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-glow)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'var(--glass-border-strong)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>
          {/* Send button */}
          <button type="submit" disabled={sendRequest.isPending || !targetId.trim()}
            className="px-4 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 shrink-0"
            style={{ background: 'var(--accent)', color: 'white', minWidth: 44, boxShadow: '0 4px 16px rgba(0,149,246,0.3)' }}>
            {sendRequest.isPending
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <UserPlus size={16} />}
          </button>
        </form>

        <AnimatePresence>
          {feedback && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="text-sm mt-2.5 px-1 font-medium"
              style={{ color: feedback.type === 'ok' ? 'var(--green)' : 'var(--red)' }}>
              {feedback.msg}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* ── Incoming requests ── */}
      {received.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
            Requests · {received.length}
          </p>
          <div className="space-y-2">
            {received.map(req => (
              <motion.div key={req.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-3 rounded-2xl"
                style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }}>
                  <span className="text-white text-sm font-bold">{req.fromUserId.slice(0, 2)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{req.fromUserId}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Wants to chat</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => handleAction(req.id, 'accept')}
                    className="px-3.5 py-1.5 rounded-xl text-white text-xs font-bold transition-opacity hover:opacity-80"
                    style={{ background: 'var(--accent)' }}>
                    Accept
                  </button>
                  <button onClick={() => handleAction(req.id, 'decline')}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
                    style={{ color: 'var(--muted)' }}>
                    <X size={15} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sent requests ── */}
      {sent.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Sent</p>
          <div className="space-y-2">
            {sent.map(req => (
              <motion.div key={req.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-3 p-3 rounded-2xl"
                style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'var(--glass-3)', border: '1px solid var(--glass-border)' }}>
                  <Clock size={16} style={{ color: 'var(--muted)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{req.toUserId}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Pending</p>
                </div>
                <button onClick={() => handleCancel(req.id)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors hover:text-white"
                  style={{ background: 'var(--glass-3)', color: 'var(--muted)', border: '1px solid var(--glass-border)' }}>
                  Cancel
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {received.length === 0 && sent.length === 0 && !isLoading && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-border)' }}>
            <Users size={22} style={{ color: 'var(--muted)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">No pending requests</p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Search for a User ID above to connect</p>
          </div>
        </div>
      )}
    </div>
  );
}
