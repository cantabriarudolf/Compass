/**
 * @vitest-environment node
 *
 * `e2e:limpiar` contra los dos motores — la herramienta existía y apuntaba a la casa de al
 * lado: 32 reglas bien pensadas, pero atadas a SQLite local mientras el dev y producción
 * corren Postgres. Resultado medido: el debris de producción (`QA-` en fondos, «Persona QA
 * Uno» en egresos) se borró a mano porque la purga abortaba en cuanto la URL no era
 * `file:…`. Este archivo fija el contrato que faltaba:
 *
 *   1. El motor sale del `DATABASE_URL` resuelto, nunca de un flag, y la salida dice motor
 *      y destino sin imprimir la cadena de conexión ni el usuario.
 *   2. El dry-run sigue siendo el modo por defecto: informa y no borra. `--apply` borra
 *      exactamente lo anunciado, y la allowlist (las 6 cuentas de login y las comunidades
 *      demo, cuyo nombre lleva «TEST») sobrevive.
 *   3. La diferencia entre motores se resuelve en UNA capa: `LIKE`→`ILIKE`, `?`→`$n` y los
 *      identificadores con mayúsculas entre comillas (Postgres los pliega a minúsculas si
 *      no se citan). Se verifica sobre todas las reglas, no sobre una muestra.
 *   4. Los comodines reclaman el mismo conjunto de filas: el `LIKE` nativo de SQLite contra
 *      la forma insensible a mayúsculas que produce `ILIKE`, con las dos grafías que los
 *      specs dejan (`QA-`/`Qa-`, `TEST-`/`Test-`).
 *
 * Por qué los casos con base se guardan por motor: la suite genera el cliente SQLite
 * (`pretest`) y un cliente Prisma no sirve a los dos motores; en el carril Postgres el
 * cliente es `postgresql` y rechaza una URL `file:`. Mismo guardia que
 * `test/lib/limpiar-e2e-reglas.test.ts` y `test/api/cobro-lineas.test.ts`.
 */
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { PrismaClient } from "@prisma/client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  DESTINOS,
  REGLAS,
  adaptarSql,
  cabeceraDePurga,
  evaluarDestino,
  motorDeUrl,
  paramsDe,
  sqlDeBorrado,
  sqlDeCuenta,
} from "../scripts/limpiar-e2e.mjs"
import { DESTINO_BASE } from "./db-descartable.setup"

const APP_DIR = path.resolve(__dirname, "..")
const SCRIPT = path.join(APP_DIR, "scripts", "limpiar-e2e.mjs")
const PRISMA_DIR = path.join(APP_DIR, "prisma")

/** La base de los casos es SQLite: en el carril Postgres el cliente generado es otro. */
const ES_SQLITE = DESTINO_BASE.archivo !== null

/** URL gestionada de mentira: alcanza para decidir el motor y nunca se conecta. */
const URL_GESTIONADA =
  "postgresql://vecino:clave-secreta@ep-dev-123.us-east-1.aws.neon.tech/neondb?sslmode=require"

/* ------------------------------------------------------------------ *
 * El motor y el destino
 * ------------------------------------------------------------------ */

