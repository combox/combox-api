import { ApiError, apiRequest } from './comboxApi.core'

/**
 * "Blocked users" (Privacy and Security -> Blocked users).
 *
 *   GET    /profile/blocked           -> { blocked: BlockedEntry[], count }
 *   POST   /profile/blocked {user_id} -> { blocked: BlockedEntry }
 *   DELETE /profile/blocked/{userID}  -> { revoked: true }
 *
 * Errors: ApiError('error.validation') for bad ids and self-blocks (400),
 * ApiError('not_found') for unknown targets / missing edges (404).
 * Storage + list only: no message/call filtering is enforced server-side yet.
 */

/** One edge of the owner's block list, oldest first. */
export type BlockedEntry = {
  user_id: string
  created_at: string
}

function asNonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Normalizes one server row, or null when it carries no user id. */
export function normalizeBlockedEntry(raw: unknown): BlockedEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const user_id = asNonEmptyString(record.user_id)
  if (!user_id) return null
  return { user_id, created_at: asNonEmptyString(record.created_at) }
}

function normalizeBlockedList(raw: unknown): BlockedEntry[] {
  if (!Array.isArray(raw)) return []
  const out: BlockedEntry[] = []
  for (const item of raw) {
    const entry = normalizeBlockedEntry(item)
    if (entry) out.push(entry)
  }
  return out
}

/** Reads the owner's block list (never null: [] when nobody is blocked). */
export async function listBlocked(): Promise<BlockedEntry[]> {
  const payload = await apiRequest<{ blocked?: unknown }>('/profile/blocked')
  return normalizeBlockedList(payload.blocked)
}

/** Blocks a user. Re-blocking is idempotent and returns the entry. */
export async function blockUser(userID: string): Promise<BlockedEntry> {
  const cleanID = asNonEmptyString(userID)
  if (!cleanID) throw new ApiError('error.validation', 'Blocked user id is required')
  const payload = await apiRequest<{ blocked?: unknown }>('/profile/blocked', {
    method: 'POST',
    body: { user_id: cleanID },
  })
  const entry = normalizeBlockedEntry(payload.blocked)
  if (!entry) throw new ApiError('request_failed', 'Block user failed')
  return entry
}

/** Unblocks a user. Throws ApiError('not_found') when no edge exists. */
export async function unblockUser(userID: string): Promise<void> {
  const cleanID = asNonEmptyString(userID)
  if (!cleanID) throw new ApiError('error.validation', 'Blocked user id is required')
  await apiRequest(`/profile/blocked/${encodeURIComponent(cleanID)}`, { method: 'DELETE' })
}
