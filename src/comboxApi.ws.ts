import { clearAuth } from './comboxApi.auth'
import { getAccessToken, getOrRefreshTokenDetailed, redirectToAuthIfNeeded, WS_BASE } from './comboxApi.core'

function resolveWsBase(): URL {
  return WS_BASE
    ? new URL(WS_BASE)
    : new URL(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/private/v1/ws`)
}

export function buildWsUrl(deviceID?: string): string {
  const token = getAccessToken()
  if (!token) return ''
  const url = resolveWsBase()
  url.searchParams.set('access_token', token)
  if (deviceID) url.searchParams.set('device_id', deviceID)
  return url.toString()
}

export async function buildWsUrlWithFreshToken(deviceID?: string, forceRefresh = false): Promise<string> {
  const { token, outcome } = await getOrRefreshTokenDetailed(forceRefresh)
  if (!token) {
    // Only a genuinely dead session logs out. A transient outage (server restart,
    // IP change, offline) must keep the stored refresh token so the next attempt succeeds.
    if (outcome !== 'unavailable') {
      clearAuth()
      redirectToAuthIfNeeded()
    }
    return ''
  }

  const url = resolveWsBase()
  url.searchParams.set('access_token', token)
  if (deviceID) url.searchParams.set('device_id', deviceID)
  return url.toString()
}
