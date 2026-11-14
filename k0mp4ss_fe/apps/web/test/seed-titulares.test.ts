/**
 * @vitest-environment node
 *
 * Semilla de titulares de la comunidad de demo (2026-11-14).
 *
 * El problema que estas pruebas fijan: `data/inventario/estructura.ts` declara
 * 166 unidades y `data/comunidad/vinculos.ts` dejaba 132 sin propietario vigente
 * (47 deptos, 2 locales y 83 estacionamientos). Una morosidad, un convenio o una
 * emisión de gasto común no se pueden cobrar si la unidad no tiene dueño: la fila
 * existe y no hay a quién cobrarle.
 *
 * Acá se verifica la semilla PURA (sin base): cada unidad de la comunidad de demo
 * queda con UN propietario vigente y la mezcla contiene los casos que se prueban a
 * mano —dueño que no vive ahí, dos dueños en una unidad (un voto), arrendatario
 * con y sin permiso de declarar el Registro—. La corrida real del seed contra la
 * base está en `test/api/integridad-titularidad.test.ts`.
 */
import { describe, expect, it } from "vitest"
import { unidades } from "@/data/inventario/estructura"
import { personas } from "@/data/comunidad/personas"
import { ESTADOS_INMOBILIARIOS, vinculos } from "@/data/comunidad/vinculos"
import { calcularDigitoVerificador } from "@/lib/rut"
import { generarTitularesDeDemo, titularesDeDemo } from "@/data/comunidad/titulares"
import { evaluarTitularidad } from "@/app/admin/metricas/_titularidad"

/** La semilla completa: la de `data/` más la que la completa. */
const semillaCompleta = [...vinculos, ...titularesDeDemo.vinculos]

const vigentes = semillaCompleta.filter((v) => !v.fechaFin)
const propietariosVigentes = vigentes.filter((v) => v.rol === "propietario")
const unidadesConPropietario = new Set(propietariosVigentes.map((v) => v.unidadId))

function normalizarRut(rut: string): string {
  return rut.trim().toUpperCase().replace(/\./g, "").replace(/\s/g, "")
}

describe("semilla de titulares — ninguna unidad de la demo queda sin dueño", () => {
  it("declara las 166 unidades que el problema describía", () => {
    expect(unidades).toHaveLength(166)
  })

  it("cada unidad tiene exactamente UN propietario vigente", () => {
    const sinPropietario = unidades.filter((u) => !unidadesConPropietario.has(u.id))
    expect(
      sinPropietario.map((u) => u.id),
      `${sinPropietario.length} unidad(es) sin propietario vigente en la semilla completa`
    ).toEqual([])

    // Un solo tramo vigente por unidad: la regla del vínculo (una titularidad
    // activa a la vez) se respeta también al sembrar.
    const porUnidad = new Map<string, number>()
    for (const v of propietariosVigentes) {
      porUnidad.set(v.unidadId, (porUnidad.get(v.unidadId) ?? 0) + 1)
    }
    const conDos = [...porUnidad.entries()].filter(([, cuantos]) => cuantos > 1)
    expect(conDos).toEqual([])
  })

  it("el invariante de titularidad reporta cero sobre la semilla completa", () => {
    const titularidad = evaluarTitularidad(unidades, semillaCompleta)
    expect(titularidad.total).toBe(0)
    expect(titularidad.evaluadas).toBe(166)
    expect(titularidad.bienesComunes).toBe(0)
    expect(titularidad.porCausa).toEqual({
      nunca_declarado: 0,
      vinculo_cerrado_sin_reemplazo: 0,
    })
  })

  it("incluye dueños que NO viven en su unidad (estado `desocupada`)", () => {
    const desocupadas = vigentes.filter(
      (v) => v.rol === "propietario" && v.estadoOcupacionPropiedad === "desocupada"
    )
    expect(desocupadas).toHaveLength(4)
    // El estado es una opción del maestro: el formulario de vínculo lo ofrece
    // desde `estadosInmobiliarios`, así que tiene que existir ahí.
    expect(ESTADOS_INMOBILIARIOS.map((e) => e.id)).toContain("desocupada")
  })

  it("incluye dos dueños en la misma unidad (un voto por unidad)", () => {
    const unidadesConCopropietario = new Set(
      vigentes.filter((v) => v.rol === "copropietario").map((v) => v.unidadId)
    )
    const dosDuenios = [...unidadesConCopropietario].filter((id) =>
      unidadesConPropietario.has(id)
    )
    expect(dosDuenios).toHaveLength(3)
  })

  it("incluye arrendatario vigente con y sin permiso de declarar el Registro", () => {
    const arrendatarios = vigentes.filter((v) => v.rol === "arrendatario")
    const habilitados = arrendatarios.filter((v) => v.puedeDeclararRegistro === true)
    const sinPermiso = arrendatarios.filter((v) => v.puedeDeclararRegistro !== true)

    expect(arrendatarios.length).toBeGreaterThan(1)
    expect(habilitados).toHaveLength(1)
    expect(sinPermiso.length).toBeGreaterThan(0)
    // Los dos caminos se prueban sobre unidades que SÍ tienen dueño: el
    // arrendatario declara por permiso del propietario, nunca en su reemplazo.
    for (const v of arrendatarios) {
      expect(unidadesConPropietario.has(v.unidadId)).toBe(true)
    }
  })

  it("no reescribe ni pisa a las personas y vínculos que ya existían", () => {
    const idsPersonas = new Set(personas.map((p) => p.id))
    const idsVinculos = new Set(vinculos.map((v) => v.id))
    for (const p of titularesDeDemo.personas) expect(idsPersonas.has(p.id)).toBe(false)
    for (const v of titularesDeDemo.vinculos) expect(idsVinculos.has(v.id)).toBe(false)
  })

  it("genera RUT válidos que no chocan con los de la semilla existente", () => {
    const usados = new Set(personas.map((p) => normalizarRut(p.rut)))
    for (const p of [...personas, ...titularesDeDemo.personas]) {
      const clave = normalizarRut(p.rut)
      if (p.id.startsWith("p-titular-") || p.id.startsWith("p-copropietario-")) {
        expect(usados.has(clave)).toBe(false)
        const [cuerpo, dv] = clave.split("-")
        expect(dv).toBe(calcularDigitoVerificador(cuerpo ?? ""))
      }
      usados.add(clave)
    }
  })

  it("es determinista: dos generaciones dejan la misma semilla", () => {
    expect(generarTitularesDeDemo()).toEqual(titularesDeDemo)
  })
})
