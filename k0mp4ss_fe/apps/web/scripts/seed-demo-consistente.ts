#!/usr/bin/env -S npx tsx
/**
 * seed-demo-consistente — datos de demostración coherentes para una comunidad.
 *
 * Spec: odd/tasks/datos-demo-consistentes.md (S1–S9).
 *
 * Por qué existe: las pantallas de finanzas y de operaciones mostraban tablas
 * vacías (`emisiones_gc`, `configuracion_cobranza_fi`, `liquidaciones_pl`,
 * `proveedores_pe`, `mantenciones_preventivas_pe`, `visitas_tecnicas_pe`,
 * `infracciones_in` en 0) mientras la estructura física tenía datos a medias
 * (3 locales, 83 estacionamientos, 1 amenity). Este script deja una comunidad
 * con números redondos y coherentes entre sí.
 *
 * Desde el paso 7 también siembra la puerta: `bitacora_visitas_pe`,
 * `encomiendas_pe` e `ingresos_contratista_pe` con el día de la corrida, para
 * que el panel «Foto del día · Operaciones» del dashboard no quede en «sin
 * movimiento».
 *
 * Propiedades del script:
 * - **Determinista**: PRNG con semilla fija. Dos corridas dejan el mismo estado.
 * - **Idempotente**: todo es upsert por id determinista; no duplica filas. En la
 *   portería el id lleva la fecha del día, así que dos corridas el mismo día
 *   actualizan las mismas filas.
 * - **Aditivo**: NO borra personas con login (`p-3`…`p-7`, `p-arrendatario-1`)
 *   ni unidades existentes cuyos ids son contrato de `seed-authz.mjs` y de
 *   `e2e/`/`test/`. Solo borra los artefactos de QA (`test-*`).
 * - **RUT válidos por construcción** (S1): el dígito verificador se calcula,
 *   nunca se escribe a mano.
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npm run db:demo-consistente [-- --comunidad-id=comunidad-a]
 */
/* global process, console */
import { cargarUrlBase } from "../lib/database-url"
import { hoyISO } from "../lib/date-utils"
import { PrismaClient, Prisma } from "@prisma/client"

const comunidadId =
  process.argv
    .find((a) => a.startsWith("--comunidad-id="))
    ?.slice("--comunidad-id=".length)
    ?.trim() ||
  process.env.COMUNIDAD_ID?.trim() ||
  "comunidad-a"

const prisma = new PrismaClient({ datasourceUrl: cargarUrlBase() })

// ────────────────────────────────────────────────────────────────────────────
// Determinismo
// ────────────────────────────────────────────────────────────────────────────

function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const azar = mulberry32(20261102)
const entero = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1))
const elegir = <T>(xs: readonly T[]): T => xs[Math.floor(azar() * xs.length)] as T
const monto = (n: number) => Math.round(n)

function barajar<T>(xs: readonly T[]): T[] {
  const copia = [...xs]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    const a = copia[i] as T
    copia[i] = copia[j] as T
    copia[j] = a
  }
  return copia
}

// ────────────────────────────────────────────────────────────────────────────
// Fechas — se fijan para que el dataset sea reproducible
// ────────────────────────────────────────────────────────────────────────────

const PERIODOS = ["2026-08", "2026-09", "2026-10"] as const
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Día 10 del mes siguiente al periodo: el vencimiento realista del gasto común. */
function vencimientoDe(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number) as [number, number]
  return iso(new Date(Date.UTC(anio, mes, 10)))
}

/** Milisegundos de un día: conversión de unidades, no un parámetro del reglamento. */
const MS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * Días corridos entre la emisión del seed (`AAAA-MM-01`) y el vencimiento que el
 * seed ya usa (`vencimientoDe`). La versión del reglamento declara ese número
 * como `diasPagoGc`, así el vencimiento que calcula la API para el primer
 * período emitido es el mismo que el seed ya sembró en `cobros_fi`.
 */
function diasDePagoDe(periodo: string): number {
  const emision = Date.parse(`${periodo}-01T00:00:00Z`)
  const vencimiento = Date.parse(`${vencimientoDe(periodo)}T00:00:00Z`)
  return Math.round((vencimiento - emision) / MS_POR_DIA)
}

function diasDesde(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number) as [number, number]
  return iso(new Date(Date.UTC(anio, mes - 1, 5)))
}

// ────────────────────────────────────────────────────────────────────────────
// RUT (S1) — mismo algoritmo que lib/rut.ts
// ────────────────────────────────────────────────────────────────────────────

