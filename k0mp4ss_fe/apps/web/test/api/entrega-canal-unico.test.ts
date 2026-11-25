/**
 * @vitest-environment node
 *
 * S2 de `odd/tasks/un-camino-de-entrega.md` — «el canal se declara, no se
 * hereda»: ningún módulo escribe su `Notificacion` por su cuenta, así que
 * ninguna fila nace del `@default("email_simulado")` de Prisma ni se salta la
 * constancia de entrega del puente (`lib/entrega/notificar.ts`).
 *
 * Por qué un barrido de fuentes: la regla es sobre la FORMA del código, no sobre
 * un desenlace observable. Mientras un módulo tenga su `prisma.notificacion.create`
 * inline, el canal puede volver a heredarse y la entrega puede volver a perderse
 * sin que ninguna aserción de comportamiento lo note. Es el mismo criterio con el
 * que el repo guarda otras convenciones (`test/qa-dev-retiro.test.ts`,
 * `test/componentes/sin-store.ts`).
 *
 * Alcance: las tres superficies de T3 que nunca mandaban correo —PE, leads del
 * portal y adelantos de PL—. Las demás rutas migradas por T2 ya están cubiertas
 * por sus propios tests de comportamiento.
 */
import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const RAIZ = path.resolve(__dirname, "../..")

/** Superficies que deben pasar por el puente (T3). */
const SUPERFICIES = ["app/api/pe", "app/api/leads-portal", "app/api/liquidaciones"]

/**
 * La escritura que el puente prohíbe fuera de él. `upsert` incluido: la regla de
 * S1 nombra las dos formas, y un upsert heredaría el canal igual que un create.
 */
const RE_ESCRITURA_INLINE = /\.notificacion\s*\.\s*(create|upsert)\s*\(/

/** Todas las fuentes TypeScript bajo un directorio, recursivo. */
function fuentes(relativa: string): string[] {
  return readdirSync(path.join(RAIZ, relativa), {
    encoding: "utf8",
    recursive: true,
  })
    .map((entrada) => path.join(RAIZ, relativa, entrada))
    .filter((ruta) => ruta.endsWith(".ts") || ruta.endsWith(".tsx"))
}

describe("S2 — el canal del aviso se declara en el puente, no en cada módulo", () => {
  it.each(SUPERFICIES)("%s no escribe Notificacion por su cuenta", (relativa) => {
    const archivos = fuentes(relativa)
    // El barrido no puede pasar por vacío: si la ruta deja de existir, esto
    // falla en vez de quedarse con cero archivos revisados.
    expect(archivos.length, `${relativa} no tiene fuentes que revisar`).toBeGreaterThan(0)

    const infractores = archivos.filter((ruta) =>
      RE_ESCRITURA_INLINE.test(readFileSync(ruta, "utf8"))
    )
    expect(
      infractores.map((ruta) => path.relative(RAIZ, ruta)),
      "escriben Notificacion sin pasar por lib/entrega/notificar.ts"
    ).toEqual([])
  })

  it("las cinco rutas de T3 llaman a `avisar` (el puente) y no al `create` inline", () => {
    const sitios = [
      "app/api/leads-portal/route.ts",
      "app/api/pe/_visitas.ts",
      "app/api/pe/encomiendas/route.ts",
      "app/api/pe/proyecciones/enviar/route.ts",
      "app/api/liquidaciones/adelantos/route.ts",
    ]
    for (const relativa of sitios) {
      const fuente = readFileSync(path.join(RAIZ, relativa), "utf8")
      expect(fuente, `${relativa} no llama a avisar()`).toContain("avisar(")
      expect(
        RE_ESCRITURA_INLINE.test(fuente),
        `${relativa} todavía escribe su Notificacion inline`
      ).toBe(false)
    }
  })
})
