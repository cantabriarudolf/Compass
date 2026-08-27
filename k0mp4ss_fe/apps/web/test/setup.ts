import "@testing-library/jest-dom/vitest"
import { beforeAll, afterAll, afterEach, beforeEach } from "vitest"
import { setupServer } from "msw/node"
import path from "node:path"

// B3: asegura DATABASE_URL para tests que tocan prisma (endpoint authz)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${path.resolve(__dirname, "../prisma/dev.db")}`
}

export const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

beforeEach(() => {
  if (typeof window !== "undefined" && window.localStorage) window.localStorage.clear()
})
