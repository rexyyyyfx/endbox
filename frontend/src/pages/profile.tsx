import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy, Check, LogOut, Trash2, Camera, Moon, Sun, ShieldCheck,
  HardDrive, AlertTriangle, ChevronRight, Github, Heart, X, QrCode,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateProfile, useUploadAvatar, useDeleteAccount, getGetMeQueryKey, ProfileUpdateTheme } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { disconnectSocket } from '../lib/socket';

// ── Crypto addresses ──────────────────────────────────────────────────────────
const CRYPTO_LIST = [
  { symbol: 'SOL', name: 'Solana', color: '#9945FF', address: 'C3A7F6RSQWQn58rxN4oHN1Lx31rchZdMj1dRZ1h2S2rN' },
  { symbol: 'LTC', name: 'Litecoin', color: '#BFBBBB', address: 'ltc1qwrv995g9cgkxrveccupwc4fggndh8zs6czvztr' },
  { symbol: 'USDT', name: 'USDT (Polygon)', color: '#26A17B', address: '0x2eEfc645e6d8382A0faf71c69EBEf953104E6665' },
  { symbol: 'USDC', name: 'USDC (ERC-20)', color: '#2775CA', address: '0x2eEfc645e6d8382A0faf71c69EBEf953104E6665' },
];

const UPI_ID = '9627374717@fam';

// ── UPI QR using a public QR API ──────────────────────────────────────────────
function UpiQr({ upiId }: { upiId: string }) {
  const upiUrl = `upi://pay?pa=${upiId}&pn=EndBox&cu=INR`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUrl)}&bgcolor=161616&color=ffffff&margin=10`;
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="rounded-2xl overflow-hidden p-3" style={{ background: 'var(--elevated)', border: '1px solid var(--border)' }}>
        <img src={qrSrc} alt="UPI QR Code" width={180} height={180} className="rounded-xl" />
      </div>
      <div className="w-full rounded-2xl p-4 flex items-center justify-between gap-3"
        style={{ background: 'var(--elevated)', border: '1px solid var(--border)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>UPI ID</p>
          <p className="text-base font-bold text-white">{upiId}</p>
        </div>
        <CopyButton text={upiId} />
      </div>
      <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>Scan with any UPI app — Google Pay, PhonePe, Paytm</p>
    </div>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={handleCopy}
      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all"
      style={{ background: copied ? 'rgba(34,197,94,0.15)' : 'var(--border)', border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'var(--border-light)'}` }}>
      {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} style={{ color: 'var(--muted)' }} />}
    </button>
  );
}

