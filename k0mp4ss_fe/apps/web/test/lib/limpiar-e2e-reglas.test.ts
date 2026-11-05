/**
 * @vitest-environment node
 *
 * `e2e:limpiar` — las reglas que reclaman el debris que quedaba fuera (deuda del debris e2e).
 *
 * Por qué existe: la purga medía 125 filas creadas y 114 reclamadas por corrida; las 11
 * restantes se acumulaban en silencio (avisos publicados, plantillas, egresos, actas,
 * avisos de recepción de encomiendas y eventos de auditoría huérfanos). El caso visible era
 * `e2e/crud/visor.spec.ts`, que fallaba porque los avisos publicados se apilaban.
 *
 * Cómo se prueba: cada caso arma una base SQLite descartable (fuera del worktree, en el
 * directorio temporal del sistema) con las tablas mínimas que la regla toca, inserta una fila
 * con marcador (debris) y una fila con forma de seed, y corre la MISMA regla que corre la
 * purga (`contarRegla`/`borrarRegla`, las funciones que usan `informar`/`aplicar`). No se
 * reescribe el predicado en el test: si alguien lo angosta o lo ensancha, el caso falla.
 *
 * La prueba de que la regla no toca el seed es doble acá: la fila "de seed" sigue existiendo
 * después del borrado, y la verificación de allowlist de la transacción real (contadores de
 * personas/unidades/vínculos + cuentas de login) se mide en la base real al aplicar la purga.
 *
 * Los ocho casos que abren base corren solo sobre SQLite (`ES_SQLITE`, abajo): cada uno arma su
 * propia base con un `PrismaClient` de URL `file:` (`baseFija`), y en el job PostgreSQL el cliente
 * generado es `provider = "postgresql"` (`ci.yml`: `prisma generate` + `prisma db push` sin
 * `--schema`), así que el motor rechaza esa URL antes de la primera query y los casos no llegan a
 * medir la regla. Se guardan por motor; el predicado de la regla no se toca. El caso de orden de
 * borrado no abre base y sigue corriendo en los dos motores. Mismo guardia que
 * `test/api/cobro-lineas.test.ts:31`.
 */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { PrismaClient } from "@prisma/client"
import { afterEach, describe, expect, it } from "vitest"
import { REGLAS, borrarRegla, contarRegla } from "../../scripts/limpiar-e2e.mjs"
import { DESTINO_BASE } from "../db-descartable.setup"

/** La base de cada caso es SQLite: en el job PostgreSQL no se aplica (su cliente es `file:`). */
const ES_SQLITE = DESTINO_BASE.archivo !== null

/** Tablas mínimas por regla: sólo las columnas que el predicado mira (nombres del schema real). */
const TABLAS = {
  avisos_cv: `CREATE TABLE avisos_cv (id TEXT PRIMARY KEY, titulo TEXT NOT NULL)`,
  plantillas_co: `CREATE TABLE plantillas_co (id TEXT PRIMARY KEY, nombre TEXT NOT NULL)`,
  egresos_fi: `CREATE TABLE egresos_fi (id TEXT PRIMARY KEY, descripcion TEXT NOT NULL)`,
  actas_gd: `CREATE TABLE actas_gd (id TEXT PRIMARY KEY, lugar TEXT NOT NULL, minuta TEXT NOT NULL)`,
  actas_gd_archivadas: `CREATE TABLE actas_gd_archivadas (id TEXT PRIMARY KEY, lugar TEXT NOT NULL, minuta TEXT NOT NULL)`,
  certificados_ct: `CREATE TABLE certificados_ct (id TEXT PRIMARY KEY, personaId TEXT, unidadId TEXT, origenRef TEXT)`,
  eventos_auditoria: `CREATE TABLE eventos_auditoria (id TEXT PRIMARY KEY, tipoAccion TEXT NOT NULL, referenciaId TEXT NOT NULL, descripcion TEXT NOT NULL)`,
  notificaciones: `CREATE TABLE notificaciones (id TEXT PRIMARY KEY, asunto TEXT NOT NULL, cuerpo TEXT NOT NULL, destinatarioPersonaId TEXT, fecha TEXT NOT NULL)`,
  encomiendas_pe: `CREATE TABLE encomiendas_pe (id TEXT PRIMARY KEY, descripcionPaquete TEXT, destinatarioPersonaId TEXT, fechaRecepcion TEXT NOT NULL)`,
  liquidaciones_pl: `CREATE TABLE liquidaciones_pl (id TEXT PRIMARY KEY, trabajadorPersonaId TEXT NOT NULL)`,
  bitacora_visitas_pe: `CREATE TABLE bitacora_visitas_pe (id TEXT PRIMARY KEY, nombre TEXT NOT NULL)`,
}

type NombreTabla = keyof typeof TABLAS

