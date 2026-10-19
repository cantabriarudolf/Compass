import { describe, it, expect, beforeEach } from "vitest"
import { useCompassStore } from "@/lib/store"
import { calcularDigitoVerificador } from "@/lib/rut"
import type { Persona, RecursoIR, SolicitudInsumoIR, EntregaEPP } from "@/lib/schemas"
import { resetStore } from "./helpers"

const getState = () => useCompassStore.getState()

const rutValido = (cuerpo: string): string => `${cuerpo.slice(0, 2)}.${cuerpo.slice(2, 5)}.${cuerpo.slice(5, 8)}-${calcularDigitoVerificador(cuerpo)}`

const personaBase = (partial: Partial<Persona>): Persona => ({
  id: "p-ir-1",
  rut: rutValido("15467892"),
  nombreCompleto: "Pedro Test Aseador",
  nombres: "Pedro",
  apellidos: "Test Aseador",
  email: "pedro@test.cl",
  telefonoMovil: "+56 9 5555 1111",
  estadoCuenta: "activa",
  condicionesEspecialesIds: [],
  roles: ["personal"],
  ...partial,
})

const recursoBase = (partial: Partial<RecursoIR>): RecursoIR => ({
  id: "ir-1",
  nombre: "Cloro bidón 5L",
  categoria: "insumo",
  estadoActivo: "disponible",
  stock: 10,
  esCritico: false,
  ...partial,
})

const solicitudBase = (partial: Partial<SolicitudInsumoIR>): SolicitudInsumoIR => ({
  id: "si-1",
  folio: "",
  solicitantePersonaId: "p-ir-1",
  estadoComodin: "no_comodin",
  cantidad: 2,
  areaDestino: "Piso 1 Torre TEST",
  estado: "pendiente",
  fechaSolicitud: "2026-08-25",
  recursoInsumoId: "ir-1",
  ...partial,
})