describe("e2e:limpiar — el motor lo decide el DATABASE_URL", () => {
  it("reconoce SQLite y Postgres por el protocolo de la URL resuelta", () => {
    expect(motorDeUrl("file:./dev.db")).toBe("sqlite")
    expect(motorDeUrl(`file:${path.join(PRISMA_DIR, "perf-test.db")}`)).toBe("sqlite")
    expect(motorDeUrl("postgresql://usuario:clave@host/db")).toBe("postgres")
    expect(motorDeUrl("postgres://usuario:clave@host/db")).toBe("postgres")
    expect(motorDeUrl("mysql://usuario:clave@host/db")).toBeNull()
    expect(motorDeUrl("")).toBeNull()
  })

  it("la salida dice motor y destino sin imprimir la cadena de conexión ni el usuario", () => {
    // El ejemplo del contrato: el dry-run anuncia el motor y la rama.
    expect(cabeceraDePurga({ modo: "dry-run", motor: "postgres", destino: "dev" })).toBe(
      "e2e:limpiar — modo: dry-run · motor: postgres · destino: rama dev"
    )
    expect(cabeceraDePurga({ modo: "aplicar", motor: "postgres", destino: "produccion" })).toBe(
      "e2e:limpiar — modo: aplicar · motor: postgres · destino: rama produccion"
    )
    // Sin destino declarado el dry-run corre igual (no borra) y lo dice.
    expect(cabeceraDePurga({ modo: "dry-run", motor: "postgres", destino: null })).toBe(
      "e2e:limpiar — modo: dry-run · motor: postgres · destino: sin declarar"
    )
    // SQLite local no necesita declaración: la ruta del archivo ES el destino.
    expect(
      cabeceraDePurga({
        modo: "dry-run",
        motor: "sqlite",
        dbPath: path.join(PRISMA_DIR, "dev.db"),
      })
    ).toBe(
      `e2e:limpiar — modo: dry-run · motor: sqlite · destino: SQLite local (${path.join("prisma", "dev.db")})`
    )

    for (const destino of Object.keys(DESTINOS)) {
      const linea = cabeceraDePurga({ modo: "aplicar", motor: "postgres", destino })
      expect(linea).not.toContain("postgresql://")
      expect(linea).not.toContain("vecino")
      expect(linea).not.toContain("clave-secreta")
    }
  })
})

describe("e2e:limpiar — el destino que se puede tocar", () => {
  it("un SQLite local sigue borrando con sólo --apply", () => {
    const veredicto = evaluarDestino({ databaseUrl: "file:./dev.db", aplicar: true })
    expect(veredicto.ok).toBe(true)
    expect(veredicto.motor).toBe("sqlite")
    expect(veredicto.destino).toBe("local")
    expect(veredicto.dbPath).toBe(path.join(PRISMA_DIR, "dev.db"))
  })

  it("--apply sin destino no puede borrar en una base gestionada", () => {
    const veredicto = evaluarDestino({ databaseUrl: URL_GESTIONADA, aplicar: true })
    expect(veredicto.ok).toBe(false)
    expect(String(veredicto.motivo)).toContain("--destino")
    expect(String(veredicto.motivo)).not.toContain("clave-secreta")
  })

  it("el dry-run sobre una base gestionada corre sin destino declarado y no borra", () => {
    expect(evaluarDestino({ databaseUrl: URL_GESTIONADA })).toMatchObject({
      ok: true,
      motor: "postgres",
      destino: null,
    })
  })

  it("declarar el destino habilita el borrado y tiene que coincidir con el motor", () => {
    expect(
      evaluarDestino({ databaseUrl: URL_GESTIONADA, destino: "dev", aplicar: true })
    ).toMatchObject({ ok: true, motor: "postgres", destino: "dev" })
    expect(
      evaluarDestino({ databaseUrl: URL_GESTIONADA, destino: "produccion", aplicar: true })
    ).toMatchObject({ ok: true, motor: "postgres", destino: "produccion" })

    // Un destino de otro motor es un error de tipeo, no una autorización.
    expect(evaluarDestino({ databaseUrl: URL_GESTIONADA, destino: "local" }).ok).toBe(false)
    expect(evaluarDestino({ databaseUrl: "file:./dev.db", destino: "dev" }).ok).toBe(false)

    const desconocido = evaluarDestino({ databaseUrl: "file:./dev.db", destino: "staging" })
    expect(desconocido.ok).toBe(false)
    expect(String(desconocido.motivo)).toContain("local, dev, produccion")
  })

  it("rechaza el entorno de producción y una URL inservible, sin repetir el valor", () => {
    expect(evaluarDestino({ databaseUrl: "file:./dev.db", appEnv: "production" }).ok).toBe(false)
    expect(evaluarDestino({ databaseUrl: "file:./dev.db", nodeEnv: "production" }).ok).toBe(false)
    expect(evaluarDestino({}).ok).toBe(false)

    const rota = evaluarDestino({
      databaseUrl: "file:./dev.db DATABASE_URL=postgresql://vecino:clave-secreta@host/db",
    })
    expect(rota.ok).toBe(false)
    expect(String(rota.motivo)).not.toContain("vecino")
    expect(String(rota.motivo)).not.toContain("clave-secreta")
  })
})

