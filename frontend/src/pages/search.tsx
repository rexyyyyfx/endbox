import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Send, Check, X, UserPlus, Clock, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListRequests,
  getListRequestsQueryKey,
  useSendRequest,
  useUpdateRequest,
  useCancelRequest,
  getListConversationsQueryKey,
  RequestUpdateAction,
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
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: getListRequestsQueryKey() });
    };
    window.addEventListener('endbox:request', handler);
    window.addEventListener('endbox:request_accepted', handler);
    return () => {
      window.removeEventListener('endbox:request', handler);
      window.removeEventListener('endbox:request_accepted', handler);
    };
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
      const msg = err instanceof Error ? err.message : 'Failed to send request.';
      setFeedback({ type: 'err', msg });
    }
  }

  async function handleAction(requestId: string, action: 'accept' | 'decline') {
    try {
      await updateRequest.mutateAsync({
        requestId,
        data: { action: action === 'accept' ? RequestUpdateAction.accept : RequestUpdateAction.decline },
      });
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

  const received = requests?.received?.filter((r) => r.status === 'pending') ?? [];
  const sent = requests?.sent?.filter((r) => r.status === 'pending') ?? [];

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--ig-bg)' }}>
      <div className="max-w-lg mx-auto p-4 space-y-5">

        {/* Find people */}
        <div>
          <p className="text-xs font-semibold text-ig-muted uppercase tracking-widest mb-3">Find People</p>
          <form onSubmit={handleSend} className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ig-muted" />
              <input
                className="ig-input pl-9"
                placeholder="User ID (e.g. AB1234)"
                value={targetId}
                onChange={(e) => { setTargetId(e.target.value.toUpperCase()); setFeedback(null); }}
                maxLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={sendRequest.isPending || !targetId.trim()}
              className="ig-btn px-4 flex items-center gap-2 shrink-0"
            >
              {sendRequest.isPending ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <UserPlus size={16} />
              )}
            </button>
          </form>

          <AnimatePresence>
            {feedback && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`text-sm mt-2 px-1 ${feedback.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}
              >
                {feedback.msg}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Incoming requests */}
        {received.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-ig-muted uppercase tracking-widest mb-3">
              Requests · {received.length}
            </p>
            <div className="space-y-2">
              {received.map((req) => (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--ig-card)', border: '1px solid var(--ig-border)' }}
                >
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                    <span className="text-white text-sm font-bold">{req.fromUserId.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{req.fromUserId}</p>
                    <p className="text-xs text-ig-muted">Wants to chat</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAction(req.id, 'accept')}
                      className="px-4 py-1.5 rounded-lg bg-ig-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleAction(req.id, 'decline')}
                      className="w-8 h-8 rounded-full hover:bg-ig-elevated flex items-center justify-center transition-colors"
                    >
                      <X size={16} className="text-ig-muted" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Sent requests */}
        {sent.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-ig-muted uppercase tracking-widest mb-3">Sent Requests</p>
            <div className="space-y-2">
              {sent.map((req) => (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--ig-card)', border: '1px solid var(--ig-border)' }}
                >
                  <div className="w-11 h-11 rounded-full bg-ig-elevated flex items-center justify-center shrink-0">
                    <Clock size={18} className="text-ig-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{req.toUserId}</p>
                    <p className="text-xs text-ig-muted">Pending</p>
                  </div>
                  <button
                    onClick={() => handleCancel(req.id)}
                    className="text-xs font-semibold text-ig-muted hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-ig-elevated"
                  >
                    Cancel
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {received.length === 0 && sent.length === 0 && !isLoading && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="w-14 h-14 rounded-full bg-ig-elevated flex items-center justify-center">
              <Users size={24} className="text-ig-muted" />
            </div>
            <p className="text-sm text-ig-muted">No pending requests</p>
          </div>
        )}
      </div>
    </div>
  );
}
