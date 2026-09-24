import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { SettingsService } from './settingsService'
import { AppError, invalid } from './errors'

const KEY_PIN = 'auth.pinHash' // format: <saltHex>:<hashHex>
const UNLOCK_WINDOW_MS = 5 * 60 * 1000

function hashPin(pin: string, salt: Buffer): Buffer {
  return scryptSync(pin, salt, 32)
}

/**
 * Parental lock. The PIN hash lives in the settings table (internal key, never
 * sent to the renderer); the unlock state lives here in the main process so a
 * compromised renderer cannot skip the gate.
 */
export function createAuthService(settings: SettingsService) {
  let unlockedUntilMs = 0

  async function pinSet(): Promise<boolean> {
    const raw = await settings.getRaw(KEY_PIN)
    return raw !== null
  }

  async function isUnlocked(): Promise<boolean> {
    const isSet = await pinSet()
    return !isSet || Date.now() < unlockedUntilMs
  }

  async function verifyPin(pin: string): Promise<boolean> {
    const stored = await settings.getRaw(KEY_PIN)
    return checkPin(stored, pin)
  }

  function checkPin(stored: string | null, pin: string): boolean {
    if (!stored) return true
    const [saltHex, hashHex] = stored.split(':')
    if (!saltHex || !hashHex) return false
    const expected = Buffer.from(hashHex, 'hex')
    const actual = hashPin(pin, Buffer.from(saltHex, 'hex'))
    const ok = expected.length === actual.length && timingSafeEqual(expected, actual)
    if (ok) unlockedUntilMs = Date.now() + UNLOCK_WINDOW_MS
    return ok
  }

  async function setPin(pin: string | null): Promise<void> {
    const unlocked = await isUnlocked()
    const set = await pinSet()
    if (set && !unlocked) throw new AppError('LOCKED', 'Unlock with the current PIN first')
    return doSetPin(pin)
  }

  async function doSetPin(pin: string | null): Promise<void> {
    if (pin === null) {
      return removePin()
    }
    if (!/^\d{4,8}$/.test(pin)) throw invalid('PIN must be 4–8 digits')
    const salt = randomBytes(16)
    await settings.setRaw(KEY_PIN, `${salt.toString('hex')}:${hashPin(pin, salt).toString('hex')}`)
    unlockedUntilMs = Date.now() + UNLOCK_WINDOW_MS
  }

  async function removePin(): Promise<void> {
    await settings.deleteRaw(KEY_PIN)
    unlockedUntilMs = 0
  }

  function lock(): void {
    unlockedUntilMs = 0
  }

  async function assertUnlocked(): Promise<void> {
    const unlocked = await isUnlocked()
    if (!unlocked) throw new AppError('LOCKED', 'Parental lock is on — enter the PIN first')
    const set = await pinSet()
    if (set) unlockedUntilMs = Date.now() + UNLOCK_WINDOW_MS
  }

  return { pinSet, isUnlocked, verifyPin, setPin, lock, assertUnlocked }
}

export type AuthService = ReturnType<typeof createAuthService>