describe("IR - Inventario y Recursos en el store", () => {
  beforeEach(resetStore)

  describe("saveRecursoIR", () => {
    it("crea insumo con código auto-generado y valida FKs", () => {
      const macroId = getState().macroSectores[0]!.id
      const rMs = getState().saveMicroSector({ id: "ms-ir", nombre: "Piso TEST", etiqueta: "Piso", macroSectorId: macroId })
      expect(rMs.ok).toBe(true)
      const r = getState().saveRecursoIR(recursoBase({ microSectorId: "ms-ir" }))
      expect(r.ok).toBe(true)
      const recurso = getState().activosIR[0]!
      expect(recurso.codigo).toBe("IR-A-0001")

      const rFantasma = getState().saveRecursoIR(recursoBase({ id: "ir-2", responsablePersonaId: "p-fantasma" }))
      expect(rFantasma.ok).toBe(false)
    })

    it("infraestructura exige ubicación EF y acceso exige unidad", () => {
      const sinUbicacion = getState().saveRecursoIR(recursoBase({ id: "ir-hidro", nombre: "Hidropack", categoria: "infraestructura" }))
      expect(sinUbicacion.ok).toBe(false)
      expect(sinUbicacion.error).toContain("ubicación de la Estructura Física")

      const llaveSinUnidad = getState().saveRecursoIR(recursoBase({ id: "ir-llave", nombre: "Llave Depto 999", categoria: "acceso" }))
      expect(llaveSinUnidad.ok).toBe(false)

      getState().savePersona(personaBase({}))
      const unidadId = getState().unidades[0]!.id
      const llaveOk = getState().saveRecursoIR(
        recursoBase({ id: "ir-llave", nombre: "Llave Depto 999", categoria: "acceso", unidadId })
      )
      expect(llaveOk.ok).toBe(true)
    })

    it("insumo crítico exige umbral; factura deja referencia pendiente FI", () => {
      const criticoSinUmbral = getState().saveRecursoIR(recursoBase({ esCritico: true }))
      expect(criticoSinUmbral.ok).toBe(false)
      expect(criticoSinUmbral.error).toContain("umbral")

      const conCompra = getState().saveRecursoIR(
        recursoBase({
          proveedor: "Distribuidora TEST",
          numeroFactura: "F-123",
          facturaUrl: "https://placeholder.supabase.co/f123.pdf",
        })
      )
      expect(conCompra.ok).toBe(true)
      expect(getState().activosIR[0]!.cargoFIReferencia).toBe("pendiente")
    })

    it("rechaza factura embebida (D1) y bloquea eliminación con dependencias", () => {
      const d1Invalido = getState().saveRecursoIR(recursoBase({ facturaUrl: "data:image/png;base64,AAAA" }))
      expect(d1Invalido.ok).toBe(false)
      expect(d1Invalido.error).toContain("referencia")

      getState().savePersona(personaBase({}))
      expect(getState().saveRecursoIR(recursoBase({ id: "ir-dep" })).ok).toBe(true)
      expect(getState().saveSolicitudInsumoIR(solicitudBase({ recursoInsumoId: "ir-dep" })).ok).toBe(true)
      const r = getState().removeRecursoIR("ir-dep")
      expect(r.ok).toBe(false)
      expect(r.error).toContain("solicitud(es)")
    })
  })

  describe("flujo de solicitudes de insumo", () => {
    beforeEach(() => {
      getState().savePersona(personaBase({}))
      getState().saveRecursoIR(
        recursoBase({ id: "ir-1", stock: 10, esCritico: true, umbralCritico: 5 })
      )
    })

    it("crea solicitud con folio SI único contra el catálogo", () => {
      const r1 = getState().saveSolicitudInsumoIR(solicitudBase({}))
      const r2 = getState().saveSolicitudInsumoIR(solicitudBase({ id: "si-2", cantidad: 1 }))
      expect(r1.ok).toBe(true)
      expect(r2.ok).toBe(true)
      expect(getState().solicitudesInsumoIR.map(s => s.folio)).toEqual(["SI-0001", "SI-0002"])

      const sinArticulo = getState().saveSolicitudInsumoIR(solicitudBase({ id: "si-3", recursoInsumoId: undefined }))
      expect(sinArticulo.ok).toBe(false)
    })

    it("entrega descuenta stock y dispara IR_STOCK_LOW al cruzar umbral", () => {
      getState().saveSolicitudInsumoIR(solicitudBase({ cantidad: 3 }))
      const r = getState().entregarSolicitudInsumoIR("si-1")
      expect(r.ok).toBe(true)
      expect(getState().activosIR[0]!.stock).toBe(7)
      // Sin cruce: 7 > 5 → sin alarma aún.
      expect(getState().eventos.filter(e => e.tipoAccion === "IR_STOCK_LOW")).toHaveLength(0)

      getState().saveSolicitudInsumoIR(solicitudBase({ id: "si-2", cantidad: 3 }))
      getState().entregarSolicitudInsumoIR("si-2")
      expect(getState().activosIR[0]!.stock).toBe(4)
      const alarmas = getState().eventos.filter(e => e.tipoAccion === "IR_STOCK_LOW")
      expect(alarmas).toHaveLength(1)
      const notifs = getState().notificaciones.filter(n => n.asunto.includes("Alarma de reposición"))
      expect(notifs).toHaveLength(1)
    })

    it("entrega sin stock suficiente rechaza indicando faltante", () => {
      getState().saveSolicitudInsumoIR(solicitudBase({ cantidad: 99 }))
      const r = getState().entregarSolicitudInsumoIR("si-1")
      expect(r.ok).toBe(false)
      expect(r.error).toContain("Stock insuficiente")
      expect(getState().activosIR[0]!.stock).toBe(10)
    })

    it("comodín genera alerta crítica y las tres salidas administrativas funcionan", () => {
      const comodin = solicitudBase({
        id: "si-comodin",
        recursoInsumoId: undefined,
        comodin: { descripcionArticulo: "Escobillón industrial", justificacion: "Emergencia de aseo post evento TEST en áreas comunes." },
      })
      expect(getState().saveSolicitudInsumoIR(comodin).ok).toBe(true)
      expect(getState().eventos.filter(e => e.tipoAccion === "IR_COMODIN_ALERTA")).toHaveLength(1)
      expect(getState().notificaciones.some(n => n.asunto.includes("artículo no catalogado"))).toBe(true)

      // Rechazar sin justificación falla.
      const rechazoVacio = getState().resolverComodinIR("si-comodin", "rechazar")
      expect(rechazoVacio.ok).toBe(false)

      // Sustituir exige artículo existente del catálogo.
      const sustitucionFantasma = getState().resolverComodinIR("si-comodin", "sustituir", { recursoSustitutoId: "ir-fantasma" })
      expect(sustitucionFantasma.ok).toBe(false)

      // Aprobar y crear incorpora el artículo al catálogo.
      const rCrear = getState().resolverComodinIR("si-comodin", "aprobar_crear")
      expect(rCrear.ok).toBe(true)
      const creado = getState().activosIR.find(a => a.nombre === "Escobillón industrial")
      expect(creado).toBeTruthy()
      const solicitud = getState().solicitudesInsumoIR.find(s => s.id === "si-comodin")!
      expect(solicitud.estadoComodin).toBe("aprobada_creada")
      expect(solicitud.recursoInsumoId).toBe(creado!.id)

      // Comodín resuelto no se re-resuelve.
      const reResuelto = getState().resolverComodinIR("si-comodin", "rechazar", { justificacion: "duplicado" })
      expect(reResuelto.ok).toBe(false)

      // Y ahora puede entregarse si hay stock (creado con 0 → primero rechaza).
      const entregaSinStock = getState().entregarSolicitudInsumoIR("si-comodin")
      expect(entregaSinStock.ok).toBe(false)
    })

    it("comodín rechazado cierra la solicitud con notificación al solicitante", () => {
      getState().saveSolicitudInsumoIR(
        solicitudBase({
          id: "si-rechazo",
          recursoInsumoId: undefined,
          comodin: { descripcionArticulo: "Herramienta especial", justificacion: "Se requiere para reparación urgente de puerta." },
        })
      )
      const r = getState().resolverComodinIR("si-rechazo", "rechazar", { justificacion: "No aprobado por presupuesto." })
      expect(r.ok).toBe(true)
      const solicitud = getState().solicitudesInsumoIR.find(s => s.id === "si-rechazo")!
      expect(solicitud.estado).toBe("rechazada")
      expect(solicitud.rechazoJustificacion).toContain("presupuesto")
      expect(getState().notificaciones.some(n => n.asunto.includes("rechazada"))).toBe(true)
    })
  })

  describe("EPP y accesos", () => {
    beforeEach(() => {
      getState().savePersona(personaBase({}))
      getState().saveRecursoIR(recursoBase({ id: "ir-epp", nombre: "Casco seguridad", categoria: "epp", talla: "M", renovacionMeses: 6, stock: 0, esCritico: false }))
    })

    it("entrega EPP individual calcula próxima renovación y audita IR_DELIVERY_EPP", () => {
      const entrega: EntregaEPP = {
        id: "epp-1",
        recursoId: "ir-epp",
        personaId: "p-ir-1",
        fechaEntrega: "2026-08-25",
        talla: "M",
        estado: "nuevo",
      }
      const r = getState().registrarEntregaEPP(entrega)
      expect(r.ok).toBe(true)
      const guardada = getState().entregasEPP[0]!
      expect(guardada.proximaRenovacion).toBe("2027-02-25")
      expect(getState().eventos.filter(e => e.tipoAccion === "IR_DELIVERY_EPP")).toHaveLength(1)

      const noEPP = getState().registrarEntregaEPP({ ...entrega, id: "epp-2", recursoId: "ir-inexistente" })
      expect(noEPP.ok).toBe(false)
    })

    it("accesos: asignar/devolver mantiene quién tiene qué", () => {
      getState().saveRecursoIR(recursoBase({ id: "ir-llave", nombre: "Llave bodega", categoria: "acceso", unidadId: getState().unidades[0]!.id, stock: 0, esCritico: false }))

      const dobleAsignacionPrevia = getState().devolverAccesoIR("ir-llave")
      expect(dobleAsignacionPrevia.ok).toBe(false)

      const r = getState().asignarAccesoIR("ir-llave", "p-ir-1")
      expect(r.ok).toBe(true)
      let llave = getState().activosIR.find(x => x.id === "ir-llave")!
      expect(llave.asignacionActual?.personaId).toBe("p-ir-1")
      expect(llave.estadoActivo).toBe("en_uso")

      const segunda = getState().asignarAccesoIR("ir-llave", "p-otro")
      expect(segunda.ok).toBe(false)

      const rDev = getState().devolverAccesoIR("ir-llave")
      expect(rDev.ok).toBe(true)
      llave = getState().activosIR.find(x => x.id === "ir-llave")!
      expect(llave.asignacionActual).toBeUndefined()
      expect(llave.estadoActivo).toBe("disponible")
    })
  })
})