/* ------------------------------------------------------------------ *
 * La capa que adapta los motores (sin base)
 * ------------------------------------------------------------------ */

/** Palabras clave del SQL que escribe la purga: no son identificadores. */
const CLAVES = new Set([
  "select",
  "count",
  "from",
  "where",
  "and",
  "or",
  "not",
  "in",
  "exists",
  "as",
  "delete",
  "like",
  "ilike",
  "is",
  "null",
  "order",
  "by",
])

/**
 * Identificadores sin comillas del SQL, leyendo el texto como lo hace el motor: lo que está
 * entre `'…'` es literal y lo que está entre `"…"` ya está citado, así que no se devuelve.
 * Es un lector independiente del que usa el script a propósito: si los dos se equivocan
 * igual, la prueba no sirve.
 */
function identificadoresDesnudos(sql: string): string[] {
  const encontrados: string[] = []
  let i = 0
  while (i < sql.length) {
    const actual = sql.charAt(i)
    if (actual === "'" || actual === '"') {
      const cierre = actual
      i++
      while (i < sql.length) {
        if (sql.charAt(i) !== cierre) {
          i++
          continue
        }
        // Comilla escapada ('' o ""): sigue adentro del literal o del identificador.
        if (sql.charAt(i + 1) === cierre) {
          i += 2
          continue
        }
        i++
        break
      }
      continue
    }
    if (/[A-Za-z_]/.test(actual)) {
      let j = i
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql.charAt(j))) j++
      const palabra = sql.slice(i, j)
      if (!CLAVES.has(palabra.toLowerCase())) encontrados.push(palabra)
      i = j
      continue
    }
    i++
  }
  return encontrados
}

/** Deshace la traducción a Postgres para comparar contra la forma base (SQLite). */
function volverASqlite(sql: string): string {
  return sql
    .replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, "$1")
    .replace(/\bILIKE\b/g, "LIKE")
    .replace(/\$(\d+)/g, "?")
}

