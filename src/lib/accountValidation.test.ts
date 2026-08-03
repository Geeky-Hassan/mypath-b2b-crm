import { describe, expect, it, vi } from 'vitest'
import { generateTemporaryPassword, temporaryPasswordSchema } from './accountValidation'

describe('temporary password policy', () => {
  it('requires length and mixed character classes', () => {
    expect(temporaryPasswordSchema.safeParse('short').success).toBe(false)
    expect(temporaryPasswordSchema.safeParse('A-secure-passphrase1').success).toBe(true)
  })

  it('generates a password that meets the same policy', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) })
    expect(temporaryPasswordSchema.safeParse(generateTemporaryPassword()).success).toBe(
      true,
    )
    vi.unstubAllGlobals()
  })
})
