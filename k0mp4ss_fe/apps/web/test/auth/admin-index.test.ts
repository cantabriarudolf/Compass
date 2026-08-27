import { describe, expect, it } from "vitest"
import AdminIndexPage from "@/app/admin/page"

describe("GET /admin (index) — destino post-login", () => {
  it("redirige a /admin/gestion en vez de 404 (regresión flujo de sesión)", async () => {
    let digest: string | undefined
    try {
      await AdminIndexPage()
    } catch (e) {
      digest = (e as Error & { digest?: string }).digest
    }
    expect(digest).toContain("NEXT_REDIRECT")
    expect(digest).toContain("/admin/gestion")
  })
})
