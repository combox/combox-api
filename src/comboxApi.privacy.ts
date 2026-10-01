import { ApiError, apiRequest } from './comboxApi.core'

/** The three visibility rules every privacy parameter understands. */
export type PrivacyRule = 'everybody' | 'contacts' | 'nobody'

const PRIVACY_RULES: readonly PrivacyRule[] = ['everybody', 'contacts', 'nobody']

/** One privacy parameter as returned by `GET /profile/privacy`. */
export type PrivacySetting = {
  param: string
  rule: PrivacyRule
  allow_ids: string[]
  deny_ids: string[]
  allow_count: number
  deny_count: number
}

/** Full privacy state: every parameter the account exposes plus server defaults. */
export type PrivacyResponse = {
  settings: PrivacySetting[]
  defaults: Record<string, PrivacyRule>
}

export type PrivacyUpdateInput = {
  rule: PrivacyRule
  allow_ids: string[]
  deny_ids: string[]
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function asRule(value: unknown): PrivacyRule {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return (PRIVACY_RULES as readonly string[]).includes(raw) ? (raw as PrivacyRule) : 'everybody'
}

function asCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
}

/** Normalizes one server row, or null when it carries no parameter name. */
export function normalizePrivacySetting(raw: unknown): PrivacySetting | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const param = typeof record.param === 'string' ? record.param.trim() : ''
  if (!param) return null
  const allow_ids = asStringArray(record.allow_ids)
  const deny_ids = asStringArray(record.deny_ids)
  return {
    param,
    rule: asRule(record.rule),
    allow_ids,
    deny_ids,
    // Some deployments omit the counters: fall back to what the row carries.
    allow_count: asCount(record.allow_count) || allow_ids.length,
    deny_count: asCount(record.deny_count) || deny_ids.length,
  }
}

/**
 * Reads the viewer's privacy state. The parameter list is whatever the server
 * returns - the frontend renders it as-is instead of assuming a fixed set.
 */
export async function getMyPrivacy(): Promise<PrivacyResponse> {
  const payload = await apiRequest<{ settings?: unknown; defaults?: Record<string, unknown> }>('/profile/privacy')
  const settings = Array.isArray(payload.settings)
    ? payload.settings
        .map((item) => normalizePrivacySetting(item))
        .filter((item): item is PrivacySetting => item !== null)
    : []
  const defaults: Record<string, PrivacyRule> = {}
  if (payload.defaults && typeof payload.defaults === 'object') {
    for (const [param, rule] of Object.entries(payload.defaults as Record<string, unknown>)) {
      if (param) defaults[param] = asRule(rule)
    }
  }
  return { settings, defaults }
}

/**
 * Replaces one parameter (`PUT /profile/privacy/{param}`) and returns the
 * updated setting. The response is accepted either as the setting itself or
 * wrapped in `{ setting: … }`.
 */
export async function updatePrivacySetting(param: string, input: PrivacyUpdateInput): Promise<PrivacySetting> {
  const cleanParam = String(param || '').trim()
  if (!cleanParam) throw new ApiError('error.validation', 'Privacy parameter is required')
  if (!(PRIVACY_RULES as readonly string[]).includes(String(input.rule))) {
    throw new ApiError('error.validation', 'Unknown privacy rule')
  }
  const body = {
    rule: input.rule,
    allow_ids: asStringArray(input.allow_ids),
    deny_ids: asStringArray(input.deny_ids),
  }
  const payload = await apiRequest<Record<string, unknown>>(`/profile/privacy/${encodeURIComponent(cleanParam)}`, {
    method: 'PUT',
    body,
  })
  const setting = normalizePrivacySetting(payload) ?? normalizePrivacySetting(payload?.setting)
  if (!setting) throw new ApiError('request_failed', 'Privacy setting update failed')
  return { ...setting, param: setting.param || cleanParam }
}
