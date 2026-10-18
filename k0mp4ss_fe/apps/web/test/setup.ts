import "@testing-library/jest-dom/vitest"
// La base de la suite se resuelve ACÁ antes que nada (y antes de cualquier import de
// `@/lib/prisma`): base descartable por defecto + guarda dura contra `prisma/dev.db`.
// Ver openspec/changes/test-db-descartable/ y test/db-descartable.setup.ts.
import "./db-descartable.setup"
import { beforeAll, afterAll, afterEach, beforeEach } from "vitest"
import { setupServer } from "msw/node"

// P5 (AU §3): NextAuth() captura AUTH_SECRET al cargar el módulo; se fija un
// default para tests antes de cualquier import de lib/auth o proxy.
process.env.AUTH_SECRET ??= "test-secret-12345678"

export const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

beforeEach(() => {
  if (typeof window !== "undefined" && window.localStorage)
    window.localStorage.clear()
})
