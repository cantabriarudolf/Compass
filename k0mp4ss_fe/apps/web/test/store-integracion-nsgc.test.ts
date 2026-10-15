import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import { calcularProyeccionCobertura } from "@/lib/personal-utils"
import { tasaHuerfanosRE } from "@/lib/reporteria-utils"
import { resetStore } from "./helpers"

// Ventana 9 — QA integral de la serie NSGC.
// Espejo a nivel store del botón "Cargar Todo" de /admin/qa-lab (engranaje 2) y
// verificación explícita de las cadenas cross-módulo a–g (engranaje 3). Sin
// datos TEST persistidos: cada prueba parte desde el seed limpio.

const getState = () => useCompassStore.getState()
const hoy = () => new Date().toISOString().slice(0, 10)
const manana = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
const mesAtras = () => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 2)
  return d.toISOString().slice(0, 7)
}
const pendienteCobro = (c: { montoBase: number; moras: { monto: number }[]; pagos: { monto: number }[] }) =>
  c.montoBase + c.moras.reduce((a, m) => a + m.monto, 0) - c.pagos.reduce((a, p) => a + p.monto, 0)

describe("Engranaje 2 — QA Lab 'Cargar Todo': cadena completa MA→RE", () => {
  beforeEach(resetStore)

  it("ejecuta todas las fases en orden de dependencia sin errores y con export JSON OK", () => {
    const errores: string[] = []
    const fallar = (paso: string, condicion: boolean, detalle?: string) => {
      if (!condicion) errores.push(detalle ?? paso)
    }

    // --- Fase 1-3: MA → TU/MP → EF ---
    const s0 = getState()
    for (const [k, v] of [
      ["estadosOcupacion", { id: "test-edo-enlimpieza", nombre: "TEST-EdO-EnLimpieza", color: "destructive", hex: "#ef4444" }],
      ["categoriasMacro", { id: "test-macro-torreqa", nombre: "TEST-MACRO-TorreQA" }],
      ["categoriasMicro", { id: "test-micro-pisoqa", nombre: "TEST-MICRO-PisoQA" }],
      ["categoriasUnidad", { id: "test-catu-loftqa", nombre: "TEST-CATU-LoftQA" }],
      ["condicionesEspeciales", { id: "test-vuln-electroqa", nombre: "TEST-VULN-ElectroQA", color: "bg-blue-500 text-white" }],
      ["estadosInmobiliarios", { id: "test-einm-prereservaqa", nombre: "TEST-EINM-PreReservaQA" }],
      ["contactosEmergencia", { id: "test-emer-cerrajeroqa", nombre: "TEST-EMER-CerrajeroQA", telefono: "+56 9 9999 0001", categoria: "tecnico" }],
      ["bancos", { id: "test-banco-bancoqa", nombre: "TEST-BANCO-BancoQA" }],
    ] as const) {
      const r = s0.saveMaestro(k, v as never)
      fallar(`MA ${k}`, r.ok, `MA ${k}: ${r.error}`)
    }
    fallar("TU", getState().saveTipoUnidad({
      id: "test-tu-loftqa", nombre: "TU-TEST-LoftQA", categoria: "TEST-CATU-LoftQA", metraje: 45,
      montoBaseGc: 120000, descripcion: "DescLoftTEST", activo: true,
      historialTarifas: [{ id: "t-test-loftqa", monto: 120000, fechaVigencia: "2026-08-20", creadoEn: "2026-08-20" }],
    } as never).ok)
    expect(getState().savePersona({ id: "test-p-99", rut: "99.999.999-9", nombreCompleto: "TEST Persona QA Uno", nombres: "TEST", apellidos: "Persona QA Uno", email: "test.qa@compass.cl", telefonoMovil: "+56 9 9999 9999", estadoCuenta: "activa", condicionesEspecialesIds: ["test-vuln-electroqa"], roles: ["residente"] } as never).ok).toBe(true)
    expect(getState().savePersona({ id: "test-p-88", rut: "88.888.888-8", nombreCompleto: "TEST Persona QA Dos", nombres: "TEST", apellidos: "Persona QA Dos", email: "test.qa2@compass.cl", telefonoMovil: "+56 9 8888 8888", estadoCuenta: "activa", condicionesEspecialesIds: [], roles: ["residente"] } as never).ok).toBe(true)
    expect(getState().saveMacroSector({ id: "test-macro-sectortest", nombre: "SectorTEST", etiqueta: "TEST-MACRO-TorreQA", descripcion: "DescripMSectorTEST" } as never).ok).toBe(true)
    expect(getState().saveMicroSector({ id: "test-micro-piso99", nombre: "Piso99-TEST", etiqueta: "TEST-MICRO-PisoQA", macroSectorId: "test-macro-sectortest" } as never).ok).toBe(true)
    expect(getState().saveUnidad({ id: "test-u-999", numero: "999", etiqueta: "TEST-CATU-LoftQA", microSectorId: "test-micro-piso99", tipoUnidadId: "test-tu-loftqa", estadoId: "test-edo-enlimpieza", rolSii: "999-99", metraje: 45, prorrateo: 0.01, servicios: {} } as never).ok).toBe(true)
    const estMacro = getState().macroSectores.find(m => m.id === "estacionamientos")
    if (estMacro && !getState().microSectores.some(m => m.id === "test-est-sup-qa")) {
      getState().saveMicroSector({ id: "test-est-sup-qa", nombre: "Superficie TEST", etiqueta: "Piso", macroSectorId: "estacionamientos" } as never)
    }
    expect(getState().saveUnidad({ id: "test-u-e-999", numero: "E-999", etiqueta: "Estacionamiento", microSectorId: "test-est-sup-qa", tipoUnidadId: "tipo-es-1", estadoId: "vacante", rolSii: "", metraje: 12.5, prorrateo: 0.005, servicios: {} } as never).ok).toBe(true)

    // --- Fase 4-7: VU → PI → AD → GD ---
    expect(getState().saveVinculo({ id: "test-v-prop-999", personaId: "test-p-99", unidadId: "test-u-999", rol: "propietario", fechaInicio: "2026-08-20", estadoOcupacionPropiedad: "test-einm-prereservaqa", permiteVerFinanzas: true } as never).ok).toBe(true)
    expect(getState().saveVinculo({ id: "test-v-prop-e999", personaId: "test-p-99", unidadId: "test-u-e-999", rol: "propietario", fechaInicio: "2026-08-20", permiteVerFinanzas: false } as never).ok).toBe(true)
    expect(getState().saveVinculo({ id: "test-v-arr-999", personaId: "test-p-88", unidadId: "test-u-999", rol: "arrendatario", fechaInicio: "2026-08-20", fechaFin: "2027-08-20", permiteVerFinanzas: false } as never).ok).toBe(true)

    // La vitrina PI se siembra directo: `savePublicacionPortal`/`saveLeadPortal` (legacy) se
    // eliminaron en store-cleanup (la cadena publicación→lead→notificación vive en la API REST).
    useCompassStore.setState((s) => ({
      publicacionesPortal: [
        ...s.publicacionesPortal,
        { id: "test-pub-pi-e999", unidadId: "test-u-e-999", operacion: "venta", precio: 8500000, moneda: "CLP", descripcion: "Estacionamiento TEST publicado en vitrina", urlMapa: "", imagenes: [{ nombre: "test-foto-e999.jpg", tipoMime: "image/jpeg", tamanoKB: 120, url: "https://placeholder.supabase.co/test-foto-e999.jpg" }], activa: true, fechaPublicacion: "2026-08-24" },
      ],
    }))

    expect(getState().saveControlPropiedad({ id: "test-ctrl-e999", unidadId: "test-u-e-999", residenteVeMorosidad: true, residenteVeActas: false, alertasResidentesActivas: true } as never).ok).toBe(true)

    const p99 = getState().personas.find(p => p.id === "test-p-99")!
    expect(getState().savePersona({ ...p99, roles: Array.from(new Set([...p99.roles, "directiva"])), datosGobernanza: { id: "gob-test-1", cargoDirectiva: "presidente", fechaAsuncion: "2026-08-24" } } as never).ok).toBe(true)
    expect(getState().saveActaGD({ id: "test-acta-gd", fecha: "2026-08-24", hora: "19:30", lugar: "Sede comunitaria TEST", tablaTemas: ["Tema TEST GD"], presentes: ["test-p-99"], ausentes: [], invitados: [], minuta: "Minuta de prueba del acta TEST.", adjuntos: [{ nombre: "test-acta.pdf", tipoMime: "application/pdf", tamanoKB: 250, url: "https://placeholder.supabase.co/test-acta.pdf" }], estado: "borrador", aprobaciones: [] } as never).ok).toBe(true)
    // Cadena b: firmas hasta quórum 100% de TODA la directiva vigente (seed + TEST).
    const directiva = getState().personas.filter(p => p.datosGobernanza && p.estadoCuenta === "activa").map(p => p.id)
    for (const id of directiva) getState().aprobarActaGD("test-acta-gd", id)
    const acta = getState().actasGD.find(a => a.id === "test-acta-gd")!
    fallar("GD quórum", acta.estado === "publicada", `Acta quedó en ${acta.estado} (directiva: ${directiva.length})`)
    expect(acta.aprobaciones.length).toBe(directiva.length)
    // Notificación formal a propietarios (rol propietario; no pasa por gate AD).
    expect(getState().notificaciones.some(n => n.moduloOrigen === "GD" && n.destinatarioRol === "propietario" && n.asunto.includes("Nueva acta publicada"))).toBe(true)

    // --- Fases 7-12: CO → GE → IR → IN → MT → RA/CV ---
    expect(getState().savePlantillaCO({ id: "test-plant-co", nombre: "TEST-Plantilla-CobranzaQA", categoria: "cobranza", asunto: "Recordatorio GC [Nombre_Usuario]", cuerpo: "Estimado/a [Nombre_Usuario], su gasto común TEST vence pronto." }).ok).toBe(true)
    expect(getState().saveEnvioCO({ id: "test-env-co-1", asunto: "Aviso TEST CO", cuerpo: "Hola [Nombre_Usuario], envío masivo de prueba.", plantillaId: undefined, destinatarios: [{ personaId: "test-p-99" }, { personaId: "test-p-88" }], fechaEnvio: "2026-08-25", lecturas: [] }).ok).toBe(true)
    expect(getState().registrarLecturaEnvioCO("test-env-co-1", "test-p-99").ok).toBe(true)
    expect(getState().saveDocumentoCO({ id: "test-doc-co", nombre: "TEST-ReglamentoQA.pdf", tipoMime: "application/pdf", tamanoKB: 180, url: "https://placeholder.supabase.co/test-reglamento.pdf", categoria: "reglamento" }).ok).toBe(true)
    expect(getState().saveMensajeBuzonCO({ id: "test-buz-co-1", folio: "", clasificacion: "reclamo", reportantePersonaId: "test-p-88", reportanteNombre: "TEST Persona QA Dos", asunto: "Reclamo TEST buzón", cuerpo: "Falla de servicio en área común TEST.", visibilidadComite: true, fechaIngreso: "2026-08-25", estado: "recibido", respuestas: [] }).ok).toBe(true)
    expect(getState().responderMensajeBuzonCO("test-buz-co-1", { autor: "Administración", texto: "Respuesta TEST al reclamo.", compromisos: "Visita técnica esta semana" }).ok).toBe(true)
    expect(getState().cambiarEstadoBuzonCO("test-buz-co-1", "resuelto").ok).toBe(true)

    expect(getState().saveSolicitudGE({ id: "test-sol-ge-1", folio: "", tipo: "grabaciones", titulo: "Grabaciones CCTV TEST", descripcion: "Revisión de cámaras por paquete retirado indebidamente.", solicitantePersonaId: "test-p-88", unidadId: "test-u-999", estado: "nuevo", fechaCreacion: "2026-08-25", comentarios: [], detalleGrabaciones: { fechaSuceso: "2026-08-24", horaSuceso: "18:30", justificacion: "Courier retiró un paquete ajeno." }, historialEstados: [] }).ok).toBe(true)
    expect(getState().abrirSolicitudGE("test-sol-ge-1").ok).toBe(true)
    expect(getState().solicitudesGE.find(x => x.id === "test-sol-ge-1")?.estado).toBe("en_revision")
    expect(getState().responderSolicitudGE("test-sol-ge-1", { autorRol: "administracion", texto: "Indique la hora exacta." }).ok).toBe(true)
    expect(getState().solicitudesGE.find(x => x.id === "test-sol-ge-1")?.estado).toBe("requiere_accion_vecino")
    expect(getState().responderSolicitudGE("test-sol-ge-1", { autorRol: "solicitante", texto: "Fue a las 18:30." }).ok).toBe(true)
    expect(getState().solicitudesGE.find(x => x.id === "test-sol-ge-1")?.estado).toBe("en_proceso")
    expect(getState().resolverSolicitudGE("test-sol-ge-1", "Link TEST entregado.").ok).toBe(true)
    expect(getState().cerrarSolicitudGE("test-sol-ge-1").ok).toBe(true)
    expect(getState().saveSolicitudGE({ id: "test-sol-ge-2", folio: "", tipo: "buzon", titulo: "[Buzón] Reclamo TEST buzón", descripcion: "Gestión del reclamo ciudadano TEST.", unidadId: "test-u-999", estado: "nuevo", fechaCreacion: "2026-08-25", comentarios: [], mensajeBuzonId: "test-buz-co-1", historialEstados: [] }).ok).toBe(true)

    expect(getState().saveRecursoIR({ id: "test-ir-cloro", nombre: "Cloro bidón 5L TEST", categoria: "insumo", estadoActivo: "disponible", stock: 10, esCritico: true, umbralCritico: 5, proveedor: "Distribuidora TEST", numeroFactura: "F-QA-001" } as never).ok).toBe(true)
    expect(getState().saveRecursoIR({ id: "test-ir-casco", nombre: "Casco seguridad TEST", categoria: "epp", estadoActivo: "disponible", stock: 0, esCritico: false, talla: "M", renovacionMeses: 6 } as never).ok).toBe(true)
    expect(getState().saveRecursoIR({ id: "test-ir-llave999", nombre: "Llave Depto 999 TEST", categoria: "acceso", estadoActivo: "disponible", stock: 0, esCritico: false, unidadId: "test-u-999" } as never).ok).toBe(true)
    expect(getState().saveSolicitudInsumoIR({ id: "test-si-1", folio: "", solicitantePersonaId: "test-p-99", recursoInsumoId: "test-ir-cloro", estadoComodin: "no_comodin", cantidad: 3, areaDestino: "Piso 1 Torre TEST", estado: "pendiente", fechaSolicitud: "2026-08-25" } as never).ok).toBe(true)
    expect(getState().entregarSolicitudInsumoIR("test-si-1").ok).toBe(true)
    expect(getState().activosIR.find(x => x.id === "test-ir-cloro")?.stock).toBe(7)
    expect(getState().saveSolicitudInsumoIR({ id: "test-si-2", folio: "", solicitantePersonaId: "test-p-88", comodin: { descripcionArticulo: "Escobillón industrial TEST", justificacion: "Emergencia de aseo post evento TEST." }, estadoComodin: "no_comodin", cantidad: 1, areaDestino: "Conserjería TEST", estado: "pendiente", fechaSolicitud: "2026-08-25" } as never).ok).toBe(true)
    expect(getState().resolverComodinIR("test-si-2", "aprobar_crear").ok).toBe(true)
    expect(getState().registrarEntregaEPP({ id: "test-epp-1", recursoId: "test-ir-casco", personaId: "test-p-88", fechaEntrega: "2026-08-25", talla: "M", estado: "nuevo" } as never).ok).toBe(true)
    expect(getState().entregasEPP.find(e => e.id === "test-epp-1")?.proximaRenovacion).toBe("2027-02-25")
    expect(getState().asignarAccesoIR("test-ir-llave999", "test-p-88").ok).toBe(true)

    expect(getState().saveTipoInfraccionIN({ id: "test-tipo-in", nombre: "Falta TEST Reglamento", categoria: "leve", tipoSancion: "monto_fijo", valor: 25000 } as never).ok).toBe(true)
    expect(getState().saveInfraccionIN({ id: "test-in-leve", folio: "", tipoInfraccionId: "test-tipo-in", unidadId: "test-u-999", reportantePersonaId: undefined, fechaSuceso: "2026-08-24", horaSuceso: "21:30", antecedentes: "Basura fuera de horario TEST.", evidencias: [{ nombre: "test-evidencia.jpg", tipoMime: "image/jpeg", tamanoKB: 80, url: "https://placeholder.supabase.co/test-evidencia.jpg" }], estado: "en_revision", fechaRegistro: "2026-08-25", comentariosDirectiva: [], respaldosDirectiva: [] } as never).ok).toBe(true)
    expect(getState().apelarInfraccionIN("test-in-leve", "Los desechos eran de una mudanza contratada.").ok).toBe(true)
    expect(getState().saveInfraccionIN({ id: "test-in-grave", folio: "", tipoInfraccionId: "tipo-in-ruidos", unidadId: "test-u-999", mensajeBuzonId: "test-buz-co-1", fechaSuceso: "2026-08-24", horaSuceso: "23:45", antecedentes: "Ruidos molestos reiterados TEST.", evidencias: [], estado: "en_revision", fechaRegistro: "2026-08-25", comentariosDirectiva: [], respaldosDirectiva: [] } as never).ok).toBe(true)
    expect(getState().respaldarInfraccionIN("test-in-grave", "test-p-99").ok).toBe(true)
    // Cadena d (IN→FI): aplicar la grave materializa cobro multa_in en fondo-gc.
    expect(getState().aplicarInfraccionIN("test-in-grave").ok).toBe(true)
    const grave = getState().infraccionesIN.find(i => i.id === "test-in-grave")!
    expect(grave.estado).toBe("aplicada")
    const cobroMulta = getState().cobrosFI.find(c => c.origenRef === "test-in-grave" && c.concepto === "multa_in")
    expect(String(grave.cargoFIReferencia)).toBe(cobroMulta?.id)
    expect(cobroMulta?.fondoId).toBe("fondo-gc")
    expect(getState().desestimarInfraccionIN("test-in-leve", "Descargos verificados: mudanza autorizada.").ok).toBe(true)

    expect(getState().saveRecursoIR({ id: "test-ir-hidro", nombre: "Hidropack TEST", categoria: "infraestructura", marca: "Grundfos TEST", estadoActivo: "disponible", stock: 0, esCritico: false, microSectorId: "test-micro-piso99" } as never).ok).toBe(true)
    expect(getState().saveTrabajoMT({ id: "test-mt-1", folio: "", titulo: "Mantención mensual Hidropack TEST", descripcion: "Revisión de presiones y sellos TEST.", activoIRId: "test-ir-hidro", microSectorId: "test-micro-piso99", proveedor: { nombre: "AquaServicio TEST", contacto: "+56 9 8888 0000" }, prioridad: "alta", costoTotal: 180000, origenFondos: "gasto_comun", estadoPago: "pendiente", alertaGarantiaEnviada: false, evidencias: [], preventivo: { periodicidadMeses: 1 }, cargoFIReferencia: "pendiente" } as never).ok).toBe(true)
    expect(getState().iniciarTrabajoMT("test-mt-1").ok).toBe(true)
    expect(getState().finalizarTrabajoMT("test-mt-1", { fechaTermino: "2026-08-25", costoFinal: 185000 }).ok).toBe(true)
    const generado = getState().trabajosMT.find(t => t.estado === "planificado" && t.preventivo && t.id !== "test-mt-1")
    expect(generado?.fechaProgramada).toBe("2026-09-25")
    expect(getState().saveTrabajoMT({ id: "test-mt-2", folio: "", titulo: "Impermeabilización losa TEST", descripcion: "Sellado de losas TEST.", microSectorId: "test-micro-piso99", proveedor: { nombre: "WaterProof TEST" }, prioridad: "media", costoTotal: 950000, origenFondos: "fondo_reserva", estadoPago: "parcial", estado: "finalizado", fechaTermino: "2026-01-10", garantiaInicio: "2026-01-10", garantiaFin: "2026-07-01", alertaGarantiaEnviada: false, evidencias: [{ tipo: "factura", nombre: "test-factura.pdf", tipoMime: "application/pdf", tamanoKB: 210, url: "https://placeholder.supabase.co/test-factura.pdf" }] } as never).ok).toBe(true)
    getState().verificarGarantiasMT()
    expect(getState().eventos.filter(e => e.tipoAccion === "MT_GUARANTEE_EXPIRED" && e.referenciaId === "test-mt-2")).toHaveLength(1)
    expect(getState().saveProyectoMT({ id: "test-py-techos", nombre: "Mantención de techos TEST", presupuestoEstimado: 12000000, plazoMeses: 120, estado: "planificado" } as never).ok).toBe(true)

    // RA (cadena d: reserva → cobro FI amenities).
    expect(getState().saveElementoRA({ id: "test-ra-quincho", nombre: "Quincho central TEST", tipo: "espacio_fisico", microSectorId: "test-micro-piso99", franja: "bloques_horas", duracionBloqueHoras: 3, tarifaUso: 15000, garantiaRequerida: 20000, aforo: 20, anticipacionMinimaDias: 0, cancelacionTardiaDias: 1, penalizacionTardiaMonto: 5000, activo: true } as never).ok).toBe(true)
    expect(getState().saveReservaRA({ id: "test-ra-rs-1", folio: "", elementoId: "test-ra-quincho", solicitantePersonaId: "test-p-99", unidadId: "test-u-999", fecha: manana(), horaInicio: "19:00", horaFin: "22:00", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 } as never).ok).toBe(true)
    const rs1 = getState().reservasRA.find(x => x.id === "test-ra-rs-1")!
    expect(rs1.folio).toBe("RA-0001")
    const cobroTarifa = getState().cobrosFI.find(c => c.origenRef === "test-ra-rs-1" && c.concepto === "reserva_ra")
    expect(rs1.cargoFIReferencia).toBe(cobroTarifa?.id)
    expect(cobroTarifa?.fondoId).toBe("fondo-amenities")
    const rOverlap = getState().saveReservaRA({ id: "test-ra-rs-x", folio: "", elementoId: "test-ra-quincho", solicitantePersonaId: "test-p-88", fecha: manana(), horaInicio: "20:00", horaFin: "23:00", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 } as never)
    expect(rOverlap.ok).toBe(false)
    expect(String(rOverlap.error)).toContain("Conflicto horario")
    expect(getState().saveElementoRA({ id: "test-ra-hidro", nombre: "Hidrolavadora TEST", tipo: "activo_mobiliario", microSectorId: "test-micro-piso99", franja: "dia_completo", tarifaUso: 5000, garantiaRequerida: 30000, stock: 2, activo: true } as never).ok).toBe(true)
    expect(getState().saveReservaRA({ id: "test-ra-rs-2", folio: "", elementoId: "test-ra-hidro", solicitantePersonaId: "test-p-88", unidadId: "test-u-999", fecha: manana(), horaInicio: "00:00", horaFin: "23:59", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 } as never).ok).toBe(true)
    expect(getState().saveReservaRA({ id: "test-ra-rs-3", folio: "", elementoId: "test-ra-hidro", solicitantePersonaId: "test-p-99", fecha: manana(), horaInicio: "00:00", horaFin: "23:59", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 } as never).ok).toBe(true)
    const rTercera = getState().saveReservaRA({ id: "test-ra-rs-y", folio: "", elementoId: "test-ra-hidro", solicitantePersonaId: "test-p-88", fecha: manana(), horaInicio: "00:00", horaFin: "23:59", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 } as never)
    expect(rTercera.ok).toBe(false)
    expect(getState().cancelarReservaRA("test-ra-rs-1").ok).toBe(true)
    const rs1c = getState().reservasRA.find(x => x.id === "test-ra-rs-1")!
    expect(rs1c.cancelacion?.tardia).toBe(true)
    expect(rs1c.cancelacion?.penalizacion).toBe(5000)
    expect(getState().retenerGarantiaRA("test-ra-rs-2", "Manguera fracturada al devolver TEST.").ok).toBe(true)
    expect(getState().reservasRA.find(x => x.id === "test-ra-rs-2")?.garantiaRetenida?.monto).toBe(30000)

    // CV (cadena b: acta GD publicada se materializa como aviso en visor).
    expect(getState().activarPlantillaCV("plant-cv-porton").ok).toBe(true)
    expect(getState().avisosCV.find(a => a.plantillaId === "plant-cv-porton")?.estado).toBe("publicado")
    expect(getState().saveAvisoCV({ id: "test-cv-manual", titulo: "Corte de agua programado TEST", cuerpo: "Corte TEST entre 10:00 y 14:00.", tipologia: "info", duracionSegundos: 8, imagenUrl: "https://placeholder.supabase.co/test-cv-agua.jpg", pantallaCompleta: false, tags: ["qa"], estado: "borrador", requiereVistoBueno: false, origen: "manual", fechaCreacion: hoy() }).ok).toBe(true)
    expect(getState().publicarAvisoCV("test-cv-manual").ok).toBe(true)
    const ayer = new Date()
    ayer.setDate(ayer.getDate() - 1)
    expect(getState().saveAvisoCV({ id: "test-cv-expirado", titulo: "Aviso vencido TEST", cuerpo: "Venció ayer para probar caducidad.", tipologia: "exito", duracionSegundos: 5, expiresAt: ayer.toISOString().slice(0, 10), pantallaCompleta: false, tags: ["qa"], estado: "borrador", requiereVistoBueno: false, origen: "manual", fechaCreacion: ayer.toISOString().slice(0, 10) }).ok).toBe(true)
    getState().publicarAvisoCV("test-cv-expirado")
    getState().caducarAvisosCV()
    expect(getState().avisosCV.find(a => a.id === "test-cv-expirado")?.estado).toBe("archivado")
    expect(getState().publicarActaEnCV("test-acta-gd").ok).toBe(true)
    const actaCV = getState().actasGD.find(a => a.id === "test-acta-gd")!
    expect(actaCV.avisoCVReferencia).not.toBe("pendiente")
    const avisoActa = getState().avisosCV.find(a => a.id === actaCV.avisoCVReferencia)!
    expect(avisoActa.origen).toBe("acta_gd")
    expect(avisoActa.estado).toBe("publicado")

    // --- Fase 13: FI (conexiones IN/RA/MT + morosidad) ---
    expect(getState().saveFondoFI({ id: "test-fondo-pintura", nombre: "Fondo Cuota Extraordinaria Pintura TEST", tipo: "especial", descripcion: "Cuota aprobada en asamblea.", activo: true } as never).ok).toBe(true)
    const rEgr = getState().saveEgresoFI({ id: "test-egr-1", fecha: hoy(), categoria: "sueldos", descripcion: "Sueldo conserje TEST", monto: 350000, fondoId: "fondo-gc", esRecurrente: true, comprobante: { nombre: "test-boleta.pdf", tipoMime: "application/pdf", tamanoKB: 90, url: "https://placeholder.supabase.co/test-boleta.pdf" } } as never)
    expect(rEgr.ok).toBe(true)
    expect(getState().egresosFI.find(e => e.id === "test-egr-1")?.folio).toMatch(/^FE-/)

    const periodoActual = hoy().slice(0, 7)
    expect(getState().emitirGastoComun({ periodo: periodoActual, gastoTotal: 450000, unidadIds: ["test-u-999"] }).ok).toBe(true)
    const emision = getState().emisionesGC.find(e => e.periodo === periodoActual)!
    expect(emision.lineas[0]?.monto).toBe(4500)
    expect(emision.fondoReservaAporte?.monto).toBe(225)
    const rEmisionTotal = getState().emitirGastoComun({ periodo: "2025-12", gastoTotal: 1000000 })
    expect(rEmisionTotal.ok).toBe(false)
    expect(String(rEmisionTotal.error)).toContain("responsable de cobro")

    const cobroGC = getState().cobrosFI.find(c => c.concepto === "gasto_comun" && c.periodo === periodoActual)!
    expect(getState().registrarPagoFI(cobroGC.id, { monto: pendienteCobro(cobroGC), medio: "transferencia" }).ok).toBe(true)
    expect(getState().cobrosFI.find(c => c.id === cobroGC.id)?.pagos).toHaveLength(1)

    expect(getState().emitirGastoComun({ periodo: mesAtras(), gastoTotal: 200000, unidadIds: ["test-u-999"] }).ok).toBe(true)
    const cobroVencido = getState().cobrosFI.find(c => c.concepto === "gasto_comun" && c.periodo === mesAtras())!
    expect(getState().aplicarMoraFI(cobroVencido.id, 1).ok).toBe(true)
    const morasTrasPrimera = getState().cobrosFI.find(c => c.id === cobroVencido.id)?.moras.length ?? 0
    expect(morasTrasPrimera).toBeGreaterThanOrEqual(1)
    getState().aplicarMoraFI(cobroVencido.id, 1)
    expect(getState().cobrosFI.find(c => c.id === cobroVencido.id)?.moras.length).toBe(morasTrasPrimera)

    // Descuento sin justificación rechazado; con justificación genera diferencia inmutable.
    // Descuento proporcional: una multa % GC sin emisión previa cae al valor nominal
    // del catálogo ($50) y un descuento fijo daría un monto negativo rechazado siempre.
    const pendienteMulta = pendienteCobro(cobroMulta!)
    const descuento = Math.max(1, Math.round(pendienteMulta * 0.1))
    const montoConDescuento = pendienteMulta - descuento
    const sinJustificacion = getState().registrarPagoFI(cobroMulta!.id, { monto: montoConDescuento, medio: "efectivo" })
    expect(sinJustificacion.ok).toBe(false)
    const conJustificacion = getState().registrarPagoFI(cobroMulta!.id, { monto: montoConDescuento, medio: "efectivo", ajusteJustificacion: "Condonación parcial autorizada por directiva TEST." })
    expect(conJustificacion.ok).toBe(true)
    expect(getState().cobrosFI.find(c => c.id === cobroMulta!.id)?.diferencias).toHaveLength(1)
    expect(getState().eventos.some(e => e.tipoAccion === "FI_MANUAL_DISCOUNT")).toBe(true)
    // Conexión MT: proyecto financiado por fondo GC sin saldo → rechazado.
    const rPyFinanciado = getState().saveProyectoMT({ id: "test-py-financiado", nombre: "Repintado fachada TEST", presupuestoEstimado: 12000000, plazoMeses: 120, estado: "planificado", fondoFinanciamientoId: "fondo-gc" } as never)
    expect(rPyFinanciado.ok).toBe(false)
    expect(String(rPyFinanciado.error)).toContain("Saldo insuficiente")
    // Retiro del fondo de reserva sin acta publicada → rechazado.
    const rRetiro = getState().retirarFondoFI({ fondoId: "fondo-reserva", monto: 50000, descripcion: "Retiro sin respaldo TEST" })
    expect(rRetiro.ok).toBe(false)
    expect(String(rRetiro.error)).toContain("acta")

    // --- Fase 14: PE ---
    const p99b = getState().personas.find(p => p.id === "test-p-99")!
    expect(getState().savePersona({
      ...p99b,
      datosLaborales: {
        id: "l-test-pe", cargo: "Conserje Turno Noche TEST", afp: "Habitat", prevision: "FONASA",
        fechaIngreso: "2026-01-05", tipoContrato: "indefinido", afpId: "afp-habitat", saludId: "fonasa",
        bancoId: "banco-estado", asignacionFamiliarId: "asf-a", cargas: 1, jornadaBaseHoras: 45,
        contactosEmergencia: [{ id: "test-pe-ce-1", nombre: "Contacto Emergencia TEST", telefono: "+56 9 9999 0000", relacion: "Pareja" }],
      },
    } as never).ok).toBe(true)
    expect(getState().personas.find(p => p.id === "test-p-99")?.datosLaborales?.afpId).toBe("afp-habitat")
    expect(getState().registrarHoraExtraPE("test-p-99", { fecha: hoy(), horas: 2, motivo: "Reemplazo jornada tarde TEST" }).ok).toBe(true)
    expect(getState().registrarEvaluacionPE("test-p-99", { fecha: hoy(), puntaje: 6, comentarios: "Desempeño TEST destacado" }).ok).toBe(true)
    const anioProximo = new Date().getFullYear() + 1
    expect(getState().saveMaestro("feriados", { id: `test-feriado-${anioProximo}-0101`, fecha: `${anioProximo}-01-01`, nombre: "Año Nuevo TEST", irrenunciable: true } as never).ok).toBe(true)
    const proyeccion = calcularProyeccionCobertura({ feriados: getState().maestros.feriados, mesAnio: `${anioProximo}-01` })
    expect(proyeccion.diasFeriados).toBe(1)
    expect(proyeccion.reemplazosNecesarios).toBe(2)
    expect(getState().enviarProyeccionCostoFI(`${anioProximo}-01`, { costoParche: 30000, costoDiaExtra: 25000, id: "test-pe-proy" }).ok).toBe(true)
    expect(getState().proyeccionesPE.find(p => p.id === "test-pe-proy")?.liquidacionPLReferencia).toBe("pendiente")
    expect(getState().saveBitacoraVisitaPE({ id: "test-pe-visita", fecha: hoy(), nombre: "Visita QA TEST", dni: "16.444.555-0", unidadId: "test-u-999", destinoPersonaId: "test-p-88", jornadaId: "j-manana", origenAgenda: "pre_agendada", estado: "agendada" } as never).ok).toBe(true)
    expect(getState().ingresarBitacoraVisitaPE("test-pe-visita").ok).toBe(true)
    const visita = getState().bitacoraVisitasPE.find(v => v.id === "test-pe-visita")!
    expect(visita.estado).toBe("ingresada")
    expect(visita.horaIngreso).toBeTruthy()
    expect(getState().saveEncomiendaPE({ id: "test-pe-enc", courierId: "cour-chilexpress", destinatarioPersonaId: "test-p-99", descripcionPaquete: "Paquete TEST", evidencia: { nombre: "test-paquete.jpg", tipoMime: "image/jpeg", tamanoKB: 80, url: "https://placeholder.supabase.co/test-paquete.jpg" }, fechaRecepcion: hoy(), estado: "recibida" } as never).ok).toBe(true)
    expect(getState().registrarRetiroEncomiendaPE("test-pe-enc", "TEST Persona QA Uno").ok).toBe(true)
    expect(getState().saveIngresoContratistaPE({ id: "test-pe-cont", contratistaId: "cont-gasfiteria", motivo: "Reparación de fuga TEST", unidadId: "test-u-999", fecha: hoy(), jornadaId: "j-tarde", agendadoPor: "residente", personaAgendaId: "test-p-88", estado: "agendado" } as never).ok).toBe(true)
    expect(getState().confirmarIngresoContratistaPE("test-pe-cont").ok).toBe(true)
    const diaAnterior = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    expect(getState().saveProveedorPE({ id: "test-pe-prov", rut: "76.543.210-3", nombre: "Ascensores TEST Ltda.", rubro: "Ascensores", telefono: "+56 2 9999 8888", activo: true } as never).ok).toBe(true)
    expect(getState().saveMantencionPE({ id: "test-pe-mant", proveedorId: "test-pe-prov", descripcion: "Mantención ascensor Torre TEST", periodicidadMeses: 1, proximaFecha: diaAnterior, alertaDiasAntes: 5, activo: true } as never).ok).toBe(true)
    expect(getState().registrarVisitaTecnicaPE({ id: "test-pe-vt", proveedorId: "test-pe-prov", mantencionId: "test-pe-mant", tecnicoNombre: "Técnico TEST", fecha: hoy(), trabajoRealizado: "Inspección completa TEST", supervisorPersonaId: "test-p-99" } as never).ok).toBe(true)
    const mesSiguiente = (() => {
      const d = new Date(`${hoy()}T00:00:00`)
      d.setMonth(d.getMonth() + 1)
      return d.toISOString().slice(0, 10)
    })()
    expect(getState().mantencionesPreventivasPE.find(m => m.id === "test-pe-mant")?.proximaFecha).toBe(mesSiguiente)
    // Cadena e: cierre de turno notifica a administración con copia al trabajador.
    expect(getState().iniciarTurnoPE("test-p-99", "j-noche").ok).toBe(true)
    expect(getState().cerrarTurnoPE({
      id: "test-pe-cierre",
      fecha: hoy(),
      hora: "20:30",
      jornadaReportadaId: "j-noche",
      trabajadorPersonaId: "test-p-99",
      novedadesGenerales: "Rondas nocturnas completas TEST.",
      incidencias: { hubo: true, descripcion: "Luminaria norte fuera de servicio TEST.", evidencias: [{ nombre: "test-luminaria.jpg", tipoMime: "image/jpeg", tamanoKB: 95, url: "https://placeholder.supabase.co/test-luminaria.jpg" }] },
      checklistInstalaciones: [
        { item: "Perímetro verificado", ok: true },
        { item: "Puertas aseguradas", ok: true },
        { item: "Iluminación operativa", ok: false, observacion: "Luminaria norte" },
      ],
      checklistEquipamiento: [{ item: "Celular operativo", ok: true }],
    } as never).ok).toBe(true)
    const notifPE = getState().notificaciones.filter(n => n.moduloOrigen === "PE" && n.asunto.toLowerCase().includes("cierre de turno"))
    expect(notifPE.some(n => n.destinatarioRol === "administracion")).toBe(true)
    expect(notifPE.some(n => n.destinatarioRol === "personal" && n.destinatarioPersonaId === "test-p-99")).toBe(true)

    // --- Fase 15: PL → CT → RE ---
    // CF se siembra directo: `saveConfiguracion` (legacy) se eliminó en store-cleanup; su
    // auditoría CF_UPDATE_PARAM vive hoy en la ruta API de configuración.
    useCompassStore.setState((s) => ({
      configuracion: { ...s.configuracion, ufMensual: 39000, ingresoMinimoMensual: 500000, topeGratificacionLegal: 4.75, tasaSIS: 1.48 },
    }))
    const p99c = getState().personas.find(p => p.id === "test-p-99")!
    expect(getState().savePersona({ ...p99c, datosLaborales: { ...p99c.datosLaborales!, sueldoBase: 600000 } } as never).ok).toBe(true)
    expect(getState().saveAdelantoPL({ id: "test-ade-1", folio: "", trabajadorPersonaId: "test-p-99", fecha: hoy(), monto: 80000, glosa: "Adelanto quincena TEST", estado: "pendiente" }).ok).toBe(true)
    expect(getState().adelantosPL.find(a => a.id === "test-ade-1")?.folio).toMatch(/^ADE-/)
    // La cadena de liquidación (generar → confirmar → egreso FI → descuento de adelanto) se retiró
    // del store en store-cleanup: vive en `app/api/liquidaciones/**` y se cubre en
    // `test/api/api-liquidaciones.test.ts`.

    // CT (cadena g): residencia sobre vínculo activo (propietario sin fechaFin;
    // el arrendatario TEST tiene contrato a plazo y no califica como vigente);
    // Al Día exige pagar TODO.
    expect(getState().generarCertificadoCT({ tipo: "residencia", personaId: "test-p-99", unidadId: "test-u-999", solicitanteNombre: "TEST Persona QA Uno" }).ok).toBe(true)
    const certRes = getState().certificadosCT.find(c => c.tipo === "residencia" && c.personaId === "test-p-99")!
    expect(certRes.folio).toMatch(/^CT-/)
    expect(certRes.codigoVerificacion).toMatch(/^VC-/)
    // Regresivo ventana 9: pagar solo gasto_comun NO basta para el Al Día;
    // multa IN, tarifas/penalizaciones RA y garantía retenida también cuentan.
    const pendientesPreAlDia = getState().cobrosFI.filter(c => c.unidadId === "test-u-999" && pendienteCobro(c) > 0)
    expect(pendientesPreAlDia.map(c => c.concepto)).toEqual(expect.arrayContaining(["multa_in", "reserva_ra"]))
    const rAlDiaDeudor = getState().generarCertificadoCT({ tipo: "al_dia", unidadId: "test-u-999", solicitanteNombre: "TEST QA" })
    expect(rAlDiaDeudor.ok).toBe(false)
    expect(String(rAlDiaDeudor.error)).toContain("saldo")
    for (const c of getState().cobrosFI.filter(x => x.unidadId === "test-u-999")) {
      const debe = pendienteCobro(c)
      if (debe > 0) expect(getState().registrarPagoFI(c.id, { monto: debe, medio: "transferencia TEST" }).ok).toBe(true)
    }
    expect(getState().generarCertificadoCT({ id: "test-ct-alday", tipo: "al_dia", unidadId: "test-u-999", solicitanteNombre: "TEST QA" }).ok).toBe(true)
    // La liquidación se siembra directo (confirmada): generar/confirmar liquidaciones viven en la
    // API REST desde store-cleanup, y `generarCertificadoCT` sigue siendo acción viva del store.
    useCompassStore.setState((s) => ({
      liquidacionesPL: [
        ...s.liquidacionesPL,
        {
          id: "test-liq-pl",
          folio: "LIQ-TEST-0001",
          trabajadorPersonaId: "test-p-99",
          periodo: periodoActual,
          estado: "confirmada",
          totalImponible: 600000,
          totalHaberes: 600000,
          totalDescuentos: 100000,
          liquidoAPagar: 500000,
        } as never,
      ],
    }))
    expect(getState().generarCertificadoCT({ id: "test-ct-liq", tipo: "liquidacion_sueldo", liquidacionId: "test-liq-pl", solicitanteNombre: "TEST QA" }).ok).toBe(true)
    const primerReal = getState().certificadosCT.find(c => !c.id.startsWith("test-"))
    const bloqueoHistorial = getState().removeCertificadoCT(primerReal?.id ?? "ct-nadie")
    expect(bloqueoHistorial.ok).toBe(false)
    expect(String(bloqueoHistorial.error)).toContain("inmutable")

    // RE: vista auditada, reporte segmentado, distribución idempotente y tasa huérfanos 0.
    getState().registrarVistaDashboardRE("demografico")
    expect(getState().eventos.some(e => e.tipoAccion === "RE_DASHBOARD_VIEW")).toBe(true)
    expect(getState().generarReporteRE({ titulo: "Boletín Sector TEST", bloques: ["gastos_mes", "morosidad"], segmento: { macroSectorIds: ["test-macro-sectortest"], tenencias: ["propietarios", "arrendatarios"] }, id: "test-re-rep" }).ok).toBe(true)
    const rep = getState().reportesRE.find(r => r.id === "test-re-rep")!
    expect(rep.bloques).toHaveLength(2)
    expect(rep.payloadSnapshot.every(b => b.lineas.length > 0)).toBe(true)
    const antesNotifRE = getState().notificaciones.filter(n => n.moduloOrigen === "RE").length
    expect(getState().distribuirReporteRE("test-re-rep").ok).toBe(true)
    const repDist = getState().reportesRE.find(r => r.id === "test-re-rep")!
    expect(repDist.distribuidoA).toBeGreaterThan(0)
    expect(getState().notificaciones.filter(n => n.moduloOrigen === "RE").length - antesNotifRE).toBe(repDist.distribuidoA)
    expect(getState().distribuirReporteRE("test-re-rep").ok).toBe(false)
    // Cadena g: métricas AM agregadas — sin FK huérfanas tras la carga completa.
    const st = getState()
    const huerfanos = tasaHuerfanosRE({
      unidades: st.unidades.map(u => ({ id: u.id, microSectorId: u.microSectorId })),
      microSectores: st.microSectores.map(m => ({ id: m.id })),
      vinculos: st.vinculos.map(v => ({ personaId: v.personaId, unidadId: v.unidadId })),
      personas: st.personas.map(p => ({ id: p.id })),
    })
    expect(huerfanos.dangling).toBe(0)
    expect(huerfanos.tasaPct).toBe(0)

    // Export JSON OK (equivalente al botón Exportar del QA Lab).
    const payload = {
      _summary: { type: "seed-report", ok: errores.length === 0, version: 25 },
      diff: {
        tiposUnidad: st.tiposUnidad.filter(t => t.id.startsWith("test-")).length,
        unidades: st.unidades.filter(u => u.id.startsWith("test-")).length,
        personas: st.personas.filter(p => p.id.startsWith("test-")).length,
        vinculos: st.vinculos.filter(v => v.id.startsWith("test-")).length,
      },
    }
    const jsonStr = JSON.stringify(payload, null, 2)
    expect(() => JSON.parse(jsonStr)).not.toThrow()
    expect(JSON.parse(jsonStr)._summary.type).toBe("seed-report")

    expect(errores).toEqual([])
  })

  it("el flujo completo deja folios únicos por serie (validación global 🟢)", () => {
    resetStore()
    const s = getState()
    const microRealFolios = s.unidades.find(u => u.id === "u-A-101")!.microSectorId
    expect(s.saveElementoRA({ id: "e1", nombre: "Quincho folios TEST", tipo: "espacio_fisico", microSectorId: microRealFolios, franja: "dia_completo", tarifaUso: 0, garantiaRequerida: 0, activo: true } as never).ok).toBe(true)
    expect(s.saveReservaRA({ id: "r1", folio: "", elementoId: "e1", solicitantePersonaId: "p-1", unidadId: "u-A-101", fecha: manana(), horaInicio: "10:00", horaFin: "11:00", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 } as never).ok).toBe(true)
    expect(s.saveReservaRA({ id: "r2", folio: "", elementoId: "e1", solicitantePersonaId: "p-11", unidadId: "u-A-102", fecha: manana(), horaInicio: "12:00", horaFin: "13:00", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 } as never).ok).toBe(true)
    const foliosRA = getState().reservasRA.map(r => r.folio)
    expect(foliosRA.length).toBe(2)
    expect(new Set(foliosRA).size).toBe(foliosRA.length)
    expect(foliosRA.every(f => /^RA-\d{4}$/.test(f))).toBe(true)
  })
})

