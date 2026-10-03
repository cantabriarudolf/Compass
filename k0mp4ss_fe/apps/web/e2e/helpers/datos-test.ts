// Helper compartido de dato TEST para specs E2E (serie E2E-SIN-GATED P1).
//
// Unifica el setup vía API REST que estaba duplicado en 5 specs
// (pagos, certificados, portal, remuneraciones, poblamiento):
// - ids `TEST-*` únicos por llamada (patrón `test-<prefijo>-<entidad>-<ts>`).
// - dato de dominio solo vía API REST con scope `comunidadId` del servidor.
// - cleanups idempotentes: nunca fallan si la fila ya falta (catch + void).
//
// Los specs mantienen sus asserts y flujos UI idénticos; solo cambia de dónde
// sale el setup (antes inline con `page.request`, ahora aquí).
import { expect, type APIRequestContext } from "@playwright/test"

export type UnidadBaseTEST = {
  id?: string
  microSectorId: string
  tipoUnidadId: string
  estadoId: string
  etiqueta?: string
  numero?: string
}

/** Dígito verificador chileno (módulo 11) para RUTs TEST únicos por corrida. */
export function dvRutTEST(cuerpo: string): string {
  let suma = 0
  let mult = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult
    mult = mult === 7 ? 2 : mult + 1
  }
  const resto = 11 - (suma % 11)
  return resto === 11 ? "0" : resto === 10 ? "K" : String(resto)
}

/** RUT válido único por llamada (rango residente, sin colisiones entre corridas). */
export function rutUnicoTEST(): string {
  const cuerpo = String(20_000_000 + (Date.now() % 9_000_000))
  return `${cuerpo}-${dvRutTEST(cuerpo)}`
}

/** Fecha ISO corta de hoy (para vínculos, cobros, publicaciones). */
export function hoyISOTEST(): string {
  return new Date().toISOString().slice(0, 10)
}

/** FKs de una unidad real del seed (mismo scope de comunidad garantizado). */
export async function obtenerUnidadBaseTEST(
  request: APIRequestContext,
): Promise<UnidadBaseTEST> {
  const lista = await request.get("/api/unidades?pageSize=1")
  expect(lista.ok(), "GET /api/unidades debe responder").toBe(true)
  const ju = (await lista.json()) as { data?: UnidadBaseTEST[] }
  const base = ju.data?.[0]
  expect(base, "el seed debe traer al menos una unidad").toBeTruthy()
  return base!
}

/** Crea una unidad TEST propia y devuelve su id + número único. */
export async function crearUnidadTEST(
  request: APIRequestContext,
  prefix: string,
  ts = Date.now(),
  etiqueta = "TEST-P1",
): Promise<{ id: string; numero: string; base: UnidadBaseTEST }> {
  const base = await obtenerUnidadBaseTEST(request)
  const id = `test-${prefix}-u-${ts}`
  const numero = `T1P-${String(ts).slice(-6)}`
  const res = await request.post("/api/unidades", {
    data: {
      id,
      microSectorId: base.microSectorId,
      numero,
      etiqueta,
      tipoUnidadId: base.tipoUnidadId,
      metraje: 45,
      prorrateo: 0.01,
      rolSii: "",
      estadoId: base.estadoId,
      servicios: {},
    },
  })
  expect(res.ok(), "POST /api/unidades debe crear la unidad TEST").toBe(true)
  return { id, numero, base }
}

/** DELETE idempotente de unidad TEST (no falla si falta la fila). */
export async function limpiarUnidadTEST(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(`/api/unidades/${id}`).catch(() => {})
}

export type CrearPersonaTESTOptions = {
  roles?: string[]
  nombreCompleto?: string
  nombres?: string
  apellidos?: string
  email?: string
}

