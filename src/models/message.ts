export type ReactionActor = {
  user_id: string
  at: string
}

export type MessageReaction = {
  emoji: string
  count: number
  user_ids: string[]
  actors?: ReactionActor[]
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

export type MessageItem = {
  id: string
  chat_id: string
  user_id: string
  sender_bot_id?: string
  content: string
  reply_to_message_id?: string
  reply_to_message_preview?: string
  reply_to_message_sender_name?: string
  forward_origin_user_id?: string
  forward_origin_name?: string
  /** The origin asked to stay hidden: never render an avatar or a profile link. */
  forward_origin_redacted?: boolean
  /** Inline avatar of the forward origin (data URL), when the backend has one. */
  forward_origin_avatar_data_url?: string
  is_e2e: boolean
  e2e?: E2EPayload
  reactions?: MessageReaction[]
  created_at: string
  edited_at?: string
  /** Attached for every message that carries a poll, on every read path. */
  poll?: Poll
}

export type PollOption = {
  id: string
  text: string
}

export type PollResult = {
  id: string
  text: string
  votes: number
  percent: number
}

export type Poll = {
  id: string
  chat_id: string
  message_id: string
  question: string
  description?: string
  options: PollOption[]
  show_who_voted: boolean
  multiple: boolean
  allow_add_options: boolean
  allow_revoting: boolean
  shuffle_options: boolean
  /** Quiz answers; [] for a regular poll. Option ids, never indices. */
  correct_option_ids: string[]
  explanation?: string
  closes_at?: string
  hide_results: boolean
  /** The poll was stopped early by its creator or a chat admin. */
  is_closed: boolean
  created_by: string
  created_at: string
  /** Effective state: is_closed || closes_at already elapsed. */
  closed: boolean
  /** true when hide_results is on, the poll is open and this viewer has not voted. */
  results_hidden: boolean
  /** The viewer's own choice (option ids), empty before voting. */
  my_option_ids: string[]
  /** Only present when the viewer may see the tallies. */
  total_votes?: number
  results?: PollResult[]
  /** option id -> voter user ids, only when show_who_voted is on and results are visible. */
  voters?: Record<string, string[]>
}

export type MessageStatus = {
  message_id: string
  chat_id: string
  user_id: string
  status: string
  updated_at: string
}
