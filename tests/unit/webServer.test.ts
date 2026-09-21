import { describe, it, expect } from 'vitest'
import { handleApiRequest } from '../../src/main/web/server'
import { EventEmitter } from 'node:events'

function createMockReqRes(method: string, url: string, body?: any) {
  const req: any = new EventEmitter()
  req.method = method
  req.url = url
  req.socket = { remoteAddress: '127.0.0.1' }

  let statusCode = 0
  let headers: any = {}
  let responseData = ''

  const res: any = {
    writeHead(code: number, h?: any) {
      statusCode = code
      if (h) headers = { ...headers, ...h }
    },
    end(data?: string) {
      if (data) responseData += data
    },
    write(data?: string) {
      if (data) responseData += data
    }
  }

  // emit body asynchronously
  process.nextTick(() => {
    if (body) {
      req.emit('data', Buffer.from(JSON.stringify(body)))
    }
    req.emit('end')
  })

  return { req, res, getResult: () => ({ statusCode, headers, body: responseData ? JSON.parse(responseData) : null }) }
}

describe('webServer API handler', () => {
  it('responds to health endpoint', async () => {
    const { req, res, getResult } = createMockReqRes('GET', '/api/health')
    const handled = await handleApiRequest(req, res)
    expect(handled).toBe(true)
    const result = getResult()
    expect(result.statusCode).toBe(200)
    expect(result.body).toEqual({ app: 'openskylight', mode: 'web', version: '0.8.0' })
  })

  it('dispatches RPC requests to web services', async () => {
    const { req, res, getResult } = createMockReqRes('POST', '/api/rpc/app%3AgetInfo')
    const handled = await handleApiRequest(req, res)
    expect(handled).toBe(true)
    const result = getResult()
    expect(result.statusCode).toBe(200)
    expect(result.body.ok).toBe(true)
    expect(result.body.data.version).toBe('0.8.0')
  })
})