describe("e2e:limpiar — una sola capa adapta los motores", () => {
  it("traduce LIKE→ILIKE, ?→$n y cita los identificadores con mayúsculas", () => {
    expect(
      adaptarSql(`SELECT COUNT(*) AS n FROM Comunidad WHERE id IN (?)`, "postgres")
    ).toBe(`SELECT COUNT(*) AS n FROM "Comunidad" WHERE id IN ($1)`)

    expect(
      adaptarSql(`SELECT COUNT(*) AS n FROM personas WHERE id NOT LIKE ?`, "postgres")
    ).toBe(`SELECT COUNT(*) AS n FROM personas WHERE id NOT ILIKE $1`)

    // El literal no se toca: ahí vive el nombre de la acción de auditoría.
    expect(
      adaptarSql(
        `SELECT 1 FROM eventos_auditoria WHERE tipoAccion = 'PE_ENCOMIENDA_RECIBIDA' AND referenciaId LIKE ?`,
        "postgres"
      )
    ).toBe(
      `SELECT 1 FROM eventos_auditoria WHERE "tipoAccion" = 'PE_ENCOMIENDA_RECIBIDA' AND "referenciaId" ILIKE $1`
    )

    // SQLite es la forma base: la capa no reescribe nada.
    const base = `SELECT COUNT(*) AS n FROM avisos_cv WHERE (titulo LIKE ?)`
    expect(adaptarSql(base, "sqlite")).toBe(base)
  })

  it("las 32 reglas quedan portables: mismo predicado, sólo cambia lo que el motor exige", () => {
    // La tabla publicada tiene 32 reglas y el caso fija ese número: si alguien pierde una
    // (o la reemplaza por un barrido más ancho) el cambio se ve acá.
    expect(REGLAS).toHaveLength(32)

    for (const regla of REGLAS) {
      const parametros = paramsDe(regla) as string[]
      const ambos: Array<[string, string]> = [
        [sqlDeCuenta(regla), sqlDeCuenta(regla, "postgres")],
        [sqlDeBorrado(regla), sqlDeBorrado(regla, "postgres")],
      ]

      for (const [base, enPostgres] of ambos) {
        expect(base).not.toContain("$")
        expect((base.match(/\?/g) ?? []).length).toBe(parametros.length)

        // `\bLIKE\b` no matchea dentro de ILIKE: sólo queda el comodín indicado.
        expect(enPostgres).not.toMatch(/\bLIKE\b/)
        expect(enPostgres).not.toContain("?")
        expect((enPostgres.match(/\$\d+/g) ?? []).length).toBe(parametros.length)
        // Postgres pliega a minúsculas todo identificador sin comillas: uno con mayúsculas
        // (`Comunidad`, `elementoId`) sin citar no existe para el motor.
        expect(identificadoresDesnudos(enPostgres).filter((p) => /[A-Z]/.test(p))).toEqual([])
        // …y la traducción no cambia nada más: el resto del predicado es el mismo.
        expect(volverASqlite(enPostgres)).toBe(base)
      }
    }
  })
})

/* ------------------------------------------------------------------ *
 * Los comodines: mismo conjunto de filas
 * ------------------------------------------------------------------ */

/**
 * Valores con las dos grafías que aparecen en la base: el debris de los specs (`QA`,
 * `Qa-`, `TEST-`, `Test-`) y las filas legítimas del seed (`Quincho 1`, «Útiles de Aseo»,
 * los nombres de las comunidades demo, que llevan «TEST» y son intencionales).
 */
const MUESTRA = [
  "QA Aviso 1793706703584",
  "Qa-sala-1793",
  "qa-sala-1793",
  "QA-Fondo 1793",
  "TEST-ENCOMIENDA-1793",
  "Test-Visita 1793",
  "test-p-1793",
  "Sede QA",
  "Acta QA 1793",
  "Se revisa el contrato QA2026.",
  "Quincho 1",
  "Piscina",
  "Comunidad Los Aromos TEST",
  "Comunidad Las Palmas TEST",
  "Útiles de Aseo",
  "Tomas Catalina Alvarez Araya",
  "Tabla de prueba",
  "",
]

let db: PrismaClient
let dirTemporal = ""
let urlBase = ""

