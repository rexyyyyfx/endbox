import { create } from 'zustand';
import type { Conversation, Message } from '../lib/api';

interface ChatState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>;
  onlineUsers: Set<string>;
  activeConversationId: string | null;
  setConversations: (convs: Conversation[]) => void;
  addConversation: (conv: Conversation) => void;
  updateConversation: (conversationId: string, updates: Partial<Conversation>) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, message: Message) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  setTyping: (conversationId: string, userId: string) => void;
  clearTyping: (conversationId: string, userId: string) => void;
  setOnline: (userId: string, online: boolean) => void;
  setActive: (conversationId: string | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  messages: {},
  typingUsers: {},
  onlineUsers: new Set<string>(),
  activeConversationId: null,

  setConversations: (convs) => set({ conversations: convs }),

  addConversation: (conv) =>
    set((s) => ({
      conversations: [conv, ...s.conversations.filter((c) => c.id !== conv.id)],
    })),

  updateConversation: (conversationId, updates) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, ...updates } : c
      ),
    })),

  addMessage: (conversationId, message) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: [...(s.messages[conversationId] ?? []), message],
      },
    })),

  updateMessage: (conversationId, message) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m.id === message.id ? message : m
        ),
      },
    })),

  deleteMessage: (conversationId, messageId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m.id === messageId
            ? { ...m, isDeleted: true, encryptedContent: null, iv: null }
            : m
        ),
      },
    })),

  setMessages: (conversationId, messages) =>
    set((s) => ({
      messages: { ...s.messages, [conversationId]: messages },
    })),

  setTyping: (conversationId, userId) =>
    set((s) => ({
      typingUsers: {
        ...s.typingUsers,
        [conversationId]: [
          ...new Set([...(s.typingUsers[conversationId] ?? []), userId]),
        ],
      },
    })),

  clearTyping: (conversationId, userId) =>
    set((s) => ({
      typingUsers: {
        ...s.typingUsers,
        [conversationId]: (s.typingUsers[conversationId] ?? []).filter(
          (u) => u !== userId
        ),
      },
    })),

  setOnline: (userId, online) =>
    set((s) => {
      const next = new Set(s.onlineUsers);
      if (online) next.add(userId);
      else next.delete(userId);
      return { onlineUsers: next };
    }),

  setActive: (id) => set({ activeConversationId: id }),
}));
