#!/usr/bin/env node
/**
 * scripts/anonimizar-bitacora.mjs — anonimiza al visitante de la bitácora PE vencido.
 *
 * F15 (criterio del owner 2026-10-25): la bitácora es un registro y NO se purga — pesa
 * poco en la base y da trazabilidad. Pero el visitante es un tercero y su identidad no
 * puede quedar identificada indefinidamente. A los 5 años (el precedente interno de
 * retención de logs de auditoría) se anonimiza al visitante: el registro y su contexto
 * operativo quedan, el tercero deja de estar identificado.
 *
 * Qué se anonimiza:  nombre → "Visitante anonimizado", dni → "", patente → null,
 *                    notas → null.
 * Qué se conserva:   fecha, estado, horaIngreso, jornadaId, unidadId, destinoPersonaId,
 *                    origenAgenda y agendadaPorPersonaId (residentes y hecho operativo:
 *                    eso es la trazabilidad).
 *
 * Idempotente: una fila ya anonimizada no vuelve a contarse ni reescribirse, y no hay
 * inserciones (sólo updates), así que correrla dos veces deja la base igual. El evento
 * de auditoría se emite una única vez, en la corrida que sí afectó filas (uno por
 * comunidad afectada: el modelo exige comunidadId; en la práctica una corrida toca una).
 *
 * Guarda de entorno (igual que datos-reset.mjs): se niega a correr con entorno efectivo
 * de producción o contra una base que no sea `file:` SQLite. Con `--si-produccion` el
 * owner confirma explícitamente que quiere correrla igual (la base gestionada es
 * decisión suya, no de un npm run).
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npm run datos:anonimizar
 *   npm run datos:anonimizar -- --dry-run
 *   npm run datos:anonimizar -- --anios 5 --hoy 2026-10-25
 *   npm run datos:anonimizar -- --help
 */
import path from "node:path"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { PrismaClient } from "@prisma/client"
import { resolverDatabaseUrl } from "./datos-reset.mjs"

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** Nombre que reemplaza la identidad del visitante en la fila anonimizada. */
export const NOMBRE_ANONIMO = "Visitante anonimizado"
/** Plazo de retención de la identidad del visitante (años). */
export const ANIOS_POR_DEFECTO = 5
/** Usuario del evento de auditoría: no hay sesión, es una corrida de script. */
export const USUARIO_EVENTO = "anonimizador-bitacora"
/** tipoAccion del evento de auditoría de la corrida. */
export const TIPO_ACCION = "PE_BITACORA_ANONIMIZADA"

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

/* ---------- aritmética de fechas por día calendario ---------- */

/**
 * Valida y parte una fecha ISO de día (`YYYY-MM-DD`). Lanza si no lo es: mejor
 * abortar que anonimizar con un corte mal calculado.
 */
function partesFecha(iso, campo) {
  if (!RE_FECHA.test(String(iso))) {
    throw new Error(`fecha inválida en ${campo}: "${iso}" (se espera YYYY-MM-DD)`)
  }
  const [y, m, d] = String(iso).split("-").map(Number)
  return { y, m, d }
}

/** Formatea partes `{ y, m, d }` como `YYYY-MM-DD`. */
function formatearFecha({ y, m, d }) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/**
 * Fecha de corte: `hoy` menos `anios` años, como día calendario (`YYYY-MM-DD`).
 * El 29 de febrero que no existe en el año del corte cae al 28.
 */
export function restarAnios(hoyISO, anios) {
  if (!Number.isInteger(anios) || anios < 1) {
    throw new Error(`anios debe ser un entero >= 1 (recibido: ${anios})`)
  }
  const { y, m, d } = partesFecha(hoyISO, "hoy")
  const yCorte = y - anios
  const dCorte = m === 2 && d === 29 && !esBisiesto(yCorte) ? 28 : d
  return formatearFecha({ y: yCorte, m, d: dCorte })
}

