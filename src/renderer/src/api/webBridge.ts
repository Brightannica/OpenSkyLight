export interface OslBridge {
  invoke(channel: string, payload: unknown): Promise<unknown>
  on(channel: string, callback: (data: unknown) => void): () => void
}

const listeners = new Map<string, Set<(data: unknown) => void>>()

function getBearerToken(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  if (hash.includes('t=')) {
    const match = hash.match(/t=([^&]+)/)
    if (match?.[1]) {
      const token = match[1]
      try {
        localStorage.setItem('openskylight_bearer_token', token)
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      } catch {}
      return token
    }
  }
  const query = window.location.search
  if (query.includes('t=')) {
    const match = query.match(/[?&]t=([^&]+)/)
    if (match?.[1]) {
      const token = match[1]
      try {
        localStorage.setItem('openskylight_bearer_token', token)
      } catch {}
      return token
    }
  }
  try {
    return localStorage.getItem('openskylight_bearer_token')
  } catch {
    return null
  }
}

async function webInvoke(channel: string, payload: unknown): Promise<unknown> {
  const token = getBearerToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const res = await fetch(`/api/rpc/${encodeURIComponent(channel)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload ?? {})
    })

    if (!res.ok) {
      let errData: any
      try {
        errData = await res.json()
      } catch {}
      if (errData && errData.error) {
        return errData
      }
      return {
        ok: false,
        error: {
          code: 'HTTP_' + res.status,
          message: res.statusText || `HTTP ${res.status}`
        }
      }
    }

    return await res.json()
  } catch (err: any) {
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: err?.message || 'Network request failed'
      }
    }
  }
}

let eventSource: EventSource | null = null

function initSseIfNeeded(): void {
  if (typeof window === 'undefined' || eventSource || !window.EventSource) return
  try {
    const token = getBearerToken()
    const url = token ? `/api/events?token=${encodeURIComponent(token)}` : '/api/events'
    eventSource = new EventSource(url)

    eventSource.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data)
        if (parsed && typeof parsed.channel === 'string') {
          const set = listeners.get(parsed.channel)
          if (set) {
            for (const cb of set) {
              cb(parsed.payload)
            }
          }
        }
      } catch {}
    }

    eventSource.onerror = () => {
      // EventSource automatically retries connection
    }
  } catch {}
}

export function ensureWebBridge(): OslBridge {
  if (typeof window === 'undefined') {
    return {
      async invoke() {
        return { ok: false, error: { code: 'NO_WINDOW', message: 'No window object' } }
      },
      on() {
        return () => {}
      }
    }
  }

  if (window.osl) {
    return window.osl
  }

  const bridge: OslBridge = {
    invoke: webInvoke,
    on(channel: string, callback: (data: unknown) => void) {
      if (!listeners.has(channel)) {
        listeners.set(channel, new Set())
      }
      listeners.get(channel)!.add(callback)
      initSseIfNeeded()

      return () => {
        const set = listeners.get(channel)
        if (set) {
          set.delete(callback)
          if (set.size === 0) {
            listeners.delete(channel)
          }
        }
      }
    }
  }

  window.osl = bridge
  return bridge
}