/** Crea una persona residente TEST propia. */
export async function crearPersonaTEST(
  request: APIRequestContext,
  prefix: string,
  ts = Date.now(),
  opts: CrearPersonaTESTOptions = {},
): Promise<{ id: string; rut: string; nombreCompleto: string; email: string }> {
  const sufijo = String(ts).slice(-6)
  const id = `test-${prefix}-p-${ts}`
  const rut = rutUnicoTEST()
  const nombreCompleto = opts.nombreCompleto ?? `TEST P1 ${prefix} ${ts}`
  const email = opts.email ?? `${prefix}.p1.${ts}@test.cl`
  const res = await request.post("/api/personas", {
    data: {
      id,
      rut,
      nombreCompleto,
      nombres: opts.nombres ?? "TEST",
      apellidos: opts.apellidos ?? `P1 ${sufijo}`,
      email,
      telefonoMovil: "+56 9 9999 9999",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: opts.roles ?? ["residente"],
    },
  })
  expect(res.ok(), "POST /api/personas debe crear la persona TEST").toBe(true)
  return { id, rut, nombreCompleto, email }
}

/** DELETE idempotente de persona TEST. */
export async function limpiarPersonaTEST(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(`/api/personas/${id}`).catch(() => {})
}

/** Crea un vínculo propietario TEST entre persona y unidad. */
export async function crearVinculoTEST(
  request: APIRequestContext,
  personaId: string,
  unidadId: string,
  prefix: string,
  ts = Date.now(),
): Promise<{ id: string }> {
  const id = `test-${prefix}-v-${ts}`
  const res = await request.post("/api/vinculos", {
    data: {
      id,
      personaId,
      unidadId,
      rol: "propietario",
      fechaInicio: hoyISOTEST(),
      permiteVerFinanzas: true,
    },
  })
  expect(res.ok(), "POST /api/vinculos debe crear el vínculo TEST").toBe(true)
  return { id }
}

/** DELETE idempotente de vínculo TEST. */
export async function limpiarVinculoTEST(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(`/api/vinculos/${id}`).catch(() => {})
}

/** Trío persona+unidad+vínculo para certificados (cleanup inverso por guards 409). */
export async function crearTrioCertificadoTEST(
  request: APIRequestContext,
  prefix: string,
  ts = Date.now(),
): Promise<{
  personaId: string
  unidadId: string
  vinculoId: string
  numeroUnidad: string
  nombrePersona: string
  emailPersona: string
}> {
  const unidad = await crearUnidadTEST(request, `${prefix}-cert`, ts)
  const persona = await crearPersonaTEST(request, `${prefix}-cert`, ts, {
    nombreCompleto: `TEST Cert P1 ${ts}`,
    nombres: "TEST Cert",
    apellidos: `P1 ${String(ts).slice(-6)}`,
    email: `cert.p1.${ts}@test.cl`,
  })
  const vinculo = await crearVinculoTEST(
    request,
    persona.id,
    unidad.id,
    `${prefix}-cert`,
    ts,
  )
  return {
    personaId: persona.id,
    unidadId: unidad.id,
    vinculoId: vinculo.id,
    numeroUnidad: unidad.numero,
    nombrePersona: persona.nombreCompleto,
    emailPersona: persona.email,
  }
}

/** Cleanup del trío en orden (guards 409): vínculo → persona → unidad. */
export async function limpiarTrioCertificadoTEST(
  request: APIRequestContext,
  trio: { personaId: string; unidadId: string; vinculoId: string },
): Promise<void> {
  await limpiarVinculoTEST(request, trio.vinculoId)
  await limpiarPersonaTEST(request, trio.personaId)
  await limpiarUnidadTEST(request, trio.unidadId)
}

/** Crea un cobro FI pendiente TEST sobre una unidad (fondo del seed). */
export async function crearCobroTEST(
  request: APIRequestContext,
  unidadId: string,
  prefix: string,
  ts = Date.now(),
  opts: { descripcion?: string; periodo?: string } = {},
): Promise<{ id: string; descripcion: string }> {
  const id = `test-${prefix}-c-${ts}`
  const descripcion = opts.descripcion ?? `TEST P1 pagos ${ts}`
  const resFondos = await request.get("/api/fondos-fi?pageSize=100")
  expect(resFondos.ok(), "GET /api/fondos-fi debe responder").toBe(true)
  const jf = (await resFondos.json()) as { data?: { id: string; tipo: string }[] }
  const fondos = jf.data ?? []
  expect(fondos.length > 0, "el seed debe traer al menos un fondo FI").toBe(true)
  const fondoId = fondos.find((f) => f.tipo === "gasto_comun")?.id ?? fondos[0]!.id
  const res = await request.post("/api/cobros-fi", {
    data: {
      id,
      unidadId,
      periodo: opts.periodo ?? "2026-11",
      concepto: "gasto_comun",
      origenModulo: "FI",
      fondoId,
      descripcion,
      montoBase: 120000,
      fechaCargo: hoyISOTEST(),
      fechaVencimiento: "2026-12-10",
      moras: [],
      pagos: [],
      diferencias: [],
    },
  })
  expect(res.ok(), "POST /api/cobros-fi debe crear el cobro TEST").toBe(true)
  return { id, descripcion }
}

