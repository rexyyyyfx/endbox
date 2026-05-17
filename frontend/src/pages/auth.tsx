import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Copy, Check, Lock, ArrowRight, Shield } from 'lucide-react';
import { useRegister, useLogin } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { initSocket } from '../lib/socket';
import { generateKeyPair, exportPublicKey, encryptPrivateKeyWithPassword, decryptPrivateKeyWithPassword } from '../lib/crypto';

export default function AuthPage() {
  const [, navigate] = useLocation();
  const { setAuth } = useAuthStore();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userId, setUserId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registeredId, setRegisteredId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const registerMutation = useRegister();
  const loginMutation = useLogin();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const kp = await generateKeyPair();
      const publicKey = await exportPublicKey(kp.publicKey);
      const encryptedPrivateKey = await encryptPrivateKeyWithPassword(kp.privateKey, password);
      const result = await registerMutation.mutateAsync({ data: { password, publicKey, encryptedPrivateKey } });
      setAuth(result.token, result.user, kp.privateKey, encryptedPrivateKey);
      initSocket(result.token);
      setRegisteredId(result.user.userId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally { setLoading(false); }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!userId.trim()) { setError('Enter your User ID.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    setLoading(true);
    try {
      const result = await loginMutation.mutateAsync({ data: { userId: userId.trim(), password } });
      let privateKey: CryptoKey | null = null;
      if (result.encryptedPrivateKey) {
        try { privateKey = await decryptPrivateKeyWithPassword(result.encryptedPrivateKey, password); } catch {}
      }
      setAuth(result.token, result.user, privateKey, result.encryptedPrivateKey);
      initSocket(result.token);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally { setLoading(false); }
  }

  if (registeredId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm">
          <div className="rounded-2xl p-8 text-center space-y-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'var(--gradient)' }}>
                <Shield size={32} className="text-white" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">You're in!</h2>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Your User ID is how others find you. Save it.</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'var(--elevated)' }}>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>Your User ID</p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-3xl font-bold text-white tracking-widest">{registeredId}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(registeredId); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="p-2.5 rounded-xl transition-colors"
                  style={{ background: 'var(--border)' }}
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} style={{ color: 'var(--muted)' }} />}
                </button>
              </div>
            </div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Without this ID and password, your account cannot be recovered.</p>
            <button onClick={() => navigate('/')} className="eb-btn flex items-center justify-center gap-2">
              Start Chatting <ArrowRight size={16} />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm space-y-3">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl" style={{ background: 'var(--gradient)' }}>
              <Lock size={28} className="text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">EndBox</h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>End-to-end encrypted messaging</p>
        </motion.div>

        {/* Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>

          {/* Tab */}
          <div className="flex rounded-xl p-1" style={{ background: 'var(--elevated)' }}>
            {(['login', 'register'] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); setError(''); }}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all"
                style={{ background: tab === t ? 'white' : 'transparent', color: tab === t ? '#000' : 'var(--muted)' }}>
                {t === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.form key={tab}
              initial={{ opacity: 0, x: tab === 'login' ? -12 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              onSubmit={tab === 'login' ? handleLogin : handleRegister}
              className="space-y-3"
            >
              {tab === 'login' && (
                <input className="eb-input" placeholder="User ID (e.g. AB1234)"
                  value={userId} onChange={(e) => setUserId(e.target.value.toUpperCase())} autoComplete="username" />
              )}
              <div className="relative">
                <input className="eb-input" style={{ paddingRight: '44px' }}
                  type={showPassword ? 'text' : 'password'} placeholder="Password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--muted)' }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {tab === 'register' && (
                <input className="eb-input" type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm Password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
              )}
              {error && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-center" style={{ color: 'var(--red)' }}>
                  {error}
                </motion.p>
              )}
              <button type="submit" disabled={loading} className="eb-btn">
                {loading
                  ? <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {tab === 'login' ? 'Logging in...' : 'Creating account...'}
                    </span>
                  : tab === 'login' ? 'Log In' : 'Create Account'}
              </button>
            </motion.form>
          </AnimatePresence>
        </motion.div>

        {/* Switch */}
        <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <span className="text-sm" style={{ color: 'var(--muted)' }}>
            {tab === 'login' ? "Don't have an account? " : 'Already have an account? '}
          </span>
          <button onClick={() => { setTab(tab === 'login' ? 'register' : 'login'); setError(''); }}
            className="text-sm font-bold transition-colors" style={{ color: 'var(--accent)' }}>
            {tab === 'login' ? 'Sign Up' : 'Log In'}
          </button>
        </div>

        <p className="text-center text-xs px-4" style={{ color: 'var(--muted)' }}>
          Messages are encrypted with ECDH P-256 + AES-GCM. No one can read them — not even us.
        </p>
      </div>
    </div>
  );
}