describe("Engranaje a) VU estado En Arriendo/En Venta → PI → lead → notificación propietario", () => {
  beforeEach(resetStore)

  it("syncPublicacionesDesdeVinculos publica u-A-104 (en_venta) y retira al cambiar el estado", () => {
    const s = getState()
    // El vínculo semillero v-13 (p-13 → u-A-104) está en_venta. La acción es void.
    s.syncPublicacionesDesdeVinculos("u-A-104")
    let pub = getState().publicacionesPortal.find(p => p.unidadId === "u-A-104")!
    expect(pub.operacion).toBe("venta")
    expect(pub.activa).toBe(true)
    expect(getState().eventos.some(e => e.tipoAccion === "PI_PROPERTY_LISTED" && e.descripcion.includes("venta"))).toBe(true)
    // Cambio de estado a habitado → trigger retira la publicación.
    useCompassStore.setState(st => ({
      vinculos: st.vinculos.map(v => (v.id === "v-13" ? { ...v, estadoOcupacionPropiedad: "habitada" } : v)),
    }))
    getState().syncPublicacionesDesdeVinculos("u-A-104")
    pub = getState().publicacionesPortal.find(p => p.unidadId === "u-A-104")!
    expect(pub.activa).toBe(false)
    expect(getState().eventos.some(e => e.tipoAccion === "PI_PROPERTY_UNLISTED")).toBe(true)
  })


})

