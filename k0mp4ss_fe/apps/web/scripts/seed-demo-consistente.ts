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
 * Propiedades del script:
 * - **Determinista**: PRNG con semilla fija. Dos corridas dejan el mismo estado.
 * - **Idempotente**: todo es upsert por id determinista; no duplica filas.
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

const FONDOS = [
  { id: "fondo-gc", nombre: "Fondo de Gasto Común", tipo: "gasto_comun", saldoInicial: 3_450_000, porcentajeAporte: null },
  { id: "fondo-reserva", nombre: "Fondo de Reserva", tipo: "reserva", saldoInicial: 12_800_000, porcentajeAporte: 5 },
  { id: "fondo-amenities", nombre: "Fondo de Amenities", tipo: "amenities", saldoInicial: 1_250_000, porcentajeAporte: null },
  { id: "fondo-cc-punto-cero", nombre: "Cuenta Corriente", tipo: "gasto_comun", saldoInicial: 17_082_694, porcentajeAporte: null },
]

type Finanzas = { duenioDe: Map<string, string> }

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

  const conGastoComun = [...estructura.deptos, ...estructura.locales, ...estructura.estacPrivados]
  const factorPeriodo: Record<string, number> = { "2026-08": 1, "2026-09": 1.021, "2026-10": 1.034 }

  for (const periodo of PERIODOS) {
    const factor = factorPeriodo[periodo] ?? 1
    const lineas: Array<{ unidadId: string; responsablePersonaId: string; monto: number; cobroId: string }> = []
    let bruto = 0

    for (const unidad of conGastoComun) {
      const base = BASE_GC[unidad.tipoUnidadId] ?? 30_000
      const montoGc = monto(base * factor)
      const cobroId = `cobro-${periodo}-${unidad.id}`
      lineas.push({
        unidadId: unidad.id,
        responsablePersonaId: responsable(unidad.id),
        monto: montoGc,
        cobroId,
      })
      bruto += montoGc
    }

    const aporteReserva = monto(bruto * 0.05)
    const emisionId = `emision-${periodo}`
    const filaEmision = {
      comunidadId,
      periodo,
      modo: "fijo",
      gastoTotal: bruto + aporteReserva,
      lineas,
      fondoReservaAporte: { fondoId: "fondo-reserva", monto: aporteReserva },
      fechaEmision: `${periodo}-01`,
    }
    await prisma.emisionGC.upsert({ where: { id: emisionId }, update: filaEmision, create: { id: emisionId, ...filaEmision } })

    // Cobro por unidad. ~88 % paga al día; el resto queda con mora (S9: morosidad real).
    for (const [indice, linea] of lineas.entries()) {
      const paga = (indice * 7 + periodo.length) % 100 < 88
      const cobroId = linea.cobroId
      const fechaCargo = `${periodo}-01`
      const fechaVencimiento = vencimientoDe(periodo)
      const pagos = paga
        ? [
            {
              id: `pago-${cobroId}`,
              monto: linea.monto,
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
              monto: monto(linea.monto * 0.02),
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
        fondoId: "fondo-gc",
        descripcion: `Gasto común ${periodo}`,
        montoBase: linea.monto,
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
// Verificación final
// ────────────────────────────────────────────────────────────────────────────

async function verificar(): Promise<void> {
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
  await verificar()
}

main()
  .catch((error: unknown) => {
    console.error("[seed-demo-consistente] error:", error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