interface BaseFija {
  db: PrismaClient
  dir: string
}

const bases: BaseFija[] = []

/** Base SQLite descartable con las tablas pedidas (una por caso; nada se comparte). */
async function baseFija(...tablas: NombreTabla[]): Promise<PrismaClient> {
  const dir = mkdtempSync(path.join(tmpdir(), "limpiar-e2e-reglas-"))
  const db = new PrismaClient({
    datasources: { db: { url: `file:${path.join(dir, "fixture.db")}` } },
  })
  bases.push({ db, dir })
  for (const tabla of tablas) await db.$executeRawUnsafe(TABLAS[tabla])
  return db
}

/** La regla publicada de la purga para una tabla (si no existe, el caso debe fallar). */
function regla(tabla: NombreTabla) {
  const encontrada = REGLAS.find((r: { tabla: string }) => r.tabla === tabla)
  if (!encontrada) throw new Error(`e2e:limpiar no tiene regla para ${tabla}`)
  return encontrada
}

/** Índice de la tabla en el orden de borrado de la purga (hijos antes que padres). */
function posicion(tabla: NombreTabla): number {
  return REGLAS.findIndex((r: { tabla: string }) => r.tabla === tabla)
}

async function idsDe(db: PrismaClient, tabla: NombreTabla): Promise<string[]> {
  const filas = await db.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM ${tabla} ORDER BY id`)
  return filas.map((f) => f.id)
}

afterEach(async () => {
  for (const { db, dir } of bases.splice(0)) {
    await db.$disconnect()
    rmSync(dir, { recursive: true, force: true })
  }
})

describe("e2e:limpiar — avisos del visor (CV)", () => {
  it.skipIf(!ES_SQLITE)("purga el aviso QA del spec del visor y no toca un aviso del seed", async () => {
    const db = await baseFija("avisos_cv")
    await db.$executeRawUnsafe(
      `INSERT INTO avisos_cv (id, titulo) VALUES (?, ?), (?, ?)`,
      "av-qa",
      "QA Aviso 1793706703584",
      "av-seed",
      "Corte de agua programado"
    )

    const r = regla("avisos_cv")
    expect(await contarRegla(db, r)).toBe(1)
    expect(await borrarRegla(db, r)).toBe(1)
    expect(await idsDe(db, "avisos_cv")).toEqual(["av-seed"])
  })
})

describe("e2e:limpiar — plantillas de comunicación (CO)", () => {
  it.skipIf(!ES_SQLITE)("purga la plantilla QA y no toca una plantilla del seed", async () => {
    const db = await baseFija("plantillas_co")
    await db.$executeRawUnsafe(
      `INSERT INTO plantillas_co (id, nombre) VALUES (?, ?), (?, ?)`,
      "plant-qa",
      "QA Plantilla 1793644485922",
      "plant-seed",
      "Aviso de mantención programada"
    )

    const r = regla("plantillas_co")
    expect(await contarRegla(db, r)).toBe(1)
    expect(await borrarRegla(db, r)).toBe(1)
    expect(await idsDe(db, "plantillas_co")).toEqual(["plant-seed"])
  })
})

describe("e2e:limpiar — egresos (FI)", () => {
  it.skipIf(!ES_SQLITE)("purga el egreso QA y no toca un egreso del seed descrito en lenguaje natural", async () => {
    const db = await baseFija("egresos_fi")
    await db.$executeRawUnsafe(
      `INSERT INTO egresos_fi (id, descripcion) VALUES (?, ?), (?, ?), (?, ?)`,
      "egr-qa",
      "QA Egreso 1793705452267",
      "fi-egr-hist-001",
      "Útiles de Aseo",
      "fi-egr-hist-004",
      "Pago Administración"
    )

    const r = regla("egresos_fi")
    expect(await contarRegla(db, r)).toBe(1)
    expect(await borrarRegla(db, r)).toBe(1)
    expect(await idsDe(db, "egresos_fi")).toEqual(["fi-egr-hist-001", "fi-egr-hist-004"])
  })
})

describe("e2e:limpiar — libro de actas (GD)", () => {
  it.skipIf(!ES_SQLITE)("purga el acta QA por lugar o por minuta, y no toca un acta del seed", async () => {
    const db = await baseFija("actas_gd")
    await db.$executeRawUnsafe(
      `INSERT INTO actas_gd (id, lugar, minuta) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
      // el acta de e2e puede no traer minuta: el lugar la delata
      "acta-lugar",
      "Sede QA",
      "",
      // …o traer la minuta marcada con el lugar limpio: la condición OR cubre la mitad que
      // una regla AND-only perdería
      "acta-minuta",
      "Sede Comunal",
      "QA Acta 1793644470253",
      "acta-seed",
      "Sede Comunal",
      "Se aprueba el presupuesto 2026.",
      // "QA" sin espacio no es el marcador de e2e: no se toca
      "acta-otra",
      "Sede Comunal",
      "Se revisa el contrato QA2026."
    )

    const r = regla("actas_gd")
    expect(await contarRegla(db, r)).toBe(2)
    expect(await borrarRegla(db, r)).toBe(2)
    expect(await idsDe(db, "actas_gd")).toEqual(["acta-otra", "acta-seed"])
  })

  it.skipIf(!ES_SQLITE)("purga la copia archivada del acta QA con el mismo predicado", async () => {
    const db = await baseFija("actas_gd_archivadas")
    await db.$executeRawUnsafe(
      `INSERT INTO actas_gd_archivadas (id, lugar, minuta) VALUES (?, ?, ?), (?, ?, ?)`,
      "arch-qa",
      "Sede QA",
      "",
      "arch-seed",
      "Sede Comunal",
      "Se aprueba el presupuesto 2026."
    )

    const r = regla("actas_gd_archivadas")
    expect(await contarRegla(db, r)).toBe(1)
    expect(await borrarRegla(db, r)).toBe(1)
    expect(await idsDe(db, "actas_gd_archivadas")).toEqual(["arch-seed"])
  })
})