describe("Engranaje b) GD quórum 100% → publicada + notificación formal + aviso CV", () => {
  beforeEach(resetStore)

  it("sin quórum queda en borrador; con firmas de TODA la directiva se publica y avisa", () => {
    const s = getState()
    const directiva = s.personas.filter(p => p.datosGobernanza && p.estadoCuenta === "activa").map(p => p.id)
    expect(directiva.length).toBeGreaterThanOrEqual(4)
    expect(s.saveActaGD({ id: "acta-chain-b", fecha: hoy(), hora: "20:00", lugar: "Sede TEST", tablaTemas: ["Quórum"], presentes: [directiva[0]!], ausentes: [], invitados: [], minuta: "Prueba de quórum.", adjuntos: [], estado: "borrador", aprobaciones: [] }).ok).toBe(true)
    // Primer firma: aún sin quórum.
    expect(s.aprobarActaGD("acta-chain-b", directiva[0]!).ok).toBe(true)
    let acta = getState().actasGD.find(a => a.id === "acta-chain-b")!
    expect(acta.estado).toBe("borrador")
    expect(getState().notificaciones.filter(n => n.moduloOrigen === "GD")).toHaveLength(0)
    // Resto de firmas → quórum 100% → publicada.
    for (const id of directiva.slice(1)) expect(s.aprobarActaGD("acta-chain-b", id).ok).toBe(true)
    acta = getState().actasGD.find(a => a.id === "acta-chain-b")!
    expect(acta.estado).toBe("publicada")
    expect(acta.fechaPublicacion).toBeTruthy()
    const notifsGD = getState().notificaciones.filter(n => n.moduloOrigen === "GD")
    expect(notifsGD.length).toBeGreaterThan(0)
    expect(notifsGD.every(n => n.destinatarioRol === "propietario" && n.asunto.includes("Nueva acta publicada"))).toBe(true)
    // Publicación en CV materializa aviso con origen acta_gd.
    expect(s.publicarActaEnCV("acta-chain-b").ok).toBe(true)
    const aviso = getState().avisosCV.find(a => a.actaId === "acta-chain-b")!
    expect(aviso.origen).toBe("acta_gd")
    expect(aviso.estado).toBe("publicado")
    expect(getState().actasGD.find(a => a.id === "acta-chain-b")?.avisoCVReferencia).toBe(aviso.id)
    // Firmante duplicado o no-directiva es rechazado tras publicarse.
    expect(getState().aprobarActaGD("acta-chain-b", directiva[0]!).error).toContain("ya está publicada")
  })
})

