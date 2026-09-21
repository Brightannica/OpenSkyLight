export type SseClientCallback = (channel: string, payload: unknown) => void

const sseClients = new Set<SseClientCallback>()

export function registerSseClient(cb: SseClientCallback): () => void {
  sseClients.add(cb)
  return () => {
    sseClients.delete(cb)
  }
}

export function notifySseClients(channel: string, payload: unknown): void {
  for (const cb of sseClients) {
    try {
      cb(channel, payload)
    } catch {}
  }
}