describe("e2e:limpiar — certificados (CT)", () => {
  it.skipIf(!ES_SQLITE)("purga el certificado cuyo origenRef lleva test- en cualquier posición y conserva el del seed", async () => {
    const db = await baseFija("certificados_ct")
    await db.$executeRawUnsafe(
      `INSERT INTO certificados_ct (id, personaId, unidadId, origenRef) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)`,
      // el certificado de e2e referencia un vínculo de prueba: el marcador NO está al inicio
      "ct-vinculo",
      "p-3",
      "u-B-201",
      "v-test-residente",
      // forma anterior del marcador: sigue cubierta
      "ct-emision",
      "p-3",
      "u-B-201",
      "test-emision-1",
      "ct-seed",
      "p-1",
      "u-A-101",
      "acta-AD-2026-0001"
    )

    const r = regla("certificados_ct")
    expect(await contarRegla(db, r)).toBe(2)
    expect(await borrarRegla(db, r)).toBe(2)
    expect(await idsDe(db, "certificados_ct")).toEqual(["ct-seed"])
  })
})

describe("e2e:limpiar — eventos de auditoría huérfanos", () => {
  it.skipIf(!ES_SQLITE)("purga los eventos cuyo padre ya no existe y conserva los que apuntan a datos vivos", async () => {
    const db = await baseFija("eventos_auditoria", "encomiendas_pe", "liquidaciones_pl", "bitacora_visitas_pe")
    await db.$executeRawUnsafe(
      `INSERT INTO encomiendas_pe (id, descripcionPaquete, destinatarioPersonaId, fechaRecepcion) VALUES (?, ?, ?, ?)`,
      "enc-2026-11-02-01",
      "Tubo con planos",
      "p-1",
      "2026-11-02"
    )
    await db.$executeRawUnsafe(
      `INSERT INTO liquidaciones_pl (id, trabajadorPersonaId) VALUES (?, ?)`,
      "liq-2026-10-p-trab-conserje",
      "p-trab-conserje"
    )
    await db.$executeRawUnsafe(
      `INSERT INTO bitacora_visitas_pe (id, nombre) VALUES (?, ?), (?, ?)`,
      "pe-vis-qa",
      "Qa Visita 1793644648001",
      "pe-vis-seed",
      "Tomas Catalina Alvarez Araya"
    )
    await db.$executeRawUnsafe(
      `INSERT INTO eventos_auditoria (id, tipoAccion, referenciaId, descripcion) VALUES
         (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?),
         (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)`,
      // encomienda viva: el evento se conserva
      "ev-enc-viva",
      "PE_ENCOMIENDA_RECIBIDA",
      "enc-2026-11-02-01",
      "Encomienda recibida de Chilexpress.",
      // encomienda ya purgada: evento huérfano
      "ev-enc-huerfana",
      "PE_ENCOMIENDA_RECIBIDA",
      "pe-enc-1793645021371-789r09",
      "Encomienda recibida de Chilexpress.",
      // nómina viva
      "ev-liq-viva",
      "PL_EXPENSE_SYNC",
      "liq-2026-10-p-trab-conserje",
      "Liquidación LQ-2026-10-001 CONFIRMADA: egreso FE-0185 de $1.200.000 imputado a Fondo General.",
      // nómina ya purgada
      "ev-liq-huerfana",
      "PL_EXPENSE_SYNC",
      "pl-liq-fc25aee5",
      "Liquidación LIQ-0001 CONFIRMADA: egreso FE-0185 de $1.200.000 imputado a Fondo General.",
      // visita QA en la bitácora (no la borra la regla de bitácora: «Qa Visita …» no es «test-»)
      "ev-vis-qa",
      "PE_VISITA_INGRESADA",
      "pe-vis-qa",
      "Visita Qa Visita 1793644648001 ingresada (agendada).",
      // visita del seed
      "ev-vis-seed",
      "PE_VISITA_INGRESADA",
      "pe-vis-seed",
      "Visita Tomas Catalina Alvarez Araya ingresada (agendada).",
      // condición previa que debe seguir vigente: referenciaId con marcador test-
      "ev-ref-test",
      "RE_DASHBOARD_VIEW",
      "test-panel-1",
      "Dashboard visto por el usuario de prueba."
    )

    const r = regla("eventos_auditoria")
    expect(await contarRegla(db, r)).toBe(4)
    expect(await borrarRegla(db, r)).toBe(4)
    expect(await idsDe(db, "eventos_auditoria")).toEqual([
      "ev-enc-viva",
      "ev-liq-viva",
      "ev-vis-seed",
    ])
  })
})

