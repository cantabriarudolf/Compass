/** @vitest-environment node */
/**
 * Guardián de los comentarios de `prisma/schema.prisma` (decisión 8 del informe).
 *
 * La auditoría `odd/auditorias/catalogos-y-estados.md` cerró con una pregunta que
 * nadie había contestado: «¿se quiere un guardián automático que compare las tuplas
 * de `lib/` con los comentarios de `prisma/schema.prisma`? Hoy no existe ninguno:
 * ningún test lo hace».
 *
 * Sin guardián, el comentario de una columna es la única documentación del
 * vocabulario que ve quien abre la base — y puede mentir para siempre: decir
 * `abierto | aprobado | rechazado` cuando el catálogo ya tiene un cuarto valor, o
 * nombrar una constante que se renombró.
 *
 * La convención es `// NOMBRE (lib/schemas.ts)` y, opcionalmente, los valores:
 * `// NOMBRE (lib/schemas.ts): a | b | c`. Este test resuelve cada nombre contra el
 * módulo de esquemas y compara los valores. Un comentario que nombra algo
 * inexistente, o que lista valores distintos de la tupla, se cae acá.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import * as esquemas from "@/lib/schemas"

const RUTA = join(process.cwd(), "prisma/schema.prisma")
const PATRON = /([A-Z][A-Z0-9_]{4,})\s*\(lib\/schemas\.ts\)(?::\s*([a-z_]+(?:\s*\|\s*[a-z_]+)*))?/g

/** Los comentarios que declaran un vocabulario, con la lista que anuncian (si la traen). */
function comentarios(): Array<{ nombre: string; linea: number; valores: string[] }> {
  const texto = readFileSync(RUTA, "utf8")
  const salida: Array<{ nombre: string; linea: number; valores: string[] }> = []
  texto.split("\n").forEach((linea, i) => {
    PATRON.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = PATRON.exec(linea)) !== null) {
      const nombre = m[1] ?? ""
      salida.push({
        nombre,
        linea: i + 1,
        valores: m[2] ? m[2].split("|").map((v) => v.trim()) : [],
      })
    }
  })
  return salida
}

describe("prisma/schema.prisma — los comentarios no mienten", () => {
  it("el barrido encuentra los comentarios (si no, el guardián se apagó solo)", () => {
    const encontrados = comentarios()
    // Si alguien borra la convención de los comentarios, este test tiene que avisar.
    expect(encontrados.length).toBeGreaterThanOrEqual(6)
  })

  it("cada nombre existe en el módulo de esquemas", () => {
    const rotos = comentarios()
      .filter((c) => (esquemas as Record<string, unknown>)[c.nombre] === undefined)
      .map((c) => `${RUTA}:${c.linea} nombra ${c.nombre}, que no existe en lib/schemas.ts`)
    expect(rotos).toEqual([])
  })

  it("los valores que anuncia cada comentario son los de su tupla", () => {
    const discrepancias: string[] = []
    for (const c of comentarios()) {
      if (c.valores.length === 0) continue
      const tupla = (esquemas as Record<string, unknown>)[c.nombre]
      if (!Array.isArray(tupla)) continue
      const reales = [...(tupla as readonly string[])].sort()
      const anunciados = [...c.valores].sort()
      if (JSON.stringify(reales) !== JSON.stringify(anunciados)) {
        discrepancias.push(
          `${RUTA}:${c.linea} anuncia ${anunciados.join("|")} y la tupla es ${reales.join("|")}`
        )
      }
    }
    expect(discrepancias).toEqual([])
  })
})
