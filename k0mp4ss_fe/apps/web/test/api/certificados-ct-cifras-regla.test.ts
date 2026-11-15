/**
 * @vitest-environment node
 * T20 (S10, R3-001) — invariantes de la resolución server-side de las cifras
 * del estado de cuenta, fuera de la regla de cálculo: reemplazo por clave exacta
 * (no por parecido), rechazo sin `detalle`, clamp por cobro, folio y re-POST.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { cookieDeUsuario, cuerpoJson, invocarApi } from "../helpers/api-sesion"

const state = vi.hoisted(() => ({ cookie: "" }))
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers(state.cookie
    ? { cookie: state.cookie, "x-forwarded-proto": "http" }
    : { "x-forwarded-proto": "http" })),
}))

const COM = "ctregla-com"
const U_DOS = "ctregla-u1"   // sobrepago en un cobro + deuda en otro
const U_VACIA = "ctregla-u2" // sin cobros
const ADMIN = "ctregla-admin@test.cl"
const mod = () => import("@/app/api/certificados-ct/route")
const modItem = () => import("@/app/api/certificados-ct/[id]/route")

async function conSesion<T>(fn: () => Promise<T>): Promise<T> {
  state.cookie = await cookieDeUsuario(ADMIN)
  try { return await fn() } finally { state.cookie = "" }
}
const emitir = (body: Record<string, unknown>) =>
  invocarApi(mod(), "POST", "certificados-ct", { body })
const cert = (id: string, tipo: string, unidadId: string, detalle: { clave: string; valor: string }[], o: Record<string, unknown> = {}) =>
  ({ id, tipo, unidadId, solicitanteNombre: "QA", resumen: "r", detalle, fechaEmision: "2026-11-15", ...o })
const BASE2 = [{ clave: "Unidad", valor: "Depto 1" }, { clave: "Propietario", valor: "—" }]
const suma = (f: { clave: string; valor: string }[]) => f.map((x) => `${x.clave}=${x.valor}`).join(" | ")
async function enBd(id: string) {
  const f = await prisma.certificadoCT.findUnique({ where: { id } })
  return (f?.detalle ?? []) as { clave: string; valor: string }[]
}

describe("T20 — invariantes de las cifras server-side", () => {
  beforeAll(async () => {
    await prisma.comunidad.upsert({ where: { id: COM }, update: {}, create: { id: COM, nombre: "CT regla", slug: "ctregla" } })
    await prisma.certificadoCT.deleteMany({ where: { comunidadId: COM } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: COM } })
    for (const [id, numero] of [[U_DOS, "1"], [U_VACIA, "2"]] as const) {
      await prisma.unidad.create({ data: { id, comunidadId: COM, microSectorId: `ctregla-ms-${id}`,
        numero, etiqueta: "Depto", tipoUnidadId: `ctregla-tu-${id}`, metraje: 50, prorrateo: 0.1,
        rolSii: `9100-${numero}`, estadoId: `ctregla-est-${id}`, servicios: {} } })
    }
    // Cobro 1 sobrepagado (1.000 con pago 1.500) y cobro 2 impago (5.000):
    // el saldo correcto es 5.000, no 4.500 — el clamp es POR cobro.
    await prisma.cobroFI.create({ data: { id: "ctregla-c1", comunidadId: COM, unidadId: U_DOS,
      periodo: "2026-01", concepto: "gasto_comun", origenModulo: "manual", fondoId: "ctregla-f",
      descripcion: "x", montoBase: 1_000, fechaCargo: "2026-01-01", fechaVencimiento: "2026-01-31",
      moras: [], pagos: [{ id: "ctregla-p1", monto: 1_500, fecha: "2026-03-01", medio: "transferencia" }] as never,
      diferencias: [] } })
    await prisma.cobroFI.create({ data: { id: "ctregla-c2", comunidadId: COM, unidadId: U_DOS,
      periodo: "2026-02", concepto: "gasto_comun", origenModulo: "manual", fondoId: "ctregla-f",
      descripcion: "x", montoBase: 5_000, fechaCargo: "2026-02-01", fechaVencimiento: "2026-02-28",
      moras: [], pagos: [], diferencias: [] } })
    const u = await prisma.usuario.upsert({ where: { email: ADMIN }, update: { personaId: null },
      create: { email: ADMIN, personaId: null, activo: true } })
    await prisma.membresia.deleteMany({ where: { usuarioId: u.id } })
    await prisma.membresia.create({ data: { usuarioId: u.id, comunidadId: COM, rol: "administrador" } })
  }, 60_000)

  afterAll(async () => {
    state.cookie = ""
    await prisma.certificadoCT.deleteMany({ where: { comunidadId: COM } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: COM } })
    await prisma.unidad.deleteMany({ where: { id: { in: [U_DOS, U_VACIA] } } })
    const u = await prisma.usuario.findUnique({ where: { email: ADMIN } })
    if (u) { await prisma.membresia.deleteMany({ where: { usuarioId: u.id } })
      await prisma.usuario.delete({ where: { id: u.id } }).catch(() => {}) }
    await prisma.comunidad.deleteMany({ where: { id: COM } })
  })

  it("el clamp de saldo es por cobro: un sobrepago no compensa otro impago", async () => {
    await conSesion(async () => {
      const r = await emitir(cert("ctregla-1", "estado_cuenta", U_DOS, BASE2))
      expect(r.status).toBe(201)
      expect(await enBd("ctregla-1")).toEqual([...BASE2,
        { clave: "Cobros registrados", valor: "2" },
        { clave: "Total cargado", valor: "$6.000" },
        { clave: "Saldo pendiente", valor: "$5.000" }])
    })
  })

  it("sólo se reemplazan las claves EXACTAS: una parecida sobrevive y convive con la del servidor", async () => {
    await conSesion(async () => {
      const r = await emitir(cert("ctregla-2", "estado_cuenta", U_DOS, [...BASE2,
        { clave: "Cobros Registrados", valor: "9" }, { clave: "Total cargado ", valor: "$9" },
        { clave: "Saldo pendiente", valor: "$9" }]))
      expect(r.status).toBe(201)
      // Cambiar este orden/limpieza es cambiar el contrato del papel: se declara.
      expect(suma(await enBd("ctregla-2"))).toBe(
        "Unidad=Depto 1 | Propietario=— | Cobros Registrados=9 | Total cargado =$9 |" +
        " Cobros registrados=2 | Total cargado=$6.000 | Saldo pendiente=$5.000")
    })
  })

  it("estado_cuenta sin `detalle` → 400 y nada persistido (no hay papel sin cifras)", async () => {
    await conSesion(async () => {
      const r = await emitir({ id: "ctregla-3", tipo: "estado_cuenta", unidadId: U_DOS,
        solicitanteNombre: "QA", resumen: "r", fechaEmision: "2026-11-15" })
      expect(r.status).toBe(400)
      expect(await prisma.certificadoCT.findUnique({ where: { id: "ctregla-3" } })).toBeNull()
    })
  })

  it("unidad sin cobros: al_dia emite 0/0/0 sobre el libro vacío", async () => {
    await conSesion(async () => {
      const r = await emitir(cert("ctregla-4", "al_dia", U_VACIA, BASE2))
      expect(r.status).toBe(201)
      expect((await enBd("ctregla-4")).slice(2)).toEqual([
        { clave: "Cobros registrados", valor: "0" },
        { clave: "Total cargado", valor: "$0" },
        { clave: "Saldo pendiente", valor: "$0" }])
    })
  })

  it("el folio sigue correlativo con el detalle inyectado y el re-POST no consume número", async () => {
    await conSesion(async () => {
      const a = await emitir(cert("ctregla-5", "estado_cuenta", U_VACIA, BASE2))
      const ja = await cuerpoJson<{ folio: string; codigoVerificacion: string }>(a)
      const b = await emitir(cert("ctregla-6", "estado_cuenta", U_VACIA, BASE2))
      const jb = await cuerpoJson<{ folio: string }>(b)
      expect(Number(jb.folio.slice(3))).toBe(Number(ja.folio.slice(3)) + 1)
      const r2 = await emitir(cert("ctregla-5", "estado_cuenta", U_VACIA, BASE2,
        { folio: ja.folio, codigoVerificacion: ja.codigoVerificacion }))
      expect(r2.status).toBe(200)
      expect((await enBd("ctregla-5")).slice(0, 2)).toEqual(BASE2)
      expect((await enBd("ctregla-5")).length).toBe(5)
    })
  })

  it("PRESERVE: el PUT sigue aceptando el detalle del cliente (documento no inmutable por API)", async () => {
    await conSesion(async () => {
      expect((await emitir(cert("ctregla-7", "estado_cuenta", U_VACIA, BASE2))).status).toBe(201)
      const put = await invocarApi(modItem(), "PUT", "certificados-ct/[id]", {
        params: { id: "ctregla-7" },
        body: { detalle: [...BASE2, { clave: "Saldo pendiente", valor: "$1" }] },
      })
      expect(put.status).toBe(200)
      expect(suma(await enBd("ctregla-7"))).toContain("Saldo pendiente=$1")
    })
  })
})
