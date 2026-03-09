import { clearAuth } from './comboxApi.auth'
import { getAccessToken, getOrRefreshToken, redirectToAuthIfNeeded, WS_BASE } from './comboxApi.core'

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
  const token = await getOrRefreshToken(forceRefresh)
  if (!token) {
    clearAuth()
    redirectToAuthIfNeeded()
    return ''
  }

  const url = resolveWsBase()
  url.searchParams.set('access_token', token)
  if (deviceID) url.searchParams.set('device_id', deviceID)
  return url.toString()
}
