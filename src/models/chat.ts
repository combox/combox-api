import type { SearchUserResult } from './search'
import type { MessageReaction, Poll } from './message'

export type ChatItem = {
  id: string
  title: string
  is_direct: boolean
  type: string
  kind?: string
  is_public?: boolean
  public_slug?: string
  comments_enabled?: boolean
  /** 'all' = everyone may post, 'admins' = only owner/admin/moderator. */
  send_permission?: string
  reactions_enabled?: boolean
  /** Sign outgoing messages with the sender key. */
  sign_messages?: boolean
  /** Show author profile links next to messages. */
  show_authors_profiles?: boolean
  auto_translate?: boolean
  /** 0 = slow mode off, otherwise seconds between messages. */
  slow_mode_seconds?: number
  /** Linked group/standalone channel used for discussion. */
  discussion_chat_id?: string
  archived?: boolean
  pinned?: boolean
  pin_scope?: string
  pin_order?: number
  parent_chat_id?: string
  /** Title of the parent group for a topic/channel row. */
  parent_title?: string
  channel_type?: 'text' | 'voice'
  /** Free text shown on the chat/channel info screen; '' when never set. */
  description?: string
  /** Emoji used as the chat/channel icon; '' when never set. */
  icon_emoji?: string
  topic_number?: number
  is_general?: boolean
  bot_id?: string
  peer_user_id?: string
  viewer_role?: string
  subscriber_count?: number
  avatar_data_url?: string
  avatar_gradient?: string
  last_message_preview?: string
  /** Display name of the last message author (sender/topic line). */
  last_message_sender_name?: string
  /** Timestamp of the last message in this chat. */
  last_message_at?: string
  /** Chat background: 'none' | 'preset' | 'image'; absent when never set. */
  wallpaper_kind?: 'none' | 'preset' | 'image' | null
  /** Preset id, data URL, http(s) URL or object reference; null when none. */
  wallpaper_value?: string | null
  created_at: string
}

export type ChatInviteLink = {
  id: string
  chat_id: string
  created_by: string
  token: string
  title?: string
  is_primary: boolean
  use_count: number
  revoked_at?: string
  created_at: string
}

export type ChatMember = {
  user_id: string
  role: string
  joined_at?: string
}

export type ChatMemberProfile = ChatMember & {
  profile?: SearchUserResult
}

export type ChatExportAttachment = {
  id: string
  filename: string
  mime_type: string
  kind: string
  size_bytes?: number
  width?: number
  height?: number
  duration_ms?: number
}

export type ChatExportMessage = {
  id: string
  created_at: string
  edited_at?: string
  sender_user_id: string
  sender_bot_id?: string
  text: string
  reply_to_message_id?: string
  forward_origin_name?: string
  attachments?: ChatExportAttachment[]
  reactions?: MessageReaction[]
  poll?: Poll
}

/** Newest-messages-first JSON archive produced by exportChatHistory. */
export type ChatExport = {
  exported_at: string
  chat: ChatItem
  message_count: number
  /** true when the archive hit the 5000 message cap. */
  truncated: boolean
  messages: ChatExportMessage[]
}

export type ChatWallpaper = {
  kind: 'none' | 'preset' | 'image'
  /** Preset id, data URL, http(s) URL or object reference; omitted for 'none'. */
  value?: string
}

/** action kind stored in the per-chat recent-actions journal. */
export type ChatEventType =
  | 'member_joined'
  | 'member_left'
  | 'member_removed'
  | 'role_changed'
  | 'title_changed'
  | 'avatar_changed'
  | 'description_changed'
  | 'icon_changed'
  | 'settings_changed'
  | 'banned'
  | 'unbanned'

/** One "recent actions" journal entry; payload is a short single line. */
export type ChatEvent = {
  id: string
  chat_id: string
  /** Who performed the action; omitted for anonymous/system entries. */
  actor_user_id?: string
  /** Who the action targeted (kicked, banned, role change). */
  target_user_id?: string
  event_type: ChatEventType
  /**
   * Human readable detail: the new title/description/icon, 'field=value'
   * pairs for settings_changed, 'role=admin' for role_changed, '' otherwise.
   */
  payload: string
  created_at: string
}

/** One Telegram style dialog filter ("folder"): a tab above the chat list. */
export type ChatFolder = {
  id: string
  /** 1..32 characters after trim, unique per user. */
  name: string
  /** Optional glyph up to 8 characters; '' when the folder shows no icon. */
  icon: string
  /** 0 based order inside the folder bar; dense, renumbered on reorder. */
  position: number
  created_at: string
  /** Chat ids in folder order; never null, [] for an empty folder. */
  chat_ids: string[]
}
