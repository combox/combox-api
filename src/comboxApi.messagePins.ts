import { apiRequest } from './comboxApi.core'
import type { MessageItem } from './models/message'

function unwrapItem(payload: { item?: MessageItem | null } | null): MessageItem | null {
  const item = payload?.item
  if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id) return null
  return item
}

/** Pinned message of a chat, or null when nothing is pinned. */
export async function getPinnedMessage(chatID: string): Promise<MessageItem | null> {
  const payload = await apiRequest<{ item?: MessageItem | null }>(`/chats/${encodeURIComponent(chatID)}/pinned-message`)
  return unwrapItem(payload)
}

/** Pins (`pinned = true`) or unpins a message and returns the chat's pinned message afterwards. */
export async function setPinnedMessage(chatID: string, messageID: string, pinned: boolean): Promise<MessageItem | null> {
  const payload = await apiRequest<{ item?: MessageItem | null }>(
    `/chats/${encodeURIComponent(chatID)}/messages/${encodeURIComponent(messageID)}/pin`,
    { method: 'POST', body: { pinned } },
  )
  return unwrapItem(payload)
}
