import type {
  ChatItem,
  MediaAttachment,
  MediaSession,
  MessageItem,
  SearchChatResult,
  SearchUserResult,
} from './comboxApi'

export type NormalizedChatItem = Omit<ChatItem, 'created_at'> & {
  createdAt: Date
}

export type NormalizedMessageItem = Omit<MessageItem, 'created_at' | 'edited_at'> & {
  createdAt: Date
  editedAt?: Date
}

export type NormalizedMediaAttachment = Omit<MediaAttachment, 'created_at' | 'updated_at'> & {
  createdAt: Date
  updatedAt: Date
}

export type NormalizedMediaSession = Omit<MediaSession, 'created_at' | 'updated_at' | 'finalized_at'> & {
  createdAt: Date
  updatedAt: Date
  finalizedAt?: Date
}

export type NormalizedSearchUser = SearchUserResult
export type NormalizedSearchChat = SearchChatResult

function safeDate(value?: string): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export function normalizeChatItem(item: ChatItem): NormalizedChatItem {
  return { ...item, createdAt: safeDate(item.created_at) ?? new Date(0) }
}

export function normalizeMessageItem(item: MessageItem): NormalizedMessageItem {
  return {
    ...item,
    createdAt: safeDate(item.created_at) ?? new Date(0),
    editedAt: safeDate(item.edited_at),
  }
}

export function normalizeMediaAttachment(item: MediaAttachment): NormalizedMediaAttachment {
  return {
    ...item,
    createdAt: safeDate(item.created_at) ?? new Date(0),
    updatedAt: safeDate(item.updated_at) ?? new Date(0),
  }
}

export function normalizeMediaSession(item: MediaSession): NormalizedMediaSession {
  return {
    ...item,
    createdAt: safeDate(item.created_at) ?? new Date(0),
    updatedAt: safeDate(item.updated_at) ?? new Date(0),
    finalizedAt: safeDate(item.finalized_at),
  }
}
