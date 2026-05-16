import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, LogOut, Trash2, Camera, Moon, Sun, ShieldCheck, HardDrive, Calendar, AlertTriangle, ChevronRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUpdateProfile,
  useUploadAvatar,
  useDeleteAccount,
  getGetMeQueryKey,
  ProfileUpdateTheme,
} from '../lib/api';
import { useAuthStore } from '../store/auth';
import { disconnectSocket } from '../lib/socket';

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { user, setUser, logout, privateKey } = useAuthStore();

  const [copiedId, setCopiedId] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState('');
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
      const dataUrl = reader.result as string;
      try {
        const result = await uploadAvatar.mutateAsync({ data: { dataUrl } });
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
      disconnectSocket();
      logout();
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
    <div className="h-full overflow-y-auto" style={{ background: 'var(--ig-bg)' }}>
      <div className="max-w-lg mx-auto">
        {/* Profile header */}
        <div className="px-6 pt-8 pb-6" style={{ borderBottom: '1px solid var(--ig-border)' }}>
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="relative">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-2xl font-bold">{initials}</span>
                )}
              </div>
              <button
                onClick={() => avatarRef.current?.click()}
                disabled={uploadAvatar.isPending}
                className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-ig-accent border-2 flex items-center justify-center"
                style={{ borderColor: 'var(--ig-bg)' }}
              >
                {uploadAvatar.isPending
                  ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Camera size={12} className="text-white" />}
              </button>
              <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl font-bold text-white">{user?.userId ?? '—'}</span>
                <button onClick={copyUserId} className="p-1 text-ig-muted hover:text-white transition-colors">
                  {copiedId ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-sm text-ig-muted">Member since {memberSince}</p>
              {!privateKey && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30">
                  <ShieldCheck size={11} className="text-yellow-400" />
                  <span className="text-[11px] text-yellow-400 font-medium">Encryption inactive — re-login</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 px-6 py-4" style={{ borderBottom: '1px solid var(--ig-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-ig-elevated flex items-center justify-center">
              <HardDrive size={16} className="text-ig-muted" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{storageMB.toFixed(1)} MB</p>
              <p className="text-xs text-ig-muted">Storage used</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-ig-elevated flex items-center justify-center">
              <Calendar size={16} className="text-ig-muted" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{memberSince}</p>
              <p className="text-xs text-ig-muted">Joined</p>
            </div>
          </div>
        </div>

        {/* Settings list */}
        <div className="px-4 pt-4 space-y-1">
          <p className="text-xs font-semibold text-ig-muted uppercase tracking-widest px-2 mb-2">Settings</p>

          {/* Theme toggle */}
          <div className="flex items-center justify-between px-4 py-3.5 rounded-xl hover:bg-ig-elevated transition-colors cursor-pointer" onClick={toggleTheme}>
            <div className="flex items-center gap-3">
              {isDark ? <Moon size={18} className="text-ig-muted" /> : <Sun size={18} className="text-ig-muted" />}
              <div>
                <p className="text-sm font-medium text-white">Appearance</p>
                <p className="text-xs text-ig-muted">{isDark ? 'Dark' : 'Light'} mode</p>
              </div>
            </div>
            <div className={`w-12 h-6 rounded-full relative transition-colors ${isDark ? 'bg-ig-accent' : 'bg-ig-border'}`}>
              <motion.div
                animate={{ x: isDark ? 24 : 2 }}
                transition={{ type: 'spring', stiffness: 600, damping: 35 }}
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
              />
            </div>
          </div>

          {/* Encryption status */}
          <div className="flex items-center px-4 py-3.5 rounded-xl">
            <ShieldCheck size={18} className={`mr-3 ${privateKey ? 'text-green-400' : 'text-ig-muted'}`} />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Encryption</p>
              <p className="text-xs text-ig-muted">ECDH P-256 + AES-GCM-256</p>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${privateKey ? 'bg-green-500/10 text-green-400' : 'bg-ig-elevated text-ig-muted'}`}>
              {privateKey ? 'Active' : 'Inactive'}
            </span>
          </div>

          {/* Sign out */}
          <button
            onClick={() => { disconnectSocket(); logout(); }}
            className="w-full flex items-center px-4 py-3.5 rounded-xl hover:bg-ig-elevated transition-colors"
          >
            <LogOut size={18} className="mr-3 text-ig-muted" />
            <span className="text-sm font-medium text-white flex-1 text-left">Sign Out</span>
            <ChevronRight size={16} className="text-ig-muted" />
          </button>
        </div>

        {/* Danger zone */}
        <div className="px-4 pt-2 pb-8">
          <p className="text-xs font-semibold text-ig-muted uppercase tracking-widest px-2 mb-2 mt-4">Danger Zone</p>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)' }}>
            <AnimatePresence mode="wait">
              {!showDeleteConfirm ? (
                <motion.button
                  key="btn"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full flex items-center px-4 py-4 text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 size={18} className="mr-3" />
                  <span className="text-sm font-medium">Delete Account Permanently</span>
                </motion.button>
              ) : (
                <motion.form
                  key="form"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onSubmit={handleDeleteAccount}
                  className="p-4 space-y-3"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300">This action cannot be undone. All your messages and data will be deleted forever.</p>
                  </div>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter your password to confirm"
                    className="ig-input text-sm"
                  />
                  {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={deleteAccount.isPending || !deletePassword}
                      className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50 transition-opacity"
                    >
                      {deleteAccount.isPending ? 'Deleting...' : 'Delete Forever'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium text-ig-muted hover:text-white transition-colors"
                      style={{ background: 'var(--ig-elevated)' }}
                    >
                      Cancel
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
