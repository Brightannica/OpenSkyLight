import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { promises as fs } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { getWebServices } from './webServices'
import { registerSseClient } from './sse'
import type { IpcChannel } from '@shared/ipc/contract'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  })
  res.end(payload)
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 512 * 1024) {
        resolve(null)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(null))
  })
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url ?? '/'

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    })
    res.end()
    return true
  }

  if (url === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { app: 'openskylight', mode: 'web', version: '0.8.0' })
    return true
  }

  if (url.startsWith('/api/events')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })
    res.write('retry: 5000\n\n')

    const unregister = registerSseClient((channel, payload) => {
      res.write(`data: ${JSON.stringify({ channel, payload })}\n\n`)
    })

    req.on('close', () => {
      unregister()
    })
    return true
  }

  const rpcMatch = url.match(/^\/api\/rpc\/([^/?]+)$/)
  if (rpcMatch) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: { code: 'METHOD', message: 'POST required' } })
      return true
    }

    const channelRaw = rpcMatch[1]
    const channel = decodeURIComponent(channelRaw) as IpcChannel
    const bodyStr = await readBody(req)
    let payload: unknown = undefined
    if (bodyStr && bodyStr.trim()) {
      try {
        payload = JSON.parse(bodyStr)
      } catch {
        sendJson(res, 400, { ok: false, error: { code: 'INVALID', message: 'Body must be JSON' } })
        return true
      }
    }

    try {
      const { dispatch } = await getWebServices()
      const result = await dispatch(channel, payload, 'none')
      sendJson(res, 200, result)
    } catch (err: any) {
      sendJson(res, 500, { ok: false, error: { code: 'INTERNAL', message: err?.message || 'Server error' } })
    }
    return true
  }

  if (url.startsWith('/api/')) {
    sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } })
    return true
  }

  return false
}

export async function serveStaticAssets(req: IncomingMessage, res: ServerResponse, staticRoot: string): Promise<void> {
  const urlPath = req.url ?? '/'
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '')
  let filePath = join(staticRoot, clean)

  if (!filePath.startsWith(staticRoot + sep) && filePath !== staticRoot) {
    res.writeHead(403).end()
    return
  }

  if (urlPath === '/' || urlPath === '') filePath = join(staticRoot, 'index.html')

  let data: Buffer
  try {
    data = await fs.readFile(filePath)
  } catch {
    if (extname(filePath) === '') {
      try {
        data = await fs.readFile(join(staticRoot, 'index.html'))
        filePath = 'index.html'
      } catch {
        res.writeHead(404).end('Not found')
        return
      }
    } else {
      res.writeHead(404).end('Not found')
      return
    }
  }

  const ext = extname(filePath) || '.html'
  const headers: Record<string, string> = { 'Content-Type': MIME[ext] ?? 'application/octet-stream' }
  if (ext === '.html') {
    headers['Cache-Control'] = 'no-store'
  } else if (clean.includes('assets')) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable'
  } else {
    headers['Cache-Control'] = 'no-cache'
  }
  res.writeHead(200, headers)
  res.end(data)
}

export function startWebServer(port: number = Number(process.env.PORT) || 3000, staticRoot: string = join(process.cwd(), 'dist/web')) {
  const server = createServer(async (req, res) => {
    const handled = await handleApiRequest(req, res)
    if (!handled) {
      await serveStaticAssets(req, res, staticRoot)
    }
  })

  server.listen(port, () => {
    console.log(`[openskylight] Web server running at http://localhost:${port}`)
  })

  return server
}

if (process.env.START_WEB_SERVER === '1') {
  startWebServer()
}