describe("e2e:limpiar — aviso de recepción de encomienda (notificaciones)", () => {
  it.skipIf(!ES_SQLITE)("reclama el aviso huérfano y el del padre purgado en la misma corrida, sin tocar el del seed", async () => {
    const db = await baseFija("notificaciones", "encomiendas_pe")
    await db.$executeRawUnsafe(
      `INSERT INTO encomiendas_pe (id, descripcionPaquete, destinatarioPersonaId, fechaRecepcion) VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
      // encomienda del seed: su aviso NO se toca
      "enc-2026-11-02-01",
      "Tubo con planos",
      "p-1",
      "2026-11-02",
      // encomienda de e2e: la borra la regla de encomiendas_pe en la misma corrida
      "pe-enc-1793706231614-7ss4tf",
      "TEST-ENCOMIENDA-1793706231614",
      "p-own-42",
      "2026-11-03"
    )
    await db.$executeRawUnsafe(
      `INSERT INTO notificaciones (id, asunto, cuerpo, destinatarioPersonaId, fecha) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
      // padre purgado en esta misma corrida: sólo se ve huérfano DESPUÉS de la regla de encomiendas
      "not-padre-purgado",
      "Encomienda recibida en conserjería",
      "Tiene una encomienda recibida el 2026-11-03. Retírela presentando su identificación.",
      "p-own-42",
      "2026-11-03",
      // huérfano de una corrida anterior
      "not-huerfano",
      "Encomienda recibida en conserjería",
      "Tiene una encomienda recibida el 2026-11-02. Retírela presentando su identificación.",
      "p-own-42",
      "2026-11-02",
      // encomienda del seed viva: el aviso se conserva
      "not-seed",
      "Encomienda recibida en conserjería",
      "Tiene una encomienda recibida el 2026-11-02. Retírela presentando su identificación.",
      "p-1",
      "2026-11-02",
      // otro asunto: no es de esta regla
      "not-otro",
      "Pago de gastos comunes",
      "El período 2026-11 quedó emitido.",
      "p-1",
      "2026-11-02"
    )

    // Orden real de la purga, restringido a las dos reglas de la cadena.
    const cadena = REGLAS.filter(
      (r: { tabla: string }) => r.tabla === "encomiendas_pe" || r.tabla === "notificaciones"
    )
    for (const r of cadena) await borrarRegla(db, r)

    expect(await idsDe(db, "encomiendas_pe")).toEqual(["enc-2026-11-02-01"])
    expect(await idsDe(db, "notificaciones")).toEqual(["not-otro", "not-seed"])
  })
})

describe("e2e:limpiar — orden de borrado", () => {
  it("borra los hijos antes que sus padres y barre los huérfanos después de purgar al padre", () => {
    // Un aviso referencia plantilla y acta: si el aviso sobrevive al borrado de su padre,
    // queda apuntando a una fila que ya no existe.
    expect(posicion("avisos_cv")).toBeLessThan(posicion("actas_gd"))
    expect(posicion("avisos_cv")).toBeLessThan(posicion("plantillas_co"))
    // El egreso puede citar un acta en aprobacionActaGDId.
    expect(posicion("egresos_fi")).toBeLessThan(posicion("actas_gd"))
    // El barrido de huérfanos necesita que el padre ya esté borrado…
    expect(posicion("encomiendas_pe")).toBeLessThan(posicion("eventos_auditoria"))
    expect(posicion("liquidaciones_pl")).toBeLessThan(posicion("eventos_auditoria"))
    // …y el aviso de recepción sólo queda huérfano cuando la encomienda desapareció.
    expect(posicion("encomiendas_pe")).toBeLessThan(posicion("notificaciones"))
  })
})
