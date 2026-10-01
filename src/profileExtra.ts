import { updateProfile } from './comboxApi.auth'
import type { AuthUser, ProfileUpdateInput } from './comboxApi.types'

/**
 * "My Account" (Telegram-style) field contract. No new routes: everything
 * goes through the existing `PATCH /profile` (see `updateProfile` in
 * comboxApi.auth). The backend already stores all of these columns
 * (migrations 000013 user_profile + 000027 user_playlist + 000009 idle TTL):
 *
 *   username   — 4..32 chars, [a-z0-9_], lowercased server-side, unique
 *   first_name — required, non-empty, max 64 chars
 *   last_name  — optional; empty string clears it (stored NULL)
 *   birth_date — 'YYYY-MM-DD'; empty string clears it (stored NULL).
 *                The server casts to DATE, so any other shape is a 500:
 *                validate with normalizeBirthDate() before sending.
 *   avatar_data_url / avatar_gradient — avatar upload or gradient id
 *   bio        — max 70 chars, privacy-masked for strangers unless the
 *                owner's `bio` privacy rule allows the viewer
 *   phone_number — max 32 chars, privacy-masked like bio (`phone_number` rule)
 *   session_idle_ttl_seconds — via updateSessionIdleTTL(), seconds, null resets
 */

export const MAX_BIO_LENGTH = 70
export const MAX_NAME_LENGTH = 64

const BIRTH_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Normalizes a birthday to the 'YYYY-MM-DD' shape the API stores, or null
 * when it cannot be represented as a calendar date. Accepts 'YYYY-MM-DD',
 * 'DD.MM.YYYY' and 'DD.MM' (year defaults to 2000 — Telegram hides the year
 * when the user picks day+month only; the server still needs a full DATE).
 * Returns '' for empty input, meaning "clear the birthday".
 */
export function normalizeBirthDate(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const value = String(raw).trim()
  if (value === '') return ''
  let year = 2000
  let month = 0
  let day = 0
  const iso = BIRTH_DATE_RE.exec(value)
  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else {
    const eu = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/.exec(value)
    if (!eu) return null
    day = Number(eu[1])
    month = Number(eu[2])
    if (eu[3]) year = Number(eu[3])
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

export function isValidBio(bio: string): boolean {
  return Array.from(String(bio ?? '')).length <= MAX_BIO_LENGTH
}

/** Updates the account name (first + optional last). */
export async function updateAccountName(firstName: string, lastName?: string): Promise<AuthUser> {
  const input: ProfileUpdateInput = { first_name: firstName }
  if (lastName !== undefined) input.last_name = lastName
  return updateProfile(input)
}

/** Updates the bio (client-side length guard mirrors the server's 70 chars). */
export async function updateAccountBio(bio: string): Promise<AuthUser> {
  if (!isValidBio(bio)) throw new Error(`Bio must be at most ${MAX_BIO_LENGTH} characters`)
  return updateProfile({ bio })
}

/**
 * Updates the birthday. Accepts the shapes normalizeBirthDate() takes;
 * throws on anything else so a malformed date never reaches the server
 * (which would answer 500 on a bad DATE cast).
 */
export async function updateAccountBirthday(raw: string | null | undefined): Promise<AuthUser> {
  const birth_date = normalizeBirthDate(raw)
  if (birth_date === null) throw new Error('Birthday must be YYYY-MM-DD, DD.MM.YYYY or DD.MM (empty clears it)')
  return updateProfile({ birth_date })
}

/** Updates the phone number shown on the account (privacy rule applies). */
export async function updateAccountPhone(phoneNumber: string): Promise<AuthUser> {
  return updateProfile({ phone_number: phoneNumber })
}
