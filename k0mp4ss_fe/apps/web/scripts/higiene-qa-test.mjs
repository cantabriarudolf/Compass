#!/usr/bin/env node
/**
 * e2e:higiene — purga filas TEST y QA de la BD dev (SQLite) tras reseed.
 *
 * Contexto (SERIE-E2E-FULL-VERDE P3): el backup P3 trae leftovers de corridas
 * e2e previas (proveedores, solicitudes, unidades, reservas, certificados con
 * ids con timestamp) y cada lane crea los suyos. Los specs asumen BD limpia
 * (su fila TEST es única/primera); los leftovers rompen esa asunción
 * (p.ej. solicitudes abre el detalle de una fila stale, proveedores crashea
 * por TDZ al haber datos). P2 lo llamaba "higiene QA/TEST" en su receta.
 *
 * Reglas de seguridad:
 * - Solo borra por PATRÓN DE ID (ids con timestamp/base36 o prefijos
 *   TEST-/QA-/test-/ct-test-): jamás por contenido de otros campos.
 * - NUNCA toca: personas (seed real), fondos/egresos/ingresos (punto cero),
 *   eventos de auditoría (append-only), comunidades/usuarios/membresías,
 *   maestros, configuración, ni nada con id estable del seed.
 * - Orden hijos→padres por FKs. DRY-RUN por defecto; --apply ejecuta.
 *
 * Uso: npm run e2e:higiene [-- --apply]
 */
/* global process */
import { PrismaClient } from "@prisma/client"

const APPLY = process.argv.includes("--apply")

// id con timestamp decimal (1790...) o sufijo base36 aleatorio de specs
const ES_TEST_ID = /^(test-|TEST-|QA-|qa-|ct-test-|ct-\d|re-rep-|prov-\d|sol-\d|ra-rs-\d|liq-|pub-|cob-|ge-|cv-\d|ir-[a-z0-9]{6,}|mt-[a-z0-9]{6,})|u-17\d|1790\d{6}|17906\d{5}/

// Modelo → campo id (todos usan `id`)
const MODELOS_HIJOS = [
  "certificadoCT",
  "reservaRA",
  "solicitudGE",
  "recursoIR",
  "solicitudInsumoIR",
  "entregaEPP",
  "trabajoMT",
  "proyectoMT",
  "reporteRE",
  "publicacionPortal",
  "leadPortal",
  "cobroFI",
  "liquidacionPL",
  "adelantoPL",
  "bitacoraVisitaPE",
  "encomiendaPE",
  "ingresoContratistaPE",
  "proveedorPE",
  "mantencionPreventivaPE",
  "visitaTecnicaPE",
  "infraccionIN",
  "avisoCV",
  "mensajeBuzonCO",
]
const MODELOS_PADRES = ["vinculoUnidad", "unidad", "persona"]

const db = new PrismaClient()

let total = 0
async function purgar(modelo, soloTestIds) {
  const model = db[modelo]
  if (!model) {
    console.log(`${modelo}: SIN MODELO (skip)`)
    return
  }
  const filas = await model.findMany({ select: { id: true } })
  const ids = filas.map((f) => f.id).filter((id) => !soloTestIds || ES_TEST_ID.test(id))
  if (ids.length === 0) {
    console.log(`${modelo}: limpio (${filas.length} filas seed)`)
    return
  }
  if (APPLY) {
    const r = await model.deleteMany({ where: { id: { in: ids } } })
    console.log(`${modelo}: PURGADAS ${r.count} (de ${filas.length})`)
    total += r.count
  } else {
    console.log(`${modelo}: ${ids.length} para purgar (dry-run): ${ids.slice(0, 4).join(",")}${ids.length > 4 ? "…" : ""}`)
    total += ids.length
  }
}

for (const m of MODELOS_HIJOS) await purgar(m, true)
// Personas/vínculos/unidades: solo ids TEST explícitos (el seed usa ids estables).
for (const m of MODELOS_PADRES) await purgar(m, true)

console.log(APPLY ? `higiene OK: ${total} filas purgadas` : `dry-run: ${total} filas a purgar (usar -- --apply)`)
await db.$disconnect()