function esBisiesto(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/**
 * ¿La visita con `fecha` (`YYYY-MM-DD`) ya cumplió `anios` años al `hoy`?
 *
 * Comparación por DÍA, no por timestamp: el borde exacto es el aniversario. Con
 * `anios = 5`, una visita de hace exactamente 5 años (recién cumplidos) está
 * vencida; la de un día después todavía no. Léxico sobre `YYYY-MM-DD` = orden
 * calendario, sin zonas horarias de por medio.
 */
export function estaVencida(fechaISO, hoyISO, anios = ANIOS_POR_DEFECTO) {
  partesFecha(fechaISO, "fecha")
  partesFecha(hoyISO, "hoy")
  return fechaISO <= restarAnios(hoyISO, anios)
}

/* ---------- guarda de entorno ---------- */

/**
 * Decide si la corrida puede proceder. Igual que `datos-reset` en sus tres rechazos
 * (producción efectiva, NODE_ENV de build, base no `file:`), pero ambos primeros ceden
 * ante `siProduccion` (el `--si-produccion` del owner). La base gestionada también
 * cede con ese flag: es su decisión explícita, no de un npm run.
 */
export function evaluarEntorno({
  databaseUrl = "",
  nextPublicAppEnv = "",
  appEnv = "",
  nodeEnv = "",
  siProduccion = false,
} = {}) {
  const esProd = (valor) => {
    const v = String(valor || "").toLowerCase()
    return v === "production" || v === "prod"
  }
  // Cada variable por separado: un `??` entre ellas dejaría que un NEXT_PUBLIC_APP_ENV
  // de desarrollo en .env sombreara un APP_ENV=production del shell.
  const enProduccion = esProd(nextPublicAppEnv) || esProd(appEnv) || esProd(nodeEnv)
  if (enProduccion && !siProduccion) {
    return {
      ok: false,
      motivo:
        "entorno efectivo de producción (NEXT_PUBLIC_APP_ENV/APP_ENV/NODE_ENV=production): pasar --si-produccion para confirmar la corrida",
    }
  }
  if (!databaseUrl) {
    return {
      ok: false,
      motivo: "DATABASE_URL ausente: definila en el entorno o en apps/web/.env",
    }
  }
  if (!databaseUrl.startsWith("file:") && !siProduccion) {
    return {
      ok: false,
      motivo: `DATABASE_URL no es SQLite local (${databaseUrl.split(":")[0]}://…): la base gestionada se anonimiza cuando el owner lo decida, con --si-produccion`,
    }
  }
  return { ok: true }
}

/* ---------- anonimización ---------- */

/** Dónde ya no hay identidad que anonimizar: el resultado de la corrida anterior. */
const YA_ANONIMIZADA = { nombre: NOMBRE_ANONIMO, dni: "" }

/**
 * Anonimiza las visitas de la bitácora PE cuya `fecha` ya cumplió `anios` años al `hoy`.
 *
 * - `prisma`: cliente Prisma (el de la app en producción, o el de la base descartable
 *   en los tests). Debe exponer `bitacoraVisitaPE` y `eventoAuditoria`.
 * - `hoy`: `YYYY-MM-DD` (el CLI lo toma de `--hoy`; los tests lo fijan para ser
 *   deterministas).
 * - `dryRun`: calcula y reporta, pero no escribe filas ni evento.
 *
 * Devuelve `{ corte, anios, vencidas, afectadas, eventos, dryRun }`. `vencidas` son las
 * filas en rango; `afectadas` las que realmente se reescribieron (excluye las ya
 * anonimizadas en corridas previas: por eso la segunda corrida da 0).
 */
export async function anonimizarBitacora({ prisma, hoy, anios = ANIOS_POR_DEFECTO, dryRun = false }) {
  if (!prisma?.bitacoraVisitaPE) {
    throw new Error("anonimizarBitacora necesita un cliente prisma con bitacoraVisitaPE")
  }
  const corte = restarAnios(hoy, anios)

  const enRango = await prisma.bitacoraVisitaPE.findMany({
    where: {
      fecha: { lte: corte },
      // Una fila ya anonimizada (corrida previa) no vuelve a contarse: el update
      // sería un no-op y el evento, un duplicado.
      NOT: YA_ANONIMIZADA,
    },
  })
  if (dryRun || enRango.length === 0) {
    return { corte, anios, vencidas: enRango.length, afectadas: 0, eventos: 0, dryRun }
  }

  const resultado = await prisma.bitacoraVisitaPE.updateMany({
    where: { id: { in: enRango.map((v) => v.id) } },
    data: {
      nombre: NOMBRE_ANONIMO,
      dni: "", // el schema lo exige: vacío, sin identidad del tercero
      patente: null,
      notas: null,
    },
  })

  // Un evento por comunidad afectada (el modelo exige comunidadId por evento): el
  // mismo shape que `registrarEventoPE`, con el script como usuario.
  const porComunidad = new Map()
  for (const v of enRango) {
    porComunidad.set(v.comunidadId, (porComunidad.get(v.comunidadId) ?? 0) + 1)
  }
  const descripcionBase = `Anonimización de visitas de la bitácora con fecha anterior a ${corte} (retención de ${anios} años).`
  for (const [comunidadId, cantidad] of porComunidad) {
    await prisma.eventoAuditoria.create({
      data: {
        id: generarIdEvento(),
        comunidadId,
        timestamp: new Date().toISOString(),
        usuario: USUARIO_EVENTO,
        categoria: "PE",
        tipoAccion: TIPO_ACCION,
        referenciaId: `bitacora-visitas:${corte}`,
        descripcion: `${cantidad} ${cantidad === 1 ? "visita anonimizada" : "visitas anonimizadas"} — ${descripcionBase}`,
      },
    })
  }

  return {
    corte,
    anios,
    vencidas: enRango.length,
    afectadas: resultado.count,
    eventos: porComunidad.size,
    dryRun,
  }
}

/** Id con el patrón de `generarId` de la app (no importable desde un .mjs). */
function generarIdEvento() {
  const stamp = Date.now()
  const rnd = Math.random().toString(36).slice(2, 8)
  return `ev-${stamp}-${rnd}`
}

/* ---------- CLI ---------- */

const AYUDA = `datos:anonimizar — anonimiza al visitante de la bitácora PE vencido (F15)

  npm run datos:anonimizar                       corrida real (corte = hoy − 5 años)
  npm run datos:anonimizar -- --dry-run          simula y reporta, no escribe
  npm run datos:anonimizar -- --anios 7          otro plazo de retención
  npm run datos:anonimizar -- --hoy 2026-12-31   fija el día de referencia (pruebas)

Flag                  Descripción
--dry-run             No escribe filas ni evento: sólo reporta qué afectaría
--anios <n>           Años de retención de la identidad (default ${ANIOS_POR_DEFECTO})
--hoy <YYYY-MM-DD>    Día de referencia para el corte (default: hoy)
--si-produccion       Confirmación explícita del owner para correr en producción o
                      contra una base gestionada
--help                Esta ayuda

La corrida NO borra registros: anonimiza nombre, dni, patente y notas, y conserva
fecha, estado, hora, jornada, unidad y destinatario (trazabilidad del hecho operativo).
Emitiría un evento de auditoría PE_BITACORA_ANONIMIZADA por comunidad afectada.`

function leerArgs(args) {
  const opciones = { dryRun: false, anios: ANIOS_POR_DEFECTO, hoy: null, siProduccion: false, ayuda: false }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const conValor = (clave) => {
      if (arg === clave) {
        const valor = args[++i]
        if (valor === undefined) throw new Error(`${clave} necesita un valor`)
        return valor
      }
      if (arg.startsWith(`${clave}=`)) return arg.slice(clave.length + 1)
      return null
    }
    if (arg === "--help" || arg === "-h") {
      opciones.ayuda = true
    } else if (arg === "--dry-run") {
      opciones.dryRun = true
    } else if (arg === "--si-produccion") {
      opciones.siProduccion = true
    } else if (arg === "--anios" || arg.startsWith("--anios=")) {
      const valor = conValor("--anios")
      opciones.anios = Number(valor)
      if (!Number.isInteger(opciones.anios) || opciones.anios < 1) {
        throw new Error(`--anios necesita un entero >= 1 (recibido: ${valor})`)
      }
    } else if (arg === "--hoy" || arg.startsWith("--hoy=")) {
      opciones.hoy = conValor("--hoy")
      if (!RE_FECHA.test(opciones.hoy)) {
        throw new Error(`--hoy necesita una fecha YYYY-MM-DD (recibido: ${opciones.hoy})`)
      }
    } else {
      throw new Error(`argumento desconocido: ${arg}\n\n${AYUDA}`)
    }
  }
  return opciones
}

