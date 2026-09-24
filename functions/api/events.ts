export async function onRequestGet(context: { request: Request; env: any }) {
  const { request } = context
  
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      
      controller.enqueue(encoder.encode('retry: 5000\n\n'))
      
      const interval = setInterval(() => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ channel: 'ping', payload: { timestamp: Date.now() } })}\n\n`))
      }, 30000)
      
      request.signal.addEventListener('abort', () => {
        clearInterval(interval)
        controller.close()
      })
    }
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    }
  })
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    }
  })
}