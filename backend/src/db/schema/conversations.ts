import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usersTable } from "./users";

export const conversationsTable = pgTable("conversations", {
  id: text("id").primaryKey(),
  user1Id: text("user1_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  user2Id: text("user2_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversationSettingsTable = pgTable("conversation_settings", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  isPinned: boolean("is_pinned").notNull().default(false),
  isMuted: boolean("is_muted").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  isBlocked: boolean("is_blocked").notNull().default(false),
  unreadCount: text("unread_count").notNull().default("0"),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  clearedAt: timestamp("cleared_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertConversationSchema = createInsertSchema(conversationsTable).omit({ createdAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;

export const insertConversationSettingsSchema = createInsertSchema(conversationSettingsTable).omit({ updatedAt: true });
export type InsertConversationSettings = z.infer<typeof insertConversationSettingsSchema>;
export type ConversationSettings = typeof conversationSettingsTable.$inferSelect;
