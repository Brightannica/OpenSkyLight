import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleApiRequest } from '../src/main/web/server'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const handled = await handleApiRequest(req, res)
  if (!handled) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } }))
  }
}
