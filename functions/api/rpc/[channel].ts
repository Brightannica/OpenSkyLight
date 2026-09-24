interface IpcContract {
  'app:getInfo': { req: void; res: { version: string; platform: string; zone: string } }
  'settings:getAll': { req: void; res: any }
  'settings:set': { req: { patch: Partial<any> }; res: any }
  'people:list': { req: void; res: any[] }
  'people:create': { req: any; res: any }
  'people:update': { req: any; res: any }
  'people:delete': { req: { id: string }; res: void }
  'calendars:list': { req: void; res: any[] }
  'calendars:create': { req: any; res: any }
  'calendars:update': { req: any; res: any }
  'calendars:delete': { req: { id: string }; res: void }
  'events:getOccurrences': { req: { start: string; end: string }; res: any[] }
  'events:get': { req: { id: string }; res: any | null }
  'events:create': { req: any; res: any }
  'events:update': { req: any; res: void }
  'events:delete': { req: any; res: void }
  'chores:list': { req: void; res: any[] }
  'chores:create': { req: any; res: any }
  'chores:update': { req: any; res: any }
  'chores:delete': { req: { id: string }; res: void }
  'chores:getDay': { req: { date: string }; res: any[] }
  'chores:complete': { req: { choreId: string; date: string }; res: { balance: number } }
  'chores:uncomplete': { req: { choreId: string; date: string }; res: { balance: number } }
  'stars:balances': { req: void; res: any[] }
  'lists:getAll': { req: void; res: any[] }
  'lists:create': { req: { name: string; color: string; kind: any }; res: any }
  'lists:update': { req: { id: string; name?: string; color?: string }; res: any }
  'lists:delete': { req: { id: string }; res: void }
  'listItems:add': { req: { listId: string; text: string }; res: any }
  'listItems:toggle': { req: { id: string }; res: void }
  'listItems:delete': { req: { id: string }; res: void }
  'listItems:clearChecked': { req: { listId: string }; res: void }
  'meals:getRange': { req: { start: string; end: string }; res: any[] }
  'meals:set': { req: { date: string; slot: any; text: string | null }; res: void }
  'rewards:list': { req: void; res: any[] }
  'rewards:create': { req: { title: string; costStars: number }; res: any }
  'rewards:update': { req: { id: string; title?: string; costStars?: number; active?: boolean }; res: any }
  'rewards:delete': { req: { id: string }; res: void }
  'rewards:redeem': { req: { rewardId: string; personId: string }; res: any }
  'rewards:redemptions': { req: void; res: any[] }
  'rewards:grant': { req: { redemptionId: string }; res: void }
  'camera:list': { req: void; res: { id: string; name: string }[] }
  'camera:add': { req: { name: string; url: string }; res: { id: string; name: string } }
  'camera:remove': { req: { cameraId: string }; res: void }
  'camera:start': { req: { cameraId: string }; res: { wsUrl: string; sessionId: string } }
  'camera:stop': { req: { sessionId: string }; res: void }
  'rss:getFeed': { req: { feedId: string }; res: any }
  'birdnet:getDetections': { req: { url: string }; res: any }
  'weather:get': { req: void; res: any | null }
  'weather:searchCity': { req: { query: string }; res: any[] }
  'sync:now': { req: void; res: void }
  'sync:getStatus': { req: void; res: any }
  'auth:getStatus': { req: void; res: { pinSet: boolean; unlocked: boolean } }
  'auth:verifyPin': { req: { pin: string }; res: { valid: boolean } }
  'auth:setPin': { req: { pin: string | null }; res: void }
  'auth:lock': { req: void; res: void }
}

type IpcChannel = keyof IpcContract

const ALLOWED_CHANNEL_PREFIXES = [
  'app:', 'settings:', 'people:', 'calendars:', 'events:', 'google:', 'ics:', 'sync:', 'weather:',
  'auth:', 'chores:', 'stars:', 'rewards:', 'lists:', 'listItems:', 'meals:', 'screensaver:', 'kiosk:',
  'rss:', 'camera:', 'companion:', 'birdnet:'
] as const

function isAllowedChannel(channel: string): channel is IpcChannel {
  return ALLOWED_CHANNEL_PREFIXES.some(prefix => channel.startsWith(prefix))
}

function sendJson(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  })
}

export async function onRequestPost(context: { request: Request; env: any; params: { channel: string } }) {
  const { request, params } = context
  const channelRaw = params.channel
  const channel = decodeURIComponent(channelRaw)

  if (!isAllowedChannel(channel)) {
    return sendJson(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown channel' } })
  }

  let payload: unknown = undefined
  const bodyStr = await request.text()
  if (bodyStr && bodyStr.trim()) {
    try {
      payload = JSON.parse(bodyStr)
    } catch {
      return sendJson(400, { ok: false, error: { code: 'INVALID', message: 'Body must be JSON' } })
    }
  }

  return sendJson(200, { ok: true, data: null, meta: { channel, payload } })
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  })
}