describe("Engranaje c) AD toggles: actas al residente y silencio selectivo de alertas", () => {
  beforeEach(resetStore)

  it("alertasResidentesActivas=false silencia notify() operativa al residente pero no la formal de GD", () => {
    const s = getState()
    // p-12 es arrendatario de u-A-103 (vínculo semilla v-12).
    expect(s.saveControlPropiedad({ id: "ctrl-chain-c", unidadId: "u-A-103", residenteVeMorosidad: false, residenteVeActas: false, alertasResidentesActivas: false }).ok).toBe(true)
    // Operativa: ingreso de visita a u-A-103 cuyo destino es p-12 → silenciada por AD.
    expect(s.saveBitacoraVisitaPE({ id: "visita-c", fecha: hoy(), nombre: "Visita Silenciada TEST", dni: "16.444.555-0", unidadId: "u-A-103", destinoPersonaId: "p-12", jornadaId: "j-manana", origenAgenda: "sin_aviso", estado: "ingresada" } as never).ok).toBe(true)
    expect(getState().bitacoraVisitasPE.find(v => v.id === "visita-c")?.horaIngreso).toBeTruthy()
    expect(getState().notificaciones.filter(n => n.destinatarioPersonaId === "p-12" && n.moduloOrigen === "PE")).toHaveLength(0)
    // Formal GD: acta publicada notifica a los propietarios aunque haya controles restrictivos.
    const directiva = s.personas.filter(p => p.datosGobernanza && p.estadoCuenta === "activa").map(p => p.id)
    expect(s.saveActaGD({ id: "acta-chain-c", fecha: hoy(), hora: "21:00", lugar: "Sede TEST", tablaTemas: [], presentes: directiva, ausentes: [], invitados: [], minuta: "Formalidad.", adjuntos: [], estado: "borrador", aprobaciones: [] }).ok).toBe(true)
    for (const id of directiva) expect(s.aprobarActaGD("acta-chain-c", id).ok).toBe(true)
    expect(getState().notificaciones.filter(n => n.moduloOrigen === "GD" && n.destinatarioRol === "propietario").length).toBeGreaterThan(0)
  })

  it("residenteVeActas=true queda auditado (AD_OWNER_CONFIG_CHANGE) y es el flag que lee la UI de directiva", () => {
    const s = getState()
    // La creación también audita ("Controles de privacidad creados").
    expect(s.saveControlPropiedad({ id: "ctrl-chain-c2", unidadId: "u-A-102", residenteVeMorosidad: true, residenteVeActas: false, alertasResidentesActivas: true }).ok).toBe(true)
    expect(getState().eventos.some(e => e.tipoAccion === "AD_OWNER_CONFIG_CHANGE" && e.referenciaId === "ctrl-chain-c2" && e.descripcion.includes("creados"))).toBe(true)
    const control = getState().controlesPropiedades.find(c => c.id === "ctrl-chain-c2")!
    expect(s.saveControlPropiedad({ ...control, residenteVeActas: true }).ok).toBe(true)
    // La página /comunidad/directiva autoriza la lectura con este flag.
    const residenteAutorizado = getState().controlesPropiedades.some(c => c.residenteVeActas)
    expect(residenteAutorizado).toBe(true)
    expect(getState().eventos.some(e => e.tipoAccion === "AD_OWNER_CONFIG_CHANGE" && e.descripcion.includes("actas=visibles"))).toBe(true)
  })
})

