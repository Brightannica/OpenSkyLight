import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { SettingsService } from '../services/settingsService'

const STORE_KEY = 'companion.tokens.v1'
/** Oldest pairings are pruned past this — a household has nowhere near 20 phones. */
const MAX_TOKENS = 20

/**
 * Pairing tokens for the companion web app. Only sha256 hashes are stored
 * (the PIN pattern); the plaintext token exists once, inside the QR URL the
 * parent scans. A 256-bit random token needs no stretching — sha256 +
 * timingSafeEqual is the right tool here, scrypt is for low-entropy PINs.
 */
export function createCompanionTokens(settings: Pick<SettingsService, 'getRawSync' | 'setRawSync' | 'deleteRawSync'>) {
  function readHashes(): string[] {
    const raw = settings.getRawSync(STORE_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((h) => typeof h === 'string') : []
    } catch {
      return []
    }
  }

  const hashOf = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex')

  /** Mint a new token; returns the plaintext exactly once. Older pairings stay valid. */
  function issue(): string {
    const token = randomBytes(32).toString('base64url')
    const hashes = [...readHashes(), hashOf(token)].slice(-MAX_TOKENS)
    settings.setRawSync(STORE_KEY, JSON.stringify(hashes))
    return token
  }

  function verify(token: string): boolean {
    if (typeof token !== 'string' || token.length === 0 || token.length > 128) return false
    const candidate = Buffer.from(hashOf(token), 'hex')
    let valid = false
    for (const stored of readHashes()) {
      const buf = Buffer.from(stored, 'hex')
      if (buf.length === candidate.length && timingSafeEqual(buf, candidate)) valid = true
    }
    return valid
  }

  function revokeAll(): void {
    settings.deleteRawSync(STORE_KEY)
  }

  function count(): number {
    return readHashes().length
  }

  return { issue, verify, revokeAll, count }
}

export type CompanionTokens = ReturnType<typeof createCompanionTokens>
