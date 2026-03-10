export type PresenceItem = {
  user_id: string
  online: boolean
  last_seen?: string
  last_seen_visible: boolean
}

export type ProfileSettings = {
  show_last_seen: boolean
}

export type ChatNotifications = {
  muted_chat_ids: string[]
  unread_by_chat: Record<string, number>
}

export type PresenceEvent = {
  type: string
  user_id: string
  online: boolean
  last_seen: string
  updated_at: string
}

export type NotificationEvent = {
  type: string
  user_id: string
  kind: string
  muted?: boolean
  payload: unknown
  created_at: string
}