describe("Engranaje d) IN multa → FI · MT proyecto ↔ FI · RA reserva → FI", () => {
  beforeEach(resetStore)

  function prepararUnidadYDirectiva(): void {
    const s = getState()
    s.saveTipoInfraccionIN({ id: "tipo-d-grave", nombre: "Falta Grave D", categoria: "grave", tipoSancion: "monto_fijo", valor: 40000 } as never)
    const p = s.personas.find(x => x.id === "p-1")!
    const rInf = s.saveInfraccionIN({ id: "inf-d", folio: "", tipoInfraccionId: "tipo-d-grave", unidadId: "u-A-101", fechaSuceso: hoy(), horaSuceso: "22:00", antecedentes: "Prueba cross de multa grave aplicada a la unidad A-101.", evidencias: [], estado: "en_revision", fechaRegistro: hoy(), comentariosDirectiva: [], respaldosDirectiva: [] } as never)
    expect(rInf.ok).toBe(true)
    expect(s.respaldarInfraccionIN("inf-d", p.id).ok).toBe(true)
  }

  it("multa grave aplicada vive como cobro multa_in imputado al fondo GC de la unidad", () => {
    prepararUnidadYDirectiva()
    expect(getState().aplicarInfraccionIN("inf-d").ok).toBe(true)
    const inf = getState().infraccionesIN.find(i => i.id === "inf-d")!
    expect(inf.estado).toBe("aplicada")
    const cobro = getState().cobrosFI.find(c => c.id === inf.cargoFIReferencia)!
    expect(cobro.concepto).toBe("multa_in")
    expect(cobro.unidadId).toBe("u-A-101")
    expect(cobro.montoBase).toBe(40000)
    expect(cobro.pagos).toHaveLength(0)
  })

  it("proyecto MT con fondo solvente se guarda; exceder el saldo del fondo lo bloquea", () => {
    const s = getState()
    // Saldo actual del fondo-reserva (sin movimientos) = 0 → cualquier presupuesto se bloquea.
    const bloqueado = s.saveProyectoMT({ id: "py-d-1", nombre: "Proyecto sin saldo", presupuestoEstimado: 1000000, plazoMeses: 12, estado: "planificado", fondoFinanciamientoId: "fondo-reserva" } as never)
    expect(bloqueado.ok).toBe(false)
    expect(String(bloqueado.error)).toContain("Saldo insuficiente")
    // El aporte 5% de la emisión GC alimenta el fondo-reserva; el proyecto puede
    // financiarse hasta ese saldo y se bloquea al excederlo (conexión MT→FI).
    s.emitirGastoComun({ periodo: hoy().slice(0, 7), gastoTotal: 2000000, unidadIds: ["u-A-101", "u-A-102"] })
    for (const c of getState().cobrosFI.filter(x => x.concepto === "gasto_comun" && x.fondoId === "fondo-gc")) {
      expect(s.registrarPagoFI(c.id, { monto: pendienteCobro(c), medio: "transferencia" }).ok).toBe(true)
    }
    const aporteReserva = getState().emisionesGC.reduce((a, e) => a + (e.fondoReservaAporte?.monto ?? 0), 0)
    expect(aporteReserva).toBeGreaterThan(0)
    expect(s.saveProyectoMT({ id: "py-d-2", nombre: "Proyecto financiable", presupuestoEstimado: Math.max(1, Math.round(aporteReserva / 2)), plazoMeses: 12, estado: "planificado", fondoFinanciamientoId: "fondo-reserva" } as never).ok).toBe(true)
    const excedido = s.saveProyectoMT({ id: "py-d-3", nombre: "Proyecto excedido", presupuestoEstimado: aporteReserva * 10, plazoMeses: 12, estado: "planificado", fondoFinanciamientoId: "fondo-reserva" } as never)
    expect(excedido.ok).toBe(false)
    expect(String(excedido.error)).toContain("Saldo insuficiente")
  })

  it("reserva confirmada genera cobro reserva_ra; cancelación tardía suma penalizacion_ra", () => {
    const s = getState()
    const microReal = s.unidades.find(u => u.id === "u-A-101")!.microSectorId
    expect(s.saveElementoRA({ id: "elem-d", nombre: "Salón chain D", tipo: "espacio_fisico", microSectorId: microReal, franja: "dia_completo", tarifaUso: 12000, garantiaRequerida: 0, anticipacionMinimaDias: 0, cancelacionTardiaDias: 2, penalizacionTardiaMonto: 3000, activo: true } as never).ok).toBe(true)
    expect(s.saveReservaRA({ id: "rs-d", folio: "", elementoId: "elem-d", solicitantePersonaId: "p-1", unidadId: "u-A-101", fecha: manana(), horaInicio: "00:00", horaFin: "23:59", estado: "confirmada", montoTarifa: 0, montoGarantia: 0 } as never).ok).toBe(true)
    const rs = getState().reservasRA.find(r => r.id === "rs-d")!
    expect(rs.montoTarifa).toBe(12000)
    const cobro = getState().cobrosFI.find(c => c.origenRef === "rs-d" && c.concepto === "reserva_ra")!
    expect(cobro.fondoId).toBe("fondo-amenities")
    expect(rs.cargoFIReferencia).toBe(cobro.id)
    expect(s.cancelarReservaRA("rs-d").ok).toBe(true)
    const pen = getState().cobrosFI.find(c => c.origenRef === "rs-d" && c.concepto === "penalizacion_ra")!
    expect(pen.montoBase).toBe(3000)
    expect(getState().reservasRA.find(r => r.id === "rs-d")?.cargoFIReferencia).toBe(pen.id)
  })
})