function banner({ corte, anios, dryRun }) {
  const linea = "=".repeat(76)
  console.log(`\n${linea}`)
  console.log(" datos:anonimizar — identidad del visitante de la bitácora PE (F15)")
  console.log(linea)
  console.log(` Corte aplicado   : visitas con fecha anterior a ${corte}`)
  console.log(` Retención        : ${anios} años (precedente interno de logs de auditoría)`)
  console.log(` Modo             : ${dryRun ? "dry-run (no escribe nada)" : "real"}`)
  console.log(" Qué se anonimiza : nombre, dni, patente, notas")
  console.log(" Qué se conserva  : fecha, estado, hora, jornada, unidad, destinatario")
  console.log(`${linea}\n`)
}

function leerEnv() {
  const contenidos = []
  for (const archivo of [".env", ".env.local"]) {
    const ruta = path.join(APP_DIR, archivo)
    if (existsSync(ruta)) contenidos.push(readFileSync(ruta, "utf8"))
  }
  return contenidos
}

async function main() {
  const opciones = leerArgs(process.argv.slice(2))
  if (opciones.ayuda) {
    console.log(AYUDA)
    return
  }

  const databaseUrl = resolverDatabaseUrl(process.env, leerEnv())
  const veredicto = evaluarEntorno({
    databaseUrl,
    nextPublicAppEnv: process.env.NEXT_PUBLIC_APP_ENV ?? "",
    appEnv: process.env.APP_ENV ?? "",
    nodeEnv: process.env.NODE_ENV ?? "",
    siProduccion: opciones.siProduccion,
  })
  if (!veredicto.ok) {
    console.error(`datos:anonimizar — ABORTADO: ${veredicto.motivo}`)
    process.exit(1)
  }

  const hoyISO = opciones.hoy ?? formatearFecha(
    (() => {
      const ahora = new Date()
      return { y: ahora.getFullYear(), m: ahora.getMonth() + 1, d: ahora.getDate() }
    })()
  )
  const corte = restarAnios(hoyISO, opciones.anios)
  banner({ corte, anios: opciones.anios, dryRun: opciones.dryRun })

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl })
  try {
    const resumen = await anonimizarBitacora({
      prisma,
      hoy: hoyISO,
      anios: opciones.anios,
      dryRun: opciones.dryRun,
    })
    console.log(` Filas en rango (${resumen.dryRun ? "se anonimizarían" : "anonimizadas"}) : ${resumen.dryRun ? resumen.vencidas : resumen.afectadas}`)
    if (!resumen.dryRun) {
      console.log(` Eventos de auditoría emitidos: ${resumen.eventos}`)
    }
    if (resumen.dryRun) {
      console.log("\ndatos:anonimizar — dry-run terminado: la base quedó igual.")
    } else if (resumen.afectadas === 0) {
      console.log("\ndatos:anonimizar — nada por anonimizar: no se escribió nada.")
    } else {
      console.log(`\ndatos:anonimizar — listo: ${resumen.afectadas} visita(s) anonimizada(s) al corte ${resumen.corte}.`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && process.argv[1].endsWith("anonimizar-bitacora.mjs")) {
  main().catch((err) => {
    console.error(`datos:anonimizar — ABORTADO: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  })
}
