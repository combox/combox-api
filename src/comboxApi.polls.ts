import type { ChatExport, ChatItem, MessageItem, Poll } from './comboxApi.types'
import { ApiError, apiRequest } from './comboxApi.core'

/** Server side cap on poll options (mirrors chatsvc.PollMaxOptions). */
export const POLL_MAX_OPTIONS = 13
/** Minimum number of options a poll needs. */
export const POLL_MIN_OPTIONS = 2

let serverMaxPollOptions: number | null = null

/**
 * Upper bound for the option count in the composer. The backend echoes its
 * own `max_options` on every poll response, so the value tracks the server
 * once any poll endpoint has been called.
 */
export function maxPollOptions(): number {
  if (serverMaxPollOptions && serverMaxPollOptions > 0) {
    return serverMaxPollOptions
  }
  return POLL_MAX_OPTIONS
}

function noteMaxPollOptions(payload: { max_options?: unknown } | null | undefined): void {
  const value = payload?.max_options
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    serverMaxPollOptions = value
  }
}

export type CreatePollInput = {
  question: string
  description?: string
  /** 2..maxPollOptions() entries, 1..100 chars each. */
  options: string[]
  show_who_voted?: boolean
  multiple?: boolean
  allow_add_options?: boolean
  allow_revoting?: boolean
  shuffle_options?: boolean
  /**
   * Quiz answers as 0-based option INDICES encoded as strings ("0", "2"):
   * option ids only exist after creation. Responses always return ids.
   */
  correct_option_ids?: string[]
  explanation?: string
  /** RFC3339 deadline; must be in the future. */
  closes_at?: string
  hide_results?: boolean
}

export async function createPoll(chatID: string, input: CreatePollInput): Promise<{ poll: Poll; item: MessageItem }> {
  const payload = await apiRequest<{ poll?: Poll; item?: MessageItem; max_options?: number }>(
    `/chats/${encodeURIComponent(chatID)}/polls`,
    {
      method: 'POST',
      body: {
        question: input.question,
        ...(input.description !== undefined ? { description: input.description } : {}),
        options: input.options,
        show_who_voted: input.show_who_voted ?? false,
        multiple: input.multiple ?? false,
        allow_add_options: input.allow_add_options ?? false,
        allow_revoting: input.allow_revoting ?? false,
        shuffle_options: input.shuffle_options ?? false,
        ...(input.correct_option_ids ? { correct_option_ids: input.correct_option_ids } : {}),
        ...(input.explanation !== undefined ? { explanation: input.explanation } : {}),
        ...(input.closes_at !== undefined ? { closes_at: input.closes_at } : {}),
        hide_results: input.hide_results ?? false,
      },
    },
  )
  noteMaxPollOptions(payload)
  if (!payload.poll) throw new ApiError('create_poll_failed', 'Create poll failed')
  if (!payload.item) throw new ApiError('create_poll_failed', 'Create poll failed')
  return { poll: payload.poll, item: payload.item }
}

/** Reads a poll with the tallies this viewer is allowed to see. */
export async function getPoll(pollID: string): Promise<Poll> {
  const payload = await apiRequest<{ poll?: Poll; max_options?: number }>(`/polls/${encodeURIComponent(pollID)}`)
  noteMaxPollOptions(payload)
  if (!payload.poll) throw new ApiError('get_poll_failed', 'Get poll failed')
  return payload.poll
}

/**
 * Casts (or, when allow_revoting is on, replaces) the caller's ballot.
 * option_ids must be option ids from the poll payload.
 */
export async function votePoll(pollID: string, optionIDs: string[]): Promise<Poll> {
  const payload = await apiRequest<{ poll?: Poll; max_options?: number }>(`/polls/${encodeURIComponent(pollID)}/vote`, {
    method: 'POST',
    body: { option_ids: optionIDs },
  })
  noteMaxPollOptions(payload)
  if (!payload.poll) throw new ApiError('vote_poll_failed', 'Vote poll failed')
  return payload.poll
}

/** Stops the poll early; the creator and chat owner/admins may do it. */
export async function closePoll(pollID: string): Promise<Poll> {
  const payload = await apiRequest<{ poll?: Poll; max_options?: number }>(`/polls/${encodeURIComponent(pollID)}/close`, {
    method: 'POST',
  })
  noteMaxPollOptions(payload)
  if (!payload.poll) throw new ApiError('close_poll_failed', 'Close poll failed')
  return payload.poll
}

/**
 * Hides this viewer's copy of the chat history (other members keep theirs)
 * and reports how many messages they could still see.
 */
export async function clearChatHistory(chatID: string): Promise<{ cleared: number }> {
  const payload = await apiRequest<{ cleared?: number }>(`/chats/${encodeURIComponent(chatID)}/clear`, {
    method: 'POST',
  })
  return { cleared: typeof payload.cleared === 'number' ? payload.cleared : 0 }
}

/** Downloads the chat archive: newest 5000 messages, capped and flagged. */
export async function exportChatHistory(chatID: string): Promise<ChatExport> {
  const payload = await apiRequest<ChatExport>(`/chats/${encodeURIComponent(chatID)}/export`)
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.messages)) {
    throw new ApiError('export_chat_failed', 'Export chat failed')
  }
  return payload
}

/** Sets the chat background (kind: 'none' | 'preset' | 'image'). */
export async function setChatWallpaper(chatID: string, wallpaper: { kind: 'none' | 'preset' | 'image'; value?: string }): Promise<ChatItem> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/chats/${encodeURIComponent(chatID)}/wallpaper`, {
    method: 'PUT',
    body: { kind: wallpaper.kind, value: wallpaper.value },
  })
  if (!payload.chat) throw new ApiError('set_wallpaper_failed', 'Set chat wallpaper failed')
  return payload.chat
}

/** Removes the chat background. */
export async function clearChatWallpaper(chatID: string): Promise<ChatItem> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/chats/${encodeURIComponent(chatID)}/wallpaper`, {
    method: 'DELETE',
  })
  if (!payload.chat) throw new ApiError('clear_wallpaper_failed', 'Clear chat wallpaper failed')
  return payload.chat
}
