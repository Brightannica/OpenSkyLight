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

  function pinSet(): boolean | Promise<boolean> {
    const raw = settings.getRaw(KEY_PIN)
    if (raw instanceof Promise) {
      return raw.then((val) => val !== null)
    }
    return raw !== null
  }

  function isUnlocked(): boolean | Promise<boolean> {
    const isSet = pinSet()
    if (isSet instanceof Promise) {
      return isSet.then((set) => !set || Date.now() < unlockedUntilMs)
    }
    return !isSet || Date.now() < unlockedUntilMs
  }

  function verifyPin(pin: string): boolean | Promise<boolean> {
    const storedRes = settings.getRaw(KEY_PIN)
    if (storedRes instanceof Promise) {
      return storedRes.then((stored) => checkPin(stored, pin))
    }
    return checkPin(storedRes, pin)
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

  function setPin(pin: string | null): void | Promise<void> {
    const unlockedRes = isUnlocked()
    if (unlockedRes instanceof Promise) {
      return unlockedRes.then((unlocked) => {
        const setRes = pinSet()
        if (setRes instanceof Promise) {
          return setRes.then((set) => {
            if (set && !unlocked) throw new AppError('LOCKED', 'Unlock with the current PIN first')
            return doSetPin(pin)
          })
        }
        if (setRes && !unlocked) throw new AppError('LOCKED', 'Unlock with the current PIN first')
        return doSetPin(pin)
      })
    }
    const isSet = pinSet()
    if (isSet instanceof Promise) {
      return isSet.then((set) => {
        if (set && !unlockedRes) throw new AppError('LOCKED', 'Unlock with the current PIN first')
        return doSetPin(pin)
      })
    }
    if (isSet && !unlockedRes) throw new AppError('LOCKED', 'Unlock with the current PIN first')
    return doSetPin(pin)
  }

  function doSetPin(pin: string | null): void | Promise<void> {
    if (pin === null) {
      return removePin()
    }
    if (!/^\d{4,8}$/.test(pin)) throw invalid('PIN must be 4–8 digits')
    const salt = randomBytes(16)
    const setRes = settings.setRaw(KEY_PIN, `${salt.toString('hex')}:${hashPin(pin, salt).toString('hex')}`)
    unlockedUntilMs = Date.now() + UNLOCK_WINDOW_MS
    if (setRes instanceof Promise) return setRes.then(() => {})
  }

  function removePin(): void | Promise<void> {
    const delRes = settings.deleteRaw(KEY_PIN)
    unlockedUntilMs = 0
    if (delRes instanceof Promise) return delRes.then(() => {})
  }

  function lock(): void {
    unlockedUntilMs = 0
  }

  function assertUnlocked(): void | Promise<void> {
    const unlockedRes = isUnlocked()
    if (unlockedRes instanceof Promise) {
      return unlockedRes.then((unlocked) => {
        if (!unlocked) throw new AppError('LOCKED', 'Parental lock is on — enter the PIN first')
        const setRes = pinSet()
        if (setRes instanceof Promise) {
          return setRes.then((set) => {
            if (set) unlockedUntilMs = Date.now() + UNLOCK_WINDOW_MS
          })
        }
        if (setRes) unlockedUntilMs = Date.now() + UNLOCK_WINDOW_MS
      })
    }
    if (!unlockedRes) throw new AppError('LOCKED', 'Parental lock is on — enter the PIN first')
    const setRes = pinSet()
    if (setRes instanceof Promise) {
      return setRes.then((set) => {
        if (set) unlockedUntilMs = Date.now() + UNLOCK_WINDOW_MS
      })
    }
    if (setRes) unlockedUntilMs = Date.now() + UNLOCK_WINDOW_MS
  }

  return { pinSet, isUnlocked, verifyPin, setPin, lock, assertUnlocked }
}

export type AuthService = ReturnType<typeof createAuthService>