// ── Crypto list ───────────────────────────────────────────────────────────────
function CryptoPanel() {
  return (
    <div className="flex flex-col gap-3 py-1">
      {CRYPTO_LIST.map(c => (
        <div key={c.symbol} className="rounded-2xl p-4" style={{ background: 'var(--elevated)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-xs text-white"
              style={{ background: c.color }}>
              {c.symbol.slice(0, 3)}
            </div>
            <div>
              <p className="text-sm font-bold text-white">{c.symbol}</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{c.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{c.address}</p>
            <CopyButton text={c.address} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Donate modal ──────────────────────────────────────────────────────────────
function DonateModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'upi' | 'crypto'>('upi');
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 36 }}
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Modal header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }}>
              <Heart size={16} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">Support EndBox</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Every bit helps keep this alive ❤️</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-5 pt-4 pb-1">
          {(['upi', 'crypto'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{
                background: tab === t ? 'var(--accent)' : 'var(--elevated)',
                color: tab === t ? 'white' : 'var(--muted)',
                border: `1px solid ${tab === t ? 'var(--accent)' : 'var(--border)'}`,
              }}>
              {t === 'upi' ? '🇮🇳 UPI' : '₿ Crypto'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-5 pb-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 160px)' }}>
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {tab === 'upi' ? <UpiQr upiId={UPI_ID} /> : <CryptoPanel />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main profile page ─────────────────────────────────────────────────────────
export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { user, setUser, logout, privateKey } = useAuthStore();
  const [copiedId, setCopiedId] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [donateOpen, setDonateOpen] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);

  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const deleteAccount = useDeleteAccount();

  function copyUserId() {
    if (!user) return;
    navigator.clipboard.writeText(user.userId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  async function toggleTheme() {
    if (!user) return;
    const newTheme = user.theme === 'dark' ? ProfileUpdateTheme.light : ProfileUpdateTheme.dark;
    try {
      const updated = await updateProfile.mutateAsync({ data: { theme: newTheme } });
      setUser(updated);
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch {}
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await uploadAvatar.mutateAsync({ data: { dataUrl: reader.result as string } });
        if (user) setUser({ ...user, avatarUrl: result.avatarUrl });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      } catch {}
    };
    reader.readAsDataURL(file);
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteError('');
    try {
      await deleteAccount.mutateAsync({ data: { password: deletePassword } });
      disconnectSocket(); logout();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account.');
    }
  }

  const storageMB = user ? (user.storageUsedBytes ?? 0) / 1024 / 1024 : 0;
  const isDark = user?.theme !== 'light';
  const initials = user?.userId?.slice(0, 2) ?? '??';
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  return (
    <>
      <div className="h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>
        {/* ── Avatar + name ── */}
        <div className="flex flex-col items-center px-6 pt-8 pb-6" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="relative mb-4">
            <div className="p-[2px] rounded-full" style={{ background: 'var(--gradient)' }}>
              <div className="p-[2px] rounded-full" style={{ background: 'var(--bg)' }}>
                <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }}>
                  {user?.avatarUrl
                    ? <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                    : <span className="text-white text-3xl font-black">{initials}</span>}
                </div>
              </div>
            </div>
            <button onClick={() => avatarRef.current?.click()} disabled={uploadAvatar.isPending}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-opacity hover:opacity-80"
              style={{ background: 'var(--accent)', borderColor: 'var(--bg)' }}>
              {uploadAvatar.isPending
                ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Camera size={13} className="text-white" />}
            </button>
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl font-black text-white">{user?.userId ?? '—'}</span>
            <button onClick={copyUserId} className="p-1.5 rounded-lg transition-colors hover:bg-white/10" style={{ color: 'var(--muted)' }}>
              {copiedId ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Member since {memberSince}</p>

          {!privateKey && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}>
              <ShieldCheck size={12} className="text-yellow-400" />
              <span className="text-xs text-yellow-400 font-medium">Encryption inactive — please re-login</span>
            </div>
          )}
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 gap-3 px-4 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          {[
            { icon: <HardDrive size={16} />, value: `${storageMB.toFixed(1)} MB`, label: 'Storage used' },
            { icon: <ShieldCheck size={16} />, value: privateKey ? 'Active' : 'Inactive', label: 'Encryption', color: privateKey ? 'var(--green)' : undefined },
          ].map(stat => (
            <div key={stat.label} className="flex items-center gap-3 p-3 rounded-2xl"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--elevated)', color: 'var(--muted)' }}>
                {stat.icon}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate" style={{ color: stat.color }}>{stat.value}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Support section ── */}
        <div className="px-4 pt-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest px-1 mb-3" style={{ color: 'var(--muted)' }}>Support</p>

          {/* GitHub */}
          <a href="https://github.com/rexyyyyfx/endbox" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-colors hover:bg-white/5 w-full"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', textDecoration: 'none' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: '#24292e', border: '1px solid var(--border-light)' }}>
              <Github size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Star on GitHub</p>
              <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>rexyyyyfx/endbox</p>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
          </a>

          {/* Donate */}
          <button onClick={() => setDonateOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all hover:scale-[1.01]"
            style={{ background: 'linear-gradient(135deg, rgba(240,148,51,0.15), rgba(188,24,136,0.15))', border: '1px solid rgba(240,148,51,0.3)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }}>
              <Heart size={18} className="text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-white">Donate</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>UPI · Crypto — support development</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0"
              style={{ background: 'rgba(240,148,51,0.2)', border: '1px solid rgba(240,148,51,0.3)' }}>
              <QrCode size={12} style={{ color: '#f09433' }} />
              <span className="text-xs font-bold" style={{ color: '#f09433' }}>Pay</span>
            </div>
          </button>
        </div>

        {/* ── Settings ── */}
        <div className="px-4 pt-5 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest px-1 mb-3" style={{ color: 'var(--muted)' }}>Settings</p>

          {/* Theme */}
          <div className="flex items-center justify-between px-4 py-3.5 rounded-2xl cursor-pointer transition-colors hover:bg-white/5"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            onClick={toggleTheme}>
            <div className="flex items-center gap-3">
              {isDark ? <Moon size={18} style={{ color: 'var(--muted)' }} /> : <Sun size={18} style={{ color: 'var(--muted)' }} />}
              <div>
                <p className="text-sm font-semibold text-white">Appearance</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{isDark ? 'Dark' : 'Light'} mode</p>
              </div>
            </div>
            <div className="w-12 h-6 rounded-full relative transition-colors" style={{ background: isDark ? 'var(--accent)' : 'var(--border)' }}>
              <motion.div animate={{ x: isDark ? 26 : 3 }} transition={{ type: 'spring', stiffness: 600, damping: 35 }}
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow" />
            </div>
          </div>

          {/* Encryption */}
          <div className="flex items-center px-4 py-3.5 rounded-2xl"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <ShieldCheck size={18} className="mr-3" style={{ color: privateKey ? 'var(--green)' : 'var(--muted)' }} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Encryption</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>ECDH P-256 + AES-GCM-256</p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: privateKey ? 'rgba(34,197,94,0.1)' : 'var(--elevated)', color: privateKey ? 'var(--green)' : 'var(--muted)' }}>
              {privateKey ? 'Active' : 'Inactive'}
            </span>
          </div>

          {/* Sign out */}
          <button onClick={() => { disconnectSocket(); logout(); }}
            className="w-full flex items-center px-4 py-3.5 rounded-2xl transition-colors hover:bg-white/5"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <LogOut size={18} className="mr-3" style={{ color: 'var(--muted)' }} />
            <span className="text-sm font-semibold text-white flex-1 text-left">Sign Out</span>
            <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        {/* ── Danger zone ── */}
        <div className="px-4 pt-2 pb-12">
          <p className="text-xs font-bold uppercase tracking-widest px-1 mb-3 mt-6" style={{ color: 'var(--muted)' }}>Danger Zone</p>
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.04)' }}>
            <AnimatePresence mode="wait">
              {!showDeleteConfirm ? (
                <motion.button key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full flex items-center px-4 py-4 transition-colors hover:bg-red-500/5"
                  style={{ color: 'var(--red)' }}>
                  <Trash2 size={17} className="mr-3" />
                  <span className="text-sm font-semibold">Delete Account Permanently</span>
                </motion.button>
              ) : (
                <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onSubmit={handleDeleteAccount} className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs" style={{ color: 'rgba(239,68,68,0.8)' }}>
                      This cannot be undone. All messages and data will be permanently deleted.
                    </p>
                  </div>
                  <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)}
                    placeholder="Enter your password to confirm"
                    className="eb-input text-sm" style={{ borderColor: 'rgba(239,68,68,0.3)' }} />
                  {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" disabled={deleteAccount.isPending || !deletePassword}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-opacity disabled:opacity-40"
                      style={{ background: 'var(--red)' }}>
                      {deleteAccount.isPending ? 'Deleting...' : 'Delete Forever'}
                    </button>
                    <button type="button"
                      onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:text-white"
                      style={{ background: 'var(--elevated)', color: 'var(--muted)' }}>
                      Cancel
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Donate modal ── */}
      <AnimatePresence>
        {donateOpen && <DonateModal onClose={() => setDonateOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
