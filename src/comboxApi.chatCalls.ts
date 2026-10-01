import { apiRequest } from './comboxApi.core'

export type ChatCallKind = 'p2p' | 'group' | 'broadcast'
export type ChatCallDirection = 'outgoing' | 'incoming'

export type ChatCallItem = {
  id: string
  chat_id: string
  kind: ChatCallKind
  started_by: string
  started_at: string
  ended_at?: string | null
  duration_seconds: number
  end_reason?: string | null
  direction: ChatCallDirection
  missed: boolean
  participants: string[]
}

/** Newest-first call history of a chat, rendered as system rows in the feed. */
export async function listChatCalls(chatID: string, limit = 50): Promise<ChatCallItem[]> {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  const payload = await apiRequest<{ items?: ChatCallItem[] }>(`/chats/${encodeURIComponent(chatID)}/calls?${params.toString()}`)
  return Array.isArray(payload.items) ? payload.items : []
}

/** Removes a single call-history row. Resolves 204 on success, rejects with 404 when unknown. */
export async function deleteChatCall(chatID: string, callID: string): Promise<void> {
  await apiRequest<void>(`/chats/${encodeURIComponent(chatID)}/calls/${encodeURIComponent(callID)}`, { method: 'DELETE' })
}