/** Cleanup de cobro con pagos: reset vía PUT (evita 409) y luego DELETE. */
export async function limpiarCobroTEST(
  request: APIRequestContext,
  cobroId: string,
): Promise<void> {
  await request
    .put(`/api/cobros-fi/${cobroId}`, {
      data: { pagos: [], moras: [], diferencias: [] },
    })
    .catch(() => {})
  await request.delete(`/api/cobros-fi/${cobroId}`).catch(() => {})
}

/** Crea una publicación TEST de vitrina (unidad del seed si no se indica). */
export async function crearPublicacionTEST(
  request: APIRequestContext,
  prefix: string,
  ts = Date.now(),
  unidadId?: string,
): Promise<{ id: string; unidadId: string; unidadRef: string }> {
  let ref = ""
  let uid = unidadId ?? ""
  if (!uid) {
    const lista = await request.get("/api/unidades?pageSize=1")
    expect(lista.ok(), "GET /api/unidades debe responder").toBe(true)
    const ju = (await lista.json()) as {
      data?: { id: string; etiqueta: string; numero: string }[]
    }
    const unidad = ju.data?.[0]
    expect(unidad, "el seed debe traer al menos una unidad").toBeTruthy()
    uid = unidad!.id
    ref = `${unidad!.etiqueta} ${unidad!.numero}`
  }
  const id = `test-${prefix}-pub-${ts}`
  const res = await request.post("/api/publicaciones-portal", {
    data: {
      id,
      unidadId: uid,
      operacion: "venta",
      precio: 8500000,
      moneda: "CLP",
      descripcion: `Publicación TEST P2 portal ${ts}`,
      imagenes: [],
      activa: true,
      fechaPublicacion: hoyISOTEST(),
    },
  })
  expect(
    res.ok(),
    "POST /api/publicaciones-portal debe crear la publicación TEST",
  ).toBe(true)
  return { id, unidadId: uid, unidadRef: ref }
}

/** Snapshot de ids de publicaciones (para detectar manuales creadas por la UI). */
export async function snapshotPublicacionesTEST(
  request: APIRequestContext,
): Promise<Set<string>> {
  const antes = await request.get("/api/publicaciones-portal?pageSize=100")
  const jAntes = (await antes.json().catch(() => ({ data: [] }))) as {
    data?: { id: string }[]
  }
  return new Set((jAntes.data ?? []).map((p) => p.id))
}

/** Borra las publicaciones nuevas respecto al snapshot (manuales de la UI). */
export async function limpiarPublicacionesNuevasTEST(
  request: APIRequestContext,
  idsAntes: Set<string>,
): Promise<void> {
  const despues = await request
    .get("/api/publicaciones-portal?pageSize=100")
    .catch(() => null)
  const jDespues = (await despues?.json().catch(() => ({ data: [] }))) as {
    data?: { id: string }[]
  }
  for (const p of jDespues.data ?? []) {
    if (!idsAntes.has(p.id)) {
      await request.delete(`/api/publicaciones-portal/${p.id}`).catch(() => {})
    }
  }
}

/** DELETE idempotente de publicación TEST. */
export async function limpiarPublicacionTEST(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(`/api/publicaciones-portal/${id}`).catch(() => {})
}

export type MaestrosLegalesTEST = {
  afpId: string
  saludId: string
  tramoId: string
}