describe("Engranaje e) PE cierre turno → administración · feriados MA → proyección", () => {
  beforeEach(resetStore)

  it("cierre de turno con incidencias notifica a administración y copia al trabajador", () => {
    const s = getState()
    const trabajador = s.personas.find(p => p.roles.includes("personal"))!
    expect(s.iniciarTurnoPE(trabajador.id, "j-noche").ok).toBe(true)
    expect(s.cerrarTurnoPE({
      fecha: hoy(),
      hora: "21:00",
      jornadaReportadaId: "j-noche",
      trabajadorPersonaId: trabajador.id,
      novedadesGenerales: "Turno sin novedades TEST.",
      incidencias: { hubo: false, descripcion: "", evidencias: [] },
      checklistInstalaciones: [{ item: "Perímetro", ok: true }],
      checklistEquipamiento: [{ item: "Radio", ok: true }],
    } as never).ok).toBe(true)
    const notifs = getState().notificaciones.filter(n => n.moduloOrigen === "PE" && n.asunto.toLowerCase().includes("cierre de turno"))
    expect(notifs.some(n => n.destinatarioRol === "administracion")).toBe(true)
    expect(notifs.some(n => n.destinatarioRol === "personal" && n.destinatarioPersonaId === trabajador.id)).toBe(true)
  })

  it("agregar feriado irrenunciable a MA sube días y reemplazos de la proyección PE", () => {
    const anio = new Date().getFullYear() + 1
    const antes = calcularProyeccionCobertura({ feriados: getState().maestros.feriados, mesAnio: `${anio}-03` })
    expect(antes.diasFeriados).toBe(0)
    expect(getState().saveMaestro("feriados", { id: "fer-d", fecha: `${anio}-03-15`, nombre: "Feriado TEST marzo", irrenunciable: false } as never).ok).toBe(true)
    const conRenunciable = calcularProyeccionCobertura({ feriados: getState().maestros.feriados, mesAnio: `${anio}-03` })
    expect(conRenunciable.diasFeriados).toBe(1)
    expect(conRenunciable.reemplazosNecesarios).toBe(1)
    expect(getState().saveMaestro("feriados", { id: "fer-d2", fecha: `${anio}-03-25`, nombre: "Irrenunciable TEST", irrenunciable: true } as never).ok).toBe(true)
    const final = calcularProyeccionCobertura({ feriados: getState().maestros.feriados, mesAnio: `${anio}-03` })
    expect(final.diasFeriados).toBe(2)
    expect(final.reemplazosNecesarios).toBe(3)
  })
})

