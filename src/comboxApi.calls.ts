import { apiRequest, getOrRefreshTokenDetailed, redirectToAuthIfNeeded, WS_BASE } from './comboxApi.core'
import { clearAuth } from './comboxApi.auth'
import { invalidateAttachmentCache } from './comboxApi.media'

const DEVICE_ID_STORAGE_KEY = 'combox.device.v1'

export type CallKind = 'p2p' | 'group' | 'broadcast'
export type CallRole = 'publisher' | 'subscriber'
export type CallTopology = 'mesh' | 'sfu' | 'broadcast'

export type CallMediaState = {
  mic: boolean
  camera: boolean
  screen: boolean
  speaking: boolean
}

export type CallParticipant = {
  user_id: string
  device_id?: string
  role: CallRole
  joined_at: string
  media: CallMediaState
}

export type CallRecord = {
  id: string
  chat_id: string
  kind: CallKind
  topology: CallTopology
  e2ee: boolean
  started_by: string
  started_at: string
  ended_at?: string
  end_reason?: string
  max_participants: number
}

export type ICEServerConfig = {
  urls: string[] | string
  username?: string
  credential?: string
}

export type ActiveCallPayload = {
  call: CallRecord | null
  participants?: CallParticipant[]
}

export type AttachmentMeta = {
  waveform?: number[]
  round?: boolean
  voice?: boolean
  duration_ms?: number
  [key: string]: unknown
}

/**
 * Comma separated markers mirrored into the attachment token so a round/voice
 * note still renders when the user_meta request fails or the viewer's lookup
 * comes back without metadata.
 */
export function attachmentFlagsFromMeta(meta?: AttachmentMeta): string {
  const flags: string[] = []
  if (meta?.round === true) flags.push('round')
  if (meta?.voice === true) flags.push('voice')
  return flags.join(',')
}

/** Stable per-browser id so the signaling channel can rebind a reconnect. */
export function getDeviceID(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)
    if (existing) return existing
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated)
    return generated
  } catch {
    return 'web'
  }
}

function callsWsBase(): URL {
  if (WS_BASE) {
    const url = new URL(WS_BASE)
    // WS_BASE points at /api/private/v1/ws → /api/private/v1/calls/ws
    url.pathname = url.pathname.replace(/\/ws\/?$/, '/calls/ws')
    return url
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return new URL(`${protocol}//${window.location.host}/api/private/v1/calls/ws`)
}

/** Builds the signaling URL; the caller passes a fresh access token. */
export function buildCallWsURL(accessToken: string): string {
  const url = callsWsBase()
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('device_id', getDeviceID())
  return url.toString()
}

/** Builds the signaling URL with a refreshed token (mirrors the main WS). */
export async function buildCallWsURLWithFreshToken(forceRefresh = false): Promise<string> {
  const { token, outcome } = await getOrRefreshTokenDetailed(forceRefresh)
  if (!token) {
    if (outcome !== 'unavailable') {
      clearAuth()
      redirectToAuthIfNeeded()
    }
    return ''
  }
  return buildCallWsURL(token)
}

export async function getICEServers(): Promise<ICEServerConfig[]> {
  const payload = await apiRequest<{ ice_servers?: ICEServerConfig[] }>('/calls/ice')
  return payload.ice_servers ?? []
}

export async function getActiveCall(chatID: string): Promise<ActiveCallPayload> {
  const payload = await apiRequest<ActiveCallPayload>(`/calls/active?chat_id=${encodeURIComponent(chatID)}`)
  return { call: payload.call ?? null, participants: payload.participants ?? [] }
}

/** Stores client side metadata (waveform, round flag, duration) on an attachment. */
export async function setAttachmentMeta(attachmentID: string, meta: AttachmentMeta): Promise<void> {
  await apiRequest(`/media/attachments/${encodeURIComponent(attachmentID)}/meta`, {
    method: 'POST',
    body: { meta },
  })
  invalidateAttachmentCache(attachmentID)
}
