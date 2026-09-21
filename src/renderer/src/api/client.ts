import type { IpcChannel, IpcContract, IpcResult } from '@shared/ipc/contract'
import { ensureWebBridge } from './webBridge'

export class IpcError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'IpcError'
  }
}

export async function ipcInvoke<K extends IpcChannel>(
  channel: K,
  req: IpcContract[K]['req']
): Promise<IpcContract[K]['res']> {
  const osl = ensureWebBridge()
  const result = (await osl.invoke(channel, req)) as IpcResult<IpcContract[K]['res']>
  if (!result.ok) throw new IpcError(result.error.code, result.error.message)
  return result.data
}
