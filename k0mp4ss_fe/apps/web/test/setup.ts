import "@testing-library/jest-dom/vitest"
import { beforeAll, afterAll, afterEach, beforeEach } from "vitest"
import { setupServer } from "msw/node"
import path from "node:path"

// B3: asegura DATABASE_URL para tests que tocan prisma (endpoint authz)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${path.resolve(__dirname, "../prisma/dev.db")}`
}

// P5 (AU §3): NextAuth() captura AUTH_SECRET al cargar el módulo; se fija un
// default para tests antes de cualquier import de lib/auth o proxy.
process.env.AUTH_SECRET ??= "test-secret-12345678"

export const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

beforeEach(() => {
  if (typeof window !== "undefined" && window.localStorage) window.localStorage.clear()
})
