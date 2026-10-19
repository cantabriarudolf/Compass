import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import { calcularDigitoVerificador } from "@/lib/rut"
import type {
  ActaGD,
  AvisoCV,
  ControlPropiedad,
  DocumentoCO,
  EnvioCO,
  MensajeBuzonCO,
  PeriodoDirectiva,
  Persona,
  PlantillaCO,
  ProyectoMT,
  PublicacionPortal,
  RecursoIR,
  SolicitudGE,
  SolicitudInsumoIR,
  TrabajoMT,
} from "@/lib/schemas"
import { resetStore } from "./helpers"

// SERIE-NOCHE-3 P8 (`store-cobertura-fase-b`): tests comportamentales que
// suben la cobertura real de `lib/store/**` (slices + helpers) ejerciendo la
// API pública `useCompassStore` (acciones y estado resultante). Sin tocar
// detalles internos ni el shape persistido.

const getState = () => useCompassStore.getState()

const SIN_HIDRATAR =
  "El almacenamiento aún se está hidratando. Intenta de nuevo."

const guarda = (r: { ok: boolean; error?: string }): void => {
  expect(r.ok).toBe(false)
  expect(r.error).toBe(SIN_HIDRATAR)
}

const rutValido = (cuerpo: string): string =>
  `${cuerpo.slice(0, 2)}.${cuerpo.slice(2, 5)}.${cuerpo.slice(5, 8)}-${calcularDigitoVerificador(cuerpo)}`

