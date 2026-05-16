import { create } from 'zustand';
import type { User } from '../lib/api';
import { decryptPrivateKeyWithPassword } from '../lib/crypto';

interface AuthState {
  token: string | null;
  user: User | null;
  privateKey: CryptoKey | null;
  encryptedPrivateKey: string | null;
  setAuth: (token: string, user: User, privateKey: CryptoKey | null, encryptedPrivateKey?: string | null) => void;
  setUser: (user: User) => void;
  logout: () => void;
  restoreKey: (password: string) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('endbox_token') : null,
  user: typeof window !== 'undefined'
    ? (() => { try { const s = localStorage.getItem('endbox_user'); return s ? JSON.parse(s) : null; } catch { return null; } })()
    : null,
  privateKey: null,
  encryptedPrivateKey: typeof window !== 'undefined' ? localStorage.getItem('endbox_epk') : null,

  setAuth: (token, user, privateKey, encryptedPrivateKey = null) => {
    localStorage.setItem('endbox_token', token);
    localStorage.setItem('endbox_user', JSON.stringify(user));
    if (encryptedPrivateKey) localStorage.setItem('endbox_epk', encryptedPrivateKey);
    set({ token, user, privateKey, encryptedPrivateKey });
  },

  setUser: (user) => {
    localStorage.setItem('endbox_user', JSON.stringify(user));
    set({ user });
  },

  logout: () => {
    localStorage.removeItem('endbox_token');
    localStorage.removeItem('endbox_user');
    localStorage.removeItem('endbox_epk');
    set({ token: null, user: null, privateKey: null, encryptedPrivateKey: null });
  },

  restoreKey: async (password: string) => {
    const epk = get().encryptedPrivateKey ?? localStorage.getItem('endbox_epk');
    if (!epk) return false;
    try {
      const privateKey = await decryptPrivateKeyWithPassword(epk, password);
      set({ privateKey });
      return true;
    } catch {
      return false;
    }
  },
}));
