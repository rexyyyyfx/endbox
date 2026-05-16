import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Copy, Check, Lock, Shield, ArrowRight } from 'lucide-react';
import { useRegister, useLogin } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { initSocket } from '../lib/socket';
import {
  generateKeyPair,
  exportPublicKey,
  encryptPrivateKeyWithPassword,
  decryptPrivateKeyWithPassword,
} from '../lib/crypto';

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
      // Save the EPK immediately so refresh works without re-login
      setAuth(result.token, result.user, kp.privateKey, encryptedPrivateKey);
      initSocket(result.token);
      setRegisteredId(result.user.userId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
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
    } finally {
      setLoading(false);
    }
  }

  if (registeredId) {
    return (
      <div className="min-h-screen ig-bg flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm"
        >
          <div className="ig-card p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                <Shield size={28} className="text-white" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">You're all set!</h2>
              <p className="text-sm text-ig-muted">Save your User ID — it's how others find you</p>
            </div>
            <div className="bg-ig-elevated rounded-xl p-4">
              <p className="text-[11px] text-ig-muted uppercase tracking-widest mb-2">Your User ID</p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-2xl font-bold text-white tracking-widest">{registeredId}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(registeredId); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="p-2 rounded-lg bg-ig-border hover:bg-ig-border/80 transition-colors"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="text-ig-muted" />}
                </button>
              </div>
            </div>
            <p className="text-xs text-ig-muted">You cannot recover your account without this ID and password.</p>
            <button
              onClick={() => navigate('/')}
              className="ig-btn w-full flex items-center justify-center gap-2"
            >
              Start Chatting <ArrowRight size={16} />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen ig-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-3">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center pb-4">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-purple-500/30">
              <Lock size={24} className="text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">EndBox</h1>
          <p className="text-sm text-ig-muted mt-1">End-to-end encrypted messaging</p>
        </motion.div>

        {/* Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="ig-card p-6 space-y-5">
          {/* Tab switch */}
          <div className="flex rounded-xl bg-ig-elevated p-1">
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? 'bg-white text-black shadow-sm' : 'text-ig-muted hover:text-white'}`}
              >
                {t === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.form
              key={tab}
              initial={{ opacity: 0, x: tab === 'login' ? -10 : 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onSubmit={tab === 'login' ? handleLogin : handleRegister}
              className="space-y-3"
            >
              {tab === 'login' && (
                <div className="ig-input-wrap">
                  <input
                    className="ig-input"
                    placeholder="User ID (e.g. AB1234)"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value.toUpperCase())}
                    autoComplete="username"
                  />
                </div>
              )}

              <div className="ig-input-wrap">
                <input
                  className="ig-input pr-10"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ig-muted hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {tab === 'register' && (
                <div className="ig-input-wrap">
                  <input
                    className="ig-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Confirm Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              )}

              {error && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-400 text-center">
                  {error}
                </motion.p>
              )}

              <button type="submit" disabled={loading} className="ig-btn w-full">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {tab === 'login' ? 'Logging in...' : 'Creating account...'}
                  </span>
                ) : tab === 'login' ? 'Log In' : 'Create Account'}
              </button>
            </motion.form>
          </AnimatePresence>
        </motion.div>

        {/* Switch tab link */}
        <div className="ig-card p-4 text-center">
          <span className="text-sm text-ig-muted">
            {tab === 'login' ? "Don't have an account? " : 'Already have an account? '}
          </span>
          <button
            onClick={() => { setTab(tab === 'login' ? 'register' : 'login'); setError(''); }}
            className="text-sm font-semibold text-ig-accent hover:text-ig-accent/80 transition-colors"
          >
            {tab === 'login' ? 'Sign Up' : 'Log In'}
          </button>
        </div>

        <p className="text-center text-[11px] text-ig-muted px-4">
          Messages are encrypted with ECDH P-256 + AES-GCM. No one can read them — not even us.
        </p>
      </div>
    </div>
  );
}