const masDias = (dias: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

const personaBase = (partial: Partial<Persona>): Persona => ({
  id: "p-cob-1",
  rut: rutValido("15467892"),
  nombreCompleto: "Cobertura Test Uno",
  nombres: "Cobertura",
  apellidos: "Test Uno",
  email: "cobertura@test.cl",
  telefonoMovil: "+56 9 5555 1111",
  estadoCuenta: "activa",
  condicionesEspecialesIds: [],
  roles: ["personal"],
  ...partial,
})

const recursoBase = (partial: Partial<RecursoIR>): RecursoIR => ({
  id: "ir-cob-1",
  nombre: "Cloro bidón 5L COB",
  categoria: "insumo",
  estadoActivo: "disponible",
  stock: 10,
  esCritico: false,
  ...partial,
})

const solicitudIRBase = (
  partial: Partial<SolicitudInsumoIR>
): SolicitudInsumoIR => ({
  id: "si-cob-1",
  folio: "",
  solicitantePersonaId: "p-cob-1",
  estadoComodin: "no_comodin",
  cantidad: 2,
  areaDestino: "Piso 1 Torre COB",
  estado: "pendiente",
  fechaSolicitud: "2026-08-25",
  recursoInsumoId: "ir-cob-1",
  ...partial,
})

const comodinValido = {
  descripcionArticulo: "Sellador poliuretano",
  justificacion: "Artículo fuera de catálogo para sellar filtraciones del muro.",
}

const trabajoBase = (partial: Partial<TrabajoMT>): TrabajoMT => ({
  id: "mt-cob-1",
  folio: "",
  titulo: "Mantención Hidropack COB",
  descripcion: "Revisión mensual de presiones, sellos y tablero de control del hidropack.",
  activoIRId: undefined,
  responsablePersonaId: undefined,
  proveedor: { nombre: "AquaServicio COB", contacto: "+56 9 8888 0000" },
  prioridad: "media",
  estado: "planificado",
  costoTotal: 180000,
  origenFondos: "gasto_comun",
  estadoPago: "pendiente",
  alertaGarantiaEnviada: false,
  evidencias: [],
  ...partial,
})

const proyectoBase = (partial: Partial<ProyectoMT>): ProyectoMT => ({
  id: "py-cob-1",
  nombre: "Mantención de techos COB",
  presupuestoEstimado: 12000000,
  plazoMeses: 120,
  estado: "planificado",
  ...partial,
})

const documentoBase = (partial: Partial<DocumentoCO>): DocumentoCO => ({
  id: "doc-cob-1",
  nombre: "Reglamento COB.pdf",
  tipoMime: "application/pdf",
  tamanoKB: 320,
  url: "https://cdn.example.com/reglamento-cob.pdf",
  categoria: "reglamento",
  ...partial,
})

const plantillaCOBase = (partial: Partial<PlantillaCO>): PlantillaCO => ({
  id: "plant-cob-1",
  nombre: "Plantilla COB",
  categoria: "comunidad",
  asunto: "Asunto COB [Nombre_Usuario]",
  cuerpo: "Hola [Nombre_Usuario], aviso de la [Nombre_Comunidad].",
  ...partial,
})

const envioBase = (partial: Partial<EnvioCO>): EnvioCO => ({
  id: "env-cob-1",
  asunto: "Aviso COB",
  cuerpo: "Estimado/a [Nombre_Usuario], corte de agua mañana.",
  destinatarios: [{ personaId: "p-cob-1" }],
  fechaEnvio: "2026-08-25",
  lecturas: [],
  ...partial,
})

const mensajeBuzonBase = (
  partial: Partial<MensajeBuzonCO>
): MensajeBuzonCO => ({
  id: "buz-cob-1",
  folio: "",
  clasificacion: "reclamo",
  reportanteNombre: "Cobertura Test Uno",
  asunto: "Ruido en sala de bombas",
  cuerpo: "Hay un ruido constante desde ayer.",
  visibilidadComite: false,
  fechaIngreso: "2026-08-25",
  estado: "recibido",
  respuestas: [],
  ...partial,
})

const controlBase = (partial: Partial<ControlPropiedad>): ControlPropiedad => ({
  id: "ctrl-cob-1",
  unidadId: "",
  residenteVeMorosidad: false,
  residenteVeActas: true,
  alertasResidentesActivas: true,
  ...partial,
})

const directivoBase = (partial: Partial<Persona>): Persona => ({
  id: "p-dir-cob",
  rut: rutValido("13456789"),
  nombreCompleto: "Directivo Cobertura",
  nombres: "Directivo",
  apellidos: "Cobertura",
  email: "directivo.cob@test.cl",
  telefonoMovil: "+56 9 3333 1111",
  estadoCuenta: "activa",
  condicionesEspecialesIds: [],
  roles: ["directiva"],
  datosGobernanza: {
    id: "gob-cob-1",
    cargoDirectiva: "presidente",
    fechaAsuncion: "2026-01-01",
  },
  ...partial,
})

const actaBase = (partial: Partial<ActaGD>): ActaGD => ({
  id: "acta-cob-1",
  fecha: "2026-08-20",
  hora: "19:00",
  lugar: "Sede comunitaria",
  tablaTemas: ["Gasto común"],
  presentes: [],
  ausentes: [],
  invitados: [],
  minuta: "Se acuerda revisar el contrato de ascensores.",
  adjuntos: [],
  estado: "borrador",
  aprobaciones: [],
  ...partial,
})

const solicitudGEBase = (partial: Partial<SolicitudGE>): SolicitudGE => ({
  id: "sol-cob-1",
  folio: "",
  tipo: "grabaciones",
  titulo: "Solicitud de grabaciones COB",
  descripcion: "Revisión de cámaras del lobby por hurto de paquete.",
  solicitantePersonaId: undefined,
  unidadId: undefined,
  estado: "nuevo",
  fechaCreacion: "2026-08-25",
  comentarios: [],
  detalleGrabaciones: {
    fechaSuceso: "2026-08-24",
    horaSuceso: "18:30",
    justificacion: "Un courier retiró un paquete que no era suyo a las 18:30.",
  },
  historialEstados: [],
  ...partial,
})

const avisoBase = (partial: Partial<AvisoCV>): AvisoCV => ({
  id: "cv-cob-1",
  titulo: "Aviso COB",
  cuerpo: "Cuerpo del aviso de prueba para el carrusel COB.",
  tipologia: "info",
  duracionSegundos: 10,
  pantallaCompleta: false,
  tags: ["prueba"],
  estado: "borrador",
  requiereVistoBueno: false,
  origen: "manual",
  fechaCreacion: "2026-08-25",
  ...partial,
})

const publicacionBase = (
  partial: Partial<PublicacionPortal>
): PublicacionPortal => ({
  id: "pub-cob-1",
  unidadId: "u-A-302",
  operacion: "arriendo",
  precio: 450000,
  imagenes: [],
  activa: true,
  fechaPublicacion: "2026-08-24",
  ...partial,
})

describe("store-cobertura-fase-b — cobertura real de lib/store/**", () => {
  beforeEach(resetStore)

  describe("IR — Inventario y Recursos", () => {
    it("saveRecursoIR valida sub-sector, unidad, unidad de medida y umbral crítico", () => {
      const rMs = getState().saveRecursoIR(
        recursoBase({ id: "ir-ms", microSectorId: "ms-fantasma" })
      )
      expect(rMs.ok).toBe(false)
      expect(rMs.error).toContain("sub-sector indicado no existe")

      const rUnidad = getState().saveRecursoIR(
        recursoBase({ id: "ir-u", categoria: "acceso", unidadId: "u-fantasma" })
      )
      expect(rUnidad.ok).toBe(false)
      expect(rUnidad.error).toContain("unidad indicada no existe")

      const rUm = getState().saveRecursoIR(
        recursoBase({ id: "ir-um", unidadMedidaId: "um-fantasma" })
      )
      expect(rUm.ok).toBe(false)
      expect(rUm.error).toContain("unidad de medida no existe")

      const rCritico = getState().saveRecursoIR(
        recursoBase({ id: "ir-critico", esCritico: true })
      )
      expect(rCritico.ok).toBe(false)
      expect(rCritico.error).toContain("umbral de Stock Crítico")

      const rFactura = getState().saveRecursoIR(
        recursoBase({ id: "ir-factura", numeroFactura: "F-123" })
      )
      expect(rFactura.ok).toBe(true)
      expect(
        getState().activosIR.find((r) => r.id === "ir-factura")!
          .cargoFIReferencia
      ).toBe("pendiente")
    })

    it("removeRecursoIR bloquea por solicitudes y entregas, y libera el resto", () => {
      getState().savePersona(personaBase({}))
      getState().saveRecursoIR(recursoBase({ id: "ir-ins" }))
      expect(
        getState().saveSolicitudInsumoIR(
          solicitudIRBase({ id: "si-ref", recursoInsumoId: "ir-ins" })
        ).ok
      ).toBe(true)
      const conSolicitud = getState().removeRecursoIR("ir-ins")
      expect(conSolicitud.ok).toBe(false)
      expect(conSolicitud.error).toContain("solicitud(es) de insumo")

      getState().saveRecursoIR(
        recursoBase({ id: "ir-epp", categoria: "epp", nombre: "Casco", talla: "M", stock: 0 })
      )
      expect(
        getState().registrarEntregaEPP({
          id: "epp-ref",
          recursoId: "ir-epp",
          personaId: "p-cob-1",
          fechaEntrega: "2026-08-25",
          talla: "M",
          estado: "nuevo",
        }).ok
      ).toBe(true)
      const conEntrega = getState().removeRecursoIR("ir-epp")
      expect(conEntrega.ok).toBe(false)
      expect(conEntrega.error).toContain("entrega(s) individual")

      getState().saveRecursoIR(recursoBase({ id: "ir-libre" }))
      expect(getState().removeRecursoIR("ir-libre").ok).toBe(true)
      expect(getState().activosIR.some((r) => r.id === "ir-libre")).toBe(false)
    })

    it("saveSolicitudInsumoIR: comodín alerta a administración y exige coherencia", () => {
      getState().savePersona(personaBase({}))

      const rComodin = getState().saveSolicitudInsumoIR(
        solicitudIRBase({
          id: "si-com",
          recursoInsumoId: undefined,
          comodin: comodinValido,
        })
      )
      expect(rComodin.ok).toBe(true)
      const guardada = getState().solicitudesInsumoIR.find((s) => s.id === "si-com")!
      expect(guardada.estadoComodin).toBe("pendiente")
      expect(guardada.folio).toBe("SI-0001")
      expect(
        getState().eventos.some((e) => e.tipoAccion === "IR_COMODIN_ALERTA")
      ).toBe(true)
      expect(
        getState().notificaciones.some((n) =>
          n.asunto.includes("artículo no catalogado")
        )
      ).toBe(true)

      const rComodinConRecurso = getState().saveSolicitudInsumoIR(
        solicitudIRBase({
          id: "si-com-2",
          recursoInsumoId: "ir-cob-1",
          comodin: comodinValido,
        })
      )
      expect(rComodinConRecurso.ok).toBe(false)
      expect(rComodinConRecurso.error).toContain("no debe referenciar")

      const rSinNada = getState().saveSolicitudInsumoIR(
        solicitudIRBase({ id: "si-sin", recursoInsumoId: undefined })
      )
      expect(rSinNada.ok).toBe(false)
      expect(rSinNada.error).toContain("artículo del catálogo o ser un comodín")

      const rFantasma = getState().saveSolicitudInsumoIR(
        solicitudIRBase({ id: "si-fant", solicitantePersonaId: "p-nadie" })
      )
      expect(rFantasma.ok).toBe(false)
      expect(rFantasma.error).toContain("solicitante no existe")

      getState().saveRecursoIR(
        recursoBase({ id: "ir-hidro", nombre: "Hidropack", categoria: "infraestructura", microSectorId: "ms-1" })
      )
    })

    it("saveSolicitudInsumoIR rechaza recurso inexistente y recurso que no es insumo", () => {
      getState().savePersona(personaBase({}))
      const rInexistente = getState().saveSolicitudInsumoIR(
        solicitudIRBase({ id: "si-inex", recursoInsumoId: "ir-nadie" })
      )
      expect(rInexistente.ok).toBe(false)
      expect(rInexistente.error).toContain("artículo del catálogo no existe")

      // Se siembra un recurso no-insumo válido por la API y se apunta la solicitud a él.
      const ms = getState().microSectores[0]
      if (!ms) {
        getState().saveMicroSector({
          id: "ms-cob",
          nombre: "Piso COB",
          etiqueta: "Piso",
          macroSectorId: getState().macroSectores[0]!.id,
        })
      }
      expect(
        getState().saveRecursoIR(
          recursoBase({
            id: "ir-infra",
            nombre: "Hidropack COB",
            categoria: "infraestructura",
            microSectorId: ms?.id ?? "ms-cob",
          })
        ).ok
      ).toBe(true)
      const rNoInsumo = getState().saveSolicitudInsumoIR(
        solicitudIRBase({ id: "si-noins", recursoInsumoId: "ir-infra" })
      )
      expect(rNoInsumo.ok).toBe(false)
      expect(rNoInsumo.error).toContain("tipo insumo")
    })

    it("resolverComodinIR: rechazo, sustitución y aprobación con creación en catálogo", () => {
      getState().savePersona(personaBase({}))
      const crearComodin = (id: string) => {
        expect(
          getState().saveSolicitudInsumoIR(
            solicitudIRBase({
              id,
              recursoInsumoId: undefined,
              comodin: comodinValido,
            })
          ).ok
        ).toBe(true)
      }

      const inexistente = getState().resolverComodinIR("si-nadie", "aprobar_crear")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("la solicitud no existe")

      getState().saveRecursoIR(recursoBase({ id: "ir-normal" }))
      expect(
        getState().saveSolicitudInsumoIR(
          solicitudIRBase({ id: "si-normal", recursoInsumoId: "ir-normal" })
        ).ok
      ).toBe(true)
      const noComodin = getState().resolverComodinIR("si-normal", "aprobar_crear")
      expect(noComodin.ok).toBe(false)
      expect(noComodin.error).toContain("Solo una solicitud comodín pendiente")

      // Rechazo: exige justificación obligatoria.
      crearComodin("si-rech")
      const sinJustificar = getState().resolverComodinIR("si-rech", "rechazar")
      expect(sinJustificar.ok).toBe(false)
      expect(sinJustificar.error).toContain("justificación obligatoria")
      const rechazada = getState().resolverComodinIR("si-rech", "rechazar", {
        justificacion: "Existe alternativa equivalente en catálogo vigente.",
      })
      expect(rechazada.ok).toBe(true)
      const rech = getState().solicitudesInsumoIR.find((s) => s.id === "si-rech")!
      expect(rech.estado).toBe("rechazada")
      expect(rech.rechazoJustificacion).toContain("alternativa")

      // Sustitución: exige un insumo real del catálogo.
      crearComodin("si-sust")
      const sinSustituto = getState().resolverComodinIR("si-sust", "sustituir")
      expect(sinSustituto.ok).toBe(false)
      expect(sinSustituto.error).toContain("artículo similar existente")
      getState().saveRecursoIR(
        recursoBase({ id: "ir-sustituto", nombre: "Sellador similar" })
      )
      const sustituida = getState().resolverComodinIR("si-sust", "sustituir", {
        recursoSustitutoId: "ir-sustituto",
      })
      expect(sustituida.ok).toBe(true)
      const sust = getState().solicitudesInsumoIR.find((s) => s.id === "si-sust")!
      expect(sust.estadoComodin).toBe("sustituida")
      expect(sust.recursoSustitutoId).toBe("ir-sustituto")

      // Aprobación: crea el artículo en el catálogo y deja traza de auditoría.
      crearComodin("si-aprob")
      const aprobada = getState().resolverComodinIR("si-aprob", "aprobar_crear")
      expect(aprobada.ok).toBe(true)
      const creado = getState().activosIR.find(
        (r) => r.nombre === comodinValido.descripcionArticulo
      )!
      expect(creado.categoria).toBe("insumo")
      const aprob = getState().solicitudesInsumoIR.find((s) => s.id === "si-aprob")!
      expect(aprob.estadoComodin).toBe("aprobada_creada")
      expect(aprob.recursoInsumoId).toBe(creado.id)
      expect(
        getState().eventos.filter((e) => e.tipoAccion === "IR_COMODIN_RESUELTO")
      ).toHaveLength(3)
    })

    it("entregarSolicitudInsumoIR: estados, stock y alarma de reposición crítica", () => {
      getState().savePersona(personaBase({}))
      const inexistente = getState().entregarSolicitudInsumoIR("si-nadie")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("la solicitud no existe")

      getState().saveRecursoIR(
        recursoBase({ id: "ir-critico", nombre: "Cloro crítico", stock: 3, esCritico: true, umbralCritico: 2 })
      )
      expect(
        getState().saveSolicitudInsumoIR(
          solicitudIRBase({ id: "si-crit", recursoInsumoId: "ir-critico", cantidad: 1 })
        ).ok
      ).toBe(true)
      expect(getState().entregarSolicitudInsumoIR("si-crit").ok).toBe(true)
      expect(
        getState().solicitudesInsumoIR.find((s) => s.id === "si-crit")!.estado
      ).toBe("entregada")
      expect(
        getState().eventos.some((e) => e.tipoAccion === "IR_STOCK_LOW")
      ).toBe(true)
      expect(
        getState().notificaciones.some((n) => n.asunto.includes("Alarma de reposición"))
      ).toBe(true)

      const repetida = getState().entregarSolicitudInsumoIR("si-crit")
      expect(repetida.ok).toBe(false)
      expect(repetida.error).toContain("Solo una solicitud Pendiente")

      // Comodín pendiente sin artículo asociado.
      expect(
        getState().saveSolicitudInsumoIR(
          solicitudIRBase({
            id: "si-com-entrega",
            recursoInsumoId: undefined,
            comodin: comodinValido,
          })
        ).ok
      ).toBe(true)
      const comodin = getState().entregarSolicitudInsumoIR("si-com-entrega")
      expect(comodin.ok).toBe(false)
      expect(comodin.error).toContain("comodín aún no tiene artículo")

      // Stock insuficiente.
      expect(
        getState().saveSolicitudInsumoIR(
          solicitudIRBase({ id: "si-stock", recursoInsumoId: "ir-critico", cantidad: 99 })
        ).ok
      ).toBe(true)
      const sinStock = getState().entregarSolicitudInsumoIR("si-stock")
      expect(sinStock.ok).toBe(false)
      expect(sinStock.error).toContain("Stock insuficiente")

      // Artículo quitado del catálogo después de pedirlo.
      useCompassStore.setState((s) => ({
        activosIR: s.activosIR.filter((r) => r.id !== "ir-critico"),
      }))
      const sinRecurso = getState().entregarSolicitudInsumoIR("si-stock")
      expect(sinRecurso.ok).toBe(false)
      expect(sinRecurso.error).toContain("ya no existe")
    })

    it("registrarEntregaEPP rechaza recursos que no son EPP y receptores inexistentes", () => {
      getState().savePersona(personaBase({}))
      getState().saveRecursoIR(recursoBase({ id: "ir-insumo" }))
      const noEpp = getState().registrarEntregaEPP({
        id: "epp-cob",
        recursoId: "ir-insumo",
        personaId: "p-cob-1",
        fechaEntrega: "2026-08-25",
        talla: "M",
        estado: "nuevo",
      })
      expect(noEpp.ok).toBe(false)
      expect(noEpp.error).toContain("protección personal")

      getState().saveRecursoIR(
        recursoBase({ id: "ir-epp-cob", categoria: "epp", nombre: "Guante", talla: "M", stock: 0 })
      )
      const sinPersona = getState().registrarEntregaEPP({
        id: "epp-cob-2",
        recursoId: "ir-epp-cob",
        personaId: "p-nadie",
        fechaEntrega: "2026-08-25",
        talla: "M",
        estado: "nuevo",
      })
      expect(sinPersona.ok).toBe(false)
      expect(sinPersona.error).toContain("receptor no existe")
    })

    it("asignarAccesoIR y devolverAccesoIR sostienen el ciclo quién-tiene-qué", () => {
      getState().savePersona(personaBase({}))
      const sinRecurso = getState().asignarAccesoIR("ir-nadie", "p-cob-1")
      expect(sinRecurso.ok).toBe(false)
      expect(sinRecurso.error).toContain("el acceso no existe")

      getState().saveRecursoIR(recursoBase({ id: "ir-insumo-cob" }))
      const noAcceso = getState().asignarAccesoIR("ir-insumo-cob", "p-cob-1")
      expect(noAcceso.ok).toBe(false)
      expect(noAcceso.error).toContain("Solo llaves y credenciales")

      getState().saveRecursoIR(
        recursoBase({ id: "ir-llave", nombre: "Llave bodega COB", categoria: "acceso", unidadId: getState().unidades[0]!.id, stock: 0 })
      )
      const sinPersona = getState().asignarAccesoIR("ir-llave", "p-nadie")
      expect(sinPersona.ok).toBe(false)
      expect(sinPersona.error).toContain("persona no existe")

      expect(getState().asignarAccesoIR("ir-llave", "p-cob-1").ok).toBe(true)
      const asignada = getState().activosIR.find((r) => r.id === "ir-llave")!
      expect(asignada.estadoActivo).toBe("en_uso")
      expect(asignada.asignacionActual?.personaId).toBe("p-cob-1")

      const dobleAsignacion = getState().asignarAccesoIR("ir-llave", "p-cob-1")
      expect(dobleAsignacion.ok).toBe(false)
      expect(dobleAsignacion.error).toContain("ya está asignado")

      expect(getState().devolverAccesoIR("ir-llave").ok).toBe(true)
      const devuelta = getState().activosIR.find((r) => r.id === "ir-llave")!
      expect(devuelta.estadoActivo).toBe("disponible")
      expect(devuelta.asignacionActual).toBeUndefined()

      const sinAsignacion = getState().devolverAccesoIR("ir-llave")
      expect(sinAsignacion.ok).toBe(false)
      expect(sinAsignacion.error).toContain("no registra asignación vigente")

      const devolverFantasma = getState().devolverAccesoIR("ir-nadie")
      expect(devolverFantasma.ok).toBe(false)
      expect(devolverFantasma.error).toContain("el acceso no existe")
    })
  })

  describe("MT — Mantenimiento", () => {
    it("saveTrabajoMT valida ubicaciones y responsable; la edición no re-audita el alta", () => {
      const unidadId = getState().unidades[0]!.id
      const msFantasma = getState().saveTrabajoMT(
        trabajoBase({ id: "mt-ms", microSectorId: "ms-fantasma" })
      )
      expect(msFantasma.ok).toBe(false)
      expect(msFantasma.error).toContain("sub-sector indicado no existe")

      const uFantasma = getState().saveTrabajoMT(
        trabajoBase({ id: "mt-u", unidadId: "u-fantasma" })
      )
      expect(uFantasma.ok).toBe(false)
      expect(uFantasma.error).toContain("unidad indicada no existe")

      const rFantasma = getState().saveTrabajoMT(
        trabajoBase({ id: "mt-r", unidadId, proveedor: undefined, responsablePersonaId: "p-nadie" })
      )
      expect(rFantasma.ok).toBe(false)
      expect(rFantasma.error).toContain("responsable interno no existe")

      expect(getState().saveTrabajoMT(trabajoBase({ id: "mt-edit", unidadId })).ok).toBe(true)
      const eventosAlta = getState().eventos.filter(
        (e) => e.tipoAccion === "MT_WORK_CREATED"
      ).length
      const persistido = getState().trabajosMT.find((t) => t.id === "mt-edit")!
      expect(
        getState().saveTrabajoMT({ ...persistido, titulo: "Título editado COB" }).ok
      ).toBe(true)
      expect(
        getState().eventos.filter((e) => e.tipoAccion === "MT_WORK_CREATED").length
      ).toBe(eventosAlta)
    })

    it("removeTrabajoMT elimina el trabajo y no falla con un id desconocido", () => {
      const unidadId = getState().unidades[0]!.id
      getState().saveTrabajoMT(trabajoBase({ id: "mt-borrar", unidadId }))
      expect(getState().removeTrabajoMT("mt-borrar").ok).toBe(true)
      expect(getState().trabajosMT.some((t) => t.id === "mt-borrar")).toBe(false)
      expect(getState().removeTrabajoMT("mt-nadie").ok).toBe(true)
    })

    it("iniciarTrabajoMT exige existencia y estado Planificado", () => {
      const inexistente = getState().iniciarTrabajoMT("mt-nadie")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("el trabajo no existe")

      const unidadId = getState().unidades[0]!.id
      getState().saveTrabajoMT(trabajoBase({ id: "mt-curso", unidadId, estado: "en_curso" }))
      const yaEnCurso = getState().iniciarTrabajoMT("mt-curso")
      expect(yaEnCurso.ok).toBe(false)
      expect(yaEnCurso.error).toContain("Solo un trabajo Planificado")
    })

    it("finalizarTrabajoMT rechaza inexistente y cancelado", () => {
      const inexistente = getState().finalizarTrabajoMT("mt-nadie")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("el trabajo no existe")

      const unidadId = getState().unidades[0]!.id
      getState().saveTrabajoMT(trabajoBase({ id: "mt-cancel", unidadId, estado: "cancelado" }))
      const cancelado = getState().finalizarTrabajoMT("mt-cancel")
      expect(cancelado.ok).toBe(false)
      expect(cancelado.error).toContain("cancelado no puede finalizarse")
    })

    it("actualizarPagoTrabajoMT rechaza inexistente y transiciones inversas", () => {
      const inexistente = getState().actualizarPagoTrabajoMT("mt-nadie", "pagado")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("el trabajo no existe")

      const unidadId = getState().unidades[0]!.id
      getState().saveTrabajoMT(trabajoBase({ id: "mt-pago-cob", unidadId, estado: "finalizado" }))
      expect(getState().actualizarPagoTrabajoMT("mt-pago-cob", "pagado").ok).toBe(true)
      const inversa = getState().actualizarPagoTrabajoMT("mt-pago-cob", "parcial")
      expect(inversa.ok).toBe(false)
      expect(inversa.error).toContain("Transición inválida")
      expect(getState().actualizarPagoTrabajoMT("mt-pago-cob", "pagado").ok).toBe(true)
    })

    it("verificarGarantiasMT alerta la garantía por vencer dentro de 30 días", () => {
      const unidadId = getState().unidades[0]!.id
      getState().saveTrabajoMT(
        trabajoBase({
          id: "mt-porvencer",
          titulo: "Sellado por vencer COB",
          descripcion: "Sellado perimetral con garantía próxima a expirar.",
          unidadId,
          estado: "finalizado",
          fechaTermino: masDias(-40),
          garantiaInicio: masDias(-400),
          garantiaFin: masDias(10),
        })
      )
      expect(getState().verificarGarantiasMT().ok).toBe(true)
      const eventos = getState().eventos.filter(
        (e) => e.tipoAccion === "MT_GUARANTEE_EXPIRED"
      )
      expect(eventos).toHaveLength(1)
      expect(eventos[0]!.descripcion).toContain("por expirar")
      expect(
        getState().notificaciones.some((n) => n.asunto.includes("por expirar"))
      ).toBe(true)
      // Idempotente: la segunda pasada no vuelve a alertar.
      getState().verificarGarantiasMT()
      expect(
        getState().eventos.filter((e) => e.tipoAccion === "MT_GUARANTEE_EXPIRED")
      ).toHaveLength(1)
    })

    it("saveProyectoMT exige un fondo existente, activo y con saldo suficiente", () => {
      const inexistente = getState().saveProyectoMT(
        proyectoBase({ fondoFinanciamientoId: "fondo-nadie" })
      )
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("no existe en Finanzas")

      useCompassStore.setState((s) => ({
        fondosFI: s.fondosFI.map((f) =>
          f.id === "fondo-reserva" ? { ...f, activo: false } : f
        ),
      }))
      const inactivo = getState().saveProyectoMT(
        proyectoBase({ fondoFinanciamientoId: "fondo-reserva" })
      )
      expect(inactivo.ok).toBe(false)
      expect(inactivo.error).toContain("está inactivo")

      useCompassStore.setState((s) => ({
        fondosFI: s.fondosFI.map((f) =>
          f.id === "fondo-reserva" ? { ...f, activo: true } : f
        ),
      }))
      const sinSaldo = getState().saveProyectoMT(
        proyectoBase({
          id: "py-sinsaldo",
          fondoFinanciamientoId: "fondo-reserva",
          presupuestoEstimado: 999_999_999_999,
        })
      )
      expect(sinSaldo.ok).toBe(false)
      expect(sinSaldo.error).toContain("Saldo insuficiente")
    })
  })

  describe("CO — Comunicación con Vecinos", () => {
    it("removePlantillaCO y removeDocumentoCO eliminan por id sin fallar si no existen", () => {
      const iniciales = getState().plantillasCO.length
      const primeraCO = getState().plantillasCO[0]!.id
      expect(getState().removePlantillaCO(primeraCO).ok).toBe(true)
      expect(getState().plantillasCO).toHaveLength(iniciales - 1)
      expect(getState().removePlantillaCO("plant-nadie").ok).toBe(true)

      expect(getState().saveDocumentoCO(documentoBase({})).ok).toBe(true)
      expect(getState().documentosCO.some((d) => d.id === "doc-cob-1")).toBe(true)
      expect(getState().removeDocumentoCO("doc-cob-1").ok).toBe(true)
      expect(getState().documentosCO.some((d) => d.id === "doc-cob-1")).toBe(false)
      expect(getState().removeDocumentoCO("doc-nadie").ok).toBe(true)
    })

    it("responderMensajeBuzonCO transiciona Recibido → En Gestión y audita", () => {
      getState().saveMensajeBuzonCO(mensajeBuzonBase({}))
      const inexistente = getState().responderMensajeBuzonCO("buz-nadie", {
        autor: "Admin",
        texto: "Respuesta",
      })
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("el ticket del buzón no existe")

      const vacia = getState().responderMensajeBuzonCO("buz-cob-1", {
        autor: "Admin",
        texto: "   ",
      })
      expect(vacia.ok).toBe(false)
      expect(vacia.error).toContain("no puede estar vacía")

      const r = getState().responderMensajeBuzonCO("buz-cob-1", {
        autor: "Admin COB",
        texto: "Coordinamos inspección con el conserje.",
        compromisos: "Visita técnica el viernes.",
      })
      expect(r.ok).toBe(true)
      const mensaje = getState().mensajesBuzonCO.find((m) => m.id === "buz-cob-1")!
      expect(mensaje.estado).toBe("en_gestion")
      expect(mensaje.respuestas[0]!.texto).toContain("inspección")
      expect(
        getState().eventos.filter((e) => e.tipoAccion === "CO_TICKET_ESTADO")
      ).toHaveLength(1)
    })

    it("cambiarEstadoBuzonCO valida transiciones y notifica al resolverse", () => {
      getState().savePersona(personaBase({}))
      getState().saveMensajeBuzonCO(
        mensajeBuzonBase({ reportantePersonaId: "p-cob-1" })
      )

      const inexistente = getState().cambiarEstadoBuzonCO("buz-nadie", "en_gestion")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("el ticket del buzón no existe")

      expect(getState().cambiarEstadoBuzonCO("buz-cob-1", "recibido").ok).toBe(true)
      const invalida = getState().cambiarEstadoBuzonCO("buz-cob-1", "resuelto")
      expect(invalida.ok).toBe(false)
      expect(invalida.error).toContain("Transición inválida")

      expect(getState().cambiarEstadoBuzonCO("buz-cob-1", "en_gestion").ok).toBe(true)
      expect(getState().cambiarEstadoBuzonCO("buz-cob-1", "resuelto").ok).toBe(true)
      expect(
        getState().notificaciones.some((n) => n.asunto.includes("fue resuelto"))
      ).toBe(true)
      expect(getState().cambiarEstadoBuzonCO("buz-cob-1", "cerrado").ok).toBe(true)
      expect(
        getState().cambiarEstadoBuzonCO("buz-cob-1", "en_gestion").ok
      ).toBe(false)
    })

    it("saveEnvioCO rechaza plantilla y destinatarios inexistentes", () => {
      getState().savePersona(personaBase({}))
      const sinPlantilla = getState().saveEnvioCO(
        envioBase({ plantillaId: "plant-nadie" })
      )
      expect(sinPlantilla.ok).toBe(false)
      expect(sinPlantilla.error).toContain("la plantilla indicada no existe")

      const sinDestinatario = getState().saveEnvioCO(
        envioBase({ id: "env-2", destinatarios: [{ personaId: "p-nadie" }] })
      )
      expect(sinDestinatario.ok).toBe(false)
      expect(sinDestinatario.error).toContain("no existe en el Maestro de Personas")

      const unidadFantasma = getState().saveEnvioCO(
        envioBase({
          id: "env-3",
          destinatarios: [{ personaId: "p-cob-1", unidadId: "u-nadie" }],
        })
      )
      expect(unidadFantasma.ok).toBe(false)
      expect(unidadFantasma.error).toContain("no existe")
    })
  })

  describe("AD — Administración y Gobernanza", () => {
    it("saveControlPropiedad rechaza unidad inexistente, duplicado y audita solo cambios", () => {
      const unidadId = getState().unidades[0]!.id
      const sinUnidad = getState().saveControlPropiedad(
        controlBase({ unidadId: "u-nadie" })
      )
      expect(sinUnidad.ok).toBe(false)
      expect(sinUnidad.error).toContain("la unidad no existe")

      expect(
        getState().saveControlPropiedad(controlBase({ unidadId })).ok
      ).toBe(true)
      const duplicado = getState().saveControlPropiedad(
        controlBase({ id: "ctrl-cob-2", unidadId })
      )
      expect(duplicado.ok).toBe(false)
      expect(duplicado.error).toContain("ya tiene controles registrados")

      const eventosAntes = getState().eventos.filter(
        (e) => e.tipoAccion === "AD_OWNER_CONFIG_CHANGE"
      ).length
      // Edición sin cambios observables: no emite evento nuevo.
      expect(
        getState().saveControlPropiedad(controlBase({ unidadId })).ok
      ).toBe(true)
      expect(
        getState().eventos.filter(
          (e) => e.tipoAccion === "AD_OWNER_CONFIG_CHANGE"
        ).length
      ).toBe(eventosAntes)

      // Edición con cambio: evento descriptivo.
      expect(
        getState().saveControlPropiedad(
          controlBase({ unidadId, residenteVeMorosidad: true })
        ).ok
      ).toBe(true)
      expect(
        getState().eventos.filter(
          (e) => e.tipoAccion === "AD_OWNER_CONFIG_CHANGE"
        ).length
      ).toBe(eventosAntes + 1)
    })

    it("removeControlPropiedad y removeActaGD eliminan por id", () => {
      const unidadId = getState().unidades[0]!.id
      getState().saveControlPropiedad(controlBase({ unidadId }))
      expect(getState().removeControlPropiedad("ctrl-cob-1").ok).toBe(true)
      expect(getState().controlesPropiedades).toHaveLength(0)
      expect(getState().removeControlPropiedad("ctrl-nadie").ok).toBe(true)

      getState().savePersona(directivoBase({}))
      getState().saveActaGD(actaBase({ presentes: ["p-dir-cob"] }))
      expect(getState().removeActaGD("acta-cob-1").ok).toBe(true)
      expect(getState().actasGD).toHaveLength(0)
      expect(getState().removeActaGD("acta-nadie").ok).toBe(true)
    })

    it("saveActaGD hereda el período vigente y acota el quórum a su nómina", () => {
      getState().savePersona(
        directivoBase({
          id: "p-periodo",
          datosGobernanza: {
            id: "gob-per",
            cargoDirectiva: "presidente",
            fechaAsuncion: "2026-01-01",
          },
        })
      )
      // Legado pre-períodos: sin períodos registrados, la ficha sin periodoId es válida.
      expect(
        getState().saveActaGD(
          actaBase({ id: "acta-legado", presentes: ["p-periodo"] })
        ).ok
      ).toBe(true)
      expect(
        getState().actasGD.find((a) => a.id === "acta-legado")!.periodoId
      ).toBeUndefined()

      const periodo: PeriodoDirectiva = {
        id: "per-cob-1",
        fechaInicio: "2026-01-01",
        duracionMeses: 24,
        fechaInscripcion: "2026-01-15",
        referenciaInscripcion: "Acta de asamblea COB",
        estado: "vigente",
        miembros: [],
      }
      useCompassStore.setState({ periodosDirectiva: [periodo] })

      // Con período vigente, la ficha sin periodoId ya no cuenta para el quórum.
      const sinNomina = getState().saveActaGD(
        actaBase({ id: "acta-sin-nomina", presentes: ["p-periodo"] })
      )
      expect(sinNomina.ok).toBe(false)
      expect(sinNomina.error).toContain("no es miembro de la directiva")

      // Con la nómina actualizada, el acta nace con el período vigente heredado.
      const p = getState().personas.find((x) => x.id === "p-periodo")!
      expect(
        getState().savePersona({
          ...p,
          datosGobernanza: { ...p.datosGobernanza!, periodoId: "per-cob-1" },
        }).ok
      ).toBe(true)
      expect(
        getState().saveActaGD(
          actaBase({ id: "acta-nomina", presentes: ["p-periodo"] })
        ).ok
      ).toBe(true)
      expect(
        getState().actasGD.find((a) => a.id === "acta-nomina")!.periodoId
      ).toBe("per-cob-1")
      expect(getState().periodoDirectivaVigente()?.id).toBe("per-cob-1")
    })

    it("publicarActaEnCV rechaza acta inexistente y ya publicada", () => {
      const inexistente = getState().publicarActaEnCV("acta-nadie")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("el acta no existe")

      getState().savePersona(directivoBase({}))
      const primerDirectivo = getState().personas.find(
        (p) => p.datosGobernanza && p.estadoCuenta === "activa"
      )!.id
      getState().saveActaGD(actaBase({ presentes: [primerDirectivo] }))
      for (const personaId of getState()
        .personas.filter((p) => p.datosGobernanza && p.estadoCuenta === "activa")
        .map((p) => p.id)) {
        expect(getState().aprobarActaGD("acta-cob-1", personaId).ok).toBe(true)
      }
      // El quórum completo marca el acta como publicada por gobernanza.
      expect(getState().actasGD[0]!.estado).toBe("publicada")

      expect(getState().publicarActaEnCV("acta-cob-1").ok).toBe(true)
      const repetida = getState().publicarActaEnCV("acta-cob-1")
      expect(repetida.ok).toBe(false)
      expect(repetida.error).toContain("ya fue publicada")
    })
  })

  describe("GE — Gestión de Solicitudes", () => {
    it("abrirSolicitudGE rechaza inexistente y es idempotente fuera de Nuevo", () => {
      const inexistente = getState().abrirSolicitudGE("ge-nadie")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("el ticket no existe")

      const unidadId = getState().unidades[0]!.id
      expect(
        getState().saveSolicitudGE(solicitudGEBase({ unidadId })).ok
      ).toBe(true)
      expect(getState().abrirSolicitudGE("sol-cob-1").ok).toBe(true)
      expect(getState().solicitudesGE[0]!.estado).toBe("en_revision")
      const segunda = getState().abrirSolicitudGE("sol-cob-1")
      expect(segunda.ok).toBe(true)
      expect(
        getState().eventos.filter((e) => e.tipoAccion === "GE_TICKET_STATE_CHANGE")
      ).toHaveLength(1)
    })

    it("responderSolicitudGE valida texto y estados, y mueve el ticket según el autor", () => {
      getState().savePersona(personaBase({ roles: ["residente"] }))
      const unidadId = getState().unidades[0]!.id
      getState().saveSolicitudGE(
        solicitudGEBase({ solicitantePersonaId: "p-cob-1", unidadId })
      )

      const inexistente = getState().responderSolicitudGE("ge-nadie", {
        autorRol: "administracion",
        texto: "Hola",
      })
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("el ticket no existe")

      const vacio = getState().responderSolicitudGE("sol-cob-1", {
        autorRol: "administracion",
        texto: "  ",
      })
      expect(vacio.ok).toBe(false)
      expect(vacio.error).toContain("no puede estar vacío")

      // Comentario neutro sobre un ticket Nuevo: solo audita el comentario.
      expect(
        getState().responderSolicitudGE("sol-cob-1", {
          autorRol: "administracion",
          texto: "Recibido, en revisión preliminar.",
        }).ok
      ).toBe(true)
      expect(
        getState().eventos.filter((e) => e.tipoAccion === "GE_TICKET_COMMENT")
      ).toHaveLength(1)

      // Administración pide acción al vecino.
      getState().abrirSolicitudGE("sol-cob-1")
      expect(
        getState().responderSolicitudGE("sol-cob-1", {
          autorRol: "administracion",
          texto: "Necesitamos la hora exacta del suceso.",
        }).ok
      ).toBe(true)
      expect(getState().solicitudesGE[0]!.estado).toBe("requiere_accion_vecino")
      expect(
        getState().notificaciones.some((n) => n.asunto.includes("requiere más información"))
      ).toBe(true)

      // El vecino responde y el ticket vuelve a la administración.
      expect(
        getState().responderSolicitudGE("sol-cob-1", {
          autorRol: "solicitante",
          texto: "La hora exacta fue 18:30.",
        }).ok
      ).toBe(true)
      expect(getState().solicitudesGE[0]!.estado).toBe("en_proceso")
      expect(
        getState().notificaciones.some((n) => n.asunto.includes("El vecino respondió"))
      ).toBe(true)

      // Cerrado no admite comentarios.
      getState().resolverSolicitudGE("sol-cob-1", "Cámaras revisadas, sin novedad.")
      getState().cerrarSolicitudGE("sol-cob-1")
      const cerrado = getState().responderSolicitudGE("sol-cob-1", {
        autorRol: "administracion",
        texto: "Comentario tardío",
      })
      expect(cerrado.ok).toBe(false)
      expect(cerrado.error).toContain("No se puede comentar un ticket cerrado")
    })

    it("resolverSolicitudGE y cerrarSolicitudGE validan existencia, estado y obligatoriedad", () => {
      const inexistente = getState().resolverSolicitudGE("ge-nadie", "texto")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("el ticket no existe")

      const unidadId = getState().unidades[0]!.id
      getState().saveSolicitudGE(solicitudGEBase({ unidadId }))
      const sinTexto = getState().resolverSolicitudGE("sol-cob-1", "   ")
      expect(sinTexto.ok).toBe(false)
      expect(sinTexto.error).toContain("resolución es obligatoria")

      expect(
        getState().resolverSolicitudGE("sol-cob-1", "Revisado con el conserje.").ok
      ).toBe(true)
      expect(getState().solicitudesGE[0]!.estado).toBe("resuelto")
      expect(
        getState().eventos.some((e) => e.tipoAccion === "GE_TICKET_RESOLVED")
      ).toBe(true)

      const cerrarSinResolver = getState().cerrarSolicitudGE("ge-nadie")
      expect(cerrarSinResolver.ok).toBe(false)
      expect(cerrarSinResolver.error).toContain("el ticket no existe")

      getState().saveSolicitudGE(
        solicitudGEBase({ id: "sol-cob-2", unidadId, titulo: "Otra solicitud COB" })
      )
      const noResuelto = getState().cerrarSolicitudGE("sol-cob-2")
      expect(noResuelto.ok).toBe(false)
      expect(noResuelto.error).toContain("Solo un ticket Resuelto")

      expect(getState().cerrarSolicitudGE("sol-cob-1").ok).toBe(true)
      expect(getState().solicitudesGE.find((s) => s.id === "sol-cob-1")!.estado).toBe("cerrado")
      const yaCerrado = getState().resolverSolicitudGE("sol-cob-1", "Otra resolución")
      expect(yaCerrado.ok).toBe(false)
      expect(yaCerrado.error).toContain("ya está cerrado")
    })

    it("saveSolicitudGE valida los requisitos por tipo de ticket", () => {
      const sinUnidad = getState().saveSolicitudGE(
        solicitudGEBase({ detalleGrabaciones: undefined })
      )
      expect(sinUnidad.ok).toBe(false)
      expect(sinUnidad.error).toContain("deben vincularse a una unidad")

      const unidadId = getState().unidades[0]!.id
      const sinDetalle = getState().saveSolicitudGE(
        solicitudGEBase({ unidadId, detalleGrabaciones: undefined })
      )
      expect(sinDetalle.ok).toBe(false)
      expect(sinDetalle.error).toContain("fecha/hora del suceso")

      const sinInsumos = getState().saveSolicitudGE(
        solicitudGEBase({
          id: "sol-insumos",
          tipo: "insumos",
          unidadId,
          detalleGrabaciones: undefined,
        })
      )
      expect(sinInsumos.ok).toBe(false)
      expect(sinInsumos.error).toContain("requieren área de destino")

      const sinBuzon = getState().saveSolicitudGE(
        solicitudGEBase({
          id: "sol-buzon",
          tipo: "buzon",
          unidadId,
          detalleGrabaciones: undefined,
          mensajeBuzonId: "buz-nadie",
        })
      )
      expect(sinBuzon.ok).toBe(false)
      expect(sinBuzon.error).toContain("mensaje existente de CO")
    })
  })

  describe("CV — Visor de Mensajes", () => {
    it("publicarAvisoCV rechaza inexistente y estados que no son Borrador", () => {
      const inexistente = getState().publicarAvisoCV("cv-nadie")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("el aviso no existe")

      expect(getState().saveAvisoCV(avisoBase({})).ok).toBe(true)
      expect(getState().publicarAvisoCV("cv-cob-1").ok).toBe(true)
      expect(getState().avisosCV[0]!.estado).toBe("publicado")
      const repetida = getState().publicarAvisoCV("cv-cob-1")
      expect(repetida.ok).toBe(false)
      expect(repetida.error).toContain("Solo un aviso Borrador")
    })

    it("activarPlantillaCV rechaza inexistente y desactivada", () => {
      const inexistente = getState().activarPlantillaCV("plant-nadie")
      expect(inexistente.ok).toBe(false)
      expect(inexistente.error).toContain("la plantilla no existe")

      useCompassStore.setState((s) => ({
        plantillasCV: s.plantillasCV.map((p) =>
          p.id === "plant-cv-porton" ? { ...p, activa: false } : p
        ),
      }))
      const desactivada = getState().activarPlantillaCV("plant-cv-porton")
      expect(desactivada.ok).toBe(false)
      expect(desactivada.error).toContain("desactivada por administración")
    })

    it("saveAvisoCV rechaza autor inexistente en la creación manual supervisada", () => {
      const fantasma = getState().saveAvisoCV(avisoBase({}), "p-nadie")
      expect(fantasma.ok).toBe(false)
      expect(fantasma.error).toContain("el autor no existe")

      getState().savePersona(personaBase({ roles: ["residente"] }))
      const sinPermiso = getState().saveAvisoCV(
        avisoBase({ id: "cv-cob-2" }),
        "p-cob-1"
      )
      expect(sinPermiso.ok).toBe(false)
      expect(sinPermiso.error).toContain("Sin habilitación")
    })
  })

  describe("PI — Portal Inmobiliario", () => {
    it("syncPublicacionesDesdeVinculos reactiva la vitrina cuando vuelve la oferta", () => {
      const vinculo = {
        id: "v-pi-cob",
        personaId: "p-11",
        unidadId: "u-A-302",
        rol: "propietario" as const,
        fechaInicio: "2026-01-01",
        estadoOcupacionPropiedad: "en_arriendo",
        permiteVerFinanzas: false,
      }
      expect(getState().saveVinculo(vinculo).ok).toBe(true)
      const creada = getState().publicacionesPortal.find(
        (p) => p.unidadId === "u-A-302"
      )!
      expect(creada.activa).toBe(true)

      expect(
        getState().saveVinculo({ ...vinculo, estadoOcupacionPropiedad: "habitada" }).ok
      ).toBe(true)
      expect(
        getState().publicacionesPortal.find((p) => p.id === creada.id)!.activa
      ).toBe(false)

      expect(
        getState().saveVinculo({ ...vinculo, estadoOcupacionPropiedad: "en_venta" }).ok
      ).toBe(true)
      const reactivada = getState().publicacionesPortal.find(
        (p) => p.id === creada.id
      )!
      expect(reactivada.activa).toBe(true)
      expect(reactivada.operacion).toBe("venta")
      expect(
        getState().eventos.filter(
          (e) => e.tipoAccion === "PI_PROPERTY_LISTED"
        ).length
      ).toBe(2)
    })

    it("removePublicacionPortal elimina solo publicaciones sin leads", () => {
      useCompassStore.setState((s) => ({
        publicacionesPortal: [
          ...s.publicacionesPortal,
          publicacionBase({ id: "pub-cob-1" }),
        ],
      }))
      expect(getState().removePublicacionPortal("pub-cob-1").ok).toBe(true)
      expect(
        getState().publicacionesPortal.some((p) => p.id === "pub-cob-1")
      ).toBe(false)
    })
  })

  describe("Guardas de hidratación — sin hidratar ninguna acción muta", () => {
    beforeEach(() => {
      useCompassStore.setState({ hasHydrated: false })
    })

    it("IR: las 8 acciones rechazan con el mensaje de hidratación sin mutar", () => {
      const activosIR = getState().activosIR
      const solicitudes = getState().solicitudesInsumoIR
      const entregas = getState().entregasEPP

      guarda(getState().saveRecursoIR(recursoBase({})))
      guarda(getState().removeRecursoIR("ir-cob-1"))
      guarda(getState().saveSolicitudInsumoIR(solicitudIRBase({})))
      guarda(getState().resolverComodinIR("si-cob-1", "aprobar_crear"))
      guarda(getState().entregarSolicitudInsumoIR("si-cob-1"))
      guarda(
        getState().registrarEntregaEPP({
          id: "epp-guard",
          recursoId: "ir-cob-1",
          personaId: "p-cob-1",
          fechaEntrega: "2026-08-25",
          talla: "M",
          estado: "nuevo",
        })
      )
      guarda(getState().asignarAccesoIR("ir-cob-1", "p-cob-1"))
      guarda(getState().devolverAccesoIR("ir-cob-1"))

      expect(getState().activosIR).toBe(activosIR)
      expect(getState().solicitudesInsumoIR).toBe(solicitudes)
      expect(getState().entregasEPP).toBe(entregas)
    })

    it("MT: las 7 acciones rechazan con el mensaje de hidratación sin mutar", () => {
      const trabajos = getState().trabajosMT
      const proyectos = getState().proyectosMT

      guarda(getState().saveTrabajoMT(trabajoBase({})))
      guarda(getState().removeTrabajoMT("mt-cob-1"))
      guarda(getState().iniciarTrabajoMT("mt-cob-1"))
      guarda(getState().finalizarTrabajoMT("mt-cob-1"))
      guarda(getState().actualizarPagoTrabajoMT("mt-cob-1", "pagado"))
      guarda(getState().verificarGarantiasMT())
      guarda(getState().saveProyectoMT(proyectoBase({})))

      expect(getState().trabajosMT).toBe(trabajos)
      expect(getState().proyectosMT).toBe(proyectos)
    })

    it("CO: las 10 acciones rechazan con el mensaje de hidratación sin mutar", () => {
      const plantillas = getState().plantillasCO
      const envios = getState().enviosCO
      const mensajes = getState().mensajesBuzonCO
      const documentos = getState().documentosCO

      guarda(getState().savePlantillaCO(plantillaCOBase({})))
      guarda(getState().removePlantillaCO("plant-cob-1"))
      guarda(getState().saveEnvioCO(envioBase({})))
      guarda(getState().registrarLecturaEnvioCO("env-cob-1", "p-cob-1"))
      guarda(getState().saveMensajeBuzonCO(mensajeBuzonBase({})))
      guarda(
        getState().responderMensajeBuzonCO("buz-cob-1", {
          autor: "Admin",
          texto: "Respuesta",
        })
      )
      guarda(getState().cambiarEstadoBuzonCO("buz-cob-1", "en_gestion"))
      guarda(getState().removeMensajeBuzonCO("buz-cob-1"))
      guarda(getState().saveDocumentoCO(documentoBase({})))
      guarda(getState().removeDocumentoCO("doc-cob-1"))

      expect(getState().plantillasCO).toBe(plantillas)
      expect(getState().enviosCO).toBe(envios)
      expect(getState().mensajesBuzonCO).toBe(mensajes)
      expect(getState().documentosCO).toBe(documentos)
    })

    it("AD: las 6 acciones rechazan con el mensaje de hidratación sin mutar", () => {
      const controles = getState().controlesPropiedades
      const actas = getState().actasGD
      const avisos = getState().avisosCV

      guarda(getState().saveControlPropiedad(controlBase({})))
      guarda(getState().removeControlPropiedad("ctrl-cob-1"))
      guarda(getState().saveActaGD(actaBase({})))
      guarda(getState().removeActaGD("acta-cob-1"))
      guarda(getState().aprobarActaGD("acta-cob-1", "p-dir-cob"))
      guarda(getState().publicarActaEnCV("acta-cob-1"))

      expect(getState().controlesPropiedades).toBe(controles)
      expect(getState().actasGD).toBe(actas)
      expect(getState().avisosCV).toBe(avisos)
    })

    it("GE: las 6 acciones rechazan con el mensaje de hidratación sin mutar", () => {
      const solicitudes = getState().solicitudesGE

      guarda(getState().saveSolicitudGE(solicitudGEBase({})))
      guarda(getState().abrirSolicitudGE("sol-cob-1"))
      guarda(
        getState().responderSolicitudGE("sol-cob-1", {
          autorRol: "administracion",
          texto: "Comentario",
        })
      )
      guarda(getState().resolverSolicitudGE("sol-cob-1", "Resolución"))
      guarda(getState().cerrarSolicitudGE("sol-cob-1"))
      guarda(getState().removeSolicitudGE("sol-cob-1"))

      expect(getState().solicitudesGE).toBe(solicitudes)
    })

    it("CV: las 4 acciones rechazan con el mensaje de hidratación sin mutar", () => {
      const avisos = getState().avisosCV

      guarda(getState().saveAvisoCV(avisoBase({})))
      guarda(getState().publicarAvisoCV("cv-cob-1"))
      guarda(getState().caducarAvisosCV())
      guarda(getState().activarPlantillaCV("plant-cv-porton"))

      expect(getState().avisosCV).toBe(avisos)
    })

    it("PI: removePublicacionPortal rechaza sin hidratar", () => {
      const publicaciones = getState().publicacionesPortal
      guarda(getState().removePublicacionPortal("pub-cob-1"))
      expect(getState().publicacionesPortal).toBe(publicaciones)
    })
  })
})
