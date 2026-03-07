import type { NotificationEvent, PresenceEvent } from './comboxApi'

type RealtimeEvent = NotificationEvent | PresenceEvent | Record<string, unknown>

type Handler = (event: RealtimeEvent) => void

export class ComboxRealtimeClient {
  private readonly ws: WebSocket
  private readonly handlers = new Map<string, Set<Handler>>()
  private readonly pending: string[] = []
  private ready = false

  constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl)
    this.ws.onopen = () => {
      this.ready = true
      while (this.pending.length) {
        const payload = this.pending.shift()
        if (!payload) continue
        try {
          this.ws.send(payload)
        } catch {
          this.pending.unshift(payload)
          break
        }
      }
    }
    this.ws.onclose = () => {
      this.ready = false
    }
    this.ws.onmessage = (event) => {
      if (!event.data) return
      let parsed: RealtimeEvent | null = null
      try {
        parsed = JSON.parse(String(event.data)) as RealtimeEvent
      } catch {
        return
      }
      const type = String((parsed as { type?: string }).type || '')
      if (type) {
        this.emit(type, parsed)
      }
      this.emit('*', parsed)
    }
  }

  on(type: string, handler: Handler): () => void {
    const key = type || '*'
    const existing = this.handlers.get(key) ?? new Set<Handler>()
    existing.add(handler)
    this.handlers.set(key, existing)
    return () => {
      const set = this.handlers.get(key)
      if (!set) return
      set.delete(handler)
    }
  }

  subscribePresence(userIDs: string[]): void {
    if (!userIDs.length) return
    this.sendOrQueue({ type: 'presence.subscribe', user_ids: userIDs })
  }

  unsubscribePresence(userIDs: string[]): void {
    if (!userIDs.length) return
    this.sendOrQueue({ type: 'presence.unsubscribe', user_ids: userIDs })
  }

  close(code?: number, reason?: string): void {
    this.ws.close(code, reason)
  }

  private sendOrQueue(message: Record<string, unknown>): void {
    const payload = JSON.stringify(message)
    if (!this.ready || this.ws.readyState !== WebSocket.OPEN) {
      this.pending.push(payload)
      return
    }
    try {
      this.ws.send(payload)
    } catch {
      this.pending.push(payload)
    }
  }

  private emit(type: string, event: RealtimeEvent): void {
    const set = this.handlers.get(type)
    if (!set) return
    for (const handler of set) {
      handler(event)
    }
  }
}