function dvDe(cuerpo: string): string {
  let suma = 0
  let factor = 2
  for (const digito of [...cuerpo].reverse()) {
    suma += Number(digito) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const resto = suma % 11
  const dv = 11 - resto
  if (dv === 11) return "0"
  if (dv === 10) return "K"
  return String(dv)
}

function formatearRut(cuerpo: string): string {
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dvDe(cuerpo)}`
}

const rutsUsados = new Set<string>()
let siguienteCuerpoRut = 15_000_000

function rutNuevo(): string {
  for (;;) {
    const cuerpo = String(siguienteCuerpoRut++)
    if (cuerpo.length < 7) continue
    const rut = formatearRut(cuerpo)
    // La clave se compara sin puntos, igual que en `cargarRutsExistentes`.
    const clave = rut.replace(/\./g, "")
    if (rutsUsados.has(clave)) continue
    rutsUsados.add(clave)
    return rut
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Nombres — sin acentos raros para que la UI no tenga sorpresas de encoding
// ────────────────────────────────────────────────────────────────────────────

const NOMBRES = [
  "Javiera", "Matias", "Camila", "Benjamin", "Antonia", "Vicente", "Isidora", "Tomas",
  "Florencia", "Agustin", "Martina", "Joaquin", "Constanza", "Diego", "Josefa", "Sebastian",
  "Trinidad", "Nicolas", "Amanda", "Felipe", "Renata", "Cristobal", "Emilia", "Ignacio",
  "Valentina", "Alvaro", "Catalina", "Rodrigo", "Fernanda", "Pablo", "Rocio", "Andres",
]
const APELLIDOS = [
  "Gonzalez", "Munoz", "Rojas", "Diaz", "Perez", "Soto", "Contreras", "Silva",
  "Martinez", "Sepulveda", "Morales", "Rodriguez", "Lopez", "Fuentes", "Hernandez", "Torres",
  "Araya", "Flores", "Espinoza", "Valenzuela", "Castillo", "Tapia", "Reyes", "Gutierrez",
  "Castro", "Pizarro", "Alvarez", "Vasquez", "Sanchez", "Ramirez",
]

function generarNombre(): { nombres: string; apellidos: string; nombreCompleto: string } {
  const nombres = `${elegir(NOMBRES)} ${elegir(NOMBRES)}`
  const apellidos = `${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`
  return { nombres, apellidos, nombreCompleto: `${nombres} ${apellidos}` }
}

// ────────────────────────────────────────────────────────────────────────────
// Tipos de apoyo
// ────────────────────────────────────────────────────────────────────────────

type UnidadMin = { id: string; numero: string; tipoUnidadId: string; prorrateo: number }

type Estructura = {
  deptos: UnidadMin[]
  locales: UnidadMin[]
  estacPrivados: UnidadMin[]
  estacVisitas: UnidadMin[]
}

const BASE_GC: Record<string, number> = {
  "tipo-a": 45_000,
  "tipo-b": 35_000,
  "local-a": 95_000,
  "local-b": 50_000,
  "tipo-es-1": 5_000,
  "tipo-es-visita": 0,
}

// ────────────────────────────────────────────────────────────────────────────
// Paso 1 — Estructura física (S2, S3, S4, S5)
// ────────────────────────────────────────────────────────────────────────────

const EDIFICIOS = [
  { id: "torre-a", etiqueta: "Edificio 1" },
  { id: "torre-b", etiqueta: "Edificio 2" },
  { id: "torre-c", etiqueta: "Edificio 3" },
  { id: "torre-d", etiqueta: "Edificio 4" },
  { id: "torre-e", etiqueta: "Edificio 5" },
]

async function limpiarArtefactosQa(): Promise<void> {
  const unidadesQa = await prisma.unidad.findMany({
    where: {
      comunidadId,
      OR: [{ id: { startsWith: "test-" } }, { microSectorId: { startsWith: "test-" } }],
    },
    select: { id: true },
  })
  const ids = unidadesQa.map((u) => u.id)
  if (ids.length > 0) {
    await prisma.vinculoUnidad.deleteMany({ where: { unidadId: { in: ids } } })
    await prisma.unidad.deleteMany({ where: { id: { in: ids } } })
  }
  await prisma.microSector.deleteMany({ where: { comunidadId, id: { startsWith: "test-" } } })
  await prisma.macroSector.deleteMany({ where: { comunidadId, id: { startsWith: "test-" } } })
  await prisma.tipoUnidad.deleteMany({ where: { comunidadId, id: { startsWith: "test-" } } })
  if (ids.length > 0) console.log(`[estructura] ${ids.length} unidades de QA eliminadas`)
}

async function pasoEstructura(): Promise<Estructura> {
  await limpiarArtefactosQa()

  // S2 — los cinco edificios se muestran como «Edificio 1»…«Edificio 5».
  for (const edificio of EDIFICIOS) {
    await prisma.macroSector.updateMany({
      where: { comunidadId, id: edificio.id },
      data: { etiqueta: edificio.etiqueta },
    })
  }
  await prisma.macroSector.updateMany({
    where: { comunidadId, id: "comercial" },
    data: { nombre: "Sector Comercial", etiqueta: "Sector Comercial" },
  })
  await prisma.macroSector.updateMany({
    where: { comunidadId, id: "estacionamientos" },
    data: { etiqueta: "Estacionamientos" },
  })

  // S5 — el estacionamiento de visita es bien común: no paga gasto común.
  await prisma.tipoUnidad.upsert({
    where: { id: "tipo-es-visita" },
    update: { comunidadId, activo: true, montoBaseGc: 0 },
    create: {
      id: "tipo-es-visita",
      comunidadId,
      nombre: "Estacionamiento Visita",
      categoria: "Estacionamiento",
      metraje: 12.5,
      montoBaseGc: 0,
      descripcion: "Bien común de la comunidad, no se asigna a unidades",
      activo: true,
      historialTarifas: JSON.parse('[{"id":"t-ev-1","monto":0,"fechaVigencia":"2024-01-01","creadoEn":"2023-12-01"}]'),
    },
  })

  // S5 — 80 privados (E-001…E-080) y 20 de visita (E-081…E-100).
  for (let n = 1; n <= 100; n++) {
    const sufijo = String(n).padStart(3, "0")
    const id = `u-E-${sufijo}`
    const esVisita = n > 80
    const microSectorId = esVisita ? "est-vis" : n <= 20 ? "est-sup" : n <= 50 ? "est-sub1" : "est-sub2"
    const tipoUnidadId = esVisita ? "tipo-es-visita" : "tipo-es-1"
    const fila = {
      comunidadId,
      microSectorId,
      numero: `E-${sufijo}`,
      etiqueta: esVisita ? "Estacionamiento Visita" : "Estacionamiento",
      tipoUnidadId,
      metraje: 12.5,
      prorrateo: esVisita ? 0 : 0.005,
      rolSii: "",
      estadoId: esVisita ? "comun" : "en-uso",
      servicios: {},
    }
    await prisma.unidad.upsert({ where: { id }, update: fila, create: { id, ...fila } })
  }

  // S4 — cuatro locales en el mismo sector comercial.
  const LOCALES = [
    { id: "u-LC-01", numero: "L-01", tipoUnidadId: "local-a", metraje: 120, prorrateo: 0.05 },
    { id: "u-LC-02", numero: "L-02", tipoUnidadId: "local-b", metraje: 60, prorrateo: 0.025 },
    { id: "u-LC-03", numero: "L-03", tipoUnidadId: "local-b", metraje: 60, prorrateo: 0.025 },
    { id: "u-LC-04", numero: "L-04", tipoUnidadId: "local-b", metraje: 60, prorrateo: 0.025 },
  ]
  for (const local of LOCALES) {
    const fila = {
      comunidadId,
      microSectorId: "piso-comercial-1",
      numero: local.numero,
      etiqueta: "Local",
      tipoUnidadId: local.tipoUnidadId,
      metraje: local.metraje,
      prorrateo: local.prorrateo,
      rolSii: `999-${local.numero.slice(2)}`,
      estadoId: "en-uso",
      servicios: { agua: { cliente: `C-${local.numero}`, medidor: `ML-${local.numero.slice(2)}` } },
    }
    await prisma.unidad.upsert({ where: { id: local.id }, update: fila, create: { id: local.id, ...fila } })
  }

  // S3 — 2 quinchos + 1 salón de eventos + 1 piscina. El elemento existente se
  // conserva y se renombra: hay una reserva confirmada que lo referencia.
  const existente = await prisma.elementoRA.findFirst({ where: { comunidadId }, orderBy: { id: "asc" } })
  const AMENITIES = [
    { id: existente?.id ?? "ra-quincho-1", nombre: "Quincho 1", aforo: 20, tarifa: 15_000, garantia: 30_000, bloque: 3 },
    { id: "ra-quincho-2", nombre: "Quincho 2", aforo: 20, tarifa: 15_000, garantia: 30_000, bloque: 3 },
    { id: "ra-salon-eventos", nombre: "Salón de Eventos", aforo: 80, tarifa: 45_000, garantia: 120_000, bloque: 6 },
    { id: "ra-piscina", nombre: "Piscina", aforo: 40, tarifa: 0, garantia: 0, bloque: 2 },
  ]
  for (const amenity of AMENITIES) {
    const fila = {
      comunidadId,
      nombre: amenity.nombre,
      tipo: "espacio_fisico",
      microSectorId: "piso-torre-e-4",
      activo: true,
      franja: "bloques_horas",
      duracionBloqueHoras: amenity.bloque,
      tarifaUso: amenity.tarifa,
      garantiaRequerida: amenity.garantia,
      aforo: amenity.aforo,
      anticipacionMinimaDias: 2,
      cancelacionTardiaDias: 1,
      penalizacionTardiaMonto: 7_500,
    }
    await prisma.elementoRA.upsert({ where: { id: amenity.id }, update: fila, create: { id: amenity.id, ...fila } })
  }

  const deptos = await prisma.unidad.findMany({
    where: { comunidadId, microSectorId: { startsWith: "piso-torre-" } },
    select: { id: true, numero: true, tipoUnidadId: true, prorrateo: true },
    orderBy: { id: "asc" },
  })
  const locales = await prisma.unidad.findMany({
    where: { comunidadId, microSectorId: "piso-comercial-1" },
    select: { id: true, numero: true, tipoUnidadId: true, prorrateo: true },
    orderBy: { id: "asc" },
  })
  const estac = await prisma.unidad.findMany({
    where: { comunidadId, microSectorId: { startsWith: "est-" } },
    select: { id: true, numero: true, tipoUnidadId: true, prorrateo: true },
    orderBy: { id: "asc" },
  })

  return {
    deptos,
    locales,
    estacPrivados: estac.filter((u) => u.tipoUnidadId !== "tipo-es-visita"),
    estacVisitas: estac.filter((u) => u.tipoUnidadId === "tipo-es-visita"),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Paso 2 — Personas, dueños y ocupación (S1, S6, S7, S8)
// ────────────────────────────────────────────────────────────────────────────

const CANTIDAD_DUENIOS = 73
const CANTIDAD_ARRENDADAS = 32 // 40 % de las 80 unidades: el resto lo ocupa su dueño (S7)

type Personas = { duenios: string[] }

async function cargarRutsExistentes(): Promise<void> {
  // Personas Y proveedores: los RUT de ambos comparten espacio de numeración
  // en la práctica y el proveedor tiene @@unique([comunidadId, rut]).
  const personas = await prisma.persona.findMany({ select: { rut: true } })
  const proveedores = await prisma.proveedorPE.findMany({ where: { comunidadId }, select: { rut: true } })
  for (const fila of [...personas, ...proveedores]) {
    rutsUsados.add(fila.rut.trim().toUpperCase().replace(/\./g, "").replace(/\s/g, ""))
  }
}

/**
 * S1 — un RUT por persona. Si el estado previo dejó dos personas con el mismo
 * documento, la segunda (por id ascendente) recibe uno nuevo y válido. Sin
 * esto la ficha de la persona queda ambigua y el login por documento se vuelve
 * impredecible.
 */
async function deduplicarRuts(): Promise<void> {
  const personas = await prisma.persona.findMany({
    where: { comunidadId },
    select: { id: true, rut: true },
    orderBy: { id: "asc" },
  })
  const vistos = new Set<string>()
  let reparados = 0
  for (const persona of personas) {
    const clave = persona.rut.trim().toUpperCase().replace(/\./g, "").replace(/\s/g, "")
    if (!vistos.has(clave)) {
      vistos.add(clave)
      continue
    }
    const nuevoRut = rutNuevo()
    await prisma.persona.update({ where: { id: persona.id }, data: { rut: nuevoRut } })
    vistos.add(nuevoRut.replace(/\./g, ""))
    reparados++
  }
  if (reparados > 0) console.log(`[ruts] ${reparados} RUT duplicados reparados`)
}

async function crearPersona(
  id: string,
  roles: string[],
  datosGobernanza?: Prisma.InputJsonValue,
): Promise<string> {
  const { nombres, apellidos, nombreCompleto } = generarNombre()
  const rut = rutNuevo()
  const email = `${nombres.split(" ")[0]?.toLowerCase()}.${apellidos.split(" ")[0]?.toLowerCase()}.${id}@demo.cl`
  const fila = {
    comunidadId,
    rut,
    nombreCompleto,
    nombres,
    apellidos,
    email,
    telefonoMovil: `+569${entero(40_000_000, 99_999_999)}`,
    telefonoFijo: null,
    fotografiaUrl: null,
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles,
    datosLaborales: Prisma.DbNull,
    datosGobernanza: datosGobernanza ?? Prisma.DbNull,
  }
  await prisma.persona.upsert({ where: { id }, update: fila, create: { id, ...fila } })
  return id
}

async function agregarRol(personaId: string, roles: string[]): Promise<void> {
  const persona = await prisma.persona.findUnique({ where: { id: personaId }, select: { roles: true } })
  if (!persona) return
  const actuales = Array.isArray(persona.roles) ? (persona.roles as string[]) : []
  const fusionados = [...new Set([...actuales, ...roles])]
  await prisma.persona.update({ where: { id: personaId }, data: { roles: fusionados } })
}

async function vincular(personaId: string, unidadId: string, rol: string): Promise<void> {
  const id = `v-${rol}-${personaId}-${unidadId}`
  const existente = await prisma.vinculoUnidad.findFirst({ where: { personaId, unidadId, rol, fechaFin: null } })
  if (existente) return
  const fila = {
    comunidadId,
    personaId,
    unidadId,
    rol,
    fechaInicio: "2025-01-01",
    fechaFin: null,
    estadoOcupacionPropiedad: null,
    permiteVerFinanzas: rol === "propietario" || rol === "copropietario",
    cerrarAnterior: false,
  }
  await prisma.vinculoUnidad.upsert({ where: { id }, update: fila, create: { id, ...fila } })
}

async function pasoPersonas(estructura: Estructura): Promise<Personas> {
  await cargarRutsExistentes()
  await deduplicarRuts()

  const propiedades = [...estructura.deptos, ...estructura.locales, ...estructura.estacPrivados]

  // S8 — la directiva tiene **un** cargo por persona. Se limpian los cargos
  // previos antes de reasignar: dejar cargos duplicados (dos presidentes, dos
  // secretarios) rompe el guard de gobernanza y contradice la spec.
  await prisma.persona.updateMany({ where: { comunidadId }, data: { datosGobernanza: Prisma.DbNull } })
  const sobrante = await prisma.persona.findUnique({ where: { id: "p-gob-presidente" }, select: { id: true } })
  if (sobrante) {
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId, personaId: "p-gob-presidente" } })
    await prisma.persona.delete({ where: { id: "p-gob-presidente" } })
  }

  const vinculosVigentes = await prisma.vinculoUnidad.findMany({ where: { comunidadId, fechaFin: null } })
  const duenioDe = new Map<string, string>()
  for (const v of vinculosVigentes) {
    if (v.rol === "propietario" || v.rol === "copropietario") duenioDe.set(v.unidadId, v.personaId)
  }
  const duenios = [...new Set([...duenioDe.values()])].sort()
  const sinDuenio = propiedades.filter((p) => !duenioDe.has(p.id))

  // Cargos con datosGobernanza (el administrador NO es un cargo de directiva:
  // su rol vive en Membresia y su dueño se garantiza abajo).
  const CARGOS = [
    { personaId: "p-1", cargo: "presidente" },
    { personaId: "p-6", cargo: "tesorero" },
    { personaId: "p-arrendatario-1", cargo: "secretario" },
  ] as const

  // S8 — administrador, presidente y tesorero son dueños; el secretario arrienda.
  for (const obligado of ["p-5", "p-1", "p-6"]) {
    const yaDuenio = [...duenioDe.values()].includes(obligado)
    if (!yaDuenio) {
      const unidad = sinDuenio.shift()
      if (unidad) {
        await vincular(obligado, unidad.id, "propietario")
        duenioDe.set(unidad.id, obligado)
      }
    }
    if (!duenios.includes(obligado)) duenios.push(obligado)
    await agregarRol(obligado, ["propietario", "residente"])
  }

  // S6 — se completa hasta 73 dueños; cada uno recibe al menos una propiedad.
  // Los ids `p-own-NN` son deterministas: el contador arranca en el primer
  // número libre de la base para no reutilizar (ni reescribir) a un dueño que
  // ya existe, que es lo que dejaba el conteo final en 72.
  const idsDuenioExistentes = await prisma.persona.findMany({
    where: { id: { startsWith: "p-own-" } },
    select: { id: true },
  })
  let nuevo =
    1 +
    idsDuenioExistentes.reduce(
      (maximo, persona) => Math.max(maximo, Number(/^p-own-(\d+)$/.exec(persona.id)?.[1] ?? 0)),
      0,
    )
  while (duenios.length < CANTIDAD_DUENIOS && sinDuenio.length > 0) {
    const id = `p-own-${String(nuevo++).padStart(2, "0")}`
    await crearPersona(id, ["propietario"])
    duenios.push(id)
    const cuantas = Math.min(sinDuenio.length, entero(1, 3))
    for (let i = 0; i < cuantas; i++) {
      const unidad = sinDuenio.shift()
      if (!unidad) break
      await vincular(id, unidad.id, "propietario")
      duenioDe.set(unidad.id, id)
    }
  }
  // Si quedaron propiedades repartibles, se reparten entre los dueños ya existentes.
  let cursor = 0
  for (const unidad of sinDuenio) {
    const personaId = duenios[cursor++ % duenios.length] as string
    await vincular(personaId, unidad.id, "propietario")
    duenioDe.set(unidad.id, personaId)
  }

  // Garantía final (S6): los 73 dueños existen y **cada uno** tiene al menos una
  // propiedad con vínculo vigente. Cubre los dos huecos posibles: falta de cupo
  // (dueño sin propiedad) y falta de cantidad (73 dueños). Nunca toma una
  // propiedad de la directiva. La consulta va contra la base y no contra
  // `duenioDe`: ese mapa está indexado por unidad, así que pierde dueños cuando
  // una misma unidad tiene más de un propietario/copropietario.
  const CARGOS_DIRECTIVA = new Set(["p-5", "p-1", "p-6"])
  // Ceder un local o un estacionamiento no altera la ocupación dueño/residente
  // de los departamentos (S7); un departamento es el último recurso.
  const noResidenciales = new Set([...estructura.locales, ...estructura.estacPrivados].map((u) => u.id))
  let dueniosVigentes = duenios
  for (;;) {
    const vigentes = await prisma.vinculoUnidad.findMany({
      where: { comunidadId, fechaFin: null, rol: { in: ["propietario", "copropietario"] } },
      select: { personaId: true, unidadId: true, rol: true },
      orderBy: { unidadId: "asc" },
    })
    const porDuenio = new Map<string, { unidadId: string; rol: string }[]>()
    for (const v of vigentes) {
      const lista = porDuenio.get(v.personaId) ?? []
      lista.push({ unidadId: v.unidadId, rol: v.rol })
      porDuenio.set(v.personaId, lista)
    }
    dueniosVigentes = [...porDuenio.keys()].sort()
    const sinPropiedad = [...CARGOS_DIRECTIVA].filter((id) => !porDuenio.has(id))
    const faltaCantidad = dueniosVigentes.length < CANTIDAD_DUENIOS
    if (sinPropiedad.length === 0 && !faltaCantidad) break

    // Donante: dueño con más de una propiedad, siempre fuera de la directiva.
    // Se ordena por cantidad y luego por id para que la elección sea estable.
    const donante = dueniosVigentes
      .filter((id) => !CARGOS_DIRECTIVA.has(id))
      .map((id) => ({ personaId: id, propiedades: porDuenio.get(id) ?? [] }))
      .filter((d) => d.propiedades.length > 1)
      .sort((a, b) => b.propiedades.length - a.propiedades.length || a.personaId.localeCompare(b.personaId))[0]
    const cedible = donante?.propiedades
      .slice()
      .sort(
        (a, b) =>
          Number(noResidenciales.has(b.unidadId)) - Number(noResidenciales.has(a.unidadId)) ||
          a.unidadId.localeCompare(b.unidadId),
      )[0]
    if (!donante || !cedible) break

    // Sin donante no se crea el dueño: dejarlo sin propiedad rompería S6.
    const objetivo = sinPropiedad[0] ?? `p-own-${String(nuevo++).padStart(2, "0")}`
    if (sinPropiedad.length === 0) await crearPersona(objetivo, ["propietario"])
    // Solo se libera el vínculo vigente; el historial cerrado se conserva.
    await prisma.vinculoUnidad.deleteMany({
      where: {
        comunidadId,
        unidadId: cedible.unidadId,
        personaId: donante.personaId,
        rol: cedible.rol,
        fechaFin: null,
      },
    })
    await vincular(objetivo, cedible.unidadId, cedible.rol)
    duenioDe.delete(cedible.unidadId)
    duenioDe.set(cedible.unidadId, objetivo)
  }

  // S7 — 48 unidades las ocupa su dueño, 32 se arriendan (40 %). Solo cuentan
  // las unidades residenciales: un arriendo de local o estacionamiento no
  // consume cupo de los 32.
  const idsDepto = new Set(estructura.deptos.map((u) => u.id))
  const arrendadas = new Map<string, string>()
  for (const v of vinculosVigentes) {
    if (v.rol === "arrendatario" && idsDepto.has(v.unidadId)) arrendadas.set(v.unidadId, v.personaId)
  }
  // u-A-101 queda arrendada: es la unidad documentada de p-arrendatario-1.
  if (!arrendadas.has("u-A-101")) {
    await vincular("p-arrendatario-1", "u-A-101", "arrendatario")
    arrendadas.set("u-A-101", "p-arrendatario-1")
  }

  const candidatas = estructura.deptos.filter((u) => !arrendadas.has(u.id))
  let arrendatario = 1
  while (arrendadas.size < CANTIDAD_ARRENDADAS && candidatas.length > 0) {
    const unidad = candidatas.shift()
    if (!unidad) break
    const id = `p-arr-${String(arrendatario++).padStart(2, "0")}`
    await crearPersona(id, ["residente"])
    await vincular(id, unidad.id, "arrendatario")
    arrendadas.set(unidad.id, id)
  }

  // Las unidades que no se arriendan las ocupa su dueño: se marca al residente.
  for (const depto of estructura.deptos) {
    if (arrendadas.has(depto.id)) continue
    const duenio = duenioDe.get(depto.id)
    if (duenio) await agregarRol(duenio, ["propietario", "residente"])
  }

  // S8 — el secretario es arrendatario: p-arrendatario-1 arrienda u-A-101.
  await agregarRol("p-arrendatario-1", ["residente", "directiva"])
  for (const [indice, cargo] of CARGOS.entries()) {
    await prisma.persona.update({
      where: { id: cargo.personaId },
      data: {
        datosGobernanza: { id: `g-${indice + 1}`, cargoDirectiva: cargo.cargo, fechaAsuncion: "2025-03-01" },
      },
    })
    await agregarRol(cargo.personaId, ["directiva"])
  }

  return { duenios: dueniosVigentes }
}

// ────────────────────────────────────────────────────────────────────────────
// Paso 3 — Fondos, emisiones de gasto común y cobros (S9)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Porcentaje del fondo de reserva que el seed aplica a cada emisión. Es el
 * mismo número que declara `fondo-reserva.porcentajeAporte`: una sola fuente
 * para el aporte sembrado y para los parámetros de la versión del reglamento.
 */
const PORCENTAJE_RESERVA_DEMO = 5

/** Fondo de imputación del recargo al fondo de reserva (el aporte no es interno). */
const FONDO_RESERVA_ID = "fondo-reserva"

/** Fondo de imputación del gasto común presupuestado. */
const FONDO_GC_ID = "fondo-gc"

const FONDOS = [
  { id: FONDO_GC_ID, nombre: "Fondo de Gasto Común", tipo: "gasto_comun", saldoInicial: 3_450_000, porcentajeAporte: null },
  { id: FONDO_RESERVA_ID, nombre: "Fondo de Reserva", tipo: "reserva", saldoInicial: 12_800_000, porcentajeAporte: PORCENTAJE_RESERVA_DEMO },
  { id: "fondo-amenities", nombre: "Fondo de Amenities", tipo: "amenities", saldoInicial: 1_250_000, porcentajeAporte: null },
  { id: "fondo-cc-punto-cero", nombre: "Cuenta Corriente", tipo: "gasto_comun", saldoInicial: 17_082_694, porcentajeAporte: null },
]

type Finanzas = { duenioDe: Map<string, string> }

/** Una línea del detalle de un cobro sembrado: concepto, monto y su fondo. */
type LineaCobroSembrada = {
  concepto: "gasto_comun"
  monto: number
  fondoId: string
}

/**
 * Recargo al fondo de reserva de una unidad: el porcentaje que declara la
 * versión vigente aplicado a su presupuesto, redondeado como el cobro. Es la
 * MISMA cuenta que hace `detalleDeCobroGc`, de modo que el aporte que declara
 * la emisión es exactamente la suma de las líneas de reserva de sus cobros.
 */
function reservaDe(presupuestoUnidad: number): number {
  return monto(presupuestoUnidad * (PORCENTAJE_RESERVA_DEMO / 100))
}

/**
 * Detalle de un cobro de gasto común (S5): el presupuesto de la unidad como
 * línea de gasto común y, ENCIMA, el recargo al fondo de reserva imputado al
 * fondo de reserva. Las líneas suman exactamente `montoBase`.
 *
 * Es la forma que escribe `app/api/emisiones-gc` (`desgloseCobro`) con
 * `reservaIncluidaEnPresupuesto: false`, que es lo que declara la versión de
 * este seed: el recargo se suma al presupuesto, no se desagrega de él. El seed
 * escribe por Prisma directo y no importa esa función privada; lo que replica
 * es el contrato, no el código.
 */
function detalleDeCobroGc(presupuestoUnidad: number): {
  montoBase: number
  lineas: LineaCobroSembrada[]
} {
  const reserva = reservaDe(presupuestoUnidad)
  const lineas: LineaCobroSembrada[] = [
    { concepto: "gasto_comun", monto: presupuestoUnidad, fondoId: FONDO_GC_ID },
  ]
  // Una línea de monto cero no se siembra: el esquema exige líneas positivas.
  if (reserva > 0) {
    lineas.push({ concepto: "gasto_comun", monto: reserva, fondoId: FONDO_RESERVA_ID })
  }
  return { montoBase: presupuestoUnidad + reserva, lineas }
}

async function pasoFinanzas(estructura: Estructura): Promise<Finanzas> {
  for (const fondo of FONDOS) {
    const fila = {
      comunidadId,
      nombre: fondo.nombre,
      tipo: fondo.tipo,
      descripcion: null,
      porcentajeAporte: fondo.porcentajeAporte,
      activo: true,
      saldoInicial: fondo.saldoInicial,
    }
    await prisma.fondoFI.upsert({ where: { id: fondo.id }, update: fila, create: { id: fondo.id, ...fila } })
  }

  const vinculos = await prisma.vinculoUnidad.findMany({
    where: { comunidadId, fechaFin: null, rol: { in: ["propietario", "copropietario"] } },
    select: { unidadId: true, personaId: true },
  })
  const duenioDe = new Map(vinculos.map((v) => [v.unidadId, v.personaId]))
  const responsable = (unidadId: string) => duenioDe.get(unidadId) ?? "p-5"

  // T3 (cobro-gastos-comunes-parametrico): la emisión por API exige una versión
  // vigente del reglamento con fuente real. Este seed escribe `emisiones_gc` y
  // `cobros_fi` directo por Prisma, así que nunca pasó por la compuerta; sin
  // esta versión, el demo abre y «Emitir» responde que la comunidad no declaró
  // nada. Los parámetros replican lo que el seed ya calcula: mismo vencimiento
  // (`vencimientoDe`), mismo % de reserva que `reservaDe` y la tasa de mora de
  // sus cobros. El demo no modela corte ni IPC, así que esos quedan con los
  // valores por defecto que documenta la migración `add_version_reglamento`.
  // `reservaIncluidaEnPresupuesto: false` se declara explícito porque es el
  // caso que el demo muestra: el recargo se cobra ENCIMA del presupuesto, así
  // que el total a recaudar de cada período es presupuesto + recargo.
  const primeraVersion = {
    vigenteDesde: PERIODOS[0],
    fuenteInstrumento: "acta_asamblea",
    actaRef: "Acta de asamblea (dato de demo)",
    formaContribucion: "monto_por_tipo",
    parametros: {
      porcentajeReserva: PORCENTAJE_RESERVA_DEMO,
      diasPagoGc: diasDePagoDe(PERIODOS[0]),
      tasaMoraMensualPct: 1.5,
      topeMoraPct: 50,
      cuotasCorte: 3,
      diasPreavisoCorte: 5,
      ipcActivo: false,
      reservaIncluidaEnPresupuesto: false,
    },
  }
  await prisma.versionReglamento.upsert({
    where: { comunidadId_version: { comunidadId, version: 1 } },
    update: primeraVersion,
    create: { id: `reglamento-${comunidadId}-v1`, comunidadId, version: 1, ...primeraVersion },
  })

  const conGastoComun = [...estructura.deptos, ...estructura.locales, ...estructura.estacPrivados]
  const factorPeriodo: Record<string, number> = { "2026-08": 1, "2026-09": 1.021, "2026-10": 1.034 }

  for (const periodo of PERIODOS) {
    const factor = factorPeriodo[periodo] ?? 1
    const lineas: Array<{ unidadId: string; responsablePersonaId: string; monto: number; cobroId: string }> = []
    // Presupuesto del período (Σ lo que asigna la fórmula por unidad, SIN el
    // recargo) y aporte al fondo de reserva (Σ recargos de las unidades). El
    // recargo se cuenta por unidad porque es por unidad que se cobra: sumarlo
    // sobre el total redondeado una sola vez daría un aporte que ningún cobro
    // respalda en el centavo.
    let bruto = 0
    let reservaTotal = 0

    for (const unidad of conGastoComun) {
      const base = BASE_GC[unidad.tipoUnidadId] ?? 30_000
      const montoGc = monto(base * factor)
      const cobroId = `cobro-${periodo}-${unidad.id}`
      lineas.push({
        unidadId: unidad.id,
        responsablePersonaId: responsable(unidad.id),
        // Presupuesto de la unidad: el cargo con su recargo es el `montoBase`
        // del cobro, no esta línea (mismo criterio que la emisión por API).
        monto: montoGc,
        cobroId,
      })
      bruto += montoGc
      reservaTotal += reservaDe(montoGc)
    }

    const emisionId = `emision-${periodo}`
    const filaEmision = {
      comunidadId,
      periodo,
      modo: "fijo",
      // Presupuesto emitido, no el total a recaudar: el recargo al fondo de
      // reserva se cobra al lado y vive en `fondoReservaAporte`.
      gastoTotal: bruto,
      lineas,
      // El aporte declarado ES la suma de las líneas de reserva de los cobros
      // de esta emisión, no un asiento interno del presupuesto.
      fondoReservaAporte: { fondoId: FONDO_RESERVA_ID, monto: reservaTotal },
      fechaEmision: `${periodo}-01`,
    }
    await prisma.emisionGC.upsert({ where: { id: emisionId }, update: filaEmision, create: { id: emisionId, ...filaEmision } })

    // Cobro por unidad. ~88 % paga al día; el resto queda con mora (S9: morosidad real).
    for (const [indice, linea] of lineas.entries()) {
      const paga = (indice * 7 + periodo.length) % 100 < 88
      const cobroId = linea.cobroId
      const fechaCargo = `${periodo}-01`
      const fechaVencimiento = vencimientoDe(periodo)
      // El cobro lleva su detalle: presupuesto + recargo de reserva. Lo que se
      // cobra a la unidad (`montoBase`) es la suma de esas líneas, y es también
      // lo que paga quien está al día: si el pago se quedara en el presupuesto,
      // la reserva declarada volvería a ser un número que nadie paga.
      const detalle = detalleDeCobroGc(linea.monto)
      const pagos = paga
        ? [
            {
              id: `pago-${cobroId}`,
              monto: detalle.montoBase,
              fecha: iso(new Date(Date.UTC(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)) - 1, entero(5, 9)))),
              medio: elegir(["transferencia", "webpay", "efectivo"] as const),
            },
          ]
        : []
      const moras = paga
        ? []
        : [
            {
              id: `mora-${cobroId}`,
              monto: monto(detalle.montoBase * 0.02),
              diasAtraso: periodo === "2026-10" ? 22 : 52,
              tasaMensualPct: 1.5,
              fecha: vencimientoDe(periodo),
            },
          ]
      const filaCobro = {
        comunidadId,
        unidadId: linea.unidadId,
        periodo,
        concepto: "gasto_comun",
        origenModulo: "FI",
        origenRef: emisionId,
        fondoId: FONDO_GC_ID,
        descripcion: `Gasto común ${periodo}`,
        montoBase: detalle.montoBase,
        // S5: el detalle del cobro, con el recargo imputado a su propio fondo.
        lineas: detalle.lineas,
        fechaCargo,
        fechaVencimiento,
        moras,
        pagos,
        diferencias: [],
      }
      await prisma.cobroFI.upsert({ where: { id: cobroId }, update: filaCobro, create: { id: cobroId, ...filaCobro } })
    }
  }

  const filaConfig = {
    comunidadId,
    canalVisor: true,
    canalEmail: true,
    actualizadoPor: "seed-demo-consistente",
  }
  await prisma.configuracionCobranzaFI.upsert({
    where: { id: `config-cobranza-${comunidadId}` },
    update: filaConfig,
    create: { id: `config-cobranza-${comunidadId}`, ...filaConfig },
  })

  return { duenioDe }
}

// ────────────────────────────────────────────────────────────────────────────
// Paso 4 — Nóminas por pagar (S9)
// ────────────────────────────────────────────────────────────────────────────

const TRABAJADORES = [
  { id: "p-trab-conserje", cargo: "Conserje turno día", sueldo: 780_000, afp: "afp-habitat", nombreAfp: "AFP Habitat", salud: "fonasa", nombreSalud: "FONASA" },
  { id: "p-trab-mayordomo", cargo: "Mayordomo", sueldo: 950_000, afp: "afp-cuprum", nombreAfp: "AFP Cuprum", salud: "isapre-colmena", nombreSalud: "Isapre Colmena" },
  { id: "p-trab-aseo", cargo: "Auxiliar de aseo", sueldo: 620_000, afp: "afp-modelo", nombreAfp: "AFP Modelo", salud: "fonasa", nombreSalud: "FONASA" },
]

async function pasoNominas(): Promise<void> {
  const periodo = "2026-10"
  // Sonido de negocio: sueldo base + bonos, descuentos legales, líquido pendiente.
  for (const [indice, trabajador] of TRABAJADORES.entries()) {
    const existente = await prisma.persona.findUnique({ where: { id: trabajador.id } })
    if (!existente) {
      await crearPersona(trabajador.id, ["personal"])
      await prisma.persona.update({
        where: { id: trabajador.id },
        data: { datosLaborales: { cargo: trabajador.cargo, tipoContrato: "indefinido", fechaIngreso: "2024-03-01" } },
      })
    }

    const movilizacion = 55_000
    const colacion = 65_000
    const bonos = [{ id: `bono-${trabajador.id}`, descripcion: "Bono de asistencia", monto: 40_000 }]
    const totalBonos = bonos.reduce((total, b) => total + b.monto, 0)
    const totalHaberes = trabajador.sueldo + movilizacion + colacion + totalBonos
    const totalImponible = trabajador.sueldo + totalBonos
    const montoAfp = monto(totalImponible * 0.1127)
    const montoSalud = monto(totalImponible * 0.07)
    const montoSIS = monto(totalImponible * 0.0149)
    const montoSeguroCesantia = monto(totalImponible * 0.006)
    const totalDescuentos = montoAfp + montoSalud + montoSIS + montoSeguroCesantia
    const liquido = totalHaberes - totalDescuentos

    const fila = {
      comunidadId,
      folio: `LQ-${periodo}-${String(indice + 1).padStart(3, "0")}`,
      trabajadorPersonaId: trabajador.id,
      periodo,
      fechaGeneracion: `2026-10-31`,
      diasTrabajados: 30,
      sueldoBaseContrato: trabajador.sueldo,
      diasMesComercial: 30,
      jornadaSemanal: 45,
      sueldoBaseProporcional: trabajador.sueldo,
      horasExtrasHoras: 0,
      valorHoraOrdinaria: monto(trabajador.sueldo / 180),
      montoHorasExtras: 0,
      bonos,
      gratificacionLegal: 0,
      totalImponible,
      asignacionMovilizacion: movilizacion,
      asignacionColacion: colacion,
      asignacionFamiliarTramoId: null,
      cargas: 0,
      montoAsignacionFamiliar: 0,
      totalHaberes,
      afpId: trabajador.afp,
      nombreAfp: trabajador.nombreAfp,
      tasaAFP: 11.27,
      montoAFP: montoAfp,
      saludId: trabajador.salud,
      nombreSalud: trabajador.nombreSalud,
      saludTipo: trabajador.salud === "fonasa" ? "fonasa" : "isapre",
      saludPorcentaje: 7,
      saludValorUF: null,
      ufAplicada: null,
      montoSalud,
      tasaSIS: 1.49,
      montoSIS,
      montoSeguroCesantia,
      montoAPV: 0,
      totalDescuentos,
      descuentoAnticipos: 0,
      adelantosIds: [],
      adelantosDetalle: Prisma.DbNull,
      alcanceLiquido: liquido,
      liquidoAPagar: liquido,
      // «borrador» = devengada y todavía no pagada: es la nómina por pagar del dashboard.
      estado: "borrador",
      egresoFIReferencia: null,
      proyeccionPEReferencia: null,
    }
    const id = `liq-${periodo}-${trabajador.id}`
    await prisma.liquidacionPL.upsert({ where: { id }, update: fila, create: { id, ...fila } })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Paso 5 — Proveedores, mantenciones preventivas y visitas técnicas (S9)
// ────────────────────────────────────────────────────────────────────────────

const PROVEEDORES = [
  { id: "prv-hidropack", nombre: "Hidropack SpA", rubro: "Mantención de hidropack", contacto: "Marcela Ortúzar", telefono: "+56944112233", email: "contacto@hidropack.cl", sitioWeb: "https://hidropack.cl" },
  { id: "prv-ascensores", nombre: "Ascensores Andinos Ltda", rubro: "Ascensores", contacto: "Rodrigo Peña", telefono: "+56944223344", email: "servicio@ascensoresandinos.cl", sitioWeb: "https://ascensoresandinos.cl" },
  { id: "prv-edificio", nombre: "Constructora Vértice SpA", rubro: "Mantención de edificio", contacto: "Paula Requena", telefono: "+56944334455", email: "obras@vertice.cl", sitioWeb: null },
  { id: "prv-aseo", nombre: "Aseo Industrial Limpio SpA", rubro: "Aseo y sanitización", contacto: "Luis Cárdenas", telefono: "+56944445566", email: "ventas@limpiospa.cl", sitioWeb: null },
  { id: "prv-jardin", nombre: "Jardines del Valle SpA", rubro: "Áreas verdes", contacto: "Sofía Maldonado", telefono: "+56944556677", email: "contacto@jardinesdelvalle.cl", sitioWeb: null },
  { id: "prv-seguridad", nombre: "Seguridad Total SpA", rubro: "Seguridad y CCTV", contacto: "Iván Bustos", telefono: "+56944667788", email: "operaciones@seguridadtotal.cl", sitioWeb: null },
]

const MANTENCIONES = [
  { id: "mant-hidropack", proveedorId: "prv-hidropack", descripcion: "Revisión mensual del hidropack", periodicidadMeses: 1, proximaFecha: "2026-11-12", alertaDiasAntes: 5 },
  { id: "mant-ascensores", proveedorId: "prv-ascensores", descripcion: "Mantención mensual de ascensores (5 edificios)", periodicidadMeses: 1, proximaFecha: "2026-11-18", alertaDiasAntes: 7 },
  { id: "mant-edificio", proveedorId: "prv-edificio", descripcion: "Mantención semestral de fachada y cubierta", periodicidadMeses: 6, proximaFecha: "2027-03-15", alertaDiasAntes: 15 },
  { id: "mant-aseo", proveedorId: "prv-aseo", descripcion: "Sanitización de ductos y estanques", periodicidadMeses: 3, proximaFecha: "2026-12-05", alertaDiasAntes: 7 },
  { id: "mant-jardin", proveedorId: "prv-jardin", descripcion: "Mantención de áreas verdes", periodicidadMeses: 1, proximaFecha: "2026-11-20", alertaDiasAntes: 5 },
  { id: "mant-seguridad", proveedorId: "prv-seguridad", descripcion: "Revisión de cámaras y control de acceso", periodicidadMeses: 3, proximaFecha: "2026-12-12", alertaDiasAntes: 10 },
]

const VISITAS = [
  { id: "vis-01", proveedorId: "prv-hidropack", mantencionId: "mant-hidropack", tecnicoNombre: "Óscar Leiva", fecha: "2026-10-13", trabajoRealizado: "Cambio de filtros y limpieza de estanque del hidropack" },
  { id: "vis-02", proveedorId: "prv-ascensores", mantencionId: "mant-ascensores", tecnicoNombre: "Jorge Vergara", fecha: "2026-10-18", trabajoRealizado: "Certificación mensual de los 10 ascensores" },
  { id: "vis-03", proveedorId: "prv-jardin", mantencionId: "mant-jardin", tecnicoNombre: "Ana Villalobos", fecha: "2026-10-21", trabajoRealizado: "Poda de árboles del sector A y riego programado" },
  { id: "vis-04", proveedorId: "prv-seguridad", mantencionId: "mant-seguridad", tecnicoNombre: "Mauricio Silva", fecha: "2026-10-24", trabajoRealizado: "Reemplazo de dos cámaras en acceso vehicular" },
  { id: "vis-05", proveedorId: "prv-edificio", mantencionId: "mant-edificio", tecnicoNombre: "Cristián Ortega", fecha: "2026-10-27", trabajoRealizado: "Reparación de fisura en cubierta del Edificio 3" },
  { id: "vis-06", proveedorId: "prv-aseo", mantencionId: "mant-aseo", tecnicoNombre: "Patricia Núñez", fecha: "2026-10-29", trabajoRealizado: "Sanitización de ductos de extracción" },
]

async function pasoProveedores(): Promise<void> {
  for (const proveedor of PROVEEDORES) {
    // El RUT es estable entre corridas: si el proveedor ya existe se conserva.
    const previo = await prisma.proveedorPE.findUnique({ where: { id: proveedor.id }, select: { rut: true } })
    const fila = {
      comunidadId,
      rut: previo?.rut ?? rutNuevo(),
      nombre: proveedor.nombre,
      rubro: proveedor.rubro,
      contacto: proveedor.contacto,
      telefono: proveedor.telefono,
      email: proveedor.email,
      sitioWeb: proveedor.sitioWeb,
      activo: true,
    }
    await prisma.proveedorPE.upsert({ where: { id: proveedor.id }, update: fila, create: { id: proveedor.id, ...fila } })
  }

  for (const mantencion of MANTENCIONES) {
    const fila = {
      comunidadId,
      proveedorId: mantencion.proveedorId,
      descripcion: mantencion.descripcion,
      periodicidadMeses: mantencion.periodicidadMeses,
      proximaFecha: mantencion.proximaFecha,
      alertaDiasAntes: mantencion.alertaDiasAntes,
      activo: true,
    }
    await prisma.mantencionPreventivaPE.upsert({
      where: { id: mantencion.id },
      update: fila,
      create: { id: mantencion.id, ...fila },
    })
  }

  for (const visita of VISITAS) {
    const fila = {
      comunidadId,
      proveedorId: visita.proveedorId,
      mantencionId: visita.mantencionId,
      tecnicoNombre: visita.tecnicoNombre,
      fecha: visita.fecha,
      trabajoRealizado: visita.trabajoRealizado,
      supervisorPersonaId: "p-5",
      unidadId: null,
    }
    await prisma.visitaTecnicaPE.upsert({ where: { id: visita.id }, update: fila, create: { id: visita.id, ...fila } })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Paso 6 — Multas cobradas a unidades (S9)
// ────────────────────────────────────────────────────────────────────────────

async function pasoMultas(estructura: Estructura): Promise<void> {
  const tipos = await prisma.tipoInfraccionIN.findMany({ where: { comunidadId }, orderBy: { id: "asc" } })
  if (tipos.length === 0) {
    console.log("[multas] sin catálogo de tipos de infracción: se omite")
    return
  }
  const unidades = estructura.deptos.slice(0, 8)
  for (const [indice, unidad] of unidades.entries()) {
    const tipo = tipos[indice % tipos.length]
    if (!tipo) continue
    const valor = tipo.valor > 0 ? tipo.valor : 25_000
    const infraccionId = `inf-2026-${String(indice + 1).padStart(3, "0")}`
    const cobroId = `cobro-multa-${String(indice + 1).padStart(3, "0")}`
    const paga = indice % 3 !== 0

    const filaInfraccion = {
      comunidadId,
      folio: `IN-2026-${String(indice + 1).padStart(3, "0")}`,
      tipoInfraccionId: tipo.id,
      danoDirecto: Prisma.DbNull,
      unidadId: unidad.id,
      reportantePersonaId: null,
      mensajeBuzonId: null,
      fechaSuceso: `2026-10-${String(entero(3, 25)).padStart(2, "0")}`,
      horaSuceso: `${String(entero(8, 21)).padStart(2, "0")}:${String(entero(0, 59)).padStart(2, "0")}`,
      antecedentes: `Registro de la infracción «${tipo.nombre}» constatada por conserjería.`,
      evidencias: [],
      estado: "aplicada",
      fechaRegistro: "2026-10-28",
      montoAplicado: valor,
      comentariosDirectiva: [],
      respaldosDirectiva: [],
      apelacion: Prisma.DbNull,
      desestimacionJustificacion: null,
      cargoFIReferencia: cobroId,
    }
    await prisma.infraccionIN.upsert({ where: { id: infraccionId }, update: filaInfraccion, create: { id: infraccionId, ...filaInfraccion } })

    const filaCobro = {
      comunidadId,
      unidadId: unidad.id,
      periodo: "2026-10",
      concepto: "multa_in",
      origenModulo: "IN",
      origenRef: infraccionId,
      fondoId: "fondo-gc",
      descripcion: `Multa: ${tipo.nombre}`,
      montoBase: valor,
      fechaCargo: "2026-10-28",
      fechaVencimiento: "2026-11-10",
      moras: [],
      pagos: paga ? [{ id: `pago-${cobroId}`, monto: valor, fecha: "2026-10-30", medio: "transferencia" }] : [],
      diferencias: [],
    }
    await prisma.cobroFI.upsert({ where: { id: cobroId }, update: filaCobro, create: { id: cobroId, ...filaCobro } })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Paso 7 — Portería del día: visitas, encomiendas e ingresos de contratistas
// ────────────────────────────────────────────────────────────────────────────

/**
 * La «foto del día» de Operaciones (`components/dashboard/foto-del-dia.tsx`) lee
 * estas tres tablas y declara «sin movimiento» cuando no hay nada registrado
 * para hoy. La fecha es la de la corrida y no una constante: el panel compara
 * contra `hoyISO()`.
 *
 * Enums que la API valida (`lib/schemas.ts`) y que acá se respetan al pie de la
 * letra, porque un valor inválido deja el panel roto:
 * - visita: `origenAgenda` ∈ pre_agendada | sin_aviso, `estado` ∈ agendada |
 *   ingresada | cancelada, `jornadaId` del maestro `j-manana`/`j-tarde`/`j-noche`.
 * - encomienda: `courierId` del maestro de couriers, `estado` ∈ recibida |
 *   retirada.
 * - contratista: `estado` ∈ agendado | ingresado | cancelado, `agendadoPor` ∈
 *   residente | administracion, `motivo` de 5 caracteres o más.
 */

/** Fecha ISO desplazada N días (negativo = hacia el pasado). */
function desplazarDia(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number) as [number, number, number]
  return iso(new Date(Date.UTC(anio, mes - 1, dia + dias)))
}

const dosDigitos = (n: number) => String(n).padStart(2, "0")

/** Hora de la puerta: la mañana va de 08:00 a 12:59 y la tarde de 13:00 a 20:59. */
function horaDePorteria(manana: boolean): string {
  const horas = manana ? entero(8, 12) : entero(13, 20)
  return `${dosDigitos(horas)}:${dosDigitos(entero(0, 59))}`
}

/** Jornada del maestro sembrado (`j-manana`, `j-tarde`, `j-noche`) según la hora. */
function jornadaDeHora(hora: string): string {
  const horas = Number(hora.slice(0, 2))
  return horas < 13 ? "j-manana" : horas < 20 ? "j-tarde" : "j-noche"
}

/** `hora` menos N minutos, en el mismo formato HH:MM (nunca se va a negativo). */
function restarMinutos(hora: string, minutos: number): string {
  const total = Math.max(0, Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5)) - minutos)
  return `${dosDigitos(Math.floor(total / 60))}:${dosDigitos(total % 60)}`
}

/** `createdAt` con hora local: la lista del día usa esa hora como hora del paquete. */
function fechaHoraLocal(fecha: string, hora: string): Date {
  const [anio, mes, dia] = fecha.split("-").map(Number) as [number, number, number]
  return new Date(anio, mes - 1, dia, Number(hora.slice(0, 2)), Number(hora.slice(3, 5)))
}

/** Patente chilena determinista (4 letras + 2 dígitos) para la visita con auto. */
function patenteDe(indice: number): string {
  const letras = "BCDFGHJKLMNPRSTVWXYZ"
  const cuatro = [1, 3, 7, 11].map((paso) => letras[(indice * paso + paso) % letras.length] as string)
  return `${cuatro.join("")}${dosDigitos((indice * 37 + 11) % 100)}`
}

// 18 visitas ya ingresaron, 2 siguen agendadas y 2 se cancelaron: el panel no
// cuenta las canceladas, así que el día muestra movimiento real.
const ESTADOS_VISITA = [
  "ingresada", "ingresada", "ingresada", "ingresada", "agendada",
  "ingresada", "ingresada", "cancelada", "ingresada", "ingresada",
  "ingresada", "ingresada", "ingresada", "agendada", "ingresada",
  "ingresada", "ingresada", "ingresada", "cancelada", "ingresada",
  "ingresada", "ingresada",
] as const

const NOTAS_VISITA = [
  "Llegó caminando por el acceso peatonal.",
  "Estacionó en el estacionamiento de visita E-085.",
  "Trae herramientas para una reparación menor.",
  "Acompaña al residente hasta la unidad.",
  "Entrega de comida, no sube.",
  "Visita familiar de la tarde.",
]

const TIPOS_PAQUETE = [
  "Caja de cartón mediana",
  "Sobre con documentos",
  "Bolsa de supermercado",
  "Caja grande de 40x30x30",
  "Tubo con planos",
  "Caja pequeña de farmacia",
]

// Maestros sembrados por `seed-db-from-mocks` (no se crean acá).
const COURIERS_PORTERIA = [
  "cour-chilexpress",
  "cour-starken",
  "cour-pedidosya",
  "cour-uberflash",
  "cour-correos",
  "cour-otro",
] as const

// 9 encomiendas de hoy (6 por retirar y 3 ya retiradas) + 2 que llegaron ayer y
// siguen en portería: el panel cuenta las pendientes sin importar el día.
const ENCOMIENDAS_PORTERIA = 11
const ENCOMIENDAS_DE_AYER = 2

const INGRESOS_CONTRATISTAS = [
  { proveedorId: "prv-hidropack", motivo: "Revisión mensual del hidropack y cambio de filtros", hora: "09:20", estado: "ingresado", agendadoPor: "administracion" },
  { proveedorId: "prv-ascensores", motivo: "Mantención mensual de los ascensores de los cinco edificios", hora: "10:05", estado: "ingresado", agendadoPor: "administracion" },
  { proveedorId: "prv-aseo", motivo: "Sanitización de los ductos de extracción", hora: "11:40", estado: "ingresado", agendadoPor: "administracion" },
  { proveedorId: "prv-edificio", motivo: "Reparación de filtración en la techumbre del departamento", hora: "15:30", estado: "ingresado", agendadoPor: "residente" },
  { proveedorId: "prv-jardin", motivo: "Poda de los árboles del sector de la piscina", hora: "16:45", estado: "agendado", agendadoPor: "administracion" },
  { proveedorId: "prv-seguridad", motivo: "Revisión de las cámaras del acceso vehicular", hora: "18:10", estado: "agendado", agendadoPor: "administracion" },
] as const

async function pasoPorteria(estructura: Estructura): Promise<void> {
  if (estructura.deptos.length === 0) {
    console.log("[porteria] sin departamentos sembrados: se omite")
    return
  }
  const dia = hoyISO()

  // Residentes vigentes por unidad: las visitas y las encomiendas apuntan a una
  // persona real de la comunidad, no a un id inventado.
  const vinculos = await prisma.vinculoUnidad.findMany({
    where: {
      comunidadId,
      fechaFin: null,
      rol: { in: ["propietario", "copropietario", "arrendatario"] },
    },
    select: { unidadId: true, personaId: true },
    orderBy: [{ unidadId: "asc" }, { personaId: "asc" }],
  })
  const personas = await prisma.persona.findMany({
    where: { comunidadId, id: { in: [...new Set(vinculos.map((v) => v.personaId))] } },
    select: { id: true, nombreCompleto: true },
  })
  const nombreDe = new Map(personas.map((p) => [p.id, p.nombreCompleto]))
  const residenteDe = new Map<string, { personaId: string; nombre: string }>()
  for (const vinculo of vinculos) {
    if (residenteDe.has(vinculo.unidadId)) continue
    residenteDe.set(vinculo.unidadId, {
      personaId: vinculo.personaId,
      nombre: nombreDe.get(vinculo.personaId) ?? vinculo.personaId,
    })
  }
  const conResidente = estructura.deptos.filter((unidad) => residenteDe.has(unidad.id))
  const destinos = conResidente.length > 0 ? conResidente : estructura.deptos

  // Visitas de la bitácora, repartidas entre mañana y tarde.
  for (const [indice, estado] of ESTADOS_VISITA.entries()) {
    const unidad = destinos[indice % destinos.length] as UnidadMin
    const residente = residenteDe.get(unidad.id)
    const manana = indice % 2 === 0
    const hora = horaDePorteria(manana)
    const horaIngreso = estado === "ingresada" ? hora : null
    const origenAgenda = indice % 3 === 0 ? "sin_aviso" : "pre_agendada"
    // La visita sin aviso entra autorizada por teléfono: la gestión queda con su
    // hora, que es anterior al ingreso (es la llamada, no el portazo).
    const autorizada = origenAgenda === "sin_aviso" && estado === "ingresada"
    const fila = {
      comunidadId,
      fecha: dia,
      nombre: generarNombre().nombreCompleto,
      dni: formatearRut(String(20_000_000 + indice * 1_007)),
      patente: indice % 3 === 0 ? null : patenteDe(indice),
      unidadId: unidad.id,
      destinoPersonaId: residente?.personaId ?? null,
      jornadaId: jornadaDeHora(hora),
      origenAgenda,
      agendadaPorPersonaId: origenAgenda === "pre_agendada" ? (residente?.personaId ?? null) : null,
      estado,
      horaIngreso,
      autorizacionTelefonica: autorizada,
      horaAutorizacion: autorizada && horaIngreso ? restarMinutos(horaIngreso, entero(3, 9)) : null,
      notas:
        estado === "cancelada"
          ? "El residente avisó que la visita no llegaría."
          : estado === "agendada"
            ? "Pre-agendada por el residente; queda pendiente de ingreso."
            : elegir(NOTAS_VISITA),
    }
    const id = `vis-${dia}-${String(indice + 1).padStart(2, "0")}`
    await prisma.bitacoraVisitaPE.upsert({ where: { id }, update: fila, create: { id, ...fila } })
  }

  // Encomiendas: courier del maestro, evidencia por referencia (D1) y retiro
  // registrado solo en las entregadas.
  for (let indice = 0; indice < ENCOMIENDAS_PORTERIA; indice++) {
    const unidad = destinos[(indice * 5) % destinos.length] as UnidadMin
    const residente = residenteDe.get(unidad.id)
    const deAyer = indice >= ENCOMIENDAS_PORTERIA - ENCOMIENDAS_DE_AYER
    const diaRecepcion = deAyer ? desplazarDia(dia, -1) : dia
    const retirada = !deAyer && indice % 3 === 2
    const courierId = COURIERS_PORTERIA[indice % COURIERS_PORTERIA.length] as string
    const hora = horaDePorteria(indice % 2 === 0)
    const fila = {
      comunidadId,
      courierId,
      destinatarioPersonaId: residente?.personaId ?? null,
      unidadId: unidad.id,
      descripcionPaquete: elegir(TIPOS_PAQUETE),
      evidencia:
        indice % 2 === 0
          ? {
              nombre: `evidencia-${courierId}-${indice + 1}.jpg`,
              tipoMime: "image/jpeg",
              tamanoKB: entero(180, 900),
              url: `https://evidencias.demo.cl/porteria/${courierId}-${indice + 1}.jpg`,
            }
          : Prisma.DbNull,
      fechaRecepcion: diaRecepcion,
      estado: retirada ? "retirada" : "recibida",
      retiro: retirada
        ? {
            retiradoPor: residente?.nombre ?? "Conserjería",
            fechaRetiro: dia,
            relacion: elegir(["El propio residente", "Familiar directo", "Conserje autorizado"]),
          }
        : Prisma.DbNull,
      createdAt: fechaHoraLocal(diaRecepcion, hora),
    }
    const id = `enc-${diaRecepcion}-${String(indice + 1).padStart(2, "0")}`
    await prisma.encomiendaPE.upsert({ where: { id }, update: fila, create: { id, ...fila } })
  }

  // El maestro de contratistas es el que resuelve el nombre de la empresa en la
  // puerta (`/api/pe/maestros/contratistas`) y en el evento `PE_CONTRATISTA_INGRESADO`.
  // Las filas se atan al proveedor sembrado (`prv-*`), así que el maestro espeja
  // el mismo id: sin esto la pantalla mostraría el id crudo en vez del nombre.
  for (const proveedor of PROVEEDORES) {
    const fila = {
      comunidadId,
      nombre: proveedor.nombre,
      rubro: proveedor.rubro,
      telefono: proveedor.telefono,
    }
    await prisma.contratista.upsert({
      where: { id: proveedor.id },
      update: fila,
      create: { id: proveedor.id, ...fila },
    })
  }

  // Ingresos de contratistas: tres ya entraron y tres esperan (dos agendados y
  // uno agendado por el residente de la unidad que los pidió).
  for (const [indice, contratista] of INGRESOS_CONTRATISTAS.entries()) {
    const unidad = destinos[indice % destinos.length] as UnidadMin
    const residente = residenteDe.get(unidad.id)
    const pidioElResidente = contratista.agendadoPor === "residente"
    const fila = {
      comunidadId,
      contratistaId: contratista.proveedorId,
      motivo: contratista.motivo,
      unidadId: pidioElResidente ? unidad.id : null,
      fecha: dia,
      jornadaId: jornadaDeHora(contratista.hora),
      agendadoPor: contratista.agendadoPor,
      personaAgendaId: pidioElResidente ? (residente?.personaId ?? null) : null,
      estado: contratista.estado,
      horaIngreso: contratista.estado === "ingresado" ? contratista.hora : null,
      notas:
        contratista.estado === "ingresado"
          ? "Ingreso registrado por conserjería con credencial de la empresa."
          : "Agendado para hoy; queda pendiente de ingreso.",
    }
    const id = `ing-${dia}-${String(indice + 1).padStart(2, "0")}`
    await prisma.ingresoContratistaPE.upsert({ where: { id }, update: fila, create: { id, ...fila } })
  }

  console.log(
    `[porteria] ${ESTADOS_VISITA.length} visitas, ${ENCOMIENDAS_PORTERIA} encomiendas y ${INGRESOS_CONTRATISTAS.length} ingresos de contratistas para ${dia}`,
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Verificación final
// ────────────────────────────────────────────────────────────────────────────

/**
 * Líneas de un JSON de cobro/emisión, o `[]` si la fila no las trae. El `[]`
 * cubre el cobro legacy (`lineas: null`), que es válido para el sistema pero
 * que este seed no puede producir: el demo tiene que mostrar el detalle.
 */
function lineasDeJson(
  valor: Prisma.JsonValue | null
): Array<{ monto: number; fondoId?: string }> {
  return Array.isArray(valor)
    ? (valor as Array<{ monto: number; fondoId?: string }>)
    : []
}

async function verificar(): Promise<void> {
  const dia = hoyISO()
  const [unidades, personas, vinculos, locales, estac, visitas, amenities, emisiones, cobros, liquidaciones, proveedores, mantenciones, visitasTec, infracciones] =
    await Promise.all([
      prisma.unidad.count({ where: { comunidadId, microSectorId: { startsWith: "piso-torre-" } } }),
      prisma.persona.count({ where: { comunidadId } }),
      prisma.vinculoUnidad.count({ where: { comunidadId, fechaFin: null } }),
      prisma.unidad.count({ where: { comunidadId, microSectorId: "piso-comercial-1" } }),
      prisma.unidad.count({ where: { comunidadId, microSectorId: { startsWith: "est-" } } }),
      prisma.unidad.count({ where: { comunidadId, tipoUnidadId: "tipo-es-visita" } }),
      prisma.elementoRA.count({ where: { comunidadId } }),
      prisma.emisionGC.count({ where: { comunidadId } }),
      prisma.cobroFI.count({ where: { comunidadId } }),
      prisma.liquidacionPL.count({ where: { comunidadId, estado: "borrador" } }),
      prisma.proveedorPE.count({ where: { comunidadId } }),
      prisma.mantencionPreventivaPE.count({ where: { comunidadId } }),
      prisma.visitaTecnicaPE.count({ where: { comunidadId } }),
      prisma.infraccionIN.count({ where: { comunidadId } }),
    ])

  // Portería — las cuatro cifras que el panel «Foto del día · Operaciones»
  // pinta; «movimientos» en 0 es exactamente lo que muestra «sin movimiento».
  const [visitasPorteria, encomiendasPendientes, encomiendasHoy, contratistasPorteria] = await Promise.all([
    prisma.bitacoraVisitaPE.count({ where: { comunidadId, fecha: dia, estado: { not: "cancelada" } } }),
    prisma.encomiendaPE.count({ where: { comunidadId, estado: "recibida" } }),
    prisma.encomiendaPE.count({ where: { comunidadId, fechaRecepcion: dia } }),
    prisma.ingresoContratistaPE.count({ where: { comunidadId, fecha: dia, estado: { not: "cancelado" } } }),
  ])

  const duenios = await prisma.vinculoUnidad.findMany({
    where: { comunidadId, fechaFin: null, rol: { in: ["propietario", "copropietario"] } },
    select: { personaId: true },
  })
  const deptosIds = (
    await prisma.unidad.findMany({
      where: { comunidadId, microSectorId: { startsWith: "piso-torre-" } },
      select: { id: true },
    })
  ).map((u) => u.id)
  const arrendadas = await prisma.vinculoUnidad.findMany({
    where: {
      comunidadId,
      fechaFin: null,
      rol: "arrendatario",
      unidadId: { in: deptosIds },
    },
    select: { unidadId: true },
  })

  const porRol = new Map<string, number>()
  for (const v of duenios) porRol.set(v.personaId, (porRol.get(v.personaId) ?? 0) + 1)

  const reporte = {
    departamentos: unidades,
    duenios: porRol.size,
    arrendadas: arrendadas.length,
    locales,
    estacionamientos: estac,
    estacionamientosVisita: visitas,
    personasTotales: personas,
    vinculosVigentes: vinculos,
    amenities,
    emisionesGc: emisiones,
    cobros,
    nominasPorPagar: liquidaciones,
    proveedores,
    mantenciones,
    visitasTecnicas: visitasTec,
    infracciones,
    visitasPorteria,
    encomiendasPendientes,
    contratistasPorteria,
    movimientosPorteriaHoy: visitasPorteria + encomiendasHoy + contratistasPorteria,
  }
  console.log("[seed-demo-consistente] reporte:", reporte)

  // S1 — todo documento de identidad válido (mismo algoritmo de lib/rut.ts).
  const personasTodas = await prisma.persona.findMany({
    where: { comunidadId },
    select: { id: true, rut: true },
  })
  const invalidos = personasTodas.filter((p) => {
    const limpio = p.rut.trim().toUpperCase().replace(/\./g, "")
    const m = /^(\d{7,8})-([\dK])$/.exec(limpio)
    return !m || dvDe(m[1] as string) !== m[2]
  })
  console.log(`[seed-demo-consistente] RUT válidos: ${personasTodas.length - invalidos.length}/${personasTodas.length}`)
  if (invalidos.length > 0) {
    console.error("[seed-demo-consistente] RUT inválidos:", invalidos.map((p) => p.id))
    process.exitCode = 1
  }

  // S5 — la emisión y sus cobros dicen lo mismo. Son cuatro invariantes: la
  // emisión declara el PRESUPUESTO (Σ líneas de la emisión), su aporte es la
  // suma de las líneas de reserva de los cobros, el total a recaudar es
  // presupuesto + aporte (el recargo va encima) y cada cobro con detalle suma
  // exactamente su `montoBase`. Si una se rompe, el demo vuelve a mostrar una
  // reserva declarada que nadie paga o un total que no cuadra con sus cobros.
  const [emisionesGc, cobrosGc] = await Promise.all([
    prisma.emisionGC.findMany({ where: { comunidadId }, orderBy: { periodo: "asc" } }),
    prisma.cobroFI.findMany({
      where: { comunidadId, origenModulo: "FI", periodo: { in: [...PERIODOS] } },
      orderBy: { id: "asc" },
    }),
  ])
  const desvios: string[] = []
  for (const emision of emisionesGc) {
    const lineasEmision = lineasDeJson(emision.lineas)
    const presupuesto = lineasEmision.reduce((a, l) => a + l.monto, 0)
    const aporte =
      (emision.fondoReservaAporte as { monto?: number } | null)?.monto ?? 0
    const propios = cobrosGc.filter((c) => c.origenRef === emision.id)
    const total = propios.reduce((a, c) => a + c.montoBase, 0)
    const reservaCobrada = propios.reduce(
      (a, cobro) =>
        a +
        lineasDeJson(cobro.lineas)
          .filter((l) => l.fondoId === FONDO_RESERVA_ID)
          .reduce((b, l) => b + l.monto, 0),
      0
    )

    if (emision.gastoTotal !== presupuesto) {
      desvios.push(
        `${emision.periodo}: gastoTotal ${emision.gastoTotal} ≠ Σ líneas de la emisión ${presupuesto}`
      )
    }
    if (propios.length !== lineasEmision.length) {
      desvios.push(
        `${emision.periodo}: ${propios.length} cobros para ${lineasEmision.length} unidades emitidas`
      )
    }
    if (total !== presupuesto + aporte) {
      desvios.push(
        `${emision.periodo}: total cobrado ${total} ≠ presupuesto ${presupuesto} + recargo ${aporte}`
      )
    }
    if (reservaCobrada !== aporte) {
      desvios.push(
        `${emision.periodo}: líneas de reserva suman ${reservaCobrada} y el aporte declara ${aporte}`
      )
    }
    for (const cobro of propios) {
      const suma = lineasDeJson(cobro.lineas).reduce((a, l) => a + l.monto, 0)
      if (cobro.lineas === null || suma !== cobro.montoBase) {
        desvios.push(
          `${cobro.id}: Σ líneas ${suma} ≠ montoBase ${cobro.montoBase}`
        )
      }
    }

    console.log(
      `[seed-demo-consistente] ${emision.periodo}: presupuesto $${presupuesto.toLocaleString("es-CL")} + recargo $${aporte.toLocaleString("es-CL")} = total $${total.toLocaleString("es-CL")} (${propios.length} cobros)`
    )
  }
  if (desvios.length > 0) {
    console.error("[seed-demo-consistente] desvíos del cobro:", desvios)
    process.exitCode = 1
  }
}

async function main(): Promise<void> {
  const comunidad = await prisma.comunidad.findUnique({ where: { id: comunidadId }, select: { id: true, nombre: true } })
  if (!comunidad) {
    throw new Error(`Comunidad «${comunidadId}» no existe. Sembrá primero con npm run seed:authz.`)
  }
  console.log(`[seed-demo-consistente] comunidad=${comunidad.id} (${comunidad.nombre})`)

  const estructura = await pasoEstructura()
  await pasoPersonas(estructura)
  await pasoFinanzas(estructura)
  await pasoNominas()
  await pasoProveedores()
  await pasoMultas(estructura)
  await pasoPorteria(estructura)
  await verificar()
}

main()
  .catch((error: unknown) => {
    console.error("[seed-demo-consistente] error:", error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
