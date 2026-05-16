import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, X, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../store/auth';

/**
 * Shows a banner when the user is logged in (has token) but the
 * private key is missing (common after page refresh). They can
 * enter their password to restore E2E encryption without full re-login.
 */
export function RestoreKeyBanner() {
  const { token, privateKey, encryptedPrivateKey, restoreKey } = useAuthStore();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);

  // Only show if logged in, no key loaded, but epk is available
  const epk = encryptedPrivateKey ?? (typeof window !== 'undefined' ? localStorage.getItem('endbox_epk') : null);
  if (!token || privateKey || !epk || !show) return null;

  async function handleRestore(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const ok = await restoreKey(password);
    setLoading(false);
    if (ok) {
      setShow(false);
    } else {
      setError('Wrong password. Try again.');
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -60, opacity: 0 }}
        className="z-40 px-4 py-3 flex items-center gap-3"
        style={{ background: '#1a1a00', borderBottom: '1px solid rgba(234,179,8,0.3)' }}
      >
        <Lock size={16} className="text-yellow-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-yellow-300">Restore encryption</p>
          <p className="text-[11px] text-yellow-400/70 hidden sm:block">Enter your password to decrypt messages</p>
        </div>
        <form onSubmit={handleRestore} className="flex items-center gap-2">
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Password"
              className="text-sm bg-black/30 border border-yellow-500/30 text-white rounded-lg px-3 py-1.5 pr-8 outline-none placeholder:text-yellow-400/40 w-36 sm:w-44"
              style={{ fontFamily: 'Inter, sans-serif' }}
            />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-yellow-400/50">
              {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          {error && <span className="text-[11px] text-red-400 hidden sm:block">{error}</span>}
          <button
            type="submit"
            disabled={loading || !password}
            className="px-3 py-1.5 rounded-lg bg-yellow-500 text-black text-xs font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
          >
            {loading ? '...' : 'Unlock'}
          </button>
        </form>
        <button onClick={() => setShow(false)} className="text-yellow-400/50 hover:text-yellow-400 transition-colors shrink-0">
          <X size={16} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
