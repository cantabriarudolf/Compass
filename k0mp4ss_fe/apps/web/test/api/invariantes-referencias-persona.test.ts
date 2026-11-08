/**
 * @vitest-environment node
 *
 * Invariante de las referencias de persona (2026-11-07).
 *
 * El proyecto referencia a una persona por id en muchas columnas y **ninguna lleva FK**:
 * es una convención deliberada (no atar el orden del sembrado —`seed:authz` corre antes
 * de `seed:datos` y escribe `personaId: "p-5"` hardcodeado— ni acoplar los módulos). La
 * contrapartida es que la base no impide dejar una referencia colgando, y una cuenta
 * apuntando al vacío no falla: sigue logueándose y el alcance por fila le niega todo en
 * silencio.
 *
 * Esta es la red que la FK daría, sin migración. **La lista de columnas NO se escribe a
 * mano**: se deriva del schema en cada corrida (toda columna `*personaId`, escalar o JSON),
 * así una columna nueva entra sola y la invariante no puede quedar vieja. Si una fila
 * apunta a una persona que no existe, la suite lo dice el mismo día con tabla, columna,
 * id y valor.
 *
 * No reemplaza a la guarda del DELETE de personas (`app/api/personas/[id]/route.ts`), que
 * impide CREAR ese estado: esto detecta el que ya exista, venga de donde venga.
 */
import { describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"

interface Referencia {
  tabla: string
  columna: string
  tipo?: string
}

/**
 * El catálogo es distinto en cada motor y la suite corre contra los dos: SQLite en
 * dev y en el job `unit`, PostgreSQL en `unit-pg`. La invariante tiene que valer en
 * ambos o no es una invariante del sistema, es una del archivo.
 */
const EN_POSTGRES = (process.env.DATABASE_URL ?? "").startsWith("postgres")

async function columnasDePersona(): Promise<Referencia[]> {
  if (EN_POSTGRES) {
    return prisma.$queryRaw<Referencia[]>`
      SELECT table_name AS tabla, column_name AS columna, data_type AS tipo
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (column_name LIKE '%personaId' OR column_name LIKE '%PersonaId')
      ORDER BY table_name, column_name
    `
  }
  const filas = await prisma.$queryRaw<Array<{ tabla: string; columna: string }>>`
    SELECT m.name AS tabla, p.name AS columna
    FROM sqlite_master m
    JOIN pragma_table_info(m.name) p
    WHERE m.type = 'table'
      AND m.name NOT LIKE 'sqlite_%'
      AND m.name NOT LIKE '_prisma%'
      AND (p.name LIKE '%personaId' OR p.name LIKE '%PersonaId')
    ORDER BY m.name, p.name
  `
  return filas.map((f) => ({ ...f, tipo: "text" }))
}

/**
 * Una fila rota es la que tiene la columna cargada y su valor (o alguno de sus elementos,
 * si la columna es un JSON de ids) no existe en `personas`. Se resuelve en SQL porque lo
 * que se verifica es justamente lo que el ORM no modela: no hay `@relation`.
 */
async function filasRotas(ref: Referencia): Promise<Array<{ id: string; valor: string }>> {
  const tipo = (ref.tipo ?? "").toLowerCase()
  if (EN_POSTGRES) {
    // PostgreSQL tipa TODAS las ramas de un `CASE`, aunque no se ejecuten: con una
    // columna jsonb, la rama escalar intentaba `text = jsonb` y la consulta moría con
    // «operator does not exist» (lo cazó `unit-pg`). Por eso acá no hay CASE: se arma
    // UNA expresión según la forma real de la columna.
    const condicion = tipo.includes("json")
      ? `EXISTS (SELECT 1 FROM jsonb_array_elements_text(t."${ref.columna}"::jsonb) AS je(v)
                  WHERE je.v IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM personas p WHERE p.id = je.v))`
      : tipo === "array"
        ? `EXISTS (SELECT 1 FROM unnest(t."${ref.columna}") AS v
                    WHERE v IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM personas p WHERE p.id = v))`
        : `NOT EXISTS (SELECT 1 FROM personas p WHERE p.id = t."${ref.columna}")`
    return prisma.$queryRawUnsafe<Array<{ id: string; valor: string }>>(
      `SELECT t.id::text AS id, t."${ref.columna}"::text AS valor
         FROM "${ref.tabla}" t
        WHERE t."${ref.columna}" IS NOT NULL
          AND ${condicion}
        LIMIT 5`
    )
  }
  return prisma.$queryRawUnsafe<Array<{ id: string; valor: string }>>(
    `SELECT t.id AS id, t."${ref.columna}" AS valor
       FROM "${ref.tabla}" t
      WHERE t."${ref.columna}" IS NOT NULL
        AND (
          CASE WHEN substr(trim(t."${ref.columna}"), 1, 1) = '['
            THEN EXISTS (
              SELECT 1 FROM json_each(t."${ref.columna}") je
               WHERE je.value IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM personas p WHERE p.id = je.value)
            )
            ELSE NOT EXISTS (SELECT 1 FROM personas p WHERE p.id = t."${ref.columna}")
          END
        )
      LIMIT 5`
  )
}

describe("invariante — ninguna referencia de persona apunta al vacío", () => {
  it("el schema tiene columnas de persona (si no, la invariante se apagó sola)", async () => {
    expect((await columnasDePersona()).length).toBeGreaterThan(5)
  })

  it("cada columna de persona del schema resuelve a una persona existente", async () => {
    const columnas = await columnasDePersona()
    const rotas: string[] = []
    for (const ref of columnas) {
      for (const fila of await filasRotas(ref)) {
        rotas.push(`  ${ref.tabla}.${ref.columna}: ${fila.id} → ${String(fila.valor).slice(0, 60)}`)
      }
    }
    expect(
      rotas,
      rotas.length === 0
        ? ""
        : "Referencia(s) de persona apuntando al vacío. La base no tiene FK a propósito " +
          "(convención del proyecto), así que la guarda vive en el alta y el borrado; estas " +
          "filas quedaron de un camino que no la respetó:\n" +
          rotas.join("\n") +
          "\n"
    ).toEqual([])
  })
})
