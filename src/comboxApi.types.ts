export type AuthUser = {
  id: string
  email: string
  username: string
  first_name?: string
  last_name?: string
  birth_date?: string
  avatar_data_url?: string
  avatar_gradient?: string
  session_idle_ttl_seconds?: number
}

export type AuthTokens = {
  access_token: string
  refresh_token: string
  expires_in_sec: number
}

export type ProfileUpdateInput = {
  username?: string
  first_name?: string
  last_name?: string
  birth_date?: string
  avatar_data_url?: string
  avatar_gradient?: string
}

export type ChatItem = {
  id: string
  title: string
  is_direct: boolean
  type: string
  kind?: string
  is_public?: boolean
  public_slug?: string
  comments_enabled?: boolean
  parent_chat_id?: string
  channel_type?: 'text' | 'voice'
  topic_number?: number
  is_general?: boolean
  bot_id?: string
  peer_user_id?: string
  viewer_role?: string
  subscriber_count?: number
  avatar_data_url?: string
  avatar_gradient?: string
  last_message_preview?: string
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

export type MessageReaction = {
  emoji: string
  count: number
  user_ids: string[]
}

export type SearchUserResult = {
  id: string
  email: string
  username: string
  first_name: string
  last_name?: string
  birth_date?: string
  avatar_data_url?: string
  avatar_gradient?: string
}

export type SearchChatResult = {
  id: string
  title: string
  kind: string
  public_slug?: string
  avatar_data_url?: string
  avatar_gradient?: string
}

export type SearchResults = {
  users: SearchUserResult[]
  chats: SearchChatResult[]
}

export type GIFItem = {
  id: string
  title: string
  preview_url: string
  url: string
  width?: number
  height?: number
}

export type MessageItem = {
  id: string
  chat_id: string
  user_id: string
  sender_bot_id?: string
  content: string
  reply_to_message_id?: string
  reply_to_message_preview?: string
  reply_to_message_sender_name?: string
  is_e2e: boolean
  e2e?: E2EPayload
  reactions?: MessageReaction[]
  created_at: string
  edited_at?: string
}

export type E2EEnvelope = {
  recipient_device_id: string
  alg: string
  header: string
  ciphertext: string
}

export type E2EPayload = {
  sender_device_id: string
  envelope?: E2EEnvelope
}

export type MessageStatus = {
  message_id: string
  chat_id: string
  user_id: string
  status: string
  updated_at: string
}

export type E2EDevice = {
  device_id: string
  user_id: string
  identity_key: string
  updated_at: string
}

export type E2EDeviceSummary = {
  device_id: string
  identity_key: string
}

export type E2EPreKeyBundle = {
  user_id: string
  device_id: string
  identity_key: string
  signed_prekey: {
    key_id: number
    public_key: string
    signature: string
  }
  one_time_prekey?: {
    key_id: number
    public_key: string
  }
}

export type E2EUserKeyBackup = {
  user_id: string
  alg: string
  kdf: string
  salt: string
  params: unknown
  ciphertext: string
  updated_at: string
}

export type BotToken = {
  id: string
  name?: string
  bot_id: string
  owner_user_id: string
  scopes: string[]
  chat_ids: string[]
  expires_at?: string
  token: string
}

export type BotWebhook = {
  id: string
  bot_user_id: string
  endpoint_url: string
  events: string[]
  enabled: boolean
  created_at: string
}

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
  payload: unknown
  created_at: string
}

export type MediaAttachment = {
  id: string
  user_id: string
  filename: string
  mime_type: string
  kind: string
  variant: string
  size_bytes?: number
  width?: number
  height?: number
  duration_ms?: number
  bucket: string
  object_key: string
  upload_type: string
  upload_id?: string
  processing_status: string
  created_at: string
  updated_at: string
}

export type MediaSession = {
  id: string
  user_id: string
  attachment_id: string
  filename: string
  mime_type: string
  kind: string
  status: string
  parts_total: number
  parts_uploaded: number
  bytes_total?: number
  bytes_uploaded: number
  playlist_path?: string
  error_code?: string
  error_message?: string
  created_at: string
  updated_at: string
  finalized_at?: string
}