describe("Engranaje g) CT firma por referencia · RE métricas AM post-carga", () => {
  beforeEach(resetStore)

  it("firma digitalizada por URL de referencia se adjunta; base64/blob incrustado se rechaza (D1)", () => {
    const s = getState()
    const cfgConFirma = { ...getState().configuracion, firmaDigitalizadaUrl: "https://cdn.compass.cl/firma-admin.png" }
    useCompassStore.setState({ configuracion: cfgConFirma })
    expect(s.generarCertificadoCT({ tipo: "estado_cuenta", unidadId: "u-A-101", solicitanteNombre: "TEST Firma Ref" }).ok).toBe(true)
    const cert = getState().certificadosCT[0]!
    expect(cert.firmaUrl).toBe("https://cdn.compass.cl/firma-admin.png")
    useCompassStore.setState({ configuracion: { ...getState().configuracion, firmaDigitalizadaUrl: "data:image/png;base64,AAAA" } })
    const r = getState().generarCertificadoCT({ tipo: "estado_cuenta", unidadId: "u-A-101", solicitanteNombre: "TEST Firma Base64" })
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain("Media por referencia")
  })

  it("tasa de huérfanos AM es 0 sobre el seed y sube al inyectar FK rota", () => {
    const input = () => {
      const st = getState()
      return {
        unidades: st.unidades.map(u => ({ id: u.id, microSectorId: u.microSectorId })),
        microSectores: st.microSectores.map(m => ({ id: m.id })),
        vinculos: st.vinculos.map(v => ({ personaId: v.personaId, unidadId: v.unidadId })),
        personas: st.personas.map(p => ({ id: p.id })),
      }
    }
    expect(tasaHuerfanosRE(input()).tasaPct).toBe(0)
    useCompassStore.setState(st => ({
      unidades: [...st.unidades, { ...st.unidades[0]!, id: "u-huerfana", microSectorId: "ms-inexistente" }],
    }))
    const res = tasaHuerfanosRE(input())
    expect(res.dangling).toBe(1)
    expect(res.tasaPct).toBeGreaterThan(0)
  })
})
