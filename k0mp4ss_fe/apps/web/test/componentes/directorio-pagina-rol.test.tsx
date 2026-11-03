// @vitest-environment jsdom
/**
 * /comunidad/directorio — el portón del servidor, por rol.
 *
 * El portón de la PÁGINA nunca fue el defecto: se decide con `pe:directorio` ver,
 * que los cinco roles tienen. El defecto estaba en los datos (se leían del
 * maestro administrativo con `mp`). Como este trabajo cambia de dónde lee el
 * panel, lo que se afirma acá es que el portón no se movió ni se aflojó:
 * - sin sesión, redirige a /ingresar;
 * - con sesión pero sin `pe:directorio` (rol fuera de la matriz), a /dashboard;
 * - los cinco roles del permiso abren la página.
 */
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

// La página es un server component de Next 16 (JSX con runtime automático) y no
// importa React: en vitest el transform es clásico y busca el global `React`. Se
// expone el global antes de importar la página para poder invocarla como función.
;(globalThis as unknown as { React: typeof React }).React = React

const estado = vi.hoisted(() => ({ roles: [] as string[] }))

vi.mock("@/lib/auth", () => ({
  auth: () =>
    Promise.resolve(
      estado.roles.length > 0
        ? { user: { id: "dir-emerg-pagina-usuario", roles: estado.roles } }
        : null
    ),
}))

vi.mock("@/app/comunidad/directorio/panel-directorio", () => ({
  DirectorioPanel: () => null,
}))

const { default: DirectorioPage } = await import("@/app/comunidad/directorio/page")

/** Digest del redirect de Next, o null si la página simplemente renderizó. */
async function destino(): Promise<string | null> {
  try {
    await DirectorioPage()
    return null
  } catch (e) {
    return (e as Error & { digest?: string }).digest ?? ""
  }
}

afterEach(() => {
  estado.roles = []
})

describe("portón de /comunidad/directorio", () => {
  it("sin sesión manda a /ingresar", async () => {
    estado.roles = []
    const digest = await destino()
    expect(digest).toContain("NEXT_REDIRECT")
    expect(digest).toContain("/ingresar")
  })

  it("con sesión pero sin el permiso manda a /dashboard", async () => {
    // "invitado" no existe en la matriz: menor privilegio, todo denegado.
    estado.roles = ["invitado"]
    const digest = await destino()
    expect(digest).toContain("NEXT_REDIRECT")
    expect(digest).toContain("/dashboard")
  })

  it("los cinco roles del permiso abren la página", async () => {
    for (const rol of ["residente", "conserjeria", "mantencion", "comite", "administrador"]) {
      estado.roles = [rol]
      expect(await destino(), rol).toBeNull()
    }
  })
})