beforeAll(async () => {
  if (!ES_SQLITE) return
  dirTemporal = mkdtempSync(path.join(tmpdir(), "limpiar-e2e-pg-"))
  urlBase = `file:${path.join(dirTemporal, "purga.db")}`

  // Mismo paso que `test/db-descartable-global.setup.ts`: el schema completo, porque la
  // purga recorre todas las tablas aunque la prueba ensucie cuatro.
  const migrar = spawnSync(
    "npx",
    ["prisma", "migrate", "deploy", "--schema=prisma/schema.sqlite.prisma"],
    { cwd: APP_DIR, env: { ...process.env, DATABASE_URL: urlBase }, encoding: "utf8" }
  )
  if (migrar.error || migrar.status !== 0) {
    throw new Error(
      `limpiar-e2e-postgres: migrate deploy falló (${migrar.error?.message ?? `exit ${migrar.status}`})\n${migrar.stdout ?? ""}${migrar.stderr ?? ""}`
    )
  }

  db = new PrismaClient({ datasources: { db: { url: urlBase } } })
  const ahora = new Date().toISOString()

  // Comunidades demo del seed: el nombre lleva «TEST» y la purga NUNCA puede tocarlas.
  for (const [id, nombre, slug] of [
    ["comunidad-a", "Comunidad Los Aromos TEST", "los-aromos-test"],
    ["comunidad-b", "Comunidad Las Palmas TEST", "las-palmas-test"],
  ]) {
    await db.$executeRawUnsafe(
      `INSERT INTO "Comunidad" (id, nombre, slug, updatedAt) VALUES (?, ?, ?, ?)`,
      id,
      nombre,
      slug,
      ahora
    )
  }

  // Las 6 cuentas de login con su persona: es la allowlist dura que `--apply` verifica.
  const cuentas: Array<[string, string]> = [
    ["p-admin", "admin@test.cl"],
    ["p-comite", "comite@test.cl"],
    ["p-conserjeria", "conserjeria@test.cl"],
    ["p-residente", "residente@test.cl"],
    ["p-mantencion", "mantencion@test.cl"],
    // persona con prefijo `test-`: la regla de personas la excluye por estar vinculada a
    // una cuenta, y sigue contando para la allowlist.
    ["test-vinculada", "arrendatario@test.cl"],
  ]
  for (const [id, email] of cuentas) {
    await db.$executeRawUnsafe(
      `INSERT INTO personas (id, comunidadId, rut, nombreCompleto, nombres, apellidos, email, telefonoMovil, estadoCuenta, condicionesEspecialesIds, roles, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      "comunidad-a",
      `rut-${id}`,
      `Persona ${id}`,
      "Nombre",
      "Apellido",
      `${id}@example.com`,
      "+56900000000",
      "activa",
      "[]",
      "[]",
      ahora
    )
    await db.$executeRawUnsafe(
      `INSERT INTO usuarios (id, email, personaId, activo, updatedAt) VALUES (?, ?, ?, ?, ?)`,
      `usuario-${id}`,
      email,
      id,
      1,
      ahora
    )
  }

  // Debris de los specs: un aviso QA, un fondo QA-, un egreso «QA Egreso …» y una persona
  // test- suelta (sin cuenta). Las filas del seed viven al lado y no se tocan.
  await db.$executeRawUnsafe(
    `INSERT INTO avisos_cv (id, comunidadId, titulo, cuerpo, tipologia, duracionSegundos, pantallaCompleta, tags, estado, requiereVistoBueno, origen, fechaCreacion, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    "av-qa",
    "comunidad-a",
    "QA Aviso 1793706703584",
    "Aviso de prueba",
    "informativo",
    10,
    0,
    "[]",
    "publicado",
    0,
    "e2e",
    "2026-11-01",
    ahora,
    "av-seed",
    "comunidad-a",
    "Corte de agua programado",
    "El suministro se corta el martes.",
    "cronograma",
    10,
    0,
    "[]",
    "publicado",
    0,
    "seed",
    "2026-11-01",
    ahora
  )
  await db.$executeRawUnsafe(
    `INSERT INTO fondos_fi (id, comunidadId, nombre, tipo, activo, updatedAt) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`,
    "fi-fondo-qa",
    "comunidad-a",
    "QA-Fondo 1793",
    "general",
    1,
    ahora,
    "fi-fondo-seed",
    "comunidad-a",
    "Fondo General",
    "general",
    1,
    ahora
  )
  await db.$executeRawUnsafe(
    `INSERT INTO egresos_fi (id, comunidadId, fecha, categoria, descripcion, monto, fondoId, esRecurrente) VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)`,
    "fi-egr-qa",
    "comunidad-a",
    "2026-11-01",
    "operacion",
    "QA Egreso 1793705452267",
    1000,
    "fi-fondo-seed",
    0,
    "fi-egr-seed",
    "comunidad-a",
    "2026-11-01",
    "operacion",
    "Útiles de Aseo",
    25000,
    "fi-fondo-seed",
    0
  )
  await db.$executeRawUnsafe(
    `INSERT INTO personas (id, comunidadId, rut, nombreCompleto, nombres, apellidos, email, telefonoMovil, estadoCuenta, condicionesEspecialesIds, roles, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    "test-suelta",
    "comunidad-a",
    "rut-test-suelta",
    "Persona QA Uno",
    "Persona",
    "QA Uno",
    "test-suelta@example.com",
    "+56900000000",
    "activa",
    "[]",
    "[]",
    ahora
  )

  // Tabla de la comparación de comodines (no es de dominio: no la mira ninguna regla).
  await db.$executeRawUnsafe(`CREATE TABLE muestra (v TEXT NOT NULL)`)
  for (const valor of MUESTRA) {
    await db.$executeRawUnsafe(`INSERT INTO muestra (v) VALUES (?)`, valor)
  }
}, 120_000)

afterAll(async () => {
  if (db) await db.$disconnect()
  if (dirTemporal) rmSync(dirTemporal, { recursive: true, force: true })
})

/** Filas que devuelve una consulta de la muestra, en orden estable. */
async function conjunto(patron: string): Promise<string[]> {
  const filas = (await db.$queryRawUnsafe(
    `SELECT v FROM muestra WHERE v LIKE ? ORDER BY v`,
    patron
  )) as Array<{ v: string }>
  return filas.map((fila) => fila.v)
}

describe("e2e:limpiar — los comodines reclaman las mismas filas en los dos motores", () => {
  it.skipIf(!ES_SQLITE)(
    "cada patrón de las reglas da el mismo conjunto con LIKE y con la forma de ILIKE",
    async () => {
      const patrones = [
        ...new Set(
          REGLAS.flatMap((regla) => paramsDe(regla) as string[]).filter((p) =>
            p.includes("%")
          )
        ),
      ]
      // Las reglas usan más de un comodín: una lista vacía dejaría el caso sin medir nada.
      expect(patrones.length).toBeGreaterThan(5)

      for (const patron of patrones) {
        // `LIKE` de SQLite es insensible a mayúsculas ASCII (la forma en uso hoy);
        // `lower(v) LIKE lower(?)` es la semántica que aporta ILIKE en Postgres.
        const nativo = (await db.$queryRawUnsafe(
          `SELECT v FROM muestra WHERE v LIKE ? ORDER BY v`,
          patron
        )) as Array<{ v: string }>
        const mapeado = (await db.$queryRawUnsafe(
          `SELECT v FROM muestra WHERE lower(v) LIKE ? ORDER BY v`,
          patron.toLowerCase()
        )) as Array<{ v: string }>
        expect(mapeado.map((fila) => fila.v)).toEqual(nativo.map((fila) => fila.v))
      }

      // El caso que documenta la regla de portería: el título se normaliza a «Test-…» y el
      // patrón de la regla está en minúsculas. Si el mapeo perdiera la insensibilidad, esas
      // filas volverían a apilarse.
      expect(await conjunto("test-%")).toContain("Test-Visita 1793")
      expect(await conjunto("test-%")).toContain("TEST-ENCOMIENDA-1793")
      expect(await conjunto("QA%")).toContain("Qa-sala-1793")
      // …y la insensibilidad es real: una comparación sensible no las encontraría.
      expect(MUESTRA.filter((v) => v.startsWith("test-"))).not.toContain("Test-Visita 1793")
      // La fila legítima del seed no entra por ningún comodín de marcador.
      expect(await conjunto("QA%")).not.toContain("Comunidad Los Aromos TEST")
      expect(await conjunto("TEST%")).not.toContain("Tabla de prueba")
    }
  )
})

/* ------------------------------------------------------------------ *
 * El CLI sobre SQLite: dry-run, --apply y allowlist
 * ------------------------------------------------------------------ */

/** Corre la purga como la corre el operador (proceso aparte, DATABASE_URL explícita). */
function correrPurga(url: string, ...args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: APP_DIR,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: url,
      NEXT_PUBLIC_APP_ENV: "development",
      APP_ENV: "",
      NODE_ENV: "test",
    },
  })
}

/** Filas de una tabla del escenario. */
async function contar(tabla: string): Promise<number> {
  const filas = (await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM ${tabla}`)) as Array<{
    n: number | bigint
  }>
  return Number(filas[0]?.n ?? 0)
}

describe("e2e:limpiar — dry-run y --apply dicen lo mismo", () => {
  it.skipIf(!ES_SQLITE)(
    "el dry-run informa el motor y no borra una sola fila; --apply borra lo anunciado y respeta la allowlist",
    async () => {
      const antes = {
        avisos: await contar("avisos_cv"),
        fondos: await contar("fondos_fi"),
        egresos: await contar("egresos_fi"),
        personas: await contar("personas"),
        comunidades: await contar('"Comunidad"'),
      }

      // 1. Dry-run (modo por defecto): anuncia y no toca nada.
      const dry = correrPurga(urlBase)
      expect(dry.status).toBe(0)
      expect(dry.stdout).toContain("motor: sqlite")
      expect(dry.stdout).toMatch(/avisos_cv\s+1/)
      expect(dry.stdout).toMatch(/fondos_fi\s+1/)
      expect(dry.stdout).toMatch(/egresos_fi\s+1/)
      expect(dry.stdout).toMatch(/personas\s+1/)
      expect(dry.stdout).toContain(
        "e2e:limpiar — dry-run: 4 filas a purgar; no se borró nada (--apply para ejecutar)"
      )
      expect(dry.stdout).not.toContain("postgresql://")
      expect({
        avisos: await contar("avisos_cv"),
        fondos: await contar("fondos_fi"),
        egresos: await contar("egresos_fi"),
        personas: await contar("personas"),
        comunidades: await contar('"Comunidad"'),
      }).toEqual(antes)

      // 2. --apply: sólo lo que el dry-run anunció.
      const aplicar = correrPurga(urlBase, "--apply")
      expect(aplicar.status).toBe(0)
      expect(aplicar.stdout).toContain("motor: sqlite")
      expect(aplicar.stdout).toContain(
        "e2e:limpiar — 4 filas purgadas en total"
      )
      expect(await contar("avisos_cv")).toBe(1)
      expect(await contar("fondos_fi")).toBe(1)
      expect(await contar("egresos_fi")).toBe(1)
      // La allowlist sobrevive: las 6 personas de las cuentas (una con prefijo test-,
      // vinculada) y las dos comunidades demo con «TEST» en el nombre.
      expect(await contar("personas")).toBe(6)
      expect(await contar('"Comunidad"')).toBe(2)
      expect(
        (await db.$queryRawUnsafe(
          `SELECT id FROM personas WHERE id IN (SELECT personaId FROM usuarios) ORDER BY id`
        )) as Array<{ id: string }>
      ).toHaveLength(6)
      expect(
        (await db.$queryRawUnsafe(
          `SELECT nombre FROM "Comunidad" WHERE id IN ('comunidad-a', 'comunidad-b') ORDER BY id`
        )) as Array<{ nombre: string }>
      ).toEqual([
        { nombre: "Comunidad Los Aromos TEST" },
        { nombre: "Comunidad Las Palmas TEST" },
      ])

      // 3. Idempotente: un dry-run inmediatamente después informa 0 filas.
      const despues = correrPurga(urlBase)
      expect(despues.status).toBe(0)
      expect(despues.stdout).toContain(
        "e2e:limpiar — base limpia: 0 filas a purgar (dry-run)"
      )
    },
    120_000
  )

  it("el CLI se niega a borrar en una base gestionada sin destino y no filtra la URL", () => {
    const r = correrPurga(URL_GESTIONADA, "--apply")
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain("ABORTADO")
    expect(r.stderr).toContain("--destino")
    expect(r.stderr).not.toContain("clave-secreta")
    expect(r.stderr).not.toContain("vecino")
    // Aborta antes de conectarse: no hay cabecera de modo.
    expect(r.stdout).not.toContain("motor:")
  })
})
