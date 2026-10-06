import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Google provider prod guard', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('throws in production when GOOGLE_CLIENT_ID is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('GOOGLE_CLIENT_ID', '')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret')
    await expect(import('@/lib/auth')).rejects.toThrow(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production'
    )
  })

  it('throws in production when GOOGLE_CLIENT_SECRET is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('GOOGLE_CLIENT_ID', 'id')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
    await expect(import('@/lib/auth')).rejects.toThrow(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production'
    )
  })

  it('does not throw in production when both are present', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('GOOGLE_CLIENT_ID', 'abc.apps.googleusercontent.com')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret123')
    await expect(import('@/lib/auth')).resolves.toBeDefined()
  })

  it('does not throw in development when both are missing', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('GOOGLE_CLIENT_ID', '')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
    await expect(import('@/lib/auth')).resolves.toBeDefined()
  })

  it('does not throw in test when both are missing', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('GOOGLE_CLIENT_ID', '')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
    await expect(import('@/lib/auth')).resolves.toBeDefined()
  })
})