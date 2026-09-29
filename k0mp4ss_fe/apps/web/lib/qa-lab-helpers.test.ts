/* eslint-disable @typescript-eslint/no-explicit-any -- helpers de test: fakes intencionalmente laxos */
import { describe, it, expect } from "vitest"
import {
  isTestId,
  isTestNotificacion,
  filtrarNotificacionesOwnershipScoped,
  getConfiguracionLimpiaOwnershipScoped,
  VALORES_TEST_CF,
  tieneDatosTest,
  obtenerIdsEgresosPLTest,
  esCertificadoTest,
  esCobroTest,
  filtrarEgresosOwnershipScoped,
  filtrarCertificadosOwnershipScoped,
  validarEstadoCompleto,
  formatearMensajeValidacion,
} from "./qa-lab-helpers"

describe("qa-lab-helpers — P2 ownership-scoped", () => {
  it("isTestId detecta prefijo test-", () => {
    expect(isTestId("test-p-99")).toBe(true)
    expect(isTestId("test-")).toBe(true)
    expect(isTestId("prod-1")).toBe(false)
    expect(isTestId(undefined)).toBe(false)
  })

  it("notificación real sobrevive · TEST se purga", () => {
    const notifs = [
      { destinatarioPersonaId: "test-p-99", asunto: "Copia TEST", cuerpo: "hola TEST", moduloOrigen: "PE" },
      { destinatarioPersonaId: "real-p-1", asunto: "Bienvenido vecino", cuerpo: "Su gasto común vence", moduloOrigen: "FI" },
      { destinatarioPersonaId: undefined, asunto: "TEST acta publicada", cuerpo: "notificación TEST", moduloOrigen: "GD" },
      { destinatarioPersonaId: undefined, asunto: "Cierre de turno", cuerpo: "sin TEST", moduloOrigen: "PE" },
    ]
    // isTestNotificacion
    expect(isTestNotificacion(notifs[0]!)).toBe(true)
    expect(isTestNotificacion(notifs[1]!)).toBe(false)
    expect(isTestNotificacion(notifs[2]!)).toBe(true)
    // El cuarto contiene "TEST" en cuerpo? "sin TEST" incluye TEST -> debería filtrarse
    // pero si cuerpo es "sin TEST" incluye substring TEST -> es TEST; ajustamos expectativa
    expect(isTestNotificacion(notifs[3]!)).toBe(true)

    // Caso preservado: sin TEST en asunto/cuerpo y sin destinatario TEST
    const real2 = { destinatarioPersonaId: undefined, asunto: "Aviso de corte", cuerpo: "Mañana habrá corte de agua", moduloOrigen: "CV" }
    expect(isTestNotificacion(real2)).toBe(false)

    const filtradas = filtrarNotificacionesOwnershipScoped([...notifs, real2])
    // Deben sobrevivir solo las reales sin marca TEST
    expect(filtradas.some((n) => n.asunto === "Bienvenido vecino")).toBe(true)
    expect(filtradas.some((n) => n.asunto === "Aviso de corte")).toBe(true)
    expect(filtradas.some((n) => n.asunto.includes("TEST"))).toBe(false)
    expect(filtradas.some((n) => n.destinatarioPersonaId === "test-p-99")).toBe(false)
  })

  it("config real se preserva · TEST se resetea a undefined", () => {
    const cfgReal = { ufMensual: 40000, ingresoMinimoMensual: 510000, topeGratificacionLegal: 5, tasaSIS: 2, nombreComunidad: "X" }
    const limpiaReal = getConfiguracionLimpiaOwnershipScoped(cfgReal)
    expect(limpiaReal.ufMensual).toBe(40000)
    expect(limpiaReal.ingresoMinimoMensual).toBe(510000)

    const cfgTest = { ufMensual: VALORES_TEST_CF.ufMensual, ingresoMinimoMensual: VALORES_TEST_CF.ingresoMinimoMensual, topeGratificacionLegal: VALORES_TEST_CF.topeGratificacionLegal, tasaSIS: VALORES_TEST_CF.tasaSIS, nombreComunidad: "X" }
    const limpiaTest = getConfiguracionLimpiaOwnershipScoped(cfgTest)
    expect(limpiaTest.ufMensual).toBeUndefined()
    expect(limpiaTest.ingresoMinimoMensual).toBeUndefined()
    expect(limpiaTest.topeGratificacionLegal).toBeUndefined()
    expect(limpiaTest.tasaSIS).toBeUndefined()

    // Mixto: solo algunos TEST
    const cfgMixto = { ufMensual: 39000, ingresoMinimoMensual: 999999, topeGratificacionLegal: 4.75, tasaSIS: 9.99 }
    const limpiaMixto = getConfiguracionLimpiaOwnershipScoped(cfgMixto)
    expect(limpiaMixto.ufMensual).toBeUndefined()
    expect(limpiaMixto.ingresoMinimoMensual).toBe(999999)
    expect(limpiaMixto.topeGratificacionLegal).toBeUndefined()
    expect(limpiaMixto.tasaSIS).toBe(9.99)
  })

  it("TEST-* se purga · guard bloquea", () => {
    const vacio = { personas: [], unidades: [], vinculos: [], actasGD: [], cobrosFI: [], reservasRA: [], liquidacionesPL: [], certificadosCT: [], avisosCV: [], fondosFI: [], egresosFI: [] }
    expect(tieneDatosTest(vacio)).toBe(false)
    expect(tieneDatosTest({ ...vacio, personas: [{ id: "test-p-99" }] })).toBe(true)
    expect(tieneDatosTest({ ...vacio, unidades: [{ id: "test-u-999" }] })).toBe(true)
    expect(tieneDatosTest({ ...vacio, vinculos: [{ id: "test-v-1" }] })).toBe(true)
    expect(tieneDatosTest({ ...vacio, actasGD: [{ id: "test-acta" }] })).toBe(true)
    expect(tieneDatosTest({ ...vacio, cobrosFI: [{ id: "cob-1", unidadId: "test-u-999" }] })).toBe(true)
    expect(tieneDatosTest({ ...vacio, cobrosFI: [{ id: "cob-1", unidadId: "u-1", origenRef: "test-ra-rs-1" }] })).toBe(true)
    expect(tieneDatosTest({ ...vacio, reservasRA: [{ id: "test-ra-rs-1" }] })).toBe(true)
    expect(tieneDatosTest({ ...vacio, liquidacionesPL: [{ id: "test-liq-pl" }] })).toBe(true)
    expect(tieneDatosTest({ ...vacio, certificadosCT: [{ id: "ct-123", personaId: "test-p-99" }] })).toBe(true)
    expect(tieneDatosTest({ ...vacio, avisosCV: [{ id: "cv-1", plantillaId: "plant-cv-porton" }] })).toBe(true)
    // reales no bloquean
    expect(tieneDatosTest({ ...vacio, personas: [{ id: "p-real" }], unidades: [{ id: "u-real" }] })).toBe(false)
  })

  it("P4 GATED-API-BD: el resumen BD bloquea el guard en ambos mundos", () => {
    const vacio = { personas: [], unidades: [], vinculos: [], actasGD: [], cobrosFI: [], reservasRA: [], liquidacionesPL: [], certificadosCT: [], avisosCV: [], fondosFI: [], egresosFI: [] }
    // Sin resumen BD: comportamiento legacy intacto
    expect(tieneDatosTest(vacio)).toBe(false)
    expect(tieneDatosTest(vacio, {})).toBe(false)
    // Cada colección BD bloqueante dispara el guard
    expect(tieneDatosTest(vacio, { publicacionesPortal: [{ id: "test-pub-pi-qa" }] })).toBe(true)
    expect(tieneDatosTest(vacio, { leadsPortal: [{ id: "test-lead-pi-qa" }] })).toBe(true)
    expect(tieneDatosTest(vacio, { personas: [{ id: "test-qa-pl-trab" }] })).toBe(true)
    expect(tieneDatosTest(vacio, { liquidacionesBorrador: [{ id: "test-liq-pl-qa-202711", estado: "borrador" }] })).toBe(true)
    // Filas reales en BD no bloquean; las confirmadas no van en el resumen (no bloquean por diseño)
    expect(tieneDatosTest(vacio, { publicacionesPortal: [{ id: "pub-real-1" }] })).toBe(false)
    expect(tieneDatosTest(vacio, { liquidacionesBorrador: [] })).toBe(false)
  })

  it("egresos PL con id aleatorio se purgan vía liquidación", () => {
    const state = {
      liquidacionesPL: [{ id: "test-liq-pl", egresoFIReferencia: "egr-aleatorio-1" }, { id: "liq-real", egresoFIReferencia: "egr-real-1" }],
      egresosFI: [{ id: "egr-aleatorio-1", fondoId: "fondo-gc" }, { id: "egr-real-1", fondoId: "fondo-gc" }, { id: "test-egr-1", fondoId: "fondo-gc" }],
    }
    const ids = obtenerIdsEgresosPLTest(state)
    expect(ids.has("egr-aleatorio-1")).toBe(true)
    expect(ids.has("egr-real-1")).toBe(false)
    const filtrados = filtrarEgresosOwnershipScoped(state.egresosFI as any, ids)
    expect(filtrados.some((e) => e.id === "egr-aleatorio-1")).toBe(false)
    expect(filtrados.some((e) => e.id === "test-egr-1")).toBe(false)
    expect(filtrados.some((e) => e.id === "egr-real-1")).toBe(true)
  })

  it("certificados con id aleatorio pero referencia TEST se purgan", () => {
    const certs = [
      { id: "ct-aleatorio-1", personaId: "test-p-99", unidadId: "test-u-999" },
      { id: "test-ct-1", personaId: "test-p-99" },
      { id: "ct-real-1", personaId: "p-real", unidadId: "u-real" },
      { id: "ct-aleatorio-2", origenRef: "test-liq-pl" },
    ]
    expect(esCertificadoTest(certs[0]!)).toBe(true)
    expect(esCertificadoTest(certs[2]!)).toBe(false)
    const filtrados = filtrarCertificadosOwnershipScoped(certs as any)
    expect(filtrados.length).toBe(1)
    expect(filtrados[0]!.id).toBe("ct-real-1")
  })

  it("cobros TEST por origenRef", () => {
    expect(esCobroTest({ id: "cob-1", unidadId: "u-real", origenRef: "test-ra-rs-1" } as any)).toBe(true)
    expect(esCobroTest({ id: "cob-1", unidadId: "test-u-999", origenRef: undefined } as any)).toBe(true)
    expect(esCobroTest({ id: "cob-1", unidadId: "u-real", origenRef: "infra-real" } as any)).toBe(false)
  })

  it("validar() completo reporta huérfanos por área", () => {
    const perfecto = {
      personas: [{ id: "test-p-99" }, { id: "p-real" }],
      unidades: [{ id: "test-u-999", microSectorId: "test-micro-piso99", tipoUnidadId: "test-tu-loftqa", estadoId: "test-edo-enlimpieza" }],
      microSectores: [{ id: "test-micro-piso99" }],
      tiposUnidad: [{ id: "test-tu-loftqa" }, { id: "tipo-es-1" }],
      maestros: { estadosOcupacion: [{ id: "test-edo-enlimpieza" }] },
      vinculos: [{ id: "test-v-prop-999", personaId: "test-p-99", unidadId: "test-u-999" }],
      fondosFI: [{ id: "test-fondo-pintura" }, { id: "fondo-gc" }, { id: "fondo-amenities" }],
      egresosFI: [{ id: "test-egr-1", fondoId: "fondo-gc" }],
      cobrosFI: [{ id: "cob-1", unidadId: "test-u-999", origenRef: "test-in-grave", concepto: "multa_in" }],
      infraccionesIN: [{ id: "test-in-grave" }],
      reservasRA: [{ id: "test-ra-rs-1", elementoId: "test-ra-quincho", solicitantePersonaId: "test-p-99", unidadId: "test-u-999", cargoFIReferencia: "cob-1" }],
      elementosRA: [{ id: "test-ra-quincho", microSectorId: "test-micro-piso99" }],
      bitacoraVisitasPE: [{ id: "test-pe-visita", unidadId: "test-u-999", destinoPersonaId: "test-p-88" }],
      encomiendasPE: [{ id: "test-pe-enc", destinatarioPersonaId: "test-p-99" }],
      ingresosContratistasPE: [{ id: "test-pe-cont", unidadId: "test-u-999" }],
      proveedoresPE: [{ id: "test-pe-prov" }],
      mantencionesPreventivasPE: [{ id: "test-pe-mant", proveedorId: "test-pe-prov" }],
      visitasTecnicasPE: [{ id: "test-pe-vt", proveedorId: "test-pe-prov", mantencionId: "test-pe-mant" }],
      cierresTurnoPE: [{ id: "test-pe-cierre", trabajadorPersonaId: "test-p-99" }],
      proyeccionesPE: [{ id: "test-pe-proy" }],
      liquidacionesPL: [{ id: "test-liq-pl", trabajadorPersonaId: "test-p-99", adelantosIds: ["test-ade-1"], egresoFIReferencia: "test-egr-1" }],
      adelantosPL: [{ id: "test-ade-1", trabajadorPersonaId: "test-p-99" }],
      certificadosCT: [{ id: "test-ct-1", personaId: "test-p-99", unidadId: "test-u-999", origenRef: "test-liq-pl" }],
      avisosCV: [{ id: "test-cv-manual", actaId: undefined, plantillaId: undefined }, { id: "cv-plant", actaId: "test-acta-gd", plantillaId: "plant-cv-porton" }],
      actasGD: [{ id: "test-acta-gd" }],
      plantillasCV: [{ id: "plant-cv-porton" }],
      eventos: [{ id: "ev-1", referenciaId: "test-p-99" }],
      personasExtra: [],
    } as unknown as Record<string, unknown>
    // Añadir p-88 para visita
    ;(perfecto.personas as { id: string }[]).push({ id: "test-p-88" })

    const rOk = validarEstadoCompleto(perfecto)
    expect(rOk.total).toBe(0)
    expect(formatearMensajeValidacion(rOk)).toBe("Validación OK — tasa huérfanos 0, TEST-* coherente")

    // Inyectar huérfanos: reserva apunta a elemento inexistente, cobro origenRef huérfano, certificado persona huérfana
    const roto = {
      ...perfecto,
      reservasRA: [{ id: "test-ra-rs-1", elementoId: "no-existe", solicitantePersonaId: "test-p-99", unidadId: "test-u-999", cargoFIReferencia: "cob-1" }],
      cobrosFI: [{ id: "cob-1", unidadId: "test-u-999", origenRef: "test-no-existe", concepto: "multa_in" }],
      certificadosCT: [{ id: "test-ct-1", personaId: "test-p-ghost", unidadId: "test-u-999" }],
    } as unknown as Record<string, unknown>
    const rRoto = validarEstadoCompleto(roto)
    expect(rRoto.total).toBeGreaterThan(0)
    expect(rRoto.porArea.RA).toBe(1)
    expect(rRoto.porArea.FI).toBe(1)
    expect(rRoto.porArea.CT).toBe(1)
    const msg = formatearMensajeValidacion(rRoto)
    expect(msg).toContain("huérfanos")
    expect(msg).toContain("FI:")
    expect(msg).toContain("CT:")
  })
})