/** FKs legales desde los maestros del seed (mismo scope). */
export async function obtenerMaestrosLegalesTEST(
  request: APIRequestContext,
): Promise<MaestrosLegalesTEST> {
  const maestros = async (
    tipo: string,
  ): Promise<{ id: string; tipo?: string }[]> => {
    const r = await request.get(`/api/maestros/${tipo}?pageSize=100`)
    expect(r.ok(), `GET /api/maestros/${tipo} debe responder`).toBe(true)
    const j = (await r.json()) as { data?: { id: string; tipo?: string }[] }
    return j.data ?? []
  }
  const afps = await maestros("afps")
  const salud = await maestros("previsiones-salud")
  const tramos = await maestros("asignaciones-familiar")
  expect(afps.length > 0, "el seed debe traer AFPs").toBe(true)
  const afpId = afps[0]!.id
  const saludId = (salud.find((s) => s.tipo === "fonasa") ?? salud[0])?.id
  expect(saludId, "el seed debe traer previsión de salud").toBeTruthy()
  const tramoId = tramos[0]?.id
  expect(tramoId, "el seed debe traer tramos de asignación familiar").toBeTruthy()
  return { afpId, saludId: saludId!, tramoId: tramoId! }
}

/** Params legales CF idempotentes (reseed-proof). */
export async function asegurarParamsLegalesTEST(
  request: APIRequestContext,
): Promise<void> {
  const res = await request.put("/api/configuracion", {
    data: {
      ufMensual: 39000,
      ingresoMinimoMensual: 500000,
      topeGratificacionLegal: 4.75,
      tasaSIS: 1.48,
    },
  })
  expect(res.ok(), "PUT /api/configuracion debe asegurar params legales").toBe(
    true,
  )
}

/** Crea un trabajador TEST con ficha completa (maestros + params + persona). */
export async function crearTrabajadorTEST(
  request: APIRequestContext,
  prefix: string,
  ts = Date.now(),
): Promise<{ id: string; rut: string; email: string; nombre: string }> {
  const maestros = await obtenerMaestrosLegalesTEST(request)
  await asegurarParamsLegalesTEST(request)
  const id = `test-${prefix}-trab-${ts}`
  const cuerpoRut = String(ts).slice(-8).padStart(8, "1")
  const rut = `${cuerpoRut}-${dvRutTEST(cuerpoRut)}`
  const email = `test-${prefix}-${ts}@test.cl`
  const nombre = `Trabajador P3 ${String(ts).slice(-6)}`
  const res = await request.post("/api/personas", {
    data: {
      id,
      rut,
      nombreCompleto: `${nombre} TEST`,
      nombres: nombre,
      apellidos: "TEST",
      email,
      telefonoMovil: "+56900000009",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: ["personal"],
      datosLaborales: {
        id: `lab-${ts}`,
        cargo: "Conserje Turno Día",
        afp: "AFP Habitat",
        prevision: "FONASA",
        fechaIngreso: "2021-06-15",
        tipoContrato: "indefinido",
        afpId: maestros.afpId,
        saludId: maestros.saludId,
        asignacionFamiliarId: maestros.tramoId,
        cargas: 1,
        jornadaBaseHoras: 44,
        sueldoBase: 650000,
      },
    },
  })
  expect(res.ok(), "POST /api/personas debe crear el trabajador TEST").toBe(true)
  return { id, rut, email, nombre }
}

/**
 * Cleanup de trabajador: borradores TEST + egreso espejo + persona.
 * La liquidacion confirmada es inmutable por diseño y queda como documento
 * de auditoría con periodo TEST futuro que no interfiere.
 */
export async function limpiarTrabajadorTEST(
  request: APIRequestContext,
  trabajadorId: string,
): Promise<void> {
  try {
    const lista = await request
      .get("/api/liquidaciones?pageSize=100")
      .catch(() => null)
    const j = (await lista?.json().catch(() => ({ data: [] }))) as {
      data?: {
        id: string
        trabajadorPersonaId: string
        estado: string
        egresoFIReferencia?: string
      }[]
    }
    for (const l of j.data ?? []) {
      if (l.trabajadorPersonaId !== trabajadorId) continue
      if (l.estado === "borrador") {
        await request.delete(`/api/liquidaciones/${l.id}`).catch(() => {})
      } else if (l.egresoFIReferencia && l.egresoFIReferencia !== "pendiente") {
        await request
          .delete(`/api/egresos-fi/${l.egresoFIReferencia}`)
          .catch(() => {})
      }
    }
  } catch {
    /* best-effort */
  }
  await limpiarPersonaTEST(request, trabajadorId)
}
