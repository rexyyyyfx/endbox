/**
 * EndBox API Client
 * Self-contained — no monorepo workspace packages needed.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  userId: string;
  avatarUrl?: string | null;
  theme?: "dark" | "light";
  storageUsedBytes?: number;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  userId: string;
  avatarUrl?: string | null;
}

export interface AuthResult {
  token: string;
  user: User;
  encryptedPrivateKey?: string | null;
}

export interface KeyRecord {
  userId: string;
  publicKey: string;
  encryptedPrivateKey?: string | null;
}

export interface ChatRequest {
  id: string;
  fromUserId: string;
  fromUser?: PublicUser;
  toUserId: string;
  toUser?: PublicUser;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: string;
}

export interface RequestList {
  sent: ChatRequest[];
  received: ChatRequest[];
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: "text" | "image" | "file" | "voice" | "video" | "pdf" | "zip";
  encryptedContent?: string | null;
  iv?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  replyToId?: string | null;
  replyTo?: Message;
  isEdited?: boolean;
  isDeleted?: boolean;
  isRead?: boolean;
  createdAt: string;
  editedAt?: string | null;
}

export interface Conversation {
  id: string;
  otherUser: PublicUser;
  lastMessage?: Message;
  unreadCount?: number;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  isBlocked?: boolean;
  otherUserOnline?: boolean;
  createdAt: string;
}

export interface MessagePage {
  messages: Message[];
  hasMore: boolean;
  nextCursor?: string | null;
}

export const RequestUpdateAction = {
  accept: "accept",
  decline: "decline",
} as const;

export const ProfileUpdateTheme = {
  dark: "dark",
  light: "light",
} as const;

// ─── Base fetch ───────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";

function getToken(): string | null {
  return localStorage.getItem("endbox_token");
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `HTTP ${res.status}`);
  }

  return data as T;
}

// ─── React Query hooks ────────────────────────────────────────────────────────

import { useMutation, useQuery, type UseQueryOptions } from "@tanstack/react-query";

// Auth
export function useRegister() {
  return useMutation({
    mutationFn: (vars: {
      data: { password: string; publicKey?: string; encryptedPrivateKey?: string };
    }) =>
      apiFetch<AuthResult>("/auth/register", {
        method: "POST",
        body: JSON.stringify(vars.data),
      }),
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (vars: { data: { userId: string; password: string } }) =>
      apiFetch<AuthResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify(vars.data),
      }),
  });
}

export function useGetMe(options?: { query?: Partial<UseQueryOptions<User>> }) {
  return useQuery<User>({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/auth/me"),
    ...options?.query,
  });
}

export function getGetMeQueryKey() {
  return ["me"] as const;
}

// Keys
export function useGetPublicKey(
  userId: string,
  options?: { query?: Partial<UseQueryOptions<KeyRecord>> }
) {
  return useQuery<KeyRecord>({
    queryKey: ["publicKey", userId],
    queryFn: () => apiFetch<KeyRecord>(`/users/${userId}/key`),
    enabled: !!userId,
    ...options?.query,
  });
}

export function getGetPublicKeyQueryKey(userId: string) {
  return ["publicKey", userId] as const;
}

// Conversations
export function useListConversations(options?: {
  query?: Partial<UseQueryOptions<Conversation[]>>;
}) {
  return useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: () => apiFetch<Conversation[]>("/conversations"),
    ...options?.query,
  });
}

export function getListConversationsQueryKey() {
  return ["conversations"] as const;
}

export function useGetConversation(
  id: string,
  options?: { query?: Partial<UseQueryOptions<Conversation>> }
) {
  return useQuery<Conversation>({
    queryKey: ["conversation", id],
    queryFn: () => apiFetch<Conversation>(`/conversations/${id}`),
    enabled: !!id,
    ...options?.query,
  });
}

export function getGetConversationQueryKey(id: string) {
  return ["conversation", id] as const;
}

// Messages
export function useGetMessages(
  conversationId: string,
  options?: { query?: Partial<UseQueryOptions<MessagePage>> }
) {
  return useQuery<MessagePage>({
    queryKey: ["messages", conversationId],
    queryFn: () => apiFetch<MessagePage>(`/conversations/${conversationId}/messages`),
    enabled: !!conversationId,
    ...options?.query,
  });
}

export function getGetMessagesQueryKey(conversationId: string) {
  return ["messages", conversationId] as const;
}

export function useSendMessage() {
  return useMutation({
    mutationFn: (vars: {
      conversationId: string;
      data: {
        type: string;
        encryptedContent?: string;
        iv?: string;
        replyToId?: string;
      };
    }) =>
      apiFetch<Message>(`/conversations/${vars.conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify(vars.data),
      }),
  });
}

export function useEditMessage() {
  return useMutation({
    mutationFn: (vars: {
      conversationId: string;
      messageId: string;
      data: { encryptedContent: string; iv: string };
    }) =>
      apiFetch<Message>(
        `/conversations/${vars.conversationId}/messages/${vars.messageId}`,
        { method: "PATCH", body: JSON.stringify(vars.data) }
      ),
  });
}

export function useRemoveMessage() {
  return useMutation({
    mutationFn: (vars: { conversationId: string; messageId: string }) =>
      apiFetch<void>(
        `/conversations/${vars.conversationId}/messages/${vars.messageId}`,
        { method: "DELETE" }
      ),
  });
}

export function useRemoveMessageForAll() {
  return useMutation({
    mutationFn: (vars: { conversationId: string; messageId: string }) =>
      apiFetch<void>(
        `/conversations/${vars.conversationId}/messages/${vars.messageId}/forall`,
        { method: "DELETE" }
      ),
  });
}

// Requests
export function useListRequests(options?: {
  query?: Partial<UseQueryOptions<RequestList>>;
}) {
  return useQuery<RequestList>({
    queryKey: ["requests"],
    queryFn: () => apiFetch<RequestList>("/requests"),
    ...options?.query,
  });
}

export function getListRequestsQueryKey() {
  return ["requests"] as const;
}

export function useSendRequest() {
  return useMutation({
    mutationFn: (vars: { data: { targetUserId: string } }) =>
      apiFetch<ChatRequest>("/requests", {
        method: "POST",
        body: JSON.stringify(vars.data),
      }),
  });
}

export function useUpdateRequest() {
  return useMutation({
    mutationFn: (vars: {
      requestId: string;
      data: { action: "accept" | "decline" };
    }) =>
      apiFetch<ChatRequest>(`/requests/${vars.requestId}`, {
        method: "PATCH",
        body: JSON.stringify(vars.data),
      }),
  });
}

export function useCancelRequest() {
  return useMutation({
    mutationFn: (vars: { requestId: string }) =>
      apiFetch<void>(`/requests/${vars.requestId}`, { method: "DELETE" }),
  });
}

// Profile
export function useUpdateProfile() {
  return useMutation({
    mutationFn: (vars: { data: { theme?: "dark" | "light" } }) =>
      apiFetch<User>("/profile", {
        method: "PATCH",
        body: JSON.stringify(vars.data),
      }),
  });
}

export function useUploadAvatar() {
  return useMutation({
    mutationFn: (vars: { data: { dataUrl: string } }) =>
      apiFetch<{ avatarUrl: string }>("/profile/avatar", {
        method: "POST",
        body: JSON.stringify(vars.data),
      }),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: (vars: { data: { password: string } }) =>
      apiFetch<void>("/profile", {
        method: "DELETE",
        body: JSON.stringify(vars.data),
      }),
  });
}
