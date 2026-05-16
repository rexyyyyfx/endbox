import { io, Socket } from 'socket.io-client';
import { useChatStore } from '../store/chat';
import type { Message, Conversation } from './api';

let socket: Socket | null = null;
const typingTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export function initSocket(token: string): Socket {
  if (socket?.connected) {
    socket.disconnect();
  }

  socket = io(window.location.origin, {
    path: '/api/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('message', ({ conversationId, message }: { conversationId: string; message: Message }) => {
    const store = useChatStore.getState();
    store.addMessage(conversationId, message);
    store.updateConversation(conversationId, { lastMessage: message });
  });

  socket.on('typing', ({ conversationId, userId }: { conversationId: string; userId: string }) => {
    const store = useChatStore.getState();
    store.setTyping(conversationId, userId);
    const key = `${conversationId}:${userId}`;
    clearTimeout(typingTimers[key]);
    typingTimers[key] = setTimeout(() => {
      useChatStore.getState().clearTyping(conversationId, userId);
    }, 3000);
  });

  socket.on('read', ({ conversationId }: { conversationId: string }) => {
    const store = useChatStore.getState();
    const msgs = store.messages[conversationId] ?? [];
    msgs.forEach((m) => {
      if (!m.isRead) store.updateMessage(conversationId, { ...m, isRead: true });
    });
  });

  socket.on('presence', ({ userId, online }: { userId: string; online: boolean }) => {
    useChatStore.getState().setOnline(userId, online);
    useChatStore.getState().updateConversation(
      useChatStore.getState().conversations.find(c => c.otherUser.id === userId)?.id ?? '',
      { otherUserOnline: online }
    );
  });

  socket.on('message_edited', ({ conversationId, message }: { conversationId: string; message: Message }) => {
    useChatStore.getState().updateMessage(conversationId, message);
  });

  socket.on('message_deleted', ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
    useChatStore.getState().deleteMessage(conversationId, messageId);
  });

  socket.on('request', () => {
    // Invalidation handled via queryClient in the component
    window.dispatchEvent(new CustomEvent('endbox:request'));
  });

  // FIX: immediately add the new conversation to the store so it appears in DMs instantly
  socket.on('request_accepted', ({ conversationId, conversation }: { conversationId: string; conversation?: Conversation }) => {
    if (conversation) {
      useChatStore.getState().addConversation(conversation);
    }
    window.dispatchEvent(new CustomEvent('endbox:request_accepted', { detail: { conversationId } }));
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinConversation(conversationId: string): void {
  socket?.emit('join', { conversationId });
}

export function leaveConversation(conversationId: string): void {
  socket?.emit('leave', { conversationId });
}

export function emitTyping(conversationId: string): void {
  socket?.emit('typing', { conversationId });
}

export function emitRead(conversationId: string): void {
  socket?.emit('read', { conversationId });
}
