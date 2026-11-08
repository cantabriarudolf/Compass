/**
 * @vitest-environment node
 *
 * Serie «Permisos por objeto» · T2 (el arnés) + T3 (lectura por relación).
 *
 * La matriz de permisos dice «este rol entra a esta ruta»; esta prueba dice qué
 * FILA ve. El arnés es propio y no depende del seed: dos comunidades (A y B),
 * dos unidades por comunidad, una persona por unidad con su vínculo vigente y
 * cuatro sesiones — administrador de A, residente de A-unidad-1, residente de
 * A-unidad-2 y residente de B-unidad-1.
 *
 * Los veredictos NO se copian acá: salen del mapa de T1
 * (`odd/tasks/permisos-por-objeto.md`, «Mapa de T1») y de los helpers de alcance
 * que ya implementan la regla (`filtroNotificaciones`, `whereEnvios`,
 * `whereEnvioDetalle`, `personaIdDelUsuario`). Cada aserción cita el `path:line`
 * del filtro que fija: si ese filtro se borra, la aserción falla.
 *
 * Recursos del primer lote: `personas`, `notificaciones`, `co/envios`.
 * Recursos del segundo lote: `controles-propiedad`, `cobros-fi/canales`,
 * `co/mensajes-buzon`, `vinculos` (límite documentado) y `liquidaciones`
 * (T6: el trabajador lee la suya; el defecto de `pl:propia` sin usar queda
 * cerrado por la ruta, y este arnés fija la regla por fila).
 * Recursos del tercer lote: `certificados-ct` (la fuga se CERRÓ el 2026-11-06: el
 * residente leía el certificado de otra unidad porque el `where` de la ruta era
 * solo la comunidad; ahora el alcance es «lo propio» —unidades con vínculo vigente
 * o la propia persona— y la fila ajena responde 404. Los dos casos que estaban en
 * `it.fails` son `it` normales, y la emisión tiene su propio caso: el residente no
 * puede emitir para una unidad/persona ajena, ni siquiera para leer su saldo),
 * `in/infracciones` (límite documentado en la lectura de gestión + la apelación
 * propia, que es la regla por fila que sí se puede ejercitar) y
 * `pe/encomiendas` (clave vacía: límite documentado, sin regla de fila posible).
 * Recursos del cuarto lote: `ir/entregas-epp` (el dueño es `EntregaEPP.personaId`;
 * la fuga se CERRÓ con el alcance por filas de la factory: el residente lee solo
 * las entregas de su persona y la ajena responde 404), `ge/solicitudes` (dueño
 * `unidadId`/`solicitantePersonaId`: la colección y el detalle se cerraron igual,
 * y el POST lleva su propia guardia de escritura —`rechazoDeSolicitudAjena`—
 * porque un alta no se puede validar con un `where`), `ir/solicitudes-insumo` (el
 * modelo NO tiene `unidadId`: el dueño real de la fila es `solicitantePersonaId`,
 * y el residente ya no ve la solicitud de otra persona), `pe/bitacora-visitas`
 * (dueño `unidadId`/`destinoPersonaId`, pero NINGÚN rol con alcance de unidad
 * entra a la ruta: límite documentado) y `cv/avisos` (el modelo no tiene dueño
 * por fila: el visor es de la comunidad y `creadoPorPersonaId` es quién lo creó,
 * no a quién pertenece).
 * Recursos del quinto lote: `pe/cierres-turno` (el dueño es
 * `CierreTurnoPE.trabajadorPersonaId`: la conserjería leía y editaba el cierre de
 * OTRO trabajador porque la ruta sólo filtraba la comunidad; cerrado con
 * `alcanceCierresTurnoPE`, que ahora declaran el detalle y la COLECCIÓN —sin él
 * la lista traía las novedades de todos los turnos del edificio—), `ra/reservas` (el dueño es
 * `ReservaRA.solicitantePersonaId`: el residente leía la reserva de otra unidad
 * con su folio, su tramo y sus montos; cerrado con `alcanceReservasRA`) y
 * `pe/mantenciones`, `pe/proyecciones` y `leads-portal`, que quedan EXENTOS en el
 * inventario porque el modelo NO tiene dueño por fila —`MantencionPreventivaPE`,
 * `ProyeccionPE` y `LeadPortal` sólo tienen `comunidadId`— y el caso fija ese
 * hecho leyendo la fila real, no la suposición del mapa de T1.
 * `ra/reservas/[id]/cancelar` es límite documentado: la acción exige `editar` en
 * `ra`, que la matriz sólo da a administración, así que ningún rol acotado la
 * alcanza y no hay regla por fila que ejercitar.
 * Bloque T16: un rol ACOTADO sin identidad MP (conserjería en los dos recursos
 * de `ir`, residente en `ge`) falla CERRADO —colección vacía, detalle 404 y PUT
 * 404 con la fila intacta— porque sin `personaId` no hay «lo propio» que
 * comparar; la gestión sin identidad (administrador con `personaId` null) sigue
 * viendo la comunidad entera, que es lo que fijan los controles de arriba.
 * Bloque T18: la COLECCIÓN de `ra/reservas` es el calendario y NO se acota por
 * fila —el residente necesita ver los tramos ocupados—, pero sí se redacta: de
 * la fila ajena se conserva la ocupación (`folio`, `elementoId`, `fecha`,
 * `horaInicio`, `horaFin`, `estado`) y viajan en `null` la identidad, la unidad,
 * los montos, la penalización, la garantía retenida y el cargo FI
 * (`proyectarReservaRA` sobre `CrudConfig.proyeccion` de la factory). El
 * `total` no se redacta y la gestión recibe la fila completa.
 * Bloque T17 (el ALTA, que el alcance no puede validar porque la fila no existe):
 * `pe/cierres-turno` queda CERRADO —la conserjería creaba un cierre a nombre de
 * otro trabajador (201) y podía regalar el propio por PUT (200); ahora
 * `rechazoDeCierreTurnoAjeno`, sobre el helper compartido
 * `lib/api/propiedad-de-alta.ts`, responde 404 antes de escribir—; `ir/entregas-epp`
 * e `ir/solicitudes-insumo` quedan VERIFICADOS como alta operativa (el residente no
 * tiene `ir:mantenimiento` crear, el 403 es por CLAVE y no hay hueco que cerrar);
 * `ra/reservas` y `pe/turnos/iniciar` quedan CERRADOS sobre el mismo helper: el alta
 * ajena responde 404 antes de escribir, sin fila y sin el efecto colateral que la
 * hacía daño —ni el cargo `reserva_ra` al Fondo de Amenities de la unidad ajena
 * (`ra/reservas`, releído del libro FI) ni el evento `PE_START_SHIFT` a nombre de un
 * tercero (`pe/turnos/iniciar`, contado en la bitácora)—. Sus fixtures
 * (`test/api/fase4-ra.test.ts` y `test/api/pe-transiciones.test.ts`) recibieron la
 * identidad MP que la sesión acotada necesitaba para ejercitar el camino real: la
 * misma actualización de fixture que T15, sin debilitar ningún caso.
 * Bloque T7 (`fi/avisos-cobro`, F27): el dueño de la fila es la UNIDAD. El
 * residente lee con `fi:aviso:propio` ver SOLO los avisos de las unidades donde
 * tiene vínculo vigente —colección con el `total` acotado, detalle 200 para el
 * propio y 404 genérico para el ajeno— y `GET /api/avisos-cobro/[id]/pdf` sirve
 * el documento compilado del builder existente con el mismo alcance. La
 * administración sigue viendo la comunidad entera: los dos avisos del arnés
 * existen y los lee, así el 404 del residente es alcance y no ausencia.
 * Bloque T10 (`liquidaciones/[id]/pdf`): la cara visible de `pl:propia` tiene su
 * descarga. `GET /api/liquidaciones/[id]/pdf` sirve el papel que arma
 * `documentoLiquidacionPDF` sobre la fila guardada —sin recalcular ninguna
 * cifra— con el MISMO `where` que el detalle (`app/api/liquidaciones/_alcance.ts`):
 * la propia 200 con `application/pdf` y el nombre `liquidacion-<periodo>-<folio>.pdf`,
 * la de otro trabajador y la de otra comunidad 404 genérico, y la administración
 * sigue bajando cualquiera de su comunidad.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { configuracionDefault } from "@/data/admin/configuracion"
import { cookieDeUsuario, cuerpoJson, invocarApi } from "../helpers/api-sesion"

const state = vi.hoisted(() => ({ cookie: "" }))
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(
      new Headers(
        state.cookie
          ? { cookie: state.cookie, "x-forwarded-proto": "http" }
          : { "x-forwarded-proto": "http" }
      )
    ),
}))

// ── Arnes: dos comunidades, dos unidades y una persona por unidad ────────────
const COM_A = "ppo-com-a"
const COM_B = "ppo-com-b"

const U_A1 = "ppo-u-a1"
const U_A2 = "ppo-u-a2"
const U_B1 = "ppo-u-b1"
const U_B2 = "ppo-u-b2"

const P_A1 = "ppo-p-a1"
const P_A2 = "ppo-p-a2"
const P_B1 = "ppo-p-b1"
const P_B2 = "ppo-p-b2"

const EMAIL = {
  adminA: "ppo-admin-a@test.cl",
  resA1: "ppo-res-a1@test.cl",
  resA2: "ppo-res-a2@test.cl",
  resB1: "ppo-res-b1@test.cl",
  conserjeA: "ppo-conserje-a@test.cl",
  trabajadorA: "ppo-trabajador-a@test.cl",
  resSinId: "ppo-res-sin-id@test.cl",
}

// Notificaciones de la comunidad A.
const NOTI_A1 = "ppo-noti-a1" // puntual a A-1
const NOTI_A2 = "ppo-noti-a2" // puntual a A-2 (otra unidad)
const NOTI_DIFUSION_ROL = "ppo-noti-difusion-rol" // difusión al rol sin unidad
const NOTI_DIFUSION_U_A2 = "ppo-noti-difusion-ua2" // difusión al rol, unidad de A-2

// Envíos CO de la comunidad A.
const ENV_COMPARTIDO = "ppo-env-compartido" // destinatarios: A-1 y A-2
const ENV_SOLO_A2 = "ppo-env-solo-a2" // destinatario: solo A-2

// Controles de propiedad (AD): uno por unidad de la comunidad A.
const CONTROL_A1 = "ppo-ctrl-a1" // unidad A-1
const CONTROL_A2 = "ppo-ctrl-a2" // unidad A-2 (otra unidad)

// Buzón CO de la comunidad A: el reportante es la pertenencia.
const MSG_A1 = "ppo-msg-a1" // reportado por A-1
const MSG_A2 = "ppo-msg-a2" // reportado por A-2

// Liquidaciones PL: la pertenencia es `trabajadorPersonaId`. Dos trabajadores en
// la comunidad A (para distinguir «la mía» de «otra persona de mi comunidad») y
// una en la comunidad B (para el 404 cross-comunidad).
const LIQ_A = "ppo-liq-a" // comunidad A, trabajador A-1
const LIQ_A2 = "ppo-liq-a2" // comunidad A, trabajador A-2 (misma comunidad, otro trabajador)
const LIQ_B = "ppo-liq-b" // comunidad B, trabajador B-1

// Certificados CT (lote 3): el dueño es `unidadId`/`personaId`. Uno por unidad de
// la comunidad A (para comparar propio contra ajeno) y uno de la comunidad B (para
// el 404 cross-comunidad que la factory sí implementa).
const CERT_A1 = "ppo-cert-a1" // unidad A-1, persona A-1
const CERT_A2 = "ppo-cert-a2" // unidad A-2, persona A-2 (otra unidad)
const CERT_B1 = "ppo-cert-b1" // comunidad B
// Certificado SIN unidad: el dueño es solo `personaId` (caso `liquidacion_sueldo`
// y cualquier documento emitido a una persona). Fija que «lo propio» no es solo
// la unidad: la persona vinculada al usuario también acota.
const CERT_PERSONA_A1 = "ppo-cert-persona-a1" // persona A-1, sin unidad
// Cobro pendiente de la unidad A-2: es el dato que el gate de «al día» imprimía
// en el mensaje de rechazo, así que un residente que emitía para la unidad ajena
// leía su deuda sin tener vínculo con ella.
const COBRO_DEUDA_A2 = "ppo-cobro-deuda-a2"
const DEUDA_A2 = 543_210

// Infracciones IN (lote 3): el dueño es `unidadId`. Las dos de A quedan
// `en_revision` porque es el único estado que admite descargos de apelación.
const INFR_A1 = "ppo-infr-a1" // unidad A-1 (propia de la sesión resA1)
const INFR_A2 = "ppo-infr-a2" // unidad A-2 (ajena, misma comunidad)

// Encomiendas PE (lote 3): el dueño es `destinatarioPersonaId`/`unidadId`.
const ENC_A1 = "ppo-enc-a1" // destinatario A-1, unidad A-1
const ENC_A2 = "ppo-enc-a2" // destinatario A-2, unidad A-2
const ENC_B1 = "ppo-enc-b1" // comunidad B

// Entregas de EPP IR (lote 4): el dueño es `personaId` (a quién se le entregó el
// equipo). La talla y el estado distintos hacen visible, en la respuesta, que el
// registro que viaja es el de la otra persona.
const EPP_A1 = "ppo-epp-a1" // persona A-1 (propia de la sesión resA1)
const EPP_A2 = "ppo-epp-a2" // persona A-2 (otra persona de la misma comunidad)
const EPP_B1 = "ppo-epp-b1" // comunidad B (404 cross-comunidad)

// Bitácora de visitas PE (lote 4): el dueño es `unidadId`/`destinoPersonaId`.
// El nombre y el DNI distintos hacen visible el registro de la visita ajena.
const VIS_A1 = "ppo-vis-a1" // visita a la unidad A-1
const VIS_A2 = "ppo-vis-a2" // visita a la unidad A-2
const VIS_B1 = "ppo-vis-b1" // comunidad B

// Solicitudes GE (lote 4): el dueño es `unidadId` (+ `solicitantePersonaId`).
const SOL_A1 = "ppo-sol-a1" // unidad A-1, solicitante A-1
const SOL_A2 = "ppo-sol-a2" // unidad A-2, solicitante A-2 (otra unidad)
const SOL_B1 = "ppo-sol-b1" // comunidad B

// Solicitudes de insumo IR (lote 4): el modelo NO tiene `unidadId` — el dueño de
// la fila es `solicitantePersonaId` (ver el `describe` del recurso).
const INSU_A1 = "ppo-insu-a1" // solicitante A-1
const INSU_A2 = "ppo-insu-a2" // solicitante A-2 (otra persona de la comunidad)
const INSU_B1 = "ppo-insu-b1" // comunidad B

// Avisos CV (lote 4): el modelo no tiene `unidadId`; `creadoPorPersonaId` es quién
// publicó el aviso (gestión), no un dueño por fila.
const AVISO_A1 = "ppo-aviso-a1" // comunidad A
const AVISO_A2 = "ppo-aviso-a2" // comunidad A (segundo aviso, para comparar)
const AVISO_B1 = "ppo-aviso-b1" // comunidad B (cerrado por comunidad)

// Cierres de turno PE (lote 5): el dueño es `trabajadorPersonaId` (la ficha del
// trabajador que cerró el turno). Las novedades distintas hacen visible, en la
// respuesta, que el registro que viaja es el del otro trabajador.
const CIERRE_A1 = "ppo-cierre-a1" // trabajador A-1 (la persona de resA1/trabajadorA)
const CIERRE_A2 = "ppo-cierre-a2" // trabajador A-2 (otra persona de la comunidad)
const CIERRE_B1 = "ppo-cierre-b1" // comunidad B (404 cross-comunidad)

// Reservas RA (lote 5): el dueño es `solicitantePersonaId` (quién reservó). Una por
// solicitante de A, una de B y una más que sólo sirve al control de `cancelar`.
const RES_A1 = "ppo-res-a1" // solicitante A-1, unidad A-1, tramo 10:00–12:00
const RES_A2 = "ppo-res-a2" // solicitante A-2, unidad A-2, tramo 12:00–14:00
const RES_B1 = "ppo-res-b1" // comunidad B
const RES_CANCELABLE = "ppo-res-cancelable" // confirmada: la cancela el administrador (control)
// Reserva AJENA con dinero anidado y referencia al Fondo de Amenities: fija la
// redacción de la COLECCIÓN (T18) sobre los campos que no son escalares.
const RES_A2_CARGO = "ppo-res-a2-cargo" // solicitante A-2, cancelada con penalización
const MOTIVO_CANCELACION_A2 = "Cancelación tardía de la unidad ajena"
const MOTIVO_RETENCION_A2 = "Daño en el quincho de la unidad ajena"

// Recursos SIN dueño por fila (lote 5): sirven para fijar que la exención del
// inventario sale del modelo, no del mapa de T1 (que los marcaba «nv» con dueño).
const MANT_A1 = "ppo-mant-a1" // comunidad A
const MANT_B1 = "ppo-mant-b1" // comunidad B
const PROY_A1 = "ppo-proy-a1" // comunidad A
const PROY_B1 = "ppo-proy-b1" // comunidad B
const LEAD_A1 = "ppo-lead-a1" // comunidad A
const LEAD_B1 = "ppo-lead-b1" // comunidad B

// Avisos de cobro FI (F27 · T7): el dueño de la fila es la UNIDAD (`unidadId`).
// Uno por unidad de A (para comparar el propio contra el ajeno) y uno de B (la
// comunidad ya la cerraba la factory). El período es el mismo en los tres: lo que
// distingue la fila es la unidad, no el período.
const AVCOB_A1 = "ppo-avcob-a1" // unidad A-1 (propia de la sesión resA1)
const AVCOB_A2 = "ppo-avcob-a2" // unidad A-2 (ajena, misma comunidad)
const AVCOB_B1 = "ppo-avcob-b1" // comunidad B (404 cross-comunidad)
/** Configuración global de A: sin ella el papel no se puede armar (409). */
const CF_A = "ppo-cf-a"
const PERIODO_AVISO = "2026-10"

// Fixtures del ALTA (T17): el POST de `ra/reservas` carga el elemento reservable, el
// de `pe/turnos/iniciar` valida la jornada contra el maestro y las dos rutas de turno
// exigen la ficha laboral de PE (`leerDatosLaborales`). Sin estos tres datos el alta
// con dueño ajeno no se puede observar: la ruta responde 400/404 ANTES de escribir y
// el hueco quedaría invisible.
const ELEMENTO_QUINCHO = "ppo-elemento-quincho" // el mismo id que usan las reservas del arnés
const JORNADA_MANANA = "ppo-jornada-manana"
// Elemento CON tarifa y fondo de amenities ACTIVO: sin ellos el alta ajena "se cierra"
// sin haber probado la parte que importa —el cargo que el vecino terminaría pagando—.
// El cargo vive en el libro FI con `origenRef` = id de la reserva, así que la relectura
// del libro prueba que no quedó deuda registrada.
const ELEMENTO_CON_TARIFA = "ppo-elemento-con-tarifa"
const FONDO_AMENITIES_A = "ppo-fondo-amenities-a"
const TARIFA_CON_TARIFA = 15_000
/** Ficha laboral mínima de PE: lo que `leerDatosLaborales` exige (objeto no vacío). */
const FICHA_LABORAL = { cargo: "Conserje", fechaIngreso: "2025-01-02" }

/** Descargos válidos (mínimo 10 caracteres, `apelar/route.ts:53`). */
const DESCARGO =
  "Los ruidos provenían de la mudanza del vecino del 102, no de mi unidad."

// Vínculos vigentes creados por el arnés (uno por persona/unidad).
const V_A1 = `ppo-v-${P_A1}`
const V_A2 = `ppo-v-${P_A2}`
const V_B1 = `ppo-v-${P_B1}`

type Envelope<T> = { data: T[]; page: number; pageSize: number; total: number }

async function conSesion<T>(email: string, fn: () => Promise<T>): Promise<T> {
  state.cookie = await cookieDeUsuario(email)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

/**
 * Cierre de turno PE válido para el POST de la colección (T17).
 *
 * La jornada es la del maestro (`JORNADA_MANANA`) y la fecha por defecto no choca con
 * los cierres del arnés (`2026-11-05`), así que una alta rechazada por ALCANCE no se
 * puede confundir con un 409 de INV-02 (un cierre por trabajador, fecha y jornada).
 */
function cierrePE(
  id: string,
  trabajadorPersonaId: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    fecha: "2026-11-07",
    hora: "08:00",
    jornadaReportadaId: JORNADA_MANANA,
    trabajadorPersonaId,
    novedadesGenerales: `Novedades del turno de ${trabajadorPersonaId}`,
    incidencias: { hubo: false },
    checklistInstalaciones: [{ item: "Portón principal", ok: true }],
    checklistEquipamiento: [{ item: "Celular de ronda", ok: true }],
    historialCambios: [{ fecha: "2026-11-07", resumen: "Cierre enviado por el trabajador" }],
    notificadoAAdmin: true,
    ...overrides,
  }
}

const moduloPersonas = () => import("@/app/api/personas/route")
const moduloPersona = () => import("@/app/api/personas/[id]/route")
const moduloNotificaciones = () => import("@/app/api/notificaciones/route")
const moduloNotificacion = () => import("@/app/api/notificaciones/[id]/route")
const moduloNotificacionLeer = () => import("@/app/api/notificaciones/[id]/leer/route")
const moduloEnvio = () => import("@/app/api/co/envios/[id]/route")
const moduloEnvioLecturas = () => import("@/app/api/co/envios/[id]/lecturas/route")
const moduloControlesPropiedad = () => import("@/app/api/controles-propiedad/route")
const moduloControlPropiedad = () => import("@/app/api/controles-propiedad/[id]/route")
const moduloCanalesCobranza = () => import("@/app/api/cobros-fi/canales/route")
const moduloMensajesBuzon = () => import("@/app/api/co/mensajes-buzon/route")
const moduloMensajeBuzon = () => import("@/app/api/co/mensajes-buzon/[id]/route")
const moduloVinculo = () => import("@/app/api/vinculos/[id]/route")
const moduloLiquidaciones = () => import("@/app/api/liquidaciones/route")
const moduloLiquidacion = () => import("@/app/api/liquidaciones/[id]/route")
const moduloLiquidacionPdf = () => import("@/app/api/liquidaciones/[id]/pdf/route")
const moduloCertificadosCT = () => import("@/app/api/certificados-ct/route")
const moduloCertificadoCT = () => import("@/app/api/certificados-ct/[id]/route")
const moduloInfracciones = () => import("@/app/api/in/infracciones/route")
const moduloInfraccion = () => import("@/app/api/in/infracciones/[id]/route")
const moduloApelarInfraccion = () => import("@/app/api/in/infracciones/[id]/apelar/route")
const moduloEncomiendas = () => import("@/app/api/pe/encomiendas/route")
const moduloEncomienda = () => import("@/app/api/pe/encomiendas/[id]/route")
const moduloEntregasEPP = () => import("@/app/api/ir/entregas-epp/route")
const moduloEntregaEPP = () => import("@/app/api/ir/entregas-epp/[id]/route")
const moduloBitacoraVisitas = () => import("@/app/api/pe/bitacora-visitas/route")
const moduloBitacoraVisita = () => import("@/app/api/pe/bitacora-visitas/[id]/route")
const moduloSolicitudesGE = () => import("@/app/api/ge/solicitudes/route")
const moduloSolicitudGE = () => import("@/app/api/ge/solicitudes/[id]/route")
const moduloSolicitudesInsumo = () => import("@/app/api/ir/solicitudes-insumo/route")
const moduloSolicitudInsumo = () => import("@/app/api/ir/solicitudes-insumo/[id]/route")
const moduloAvisosCV = () => import("@/app/api/cv/avisos/route")
const moduloAvisoCV = () => import("@/app/api/cv/avisos/[id]/route")
const moduloCierresTurno = () => import("@/app/api/pe/cierres-turno/route")
const moduloCierreTurno = () => import("@/app/api/pe/cierres-turno/[id]/route")
const moduloReservasRA = () => import("@/app/api/ra/reservas/route")
const moduloIniciarTurnoPE = () => import("@/app/api/pe/turnos/iniciar/route")
const moduloReservaRA = () => import("@/app/api/ra/reservas/[id]/route")
const moduloCancelarReservaRA = () => import("@/app/api/ra/reservas/[id]/cancelar/route")
const moduloMantencionPE = () => import("@/app/api/pe/mantenciones/[id]/route")
const moduloProyeccionPE = () => import("@/app/api/pe/proyecciones/[id]/route")
const moduloLeadPortal = () => import("@/app/api/leads-portal/[id]/route")
const moduloAvisosCobro = () => import("@/app/api/avisos-cobro/route")
const moduloAvisoCobro = () => import("@/app/api/avisos-cobro/[id]/route")
const moduloAvisoCobroPdf = () => import("@/app/api/avisos-cobro/[id]/pdf/route")

async function limpiar(): Promise<void> {
  await prisma.cierreTurnoPE.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.reservaRA.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.elementoRA.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.jornada.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.mantencionPreventivaPE.deleteMany({
    where: { comunidadId: { in: [COM_A, COM_B] } },
  })
  await prisma.proyeccionPE.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.leadPortal.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.entregaEPP.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.bitacoraVisitaPE.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.solicitudGE.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.solicitudInsumoIR.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.avisoCV.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.avisoCobro.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.configuracionGlobal.deleteMany({
    where: { comunidadId: { in: [COM_A, COM_B] } },
  })
  await prisma.certificadoCT.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.fondoFI.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.infraccionIN.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.encomiendaPE.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.controlPropiedadArchivada.deleteMany({
    where: { comunidadId: { in: [COM_A, COM_B] } },
  })
  await prisma.controlPropiedad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.mensajeBuzonCO.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.liquidacionPL.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.preferenciaCanalCobranzaFI.deleteMany({
    where: { comunidadId: { in: [COM_A, COM_B] } },
  })
  await prisma.envioCO.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.notificacion.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
  await prisma.unidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
}

beforeAll(async () => {
  for (const [id, nombre, slug] of [
    [COM_A, "Comunidad Permisos Por Objeto A", "ppo-a"],
    [COM_B, "Comunidad Permisos Por Objeto B", "ppo-b"],
  ] as const) {
    await prisma.comunidad.upsert({ where: { id }, update: {}, create: { id, nombre, slug } })
  }
  await limpiar()

  // Unidades: no tienen FK a los catálogos (micro-sector/tipo/estado son ids sueltos).
  for (const [id, comunidadId, numero, prorrateo] of [
    [U_A1, COM_A, "101", 0.3],
    [U_A2, COM_A, "102", 0.2],
    [U_B1, COM_B, "201", 0.4],
    [U_B2, COM_B, "202", 0.1],
  ] as const) {
    await prisma.unidad.create({
      data: {
        id,
        comunidadId,
        microSectorId: `ppo-ms-${comunidadId}`,
        numero,
        etiqueta: `Depto ${numero}`,
        tipoUnidadId: `ppo-tu-${comunidadId}`,
        metraje: 55,
        prorrateo,
        rolSii: `7000-${numero}`,
        estadoId: `ppo-est-${comunidadId}`,
        servicios: {},
      },
    })
  }

  // Una persona por unidad, y cada una con su vínculo vigente (fechaFin null). Las dos
  // personas de A llevan ficha laboral de PE: son las trabajadoras del arnés y sin ella
  // `pe/turnos/iniciar` responde 400 antes de escribir (T17).
  for (const [id, comunidadId, unidadId, nombre, rut, datosLaborales] of [
    [P_A1, COM_A, U_A1, "Ana Auno", "70000001-1", FICHA_LABORAL],
    [P_A2, COM_A, U_A2, "Beto Ados", "70000002-2", FICHA_LABORAL],
    [P_B1, COM_B, U_B1, "Caro Buno", "70000003-3", null],
    [P_B2, COM_B, U_B2, "Dani Bdos", "70000004-4", null],
  ] as const) {
    const [nombres, apellidos] = nombre.split(" ") as [string, string]
    await prisma.persona.create({
      data: {
        id,
        comunidadId,
        rut,
        nombreCompleto: nombre,
        nombres,
        apellidos,
        email: `${id}@ppo.test.cl`,
        telefonoMovil: "+56911111111",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["propietario"],
        ...(datosLaborales ? { datosLaborales } : {}),
      },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: `ppo-v-${id}`,
        comunidadId,
        personaId: id,
        unidadId,
        rol: "propietario",
        fechaInicio: "2026-01-01",
        fechaFin: null,
        permiteVerFinanzas: true,
      },
    })
  }

  // Sesiones: el rol sale de la membresía, la identidad MP de `Usuario.personaId`.
  for (const u of [
    { email: EMAIL.adminA, comunidadId: COM_A, rol: "administrador", personaId: null },
    { email: EMAIL.resA1, comunidadId: COM_A, rol: "residente", personaId: P_A1 },
    { email: EMAIL.resA2, comunidadId: COM_A, rol: "residente", personaId: P_A2 },
    { email: EMAIL.resB1, comunidadId: COM_B, rol: "residente", personaId: P_B1 },
    // Conserjería sin ficha MP: tiene `pl:propia` ver pero ninguna identidad que
    // pueda ser dueña de una liquidación, así que no hay fila que devolver.
    { email: EMAIL.conserjeA, comunidadId: COM_A, rol: "conserjeria", personaId: null },
    // El trabajador (rol conserjería) con su identidad MP: es el dueño de LIQ_A.
    { email: EMAIL.trabajadorA, comunidadId: COM_A, rol: "conserjeria", personaId: P_A1 },
    // Residente sin ficha MP: tiene `ge` ver (lib/authz.ts:262) pero ninguna
    // identidad que pueda poseer una fila. Es la única sesión acotada que llega a
    // `ge/solicitudes` sin `personaId`, así que es la que prueba que el rol
    // acotado sin identidad NO cae en «ve todo» (bloque T16).
    { email: EMAIL.resSinId, comunidadId: COM_A, rol: "residente", personaId: null },
  ]) {
    const usuario = await prisma.usuario.upsert({
      where: { email: u.email },
      update: { personaId: u.personaId },
      create: { email: u.email, personaId: u.personaId, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, comunidadId: u.comunidadId, rol: u.rol },
    })
  }

  const notificacion = (id: string, overrides: Record<string, unknown>) => ({
    id,
    comunidadId: COM_A,
    destinatarioRol: "residente",
    asunto: "Aviso de la comunidad",
    cuerpo: "Contenido del aviso.",
    moduloOrigen: "MP",
    fecha: "2026-11-05",
    ...overrides,
  })
  await prisma.notificacion.createMany({
    data: [
      notificacion(NOTI_A1, { destinatarioPersonaId: P_A1, unidadId: U_A1 }),
      notificacion(NOTI_A2, { destinatarioPersonaId: P_A2, unidadId: U_A2 }),
      notificacion(NOTI_DIFUSION_ROL, { destinatarioPersonaId: null, unidadId: null }),
      notificacion(NOTI_DIFUSION_U_A2, { destinatarioPersonaId: null, unidadId: U_A2 }),
    ],
  })

  // Envíos CO: la pertenencia vive en `EnvioDestinatarioCO` (la tabla es la
  // fuente de verdad, `proyeccion-envio.ts:20-23`), no en el JSON `destinatarios`.
  await prisma.envioCO.createMany({
    data: [
      {
        id: ENV_COMPARTIDO,
        comunidadId: COM_A,
        asunto: "Citación asamblea",
        cuerpo: "Se cita a asamblea el 05-11-2026.",
        fechaEnvio: "2026-11-05",
        destinatarios: [
          { personaId: P_A1, unidadId: U_A1 },
          { personaId: P_A2, unidadId: U_A2 },
        ],
        lecturas: [],
      },
      {
        id: ENV_SOLO_A2,
        comunidadId: COM_A,
        asunto: "Comunicación a la unidad 102",
        cuerpo: "Mensaje solo para la unidad de A-2.",
        fechaEnvio: "2026-11-05",
        destinatarios: [{ personaId: P_A2, unidadId: U_A2 }],
        lecturas: [],
      },
    ],
  })
  await prisma.envioDestinatarioCO.createMany({
    data: [
      { id: "ppo-ed-a1", envioId: ENV_COMPARTIDO, personaId: P_A1, unidadId: U_A1 },
      { id: "ppo-ed-a2", envioId: ENV_COMPARTIDO, personaId: P_A2, unidadId: U_A2 },
      { id: "ppo-ed-a2-solo", envioId: ENV_SOLO_A2, personaId: P_A2, unidadId: U_A2 },
    ],
  })

  // Controles de propiedad: una fila por unidad, con flags distintos para que
  // «la fila ajena queda intacta» se pueda comparar de verdad.
  await prisma.controlPropiedad.createMany({
    data: [
      {
        id: CONTROL_A1,
        comunidadId: COM_A,
        unidadId: U_A1,
        residenteVeMorosidad: false,
        residenteVeActas: true,
        alertasResidentesActivas: true,
        estado: "vigente",
      },
      {
        id: CONTROL_A2,
        comunidadId: COM_A,
        unidadId: U_A2,
        residenteVeMorosidad: true,
        residenteVeActas: false,
        alertasResidentesActivas: false,
        estado: "vigente",
      },
    ],
  })

  // Preferencia de canal de cobranza: una fila por persona, con valores opuestos
  // (un `update` ajeno se vería en la relectura).
  await prisma.preferenciaCanalCobranzaFI.createMany({
    data: [
      { id: "ppo-pref-a1", comunidadId: COM_A, personaId: P_A1, canalVisor: true, canalEmail: false },
      { id: "ppo-pref-a2", comunidadId: COM_A, personaId: P_A2, canalVisor: false, canalEmail: true },
    ],
  })

  // Buzón CO: el reportante es la pertenencia de la fila.
  for (const [id, reportantePersonaId, nombre] of [
    [MSG_A1, P_A1, "Ana Auno"],
    [MSG_A2, P_A2, "Beto Ados"],
  ] as const) {
    await prisma.mensajeBuzonCO.create({
      data: {
        id,
        comunidadId: COM_A,
        folio: `BZ-${id}`,
        clasificacion: "reclamo",
        reportantePersonaId,
        reportanteNombre: nombre,
        asunto: `Asunto ${id}`,
        cuerpo: `Cuerpo ${id}`,
        visibilidadComite: true,
        fechaIngreso: "2026-11-05",
        estado: "recibido",
        respuestas: [],
      },
    })
  }

  // Liquidaciones PL: los totales no importan acá — la prueba es de alcance, no
  // de cálculo — pero la fila exige todos los campos.
  const liquidacion = (
    id: string,
    comunidadId: string,
    trabajadorPersonaId: string,
    folio: string,
    liquido = 650000
  ) => ({
    id,
    comunidadId,
    folio,
    trabajadorPersonaId,
    periodo: "2026-10",
    fechaGeneracion: "2026-10-30",
    diasTrabajados: 30,
    sueldoBaseContrato: 650000,
    diasMesComercial: 30,
    jornadaSemanal: 44,
    sueldoBaseProporcional: liquido,
    horasExtrasHoras: 0,
    valorHoraOrdinaria: 0,
    montoHorasExtras: 0,
    bonos: [],
    gratificacionLegal: 0,
    totalImponible: liquido,
    asignacionMovilizacion: 0,
    asignacionColacion: 0,
    cargas: 0,
    montoAsignacionFamiliar: 0,
    totalHaberes: liquido,
    nombreAfp: "AFP Habitat",
    tasaAFP: 10.58,
    montoAFP: 0,
    nombreSalud: "FONASA",
    saludTipo: "fonasa",
    montoSalud: 0,
    tasaSIS: 1.48,
    montoSIS: 0,
    montoSeguroCesantia: 0,
    montoAPV: 0,
    totalDescuentos: 0,
    descuentoAnticipos: 0,
    adelantosIds: [],
    alcanceLiquido: liquido,
    liquidoAPagar: liquido,
    estado: "borrador",
    egresoFIReferencia: "pendiente",
  })
  for (const fila of [
    liquidacion(LIQ_A, COM_A, P_A1, "LIQ-0001"),
    // Otro trabajador, misma comunidad: el líquido distinto hace visible que el
    // alcance del trabajador no trae montos ajenos.
    liquidacion(LIQ_A2, COM_A, P_A2, "LIQ-0003", 910000),
    liquidacion(LIQ_B, COM_B, P_B1, "LIQ-0002"),
  ]) {
    await prisma.liquidacionPL.create({ data: fila as never })
  }

  // Certificados CT: el `resumen` y el `folio` distintos hacen visible, en la
  // relectura, que el documento que viaja es el de la otra unidad.
  await prisma.certificadoCT.createMany({
    data: [
      {
        id: CERT_A1,
        comunidadId: COM_A,
        folio: "CT-0001",
        codigoVerificacion: "VC-AAA111",
        tipo: "residencia",
        unidadId: U_A1,
        personaId: P_A1,
        solicitanteNombre: "Ana Auno",
        resumen: "Certificado de residencia de la unidad 101.",
        detalle: [{ clave: "Unidad", valor: "101" }],
        fechaEmision: "2026-11-06",
      },
      {
        id: CERT_A2,
        comunidadId: COM_A,
        folio: "CT-0002",
        codigoVerificacion: "VC-BBB222",
        tipo: "estado_cuenta",
        unidadId: U_A2,
        personaId: P_A2,
        solicitanteNombre: "Beto Ados",
        resumen: "Estado de cuenta de la unidad 102.",
        detalle: [{ clave: "Unidad", valor: "102" }],
        fechaEmision: "2026-11-06",
      },
      {
        id: CERT_B1,
        comunidadId: COM_B,
        folio: "CT-0001",
        codigoVerificacion: "VC-CCC333",
        tipo: "residencia",
        unidadId: U_B1,
        personaId: P_B1,
        solicitanteNombre: "Caro Buno",
        resumen: "Certificado de residencia de la unidad 201.",
        detalle: [{ clave: "Unidad", valor: "201" }],
        fechaEmision: "2026-11-06",
      },
      {
        id: CERT_PERSONA_A1,
        comunidadId: COM_A,
        folio: "CT-0003",
        codigoVerificacion: "VC-DDD444",
        tipo: "liquidacion_sueldo",
        unidadId: null,
        personaId: P_A1,
        solicitanteNombre: "Ana Auno",
        resumen: "Certificado de renta de la persona A-1.",
        detalle: [{ clave: "Persona", valor: "Ana Auno" }],
        fechaEmision: "2026-11-06",
      },
    ],
  })

  // Deuda de la unidad A-2: existe para poder observar (y luego cerrar) que el
  // gate de «al día» imprimía el saldo de una unidad ajena en el rechazo.
  await prisma.cobroFI.create({
    data: {
      id: COBRO_DEUDA_A2,
      comunidadId: COM_A,
      unidadId: U_A2,
      periodo: "2026-10",
      concepto: "gasto_comun",
      origenModulo: "manual",
      fondoId: "ppo-fondo-gc",
      descripcion: "GC pendiente de la unidad 102 (arnés de permisos por objeto).",
      montoBase: DEUDA_A2,
      fechaCargo: "2026-10-01",
      fechaVencimiento: "2026-10-31",
      moras: [],
      pagos: [],
      diferencias: [],
    },
  })

  // Infracciones IN: `en_revision` es el estado que admite descargos, así que la
  // apelación se puede probar sin fabricar transiciones previas.
  const infraccion = (id: string, comunidadId: string, unidadId: string, folio: string) => ({
    id,
    comunidadId,
    folio,
    unidadId,
    fechaSuceso: "2026-11-04",
    horaSuceso: "22:15",
    antecedentes:
      "Ruido excesivo después del horario de descanso fijado en el reglamento.",
    evidencias: [],
    estado: "en_revision",
    fechaRegistro: "2026-11-05",
    comentariosDirectiva: [],
    respaldosDirectiva: [],
  })
  await prisma.infraccionIN.createMany({
    data: [
      infraccion(INFR_A1, COM_A, U_A1, "IN-0001"),
      infraccion(INFR_A2, COM_A, U_A2, "IN-0002"),
    ],
  })

  // Encomiendas PE: una por unidad de A y una de B (404 cross-comunidad).
  await prisma.encomiendaPE.createMany({
    data: [
      {
        id: ENC_A1,
        comunidadId: COM_A,
        courierId: "ppo-courier",
        destinatarioPersonaId: P_A1,
        unidadId: U_A1,
        descripcionPaquete: "Caja mediana sellada.",
        fechaRecepcion: "2026-11-05",
        estado: "recibida",
      },
      {
        id: ENC_A2,
        comunidadId: COM_A,
        courierId: "ppo-courier",
        destinatarioPersonaId: P_A2,
        unidadId: U_A2,
        descripcionPaquete: "Sobre certificado.",
        fechaRecepcion: "2026-11-05",
        estado: "recibida",
      },
      {
        id: ENC_B1,
        comunidadId: COM_B,
        courierId: "ppo-courier",
        destinatarioPersonaId: P_B1,
        unidadId: U_B1,
        descripcionPaquete: "Bolsa de supermercado.",
        fechaRecepcion: "2026-11-05",
        estado: "recibida",
      },
    ],
  })

  // Entregas de EPP IR (lote 4): una por persona en A (para comparar propio contra
  // ajeno) y una en B (404 cross-comunidad, que la factory sí implementa).
  await prisma.entregaEPP.createMany({
    data: [
      {
        id: EPP_A1,
        comunidadId: COM_A,
        recursoId: "ppo-rec-casco",
        personaId: P_A1,
        fechaEntrega: "2026-11-04",
        talla: "M",
        estado: "nuevo",
      },
      {
        id: EPP_A2,
        comunidadId: COM_A,
        recursoId: "ppo-rec-guantes",
        personaId: P_A2,
        fechaEntrega: "2026-11-04",
        talla: "L",
        estado: "renovar",
        proximaRenovacion: "2026-12-04",
      },
      {
        id: EPP_B1,
        comunidadId: COM_B,
        recursoId: "ppo-rec-casco",
        personaId: P_B1,
        fechaEntrega: "2026-11-04",
        talla: "S",
        estado: "nuevo",
      },
    ],
  })

  // Bitácora de visitas PE (lote 4): una por unidad de A y una de B. `jornadaId` es
  // un id suelto (sin FK); nombre y DNI distintos identifican la visita ajena.
  await prisma.bitacoraVisitaPE.createMany({
    data: [
      {
        id: VIS_A1,
        comunidadId: COM_A,
        fecha: "2026-11-05",
        nombre: "Visita de la unidad 101",
        dni: "71000001-1",
        unidadId: U_A1,
        destinoPersonaId: P_A1,
        jornadaId: "ppo-jornada-a",
        origenAgenda: "pre_agendada",
        estado: "agendada",
      },
      {
        id: VIS_A2,
        comunidadId: COM_A,
        fecha: "2026-11-05",
        nombre: "Visita de la unidad 102",
        dni: "71000002-2",
        unidadId: U_A2,
        destinoPersonaId: P_A2,
        jornadaId: "ppo-jornada-a",
        origenAgenda: "sin_aviso",
        estado: "agendada",
      },
      {
        id: VIS_B1,
        comunidadId: COM_B,
        fecha: "2026-11-05",
        nombre: "Visita de la comunidad B",
        dni: "71000003-3",
        unidadId: U_B1,
        destinoPersonaId: P_B1,
        jornadaId: "ppo-jornada-b",
        origenAgenda: "pre_agendada",
        estado: "agendada",
      },
    ],
  })

  // Solicitudes GE (lote 4): una por unidad en A y una en B. Título y descripción
  // distintos hacen visible, en la respuesta, la solicitud de la unidad vecina.
  await prisma.solicitudGE.createMany({
    data: [
      {
        id: SOL_A1,
        comunidadId: COM_A,
        folio: "GE-0001",
        tipo: "buzon",
        titulo: "Filtración del baño de la unidad 101",
        descripcion: "El baño principal filtra hacia el departamento de abajo.",
        solicitantePersonaId: P_A1,
        unidadId: U_A1,
        estado: "nuevo",
        fechaCreacion: "2026-11-05",
        comentarios: [],
        historialEstados: [],
      },
      {
        id: SOL_A2,
        comunidadId: COM_A,
        folio: "GE-0002",
        tipo: "buzon",
        titulo: "Ruidos molestos de la unidad 102",
        descripcion: "Ruidos después de las 23:00 en el pasillo del segundo piso.",
        solicitantePersonaId: P_A2,
        unidadId: U_A2,
        estado: "en_revision",
        fechaCreacion: "2026-11-05",
        comentarios: [],
        historialEstados: [],
      },
      {
        id: SOL_B1,
        comunidadId: COM_B,
        folio: "GE-0001",
        tipo: "buzon",
        titulo: "Solicitud de la comunidad B",
        descripcion: "Reclamo de la comunidad B.",
        solicitantePersonaId: P_B1,
        unidadId: U_B1,
        estado: "nuevo",
        fechaCreacion: "2026-11-05",
        comentarios: [],
        historialEstados: [],
      },
    ],
  })

  // Solicitudes de insumo IR (lote 4): el modelo no tiene `unidadId`, así que la
  // pertenencia que se compara es `solicitantePersonaId`.
  await prisma.solicitudInsumoIR.createMany({
    data: [
      {
        id: INSU_A1,
        comunidadId: COM_A,
        folio: "SI-0001",
        solicitantePersonaId: P_A1,
        estadoComodin: "no_comodin",
        cantidad: 2,
        areaDestino: "Pasillo de la unidad 101",
        estado: "pendiente",
        fechaSolicitud: "2026-11-05",
      },
      {
        id: INSU_A2,
        comunidadId: COM_A,
        folio: "SI-0002",
        solicitantePersonaId: P_A2,
        estadoComodin: "no_comodin",
        cantidad: 6,
        areaDestino: "Estacionamiento de la unidad 102",
        estado: "entregada",
        fechaSolicitud: "2026-11-05",
        entregaFecha: "2026-11-06",
      },
      {
        id: INSU_B1,
        comunidadId: COM_B,
        folio: "SI-0001",
        solicitantePersonaId: P_B1,
        estadoComodin: "no_comodin",
        cantidad: 1,
        areaDestino: "Conserjería de B",
        estado: "pendiente",
        fechaSolicitud: "2026-11-05",
      },
    ],
  })

  // Avisos CV (lote 4): el visor es de la comunidad y el modelo no tiene dueño por
  // fila. `expiresAt` en el futuro o nulo evita que la caducidad al leer
  // (`app/api/cv/avisos/route.ts:39`) archive una fila del arnés a mitad de corrida.
  await prisma.avisoCV.createMany({
    data: [
      {
        id: AVISO_A1,
        comunidadId: COM_A,
        titulo: "Corte de agua programado",
        cuerpo: "Se cortará el agua el 07-11-2026 entre 09:00 y 13:00.",
        tipologia: "info",
        duracionSegundos: 10,
        pantallaCompleta: false,
        expiresAt: null,
        tags: ["agua"],
        estado: "publicado",
        requiereVistoBueno: false,
        origen: "manual",
        fechaCreacion: "2026-11-05",
      },
      {
        id: AVISO_A2,
        comunidadId: COM_A,
        titulo: "Fumigación del subterráneo",
        cuerpo: "La fumigación del subterráneo se hará el 08-11-2026 a las 10:00.",
        tipologia: "advertencia",
        duracionSegundos: 15,
        pantallaCompleta: true,
        expiresAt: "2099-12-31",
        tags: [],
        estado: "publicado",
        requiereVistoBueno: false,
        origen: "manual",
        fechaCreacion: "2026-11-05",
      },
      {
        id: AVISO_B1,
        comunidadId: COM_B,
        titulo: "Aviso de la comunidad B",
        cuerpo: "Aviso que sólo existe en la comunidad B.",
        tipologia: "info",
        duracionSegundos: 10,
        pantallaCompleta: false,
        expiresAt: null,
        tags: [],
        estado: "publicado",
        requiereVistoBueno: false,
        origen: "manual",
        fechaCreacion: "2026-11-05",
      },
    ],
  })

  // Cierres de turno PE (lote 5): uno por trabajador de A y uno de B. La fecha y la
  // jornada se repiten a propósito: lo que distingue al dueño es
  // `trabajadorPersonaId` (INV-02: un cierre por trabajador, fecha y jornada).
  const cierre = (id: string, comunidadId: string, trabajadorPersonaId: string) => ({
    id,
    comunidadId,
    fecha: "2026-11-05",
    hora: "08:00",
    jornadaReportadaId: "ppo-jornada-manana",
    trabajadorPersonaId,
    novedadesGenerales: `Novedades del turno de ${trabajadorPersonaId}`,
    incidencias: { hubo: false },
    checklistInstalaciones: [{ item: "Portón principal", ok: true }],
    checklistEquipamiento: [{ item: "Celular de ronda", ok: true }],
    historialCambios: [
      { fecha: "2026-11-05", resumen: "Cierre enviado por el trabajador" },
    ],
    notificadoAAdmin: true,
  })
  await prisma.cierreTurnoPE.createMany({
    data: [
      cierre(CIERRE_A1, COM_A, P_A1),
      cierre(CIERRE_A2, COM_A, P_A2),
      cierre(CIERRE_B1, COM_B, P_B1),
    ] as never,
  })

  // Elemento reservable y jornada del maestro (T17): los exigen los POST de `ra/reservas`
  // y `pe/turnos/iniciar` respectivamente. Tarifa y garantía en 0 para que el alta no
  // materialice un cobro al Fondo de Amenities (la prueba es de propiedad, no de dinero).
  await prisma.elementoRA.create({
    data: {
      id: ELEMENTO_QUINCHO,
      comunidadId: COM_A,
      nombre: "Quincho",
      tipo: "espacio_fisico",
      franja: "bloques_horas",
      duracionBloqueHoras: 2,
      tarifaUso: 0,
      garantiaRequerida: 0,
      stock: 1,
      activo: true,
      requiereAutorizacion: false,
    },
  })
  // El segundo elemento SÍ cobra, y hay fondo de amenities activo donde imputar el cargo:
  // es el escenario en el que una reserva ajena le dejaba la deuda a la unidad del
  // payload (`unidadDeCobro`), que es el daño que T17 cierra (ver el caso del lote 6).
  await prisma.elementoRA.create({
    data: {
      id: ELEMENTO_CON_TARIFA,
      comunidadId: COM_A,
      nombre: "Sala multiuso",
      tipo: "espacio_fisico",
      franja: "bloques_horas",
      duracionBloqueHoras: 2,
      tarifaUso: TARIFA_CON_TARIFA,
      garantiaRequerida: 0,
      stock: 1,
      activo: true,
      requiereAutorizacion: false,
    },
  })
  await prisma.fondoFI.create({
    data: {
      id: FONDO_AMENITIES_A,
      comunidadId: COM_A,
      nombre: "Fondo de Amenities A",
      tipo: "amenities",
      activo: true,
      saldoInicial: 0,
    },
  })
  await prisma.jornada.create({
    data: { id: JORNADA_MANANA, comunidadId: COM_A, nombre: "Jornada mañana" },
  })

  // Reservas RA (lote 5): la pertenencia es `solicitantePersonaId` (quién reservó).
  // El mismo elemento y el mismo día en tramos distintos: el arnés no depende de un
  // `ElementoRA` sembrado (el detalle y el PUT no lo leen).
  const reserva = (
    id: string,
    comunidadId: string,
    solicitantePersonaId: string,
    unidadId: string,
    horaInicio: string,
    horaFin: string,
    extra: Record<string, unknown> = {}
  ) => ({
    id,
    comunidadId,
    folio: `RA-${id}`,
    elementoId: "ppo-elemento-quincho",
    solicitantePersonaId,
    unidadId,
    fecha: "2026-11-12",
    horaInicio,
    horaFin,
    estado: "confirmada",
    montoTarifa: 15000,
    montoGarantia: 5000,
    ...extra,
  })
  await prisma.reservaRA.createMany({
    data: [
      reserva(RES_A1, COM_A, P_A1, U_A1, "10:00", "12:00"),
      reserva(RES_A2, COM_A, P_A2, U_A2, "12:00", "14:00"),
      reserva(RES_B1, COM_B, P_B1, U_B1, "10:00", "12:00"),
      reserva(RES_CANCELABLE, COM_A, P_A1, U_A1, "16:00", "18:00"),
      reserva(RES_A2_CARGO, COM_A, P_A2, U_A2, "18:00", "20:00", {
        estado: "cancelada",
        cancelacion: {
          fecha: "2026-11-10",
          tardia: true,
          penalizacion: 2500,
          motivo: MOTIVO_CANCELACION_A2,
        },
        garantiaRetenida: { monto: 5000, motivo: MOTIVO_RETENCION_A2 },
        cargoFIReferencia: "ppo-cargo-fi-ajeno",
      }),
    ] as never,
  })

  // Recursos sin dueño por fila (lote 5): una fila por comunidad. Ninguno de los
  // tres modelos tiene `unidadId` ni `personaId` (prisma/schema.prisma), que es el
  // hecho que sostiene su exención en el inventario de T5.
  await prisma.mantencionPreventivaPE.createMany({
    data: [
      {
        id: MANT_A1,
        comunidadId: COM_A,
        proveedorId: "ppo-proveedor-ascensores",
        descripcion: "Mantención preventiva del ascensor (comunidad A).",
        periodicidadMeses: 3,
        proximaFecha: "2026-12-01",
        alertaDiasAntes: 7,
        activo: true,
      },
      {
        id: MANT_B1,
        comunidadId: COM_B,
        proveedorId: "ppo-proveedor-ascensores",
        descripcion: "Mantención preventiva del ascensor (comunidad B).",
        periodicidadMeses: 3,
        proximaFecha: "2026-12-01",
        alertaDiasAntes: 7,
        activo: true,
      },
    ],
  })
  await prisma.proyeccionPE.createMany({
    data: [
      {
        id: PROY_A1,
        comunidadId: COM_A,
        mesAnio: "2026-12",
        feriados: [],
        diasFeriados: 0,
        reemplazosNecesarios: 0,
        costoEstimado: 1000000,
        detalleCosto: { personalPlanta: 2, costoParche: 0, costoDiaExtra: 0 },
        enviadoAFI: false,
      },
      {
        id: PROY_B1,
        comunidadId: COM_B,
        mesAnio: "2026-12",
        feriados: [],
        diasFeriados: 0,
        reemplazosNecesarios: 0,
        costoEstimado: 900000,
        detalleCosto: { personalPlanta: 2, costoParche: 0, costoDiaExtra: 0 },
        enviadoAFI: false,
      },
    ],
  })
  await prisma.leadPortal.createMany({
    data: [
      {
        id: LEAD_A1,
        comunidadId: COM_A,
        publicacionId: "ppo-publicacion-a1",
        nombreContacto: "Interesado de la comunidad A",
        contacto: "+56911112222",
        mensaje: "Quisiera visitar el departamento publicado.",
        fecha: "2026-11-05",
        atendido: false,
      },
      {
        id: LEAD_B1,
        comunidadId: COM_B,
        publicacionId: "ppo-publicacion-b1",
        nombreContacto: "Interesado de la comunidad B",
        contacto: "+56933334444",
        mensaje: "Consulta por la publicación de la comunidad B.",
        fecha: "2026-11-05",
        atendido: false,
      },
    ],
  })

  // Avisos de cobro FI (F27 · T7). El contenido es COPIADO de un aviso emitido:
  // la ruta y el PDF leen de acá y no recalculan ninguna cifra. Los folios y
  // códigos son únicos por comunidad porque el modelo los indexa así.
  const contenidoDeAviso = (unidadId: string, numero: string, total: number) => ({
    version: 1,
    periodo: PERIODO_AVISO,
    fechaEmision: "2026-10-05",
    unidad: { id: unidadId, numero, etiqueta: `Depto ${numero}` },
    reglamento: null,
    participacion: {
      prorrateo: 0.3,
      formaContribucion: "prorrateo",
      porcentajeReserva: 10,
      reservaIncluidaEnPresupuesto: false,
    },
    cargos: [
      {
        id: `ppo-cobro-congelado-${unidadId}`,
        concepto: "gasto_comun",
        descripcion: "Gasto común del período congelado",
        montoBase: total,
        fechaCargo: "2026-10-01",
        fechaVencimiento: "2026-10-15",
      },
    ],
    detalle: [
      {
        cobroId: `ppo-cobro-congelado-${unidadId}`,
        concepto: "gasto_comun",
        monto: total,
        fondoId: "ppo-fondo-gc",
        fondoNombre: "Gasto común",
        origen: "linea",
      },
    ],
    montos: {
      gastoComun: total,
      recargoFondoReserva: 0,
      multas: 0,
      intereses: 0,
      otros: [],
      exigible: total,
      pagado: 0,
      totalAdeudado: total,
    },
    resumenComunidad: {
      periodo: PERIODO_AVISO,
      desde: "2026-10-01",
      hasta: "2026-10-31",
      ingresos: { total: 12500000, deCobros: 12000000, manuales: 500000, cantidad: 3, detalle: [] },
      egresos: { total: 9800000, cantidad: 4, detalle: [] },
      saldoCaja: {
        inicial: 5000000,
        ingresosAcumulados: 12500000,
        egresosAcumulados: 9800000,
        alCierre: 7700000,
      },
    },
    noComputables: [],
  })
  for (const [id, comunidadId, unidadId, numero, folio, codigo, total] of [
    [AVCOB_A1, COM_A, U_A1, "101", "AC-7001", "VC-A7001", 47000],
    [AVCOB_A2, COM_A, U_A2, "102", "AC-7002", "VC-A7002", 61000],
    [AVCOB_B1, COM_B, U_B1, "201", "AC-7003", "VC-B7003", 52000],
  ] as const) {
    await prisma.avisoCobro.create({
      data: {
        id,
        comunidadId,
        unidadId,
        periodo: PERIODO_AVISO,
        folio,
        codigoVerificacion: codigo,
        fechaEmision: "2026-10-05",
        vencimiento: "2026-10-15",
        contenido: contenidoDeAviso(unidadId, numero, total),
        totalesComunidad: { periodo: PERIODO_AVISO, saldoCajaAlCierre: 7700000 },
      },
    })
  }
  // La firma queda en `null` a propósito: el PDF del arnés se compila de verdad
  // (bytes pdfmake), y una URL remota haría que la suite dependiera de la red.
  await prisma.configuracionGlobal.create({
    data: {
      ...configuracionDefault,
      id: CF_A,
      comunidadId: COM_A,
      nombreComunidad: "Comunidad Permisos Por Objeto A",
      smtpPassword: "no-se-expone",
      claveEliminacionMaestro: "no-se-expone",
      firmaDigitalizadaUrl: null,
    },
  })
}, 30_000)

afterAll(async () => {
  try {
    state.cookie = ""
    await limpiar()
    const emails = Object.values(EMAIL)
    await prisma.membresia.deleteMany({ where: { usuario: { email: { in: emails } } } })
    await prisma.usuario.deleteMany({ where: { email: { in: emails } } })
    await prisma.comunidad.deleteMany({ where: { id: { in: [COM_A, COM_B] } } })
  } catch {
    // intencional: limpieza best-effort (la base es descartable)
  }
})

describe("personas — propio, otra unidad, otra comunidad (T3)", () => {
  it("control: el administrador de A sí ve las dos fichas de A (y no la de B)", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloPersonas(), "GET", "personas?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // app/api/personas/route.ts:496 — el `where` base de la factory es la comunidad:
      // las dos fichas de A existen y son legibles; lo que las oculta a A-1 es el ABAC.
      expect(new Set(j.data.map((p) => p.id))).toEqual(new Set([P_A1, P_A2]))
    })
  })

  it("residente A-1: la colección devuelve solo su propia ficha", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloPersonas(), "GET", "personas?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // app/api/personas/route.ts:499 — `where.id = personaIdDelUsuario(...)`: sin
      // ese filtro entran las de A-2 y las de B (el `where` base es solo comunidad).
      expect(j.data.map((p) => p.id)).toEqual([P_A1])
      // app/api/personas/route.ts:496 — el alcance de comunidad tampoco alcanza solo.
      expect(j.data.map((p) => p.id)).not.toContain(P_A2)
    })
  })

  it("residente A-1: GET de su propia ficha → 200", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloPersona(), "GET", "personas/[id]", {
        params: { id: P_A1 },
      })
      expect(res.status).toBe(200)
      // app/api/personas/[id]/route.ts:49 — el ABAC deja pasar el id propio (control
      // negativo: sin esto un 403 general pasaría por «protección»).
      expect((await cuerpoJson<{ id: string }>(res)).id).toBe(P_A1)
    })
  })

  it("residente A-1: GET de la ficha de A-2 → 403 y ningún dato de la fila", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloPersona(), "GET", "personas/[id]", {
        params: { id: P_A2 },
      })
      // hallazgo (mapa T1, fila `personas`): app/api/personas/[id]/route.ts:47-51
      // responde 403 —que el mapa documenta como «confirma existencia»— mientras el
      // resto del repo usa 404 (`:57-60`) para no filtrar existencia. Se fija el
      // contrato de HOY; unificar es decisión de contrato, no de este test.
      // El 403 es una comparación pura `id !== personaId` ANTES de leer la fila
      // (`:48`), así que en esta rama el 403 NO distingue existente de inexistente.
      expect(res.status).toBe(403)
      // app/api/personas/[id]/route.ts:50 — el cuerpo es solo el error: ninguna
      // columna de la persona ajena viaja en la respuesta.
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Permiso denegado: solo puedes acceder a tu propia ficha.",
      })
    })
  })

  it("residente A-1: GET de una ficha de otra comunidad → 403 idéntico al de un id inexistente", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const ajeno = await invocarApi(moduloPersona(), "GET", "personas/[id]", {
        params: { id: P_B1 },
      })
      const fantasma = await invocarApi(moduloPersona(), "GET", "personas/[id]", {
        params: { id: "ppo-p-no-existe" },
      })
      // app/api/personas/[id]/route.ts:49 — el ABAC de identidad corta antes del 404
      // cross-comunidad de `:57-60`: para un residente la otra comunidad nunca llega
      // a distinguirse (mapa T1: lectura ajena = 403, sin caso aparte).
      expect(ajeno.status).toBe(403)
      // app/api/personas/[id]/route.ts:47-51 — el 403 sale de comparar el id pedido
      // con el `personaId` de la sesión, sin leer la fila: «existe pero es de otro» y
      // «no existe» son indistinguibles. El «403 confirma existencia» del mapa no se
      // cumple en esta rama (hallazgo, no defecto: no se filtra ningún dato).
      expect(fantasma.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(fantasma)).toEqual(
        await cuerpoJson<{ error: string }>(ajeno)
      )
    })
  })

  it("residente A-1: PUT de su propia ficha → 200 (control negativo del ABAC de escritura)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloPersona(), "PUT", "personas/[id]", {
        params: { id: P_A1 },
        body: { nombreCompleto: "Ana Auno Actualizada" },
      })
      // app/api/personas/[id]/route.ts:78 — el residente SÍ escribe su propia ficha:
      // sin esta cara del predicado, «403 a todo» pasaría por protección correcta.
      expect(res.status).toBe(200)
      // app/api/personas/[id]/route.ts:78 — la escritura propia se persiste de verdad.
      expect((await prisma.persona.findUnique({ where: { id: P_A1 } }))?.nombreCompleto).toBe(
        "Ana Auno Actualizada"
      )
    })
  })

  it("residente A-1: PUT de la ficha de A-2 → 403 y la fila queda intacta", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.persona.findUnique({ where: { id: P_A2 } })
      const res = await invocarApi(moduloPersona(), "PUT", "personas/[id]", {
        params: { id: P_A2 },
        body: { nombreCompleto: "Nombre Intruso" },
      })
      // app/api/personas/[id]/route.ts:76-80 — el residente solo escribe si
      // `personaIdDelUsuario === id`; la comparación ocurre antes de tocar la fila.
      expect(res.status).toBe(403)
      // app/api/personas/[id]/route.ts:80 — el 403 corta antes de cualquier escritura:
      // se relee la fila ajena y tiene que ser la misma (T4: la escritura ajena no pasa).
      expect(await prisma.persona.findUnique({ where: { id: P_A2 } })).toEqual(antes)
    })
  })
})

describe("notificaciones — propio, otra unidad (T3)", () => {
  it("control: el administrador de A ve las cuatro notificaciones de su comunidad", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloNotificaciones(), "GET", "notificaciones?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // lib/api/notificaciones-scope.ts:84 — administrador y comité ven toda la comunidad:
      // las cuatro filas existen y son legibles, incluida la de la unidad de A-2.
      expect(new Set(j.data.map((n) => n.id))).toEqual(
        new Set([NOTI_A1, NOTI_A2, NOTI_DIFUSION_ROL, NOTI_DIFUSION_U_A2])
      )
    })
  })

  it("residente A-1: la bandeja devuelve solo lo suyo (puntual y difusión de rol sin unidad)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloNotificaciones(), "GET", "notificaciones?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // lib/api/notificaciones-scope.ts:108-117 — el `where` de alcance: puntual a mi
      // persona + difusión a mi rol sin unidad. Sin él la bandeja trae las dos de A-2.
      expect(new Set(j.data.map((n) => n.id))).toEqual(new Set([NOTI_A1, NOTI_DIFUSION_ROL]))
      // lib/api/notificaciones-scope.ts:61 — `unidadId: null` en la difusión de rol:
      // sin ese acote, la difusión dirigida a la unidad de A-2 se cuela en la bandeja.
      expect(j.data.map((n) => n.id)).not.toContain(NOTI_DIFUSION_U_A2)
      // lib/api/notificaciones-scope.ts:112 — la pertenencia puntual es por persona:
      // la notificación de A-2 no aparece aunque comparta comunidad y rol.
      expect(j.data.map((n) => n.id)).not.toContain(NOTI_A2)
      // app/api/notificaciones/route.ts:82 — el `total` usa el MISMO `where` acotado.
      expect(j.total).toBe(2)
    })
  })

  it("residente A-1: GET de una notificación de A-2 → 404 (no filtra existencia)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloNotificacion(), "GET", "notificaciones/[id]", {
        params: { id: NOTI_A2 },
      })
      // app/api/notificaciones/[id]/route.ts:46-49 — `findFirst` con el `where` de
      // alcance: la ajena no se encuentra y responde el mismo 404 que un id inventado.
      expect(res.status).toBe(404)
      // app/api/notificaciones/[id]/route.ts:49 — el cuerpo es el error genérico, sin
      // asunto ni cuerpo de la notificación ajena.
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("residente A-1: POST [id]/leer de una notificación de A-2 → 404 y `leida` sigue false", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloNotificacionLeer(), "POST", "notificaciones/[id]/leer", {
        params: { id: NOTI_A2 },
      })
      // app/api/notificaciones/[id]/leer/route.ts:63-65 — `esDestinatarioDeNotificacion`:
      // el destinatario puntual es A-2, así que la lectura ajena no se firma.
      expect(res.status).toBe(404)
      const fila = await prisma.notificacion.findUnique({ where: { id: NOTI_A2 } })
      // app/api/notificaciones/[id]/leer/route.ts:65 — el 404 corta antes del `update`:
      // la fila de A-2 conserva `leida` y `fechaLectura` como estaban.
      expect(fila?.leida).toBe(false)
      expect(fila?.fechaLectura).toBeNull()
    })
  })

  it("residente A-1: POST [id]/leer de una DIFUSIÓN a la unidad de A-2 → 404 y `leida` sigue false", async () => {
    // Regresión observada: la fila NO es legible para A-1 (difusión al rol
    // `residente` con `destinatarioPersonaId: null` y `unidadId` de A-2) y aun así
    // era firmable. Escritura ⊆ lectura: si el GET la esconde, el POST no la firma.
    await conSesion(EMAIL.resA1, async () => {
      const lectura = await invocarApi(moduloNotificacion(), "GET", "notificaciones/[id]", {
        params: { id: NOTI_DIFUSION_U_A2 },
      })
      // lib/api/notificaciones-scope.ts:61 — la difusión de rol se acota a
      // `unidadId: null` y, con vínculos (F5), a las unidades propias.
      expect(lectura.status).toBe(404)

      const res = await invocarApi(moduloNotificacionLeer(), "POST", "notificaciones/[id]/leer", {
        params: { id: NOTI_DIFUSION_U_A2 },
      })
      // app/api/notificaciones/[id]/leer/route.ts — el `where` de la escritura es el
      // MISMO `filtroNotificaciones` del GET por id: la difusión de la unidad de A-2
      // no se encuentra, así que responde el 404 genérico y no filtra existencia.
      expect(res.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Registro no encontrado.",
      })

      const fila = await prisma.notificacion.findUnique({ where: { id: NOTI_DIFUSION_U_A2 } })
      // El 404 corta antes del `update`: la fila de la unidad de A-2 queda como estaba
      // (sin `leida` ni `fechaLectura`), así la métrica de apertura no cuenta a A-1.
      expect(fila?.leida).toBe(false)
      expect(fila?.fechaLectura).toBeNull()
    })
  })

  it("residente A-2: POST [id]/leer de la difusión a SU unidad → 200 e idempotente (control negativo)", async () => {
    // Sin esta cara, «404 a toda difusión con unidad» pasaría por arreglo: el
    // destinatario de la unidad correcta SÍ firma, y la fecha no se recalcula.
    await conSesion(EMAIL.resA2, async () => {
      const res = await invocarApi(moduloNotificacionLeer(), "POST", "notificaciones/[id]/leer", {
        params: { id: NOTI_DIFUSION_U_A2 },
      })
      expect(res.status).toBe(200)
      const cuerpo = await cuerpoJson<{ ok: boolean; fechaLectura?: string }>(res)
      // Mismo contrato de respuesta que antes del arreglo: `{ ok, fechaLectura }`.
      expect(cuerpo.ok).toBe(true)
      expect(cuerpo.fechaLectura).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const enBd = await prisma.notificacion.findUnique({ where: { id: NOTI_DIFUSION_U_A2 } })
      expect(enBd?.leida).toBe(true)
      expect(enBd?.fechaLectura).toBe(cuerpo.fechaLectura)

      // Idempotencia intacta: la segunda lectura responde 200 y no mueve la fecha.
      const otra = await invocarApi(moduloNotificacionLeer(), "POST", "notificaciones/[id]/leer", {
        params: { id: NOTI_DIFUSION_U_A2 },
      })
      expect(otra.status).toBe(200)
      expect((await cuerpoJson<{ fechaLectura?: string }>(otra)).fechaLectura).toBe(
        cuerpo.fechaLectura
      )
    })
  })

  it("residente A-1: POST [id]/leer de su propia notificación → 200 (control negativo)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloNotificacionLeer(), "POST", "notificaciones/[id]/leer", {
        params: { id: NOTI_A1 },
      })
      // app/api/notificaciones/[id]/leer/route.ts:63 — el predicado discrimina: la
      // propia sí se firma. Sin este control, un «404 a todo» pasaría por correcto.
      expect(res.status).toBe(200)
      // app/api/notificaciones/[id]/leer/route.ts:70-73 — la escritura es sobre la propia.
      expect((await prisma.notificacion.findUnique({ where: { id: NOTI_A1 } }))?.leida).toBe(true)
    })
  })
})

describe("co/envios — pertenencia por destinatario (T3)", () => {
  it("control: el administrador de A abre el envío que es solo de A-2", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloEnvio(), "GET", "co/envios/[id]", {
        params: { id: ENV_SOLO_A2 },
      })
      expect(res.status).toBe(200)
      // app/api/co/_lib/proyeccion-envio.ts:60 — fuera del residente el `where` es la
      // comunidad: el envío existe y es legible, así que el 404 de A-1 es alcance, no ausencia.
      expect((await cuerpoJson<{ id: string }>(res)).id).toBe(ENV_SOLO_A2)
    })
  })

  it("residente A-1: GET del envío compartido (A-1 y A-2) → 200 sin la nómina de terceros", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloEnvio(), "GET", "co/envios/[id]", {
        params: { id: ENV_COMPARTIDO },
      })
      // app/api/co/_lib/proyeccion-envio.ts:62 — `destinatariosCO: { some: { personaId } }`:
      // la pertenencia es ser destinatario, no ser el único destinatario.
      expect(res.status).toBe(200)
      const envio = await cuerpoJson<Record<string, unknown>>(res)
      expect(envio.id).toBe(ENV_COMPARTIDO)
      // app/api/co/_lib/proyeccion-envio.ts:144-152 — la proyección del residente no
      // incluye `destinatarios` ni `lecturas`: el envío compartido no revela a quién más llegó.
      expect(envio).not.toHaveProperty("destinatarios")
      expect(envio).not.toHaveProperty("lecturas")
    })
  })

  it("residente A-1: GET de un envío que no es suyo (solo A-2) → 404", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloEnvio(), "GET", "co/envios/[id]", {
        params: { id: ENV_SOLO_A2 },
      })
      // app/api/co/envios/[id]/route.ts:53-56 — `whereEnvioDetalle(...)` + `if (!fila)`:
      // un envío ajeno responde igual que un id inexistente (S3, sin filtrar existencia).
      expect(res.status).toBe(404)
      // app/api/co/_lib/proyeccion-envio.ts:72 — el detalle hereda el `where` de la
      // colección; sin `destinatariosCO.some` el 404 se vuelve 200 con el envío de A-2.
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("residente A-1: GET [id]/lecturas → 403 (co:lecturas vacía para residente)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloEnvioLecturas(), "GET", "co/envios/[id]/lecturas", {
        params: { id: ENV_COMPARTIDO },
      })
      // app/api/co/envios/[id]/lecturas/route.ts:31 + lib/authz.ts:274 — el desglose
      // nominativo es solo del administrador; el residente no tiene `co:lecturas`.
      expect(res.status).toBe(403)
      // app/api/co/envios/[id]/lecturas/route.ts:36 — la respuesta es el error, no la
      // lista de `personaId`/`leidoEn` de los vecinos.
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({ error: "Permiso denegado." })
    })
  })
})

describe("controles-propiedad — propio, otra unidad (T3/T4)", () => {
  it("control: el administrador de A ve los dos controles de su comunidad", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(
        moduloControlesPropiedad(),
        "GET",
        "controles-propiedad?pageSize=100"
      )
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // app/api/controles-propiedad/route.ts:65 — `unidadesVisibles` devuelve "todas"
      // para gestión: las dos filas existen y son legibles, así que lo que le oculta
      // la de A-2 al residente es el filtro por unidad, no la ausencia de la fila.
      expect(new Set(j.data.map((c) => c.id))).toEqual(new Set([CONTROL_A1, CONTROL_A2]))
    })
  })

  it("residente A-1: la colección trae solo el control de su unidad", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(
        moduloControlesPropiedad(),
        "GET",
        "controles-propiedad?pageSize=100"
      )
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string; unidadId: string }>>(res)
      // app/api/controles-propiedad/route.ts:100 — `where.unidadId = { in: visibles }`
      // con `unidadesVinculadasDb(personaId, comunidadId)`: sin ese filtro la
      // colección trae el control de A-2 (el `where` base es solo la comunidad).
      expect(j.data.map((c) => c.id)).toEqual([CONTROL_A1])
      expect(j.data.map((c) => c.unidadId)).toEqual([U_A1])
      // app/api/controles-propiedad/route.ts:110 — el `total` usa el MISMO `where`:
      // no delata la fila de la unidad vecina.
      expect(j.total).toBe(1)
    })
  })

  it("residente A-1: GET de su control → 200; GET del control de A-2 → 403 sin flags", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const propio = await invocarApi(
        moduloControlPropiedad(),
        "GET",
        "controles-propiedad/[id]",
        { params: { id: CONTROL_A1 } }
      )
      // app/api/controles-propiedad/[id]/route.ts:62 — el ABAC de pertenencia deja
      // pasar la unidad propia (control negativo del 403 de abajo).
      expect(propio.status).toBe(200)
      expect((await cuerpoJson<{ id: string }>(propio)).id).toBe(CONTROL_A1)

      const ajeno = await invocarApi(
        moduloControlPropiedad(),
        "GET",
        "controles-propiedad/[id]",
        { params: { id: CONTROL_A2 } }
      )
      // app/api/controles-propiedad/[id]/route.ts:62 — `!unidades.includes(record.unidadId)`:
      // 403, que es lo que el mapa declara para este recurso (a diferencia del 404 de
      // `notificaciones`/`co/envios`). El 404 cross-comunidad es de `:54`.
      expect(ajeno.status).toBe(403)
      // La respuesta es solo el error: ningún flag de privacidad de la unidad vecina.
      expect(await cuerpoJson<{ error: string }>(ajeno)).toEqual({
        error: "Permiso denegado: solo ves los controles de tu unidad.",
      })
    })
  })

  it("residente A-1: PUT y DELETE del control de A-2 → 403 y la fila queda intacta", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.controlPropiedad.findUnique({ where: { id: CONTROL_A2 } })
      const put = await invocarApi(
        moduloControlPropiedad(),
        "PUT",
        "controles-propiedad/[id]",
        { params: { id: CONTROL_A2 }, body: { residenteVeActas: false } }
      )
      // app/api/controles-propiedad/[id]/route.ts:92 — la escritura exige
      // `puedeGestionarControles(rol, "editar")` (`ad` editar, que el residente no
      // tiene): el 403 es por CLAVE, no por fila. La fila ajena igual queda intacta.
      expect(put.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(put)).toEqual({ error: "Permiso denegado." })
      expect(await prisma.controlPropiedad.findUnique({ where: { id: CONTROL_A2 } })).toEqual(antes)

      const del = await invocarApi(
        moduloControlPropiedad(),
        "DELETE",
        "controles-propiedad/[id]",
        { params: { id: CONTROL_A2 } }
      )
      // app/api/controles-propiedad/[id]/route.ts:169-170 — el DELETE corta con
      // "denegado" dentro de la transacción, antes de archivar y de marcar
      // `desestimada`: no hay borrado lógico de la fila ajena.
      expect(del.status).toBe(403)
      expect(await prisma.controlPropiedad.findUnique({ where: { id: CONTROL_A2 } })).toEqual(antes)
      expect(await prisma.controlPropiedadArchivada.count({ where: { id: CONTROL_A2 } })).toBe(0)
    })
  })
})

describe("cobros-fi/canales — preferencia por persona (T3/T4)", () => {
  it("control: el administrador de A ve las dos preferencias de la comunidad", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloCanalesCobranza(), "GET", "cobros-fi/canales")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<{ personas: { personaId: string }[]; propio: unknown }>(res)
      // app/api/cobros-fi/canales/route.ts:67-78 — `veTodas` (`fi:cobranza` ver, solo
      // admin y comité) lista todas las preferencias de la comunidad.
      expect(new Set(j.personas.map((p) => p.personaId))).toEqual(new Set([P_A1, P_A2]))
      expect(j.propio).toBeNull()
    })
  })

  it("residente A-1: GET → 200 con la colección filtrada (no 403) y solo su preferencia", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const fila = await prisma.preferenciaCanalCobranzaFI.findUnique({
        where: { comunidadId_personaId: { comunidadId: COM_A, personaId: P_A1 } },
      })
      const res = await invocarApi(moduloCanalesCobranza(), "GET", "cobros-fi/canales")
      // Respuesta de HOY, fijada tal cual: el residente no tiene `fi:cobranza` ver, así
      // que la lectura ajena NO es un 403 — es una colección vacía (`personas: []`)
      // más su propia preferencia en `propio`
      // (app/api/cobros-fi/canales/route.ts:87-91). La fila de A-2 no viaja.
      expect(res.status).toBe(200)
      const j = await cuerpoJson<{
        personas: unknown[]
        propio: { personaId: string; visor: boolean; email: boolean } | null
      }>(res)
      expect(j.personas).toEqual([])
      // app/api/cobros-fi/canales/route.ts:62 — `propio` sale de
      // `personaIdDelUsuarioDb(scope.usuarioId)`, nunca del cliente.
      expect(j.propio).toEqual({ personaId: P_A1, visor: fila?.canalVisor, email: fila?.canalEmail })
      expect(JSON.stringify(j)).not.toContain(P_A2)
    })
  })

  it("residente A-1: PUT de su propia preferencia → 200 y se persiste (control negativo)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.preferenciaCanalCobranzaFI.findUnique({
        where: { comunidadId_personaId: { comunidadId: COM_A, personaId: P_A1 } },
      })
      const res = await invocarApi(moduloCanalesCobranza(), "PUT", "cobros-fi/canales", {
        body: { personaId: P_A1, canalVisor: !antes?.canalVisor, canalEmail: !antes?.canalEmail },
      })
      // app/api/cobros-fi/canales/route.ts:148-153 — `fi:cobranza:propia` editar +
      // ABAC de pertenencia: la persona del body es la de la sesión, así que pasa.
      // Sin esta cara, «403 a todo PUT» pasaría por protección correcta.
      expect(res.status).toBe(200)
      expect(await cuerpoJson<{ ok: boolean; personaId: string }>(res)).toMatchObject({
        ok: true,
        personaId: P_A1,
      })
      const despues = await prisma.preferenciaCanalCobranzaFI.findUnique({
        where: { comunidadId_personaId: { comunidadId: COM_A, personaId: P_A1 } },
      })
      expect(despues?.canalVisor).toBe(!antes?.canalVisor)
      expect(despues?.canalEmail).toBe(!antes?.canalEmail)
    })
  })

  it("residente A-1: PUT de la preferencia de A-2 → 403 y la fila de A-2 intacta", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.preferenciaCanalCobranzaFI.findUnique({
        where: { comunidadId_personaId: { comunidadId: COM_A, personaId: P_A2 } },
      })
      const res = await invocarApi(moduloCanalesCobranza(), "PUT", "cobros-fi/canales", {
        body: { personaId: P_A2, canalVisor: true, canalEmail: true },
      })
      // app/api/cobros-fi/canales/route.ts:153-154 — `propia !== personaId`: el
      // cliente no decide de quién es la preferencia; el 403 sale antes de leer la
      // persona del body (así que tampoco confirma existencia).
      expect(res.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({ error: "Permiso denegado." })
      expect(
        await prisma.preferenciaCanalCobranzaFI.findUnique({
          where: { comunidadId_personaId: { comunidadId: COM_A, personaId: P_A2 } },
        })
      ).toEqual(antes)
    })
  })
})

describe("co/mensajes-buzon — pertenencia por reportante (T3/T4)", () => {
  it("control: el administrador de A ve los dos mensajes del buzón", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloMensajesBuzon(), "GET", "co/mensajes-buzon?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // app/api/co/_lib/buzon-alcance.ts:32 — para el administrador el alcance es `{}`
      // (toda la comunidad): las dos filas existen y son legibles.
      expect(new Set(j.data.map((m) => m.id))).toEqual(new Set([MSG_A1, MSG_A2]))
    })
  })

  it("residente A-1: la colección trae solo el mensaje que reportó él", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloMensajesBuzon(), "GET", "co/mensajes-buzon?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // app/api/co/_lib/buzon-alcance.ts:35 — `{ reportantePersonaId: personaId }`:
      // sin ese filtro la bandeja del residente trae el reclamo del vecino.
      expect(j.data.map((m) => m.id)).toEqual([MSG_A1])
      // app/api/co/mensajes-buzon/route.ts:44 — el `total` usa el MISMO `where`.
      expect(j.total).toBe(1)
    })
  })

  it("residente A-1: GET de su mensaje → 200; GET del reportado por A-2 → 404", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const propio = await invocarApi(moduloMensajeBuzon(), "GET", "co/mensajes-buzon/[id]", {
        params: { id: MSG_A1 },
      })
      // app/api/co/mensajes-buzon/[id]/route.ts:40 — `whereMensajeBuzon` conserva el
      // alcance: el reportante sí lee su propio mensaje (control negativo).
      expect(propio.status).toBe(200)
      expect((await cuerpoJson<{ id: string }>(propio)).id).toBe(MSG_A1)

      const ajeno = await invocarApi(moduloMensajeBuzon(), "GET", "co/mensajes-buzon/[id]", {
        params: { id: MSG_A2 },
      })
      // app/api/co/mensajes-buzon/[id]/route.ts:41-43 — el `findFirst` con el alcance
      // no encuentra la fila ajena y responde el mismo 404 que un id inventado.
      expect(ajeno.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(ajeno)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("residente A-1: PUT del mensaje de A-2 → 403 y la fila queda intacta", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.mensajeBuzonCO.findUnique({ where: { id: MSG_A2 } })
      const ajeno = await invocarApi(moduloMensajeBuzon(), "PUT", "co/mensajes-buzon/[id]", {
        params: { id: MSG_A2 },
        body: { asunto: "Asunto intruso" },
      })
      // lib/api/put-merge.ts:79-80 — `authzCheck(rol, "editar")` sobre `co:buzon`:
      // el residente solo tiene ver+crear (`lib/authz.ts:273`), así que el 403 es por
      // CLAVE y no por fila. Se fija el contrato real: la fila ajena no se escribe.
      expect(ajeno.status).toBe(403)
      const cuerpoAjeno = await cuerpoJson<{ error: string }>(ajeno)
      expect(cuerpoAjeno).toEqual({ error: "Permiso denegado." })

      // Control que documenta el límite: el MISMO 403 sale para el mensaje propio,
      // así que la regla por fila en escritura no es ejercitable en este recurso (el
      // residente nunca edita). La lectura sí discrimina (ver los dos casos de arriba).
      const propio = await invocarApi(moduloMensajeBuzon(), "PUT", "co/mensajes-buzon/[id]", {
        params: { id: MSG_A1 },
        body: { asunto: "Asunto propio" },
      })
      expect(propio.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(propio)).toEqual(cuerpoAjeno)

      expect(await prisma.mensajeBuzonCO.findUnique({ where: { id: MSG_A2 } })).toEqual(antes)
    })
  })
})

describe("vinculos — límite documentado, no caso por fila (T3)", () => {
  it("el residente recibe 403 antes de cualquier filtro; el admin sí discrimina comunidad", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const propio = await invocarApi(moduloVinculo(), "GET", "vinculos/[id]", {
        params: { id: V_A1 },
      })
      const ajeno = await invocarApi(moduloVinculo(), "GET", "vinculos/[id]", {
        params: { id: V_A2 },
      })
      // app/api/vinculos/[id]/route.ts:23 — el gate es `puede(rol, "ver", "mp")` y el
      // residente no lo tiene (`lib/authz.ts`): el 403 sale ANTES de leer la fila, con
      // el vínculo propio y con el ajeno por igual. Por eso este recurso NO tiene caso
      // por relación: la regla de fila no se puede ejercitar.
      expect(propio.status).toBe(403)
      expect(ajeno.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(ajeno)).toEqual(
        await cuerpoJson<{ error: string }>(propio)
      )
      // Mismo límite que `e2e/crud/arrendatario-limite.spec.ts:60` fija para
      // `/api/vinculos` (403 del residente por diseño); no se cambia acá.
    })

    await conSesion(EMAIL.adminA, async () => {
      const propio = await invocarApi(moduloVinculo(), "GET", "vinculos/[id]", {
        params: { id: V_A1 },
      })
      // Control: para un lector `mp` la ruta sí sirve la fila de su comunidad.
      expect(propio.status).toBe(200)
      expect((await cuerpoJson<{ id: string }>(propio)).id).toBe(V_A1)

      const ajeno = await invocarApi(moduloVinculo(), "GET", "vinculos/[id]", {
        params: { id: V_B1 },
      })
      // app/api/vinculos/[id]/route.ts:28-29 — 404 cross-comunidad por
      // `findUnique` + comparación, sin confirmar existencia.
      expect(ajeno.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(ajeno)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })
})

describe("liquidaciones — defecto declarado: `pl:propia` sin usar (T3) → cerrado en T6", () => {
  const ids = (cuerpo: Envelope<{ id: string }>) => cuerpo.data.map((fila) => fila.id).sort()

  it("el trabajador A-1 lee SU liquidación (200) y la fila es la suya", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const res = await invocarApi(moduloLiquidacion(), "GET", "liquidaciones/[id]", {
        params: { id: LIQ_A },
      })
      // app/api/liquidaciones/[id]/route.ts:15 → `liquidacionGetPorId`
      // (app/api/liquidaciones/route.ts:178-206): con `pl:propia` ver la lectura
      // se acota a `trabajadorPersonaId === personaId` de la sesión.
      expect(res.status).toBe(200)
      const fila = await cuerpoJson<{
        id: string
        trabajadorPersonaId: string
        liquidoAPagar: number
      }>(res)
      expect(fila.id).toBe(LIQ_A)
      expect(fila.trabajadorPersonaId).toBe(P_A1)
      expect(fila.liquidoAPagar).toBe(650000)
    })
  })

  it("el trabajador A-1: la liquidación de otro trabajador de su comunidad → 404", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const res = await invocarApi(moduloLiquidacion(), "GET", "liquidaciones/[id]", {
        params: { id: LIQ_A2 },
      })
      // Respuesta no filtrante del repo: el 404 no confirma que la fila exista, y
      // el líquido ajeno (LIQ_A2 = 910000) no viaja en el cuerpo.
      expect(res.status).toBe(404)
      const cuerpo = await cuerpoJson<{ error: string }>(res)
      expect(cuerpo).toEqual({ error: "Registro no encontrado." })
      expect(JSON.stringify(cuerpo)).not.toContain("910000")
    })
  })

  it("el trabajador A-1: la liquidación de otra comunidad → 404", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const res = await invocarApi(moduloLiquidacion(), "GET", "liquidaciones/[id]", {
        params: { id: LIQ_B },
      })
      expect(res.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("el trabajador A-1: la colección trae solo lo suyo", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const res = await invocarApi(moduloLiquidaciones(), "GET", "liquidaciones?pageSize=50")
      expect(res.status).toBe(200)
      const cuerpo = await cuerpoJson<
        Envelope<{ id: string; trabajadorPersonaId: string; liquidoAPagar: number }>
      >(res)
      // app/api/liquidaciones/route.ts:124-169 → `GET` (rama `pl:propia`): el
      // `where` lleva `trabajadorPersonaId` de la sesión (`:150-153`); las filas
      // ajenas no se cuentan.
      expect(ids(cuerpo)).toEqual([LIQ_A])
      expect(cuerpo.total).toBe(1)
      expect(cuerpo.data.map((fila) => fila.trabajadorPersonaId)).toEqual([P_A1])
      // El líquido de LIQ_A2 (910000, otro trabajador) no aparece en ninguna fila.
      expect(cuerpo.data.every((fila) => fila.liquidoAPagar === 650000)).toBe(true)
    })
  })

  it("control: el administrador de A ve todas las liquidaciones de su comunidad", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const coleccion = await invocarApi(
        moduloLiquidaciones(),
        "GET",
        "liquidaciones?pageSize=50"
      )
      expect(coleccion.status).toBe(200)
      const cuerpo = await cuerpoJson<
        Envelope<{ id: string; liquidoAPagar: number }>
      >(coleccion)
      // app/api/liquidaciones/route.ts:130 delega en la factory cuando el rol
      // tiene `pl` ver: el comportamiento administrativo no cambia.
      expect(ids(cuerpo)).toEqual([LIQ_A, LIQ_A2])
      expect(cuerpo.total).toBe(2)
      expect(cuerpo.data.find((fila) => fila.id === LIQ_A2)?.liquidoAPagar).toBe(910000)

      const detalle = await invocarApi(moduloLiquidacion(), "GET", "liquidaciones/[id]", {
        params: { id: LIQ_A2 },
      })
      expect(detalle.status).toBe(200)
      expect((await cuerpoJson<{ id: string }>(detalle)).id).toBe(LIQ_A2)
    })
  })

  it("control: el administrador de A sigue recibiendo 404 cross-comunidad", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloLiquidacion(), "GET", "liquidaciones/[id]", {
        params: { id: LIQ_B },
      })
      // lib/api/crud-factory.ts:335-337 — `findUnique` + `comunidadId !== scope`:
      // la fila de la otra comunidad responde igual que un id inexistente.
      expect(res.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("el trabajador no ensancha el alcance con personaId/trabajadorPersonaId del cliente", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const alcanceAjeno = `personaId=${P_A2}&trabajadorPersonaId=${P_A2}`
      // Query de la colección: se ignora, la identidad sale de la membresía.
      const coleccion = await invocarApi(
        moduloLiquidaciones(),
        "GET",
        `liquidaciones?pageSize=50&${alcanceAjeno}`
      )
      expect(coleccion.status).toBe(200)
      expect(ids(await cuerpoJson<Envelope<{ id: string }>>(coleccion))).toEqual([LIQ_A])

      // Query del detalle: el `[id]` ajeno sigue siendo 404.
      const detalle = await invocarApi(
        moduloLiquidacion(),
        "GET",
        `liquidaciones/[id]?${alcanceAjeno}`,
        { params: { id: LIQ_A2 } }
      )
      expect(detalle.status).toBe(404)

      // Body: la ruta [id] no tiene PUT (el snapshot es inmutable) y el único
      // canal con body es `POST /api/liquidaciones` (generar). El
      // `trabajadorPersonaId` del body no abre nada: el rol decide antes.
      const alta = await invocarApi(moduloLiquidaciones(), "POST", "liquidaciones", {
        body: { trabajadorPersonaId: P_A2, periodo: "2026-11", diasTrabajados: 30 },
      })
      expect(alta.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(alta)).toEqual({
        error: "Permiso denegado.",
      })
      // Solo la fila del arnés (LIQ_A2): no se generó una nueva con el body.
      const ajenas = await prisma.liquidacionPL.count({
        where: { comunidadId: COM_A, trabajadorPersonaId: P_A2 },
      })
      expect(ajenas).toBe(1)
      const enBd = await prisma.liquidacionPL.findUnique({ where: { id: LIQ_A } })
      expect(enBd?.trabajadorPersonaId).toBe(P_A1)
    })
  })

  it("conserjería sin identidad MP: no tiene filas que leer (colección vacía, 404 por id)", async () => {
    await conSesion(EMAIL.conserjeA, async () => {
      const coleccion = await invocarApi(moduloLiquidaciones(), "GET", "liquidaciones?pageSize=50")
      expect(coleccion.status).toBe(200)
      const cuerpo = await cuerpoJson<Envelope<{ id: string }>>(coleccion)
      expect(cuerpo.data).toEqual([])
      expect(cuerpo.total).toBe(0)
      const detalle = await invocarApi(moduloLiquidacion(), "GET", "liquidaciones/[id]", {
        params: { id: LIQ_A },
      })
      expect(detalle.status).toBe(404)
    })
  })

  it("preserva la matriz: el residente dueño de la misma persona no entra por `pl:propia`", async () => {
    await conSesion(EMAIL.resA1, async () => {
      // `P_A1` es la persona de las dos sesiones (residente y trabajador), pero la
      // clave gobierna, no la persona: el residente no tiene `pl:propia`.
      const coleccion = await invocarApi(moduloLiquidaciones(), "GET", "liquidaciones?pageSize=50")
      expect(coleccion.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(coleccion)).toEqual({
        error: "Permiso denegado.",
      })
      const detalle = await invocarApi(moduloLiquidacion(), "GET", "liquidaciones/[id]", {
        params: { id: LIQ_A },
      })
      expect(detalle.status).toBe(403)
    })
  })
})

describe("liquidaciones/[id]/pdf — el trabajador descarga SU liquidación (T10)", () => {
  it("el trabajador A-1 descarga SU liquidación como PDF real, con período y folio en el nombre", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const res = await invocarApi(
        moduloLiquidacionPdf(),
        "GET",
        "liquidaciones/[id]/pdf",
        { params: { id: LIQ_A } }
      )
      // Antes de T10 esta ruta no existía: el trabajador podía LEER su
      // liquidación por API y no podía bajar el papel que la administración
      // emitió. El documento sale del builder existente sobre la fila guardada.
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/pdf")
      // El nombre lleva período y folio: quien descarga dos liquidaciones no
      // las confunde en la carpeta de descargas.
      expect(res.headers.get("content-disposition")).toBe(
        'attachment; filename="liquidacion-2026-10-LIQ-0001.pdf"'
      )
      // Es un documento personal: no se cachea en proxies ni en el navegador.
      expect(res.headers.get("cache-control")).toBe("no-store")
      const bytes = Buffer.from(await res.arrayBuffer())
      // Bytes de un PDF de verdad: firma %PDF- y un documento no trivial. Un
      // cuerpo JSON o vacío con `application/pdf` no pasa esta mitad.
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-")
      expect(bytes.length).toBeGreaterThan(1000)
    })
  })

  it("el trabajador A-1: la liquidación de otro trabajador de su comunidad → 404 sin documento", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const res = await invocarApi(
        moduloLiquidacionPdf(),
        "GET",
        "liquidaciones/[id]/pdf",
        { params: { id: LIQ_A2 } }
      )
      // Mismo alcance que el detalle: la fila ajena no se carga ni se imprime, y
      // el 404 no confirma que exista (el líquido ajeno = 910000 no viaja).
      expect(res.status).toBe(404)
      expect(res.headers.get("content-type")).toContain("application/json")
      const cuerpo = await cuerpoJson<Record<string, unknown>>(res)
      expect(cuerpo).toEqual({ error: "Registro no encontrado." })
      expect(JSON.stringify(cuerpo)).not.toContain("910000")
    })
  })

  it("el trabajador A-1: la liquidación de otra comunidad → 404 en el PDF", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const res = await invocarApi(
        moduloLiquidacionPdf(),
        "GET",
        "liquidaciones/[id]/pdf",
        { params: { id: LIQ_B } }
      )
      expect(res.status).toBe(404)
      expect(await cuerpoJson<Record<string, unknown>>(res)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("control: la administración descarga el PDF de la liquidación que al trabajador le da 404", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(
        moduloLiquidacionPdf(),
        "GET",
        "liquidaciones/[id]/pdf",
        { params: { id: LIQ_A2 } }
      )
      // La fila existe y el papel se puede armar: el 404 del trabajador es el
      // alcance por persona, no una ruta que no sabe imprimir.
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/pdf")
      expect(res.headers.get("content-disposition")).toBe(
        'attachment; filename="liquidacion-2026-10-LIQ-0003.pdf"'
      )
      const bytes = Buffer.from(await res.arrayBuffer())
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-")
      expect(bytes.length).toBeGreaterThan(1000)
    })
  })
})

describe("certificados-ct — el dueño es `unidadId`/`personaId` (lote 3)", () => {
  it("control: el administrador de A abre el certificado de la unidad de A-2", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloCertificadoCT(), "GET", "certificados-ct/[id]", {
        params: { id: CERT_A2 },
      })
      // app/api/certificados-ct/[id]/route.ts — alcanceCertificadosCT devuelve `null`
      // para administrador (wildcard `ct` ver): la fila de la unidad 102 existe y es
      // legible, así el 404 del residente de los casos siguientes no es «fila ausente».
      expect(res.status).toBe(200)
      expect((await cuerpoJson<{ id: string }>(res)).id).toBe(CERT_A2)

      const coleccion = await invocarApi(
        moduloCertificadosCT(),
        "GET",
        "certificados-ct?pageSize=100"
      )
      expect(coleccion.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(coleccion)
      // app/api/certificados-ct/route.ts — sin alcance (gestión) el `where` sigue
      // siendo la comunidad: los tres certificados de A están en la base y el
      // administrador los ve, incluido el de la persona sin unidad.
      expect(new Set(j.data.map((c) => c.id))).toEqual(
        new Set([CERT_A1, CERT_A2, CERT_PERSONA_A1])
      )
    })
  })

  it("residente A-1: el certificado de la unidad de A-2 → 404, igual que un id inexistente", async () => {
    // Regla aplicada (app/api/certificados-ct/route.ts · alcanceCertificadosCT):
    // «lo propio» = mis unidades con vínculo vigente (`unidadesVinculadasDb`) o mi
    // persona (`personaIdDelUsuarioDb`), ambas resueltas server-side. Un certificado
    // de otra unidad no es legible → 404 y no 403: el 403 confirmaría que existe.
    //
    // Este caso estaba en `it.fails` con la fuga abierta: `GET
    // /api/certificados-ct/ppo-cert-a2` respondía **200** con la fila entera de la
    // unidad 102 —`folio: "CT-0002"`, `codigoVerificacion: "VC-BBB222"`,
    // `personaId: "ppo-p-a2"`, `unidadId: "ppo-u-a2"`, `resumen` y `detalle`— porque
    // el residente tiene `ct` ver (`lib/authz.ts:216`) y el único filtro de la ruta
    // era la comunidad (`lib/api/crud-factory.ts:335`). El `unidadId ∈
    // unidadesVinculadas` que el motor declara (`lib/authz.ts:480`) ahora lo cablea
    // la ruta.
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloCertificadoCT(), "GET", "certificados-ct/[id]", {
        params: { id: CERT_A2 },
      })
      // Contrato exigido: la fila ajena responde igual que un id inexistente.
      expect(res.status).toBe(404)
      // Y el cuerpo no puede llevar el documento ajeno.
      const cuerpo = await cuerpoJson<Record<string, unknown>>(res)
      expect(cuerpo).not.toHaveProperty("folio")
      expect(cuerpo).not.toHaveProperty("codigoVerificacion")
      // El 404 es el genérico de la ruta: ni siquiera dice «existe pero no es tuya».
      expect(cuerpo).toEqual({ error: "Registro no encontrado." })
    })
  })

  it("residente A-1: la colección no trae el certificado de A-2 (solo lo propio)", async () => {
    // Misma corrida, misma fuga: `GET /api/certificados-ct?pageSize=100` devolvía
    // los DOS certificados de la comunidad a la sesión de la unidad 101, con sus
    // `personaId` y `unidadId`. Ahora el `where` suma el alcance antes de leer.
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(
        moduloCertificadosCT(),
        "GET",
        "certificados-ct?pageSize=100"
      )
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string; unidadId?: string | null }>>(res)
      expect(j.data.map((c) => c.id)).not.toContain(CERT_A2)
      expect(j.data.every((c) => c.unidadId !== U_A2)).toBe(true)
      // Lo propio sí viaja: su unidad y su persona (sin unidad). Sin esta mitad, un
      // `where` vacío también pasaría el caso de arriba.
      expect(new Set(j.data.map((c) => c.id))).toEqual(new Set([CERT_A1, CERT_PERSONA_A1]))
      expect(j.total).toBe(2)
    })
  })

  it("residente A-1: su certificado de unidad y el de su persona → 200", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const propio = await invocarApi(moduloCertificadoCT(), "GET", "certificados-ct/[id]", {
        params: { id: CERT_A1 },
      })
      expect(propio.status).toBe(200)
      const fila = await cuerpoJson<{ id: string; folio: string }>(propio)
      expect(fila.id).toBe(CERT_A1)
      expect(fila.folio).toBe("CT-0001")

      // Documento de la persona sin unidad: el dueño es `personaId`, no `unidadId`.
      const dePersona = await invocarApi(
        moduloCertificadoCT(),
        "GET",
        "certificados-ct/[id]",
        { params: { id: CERT_PERSONA_A1 } }
      )
      expect(dePersona.status).toBe(200)
      expect((await cuerpoJson<{ id: string }>(dePersona)).id).toBe(CERT_PERSONA_A1)
    })
  })

  it("residente A-2: el certificado de la persona A-1 → 404 (la persona también acota)", async () => {
    await conSesion(EMAIL.resA2, async () => {
      const res = await invocarApi(moduloCertificadoCT(), "GET", "certificados-ct/[id]", {
        params: { id: CERT_PERSONA_A1 },
      })
      // Misma comunidad, otra persona: el documento es de A-1, no de la unidad 102.
      expect(res.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Registro no encontrado.",
      })

      const coleccion = await invocarApi(
        moduloCertificadosCT(),
        "GET",
        "certificados-ct?pageSize=100"
      )
      const j = await cuerpoJson<Envelope<{ id: string }>>(coleccion)
      expect(j.data.map((c) => c.id)).toEqual([CERT_A2])
    })
  })

  it("residente A-1: emitir para la unidad ajena → 404, sin fila y sin el saldo ajeno", async () => {
    // HALLAZGO del mismo lote, en la superficie de ESCRITURA: el residente tiene
    // `ct` crear (`lib/authz.ts:216`) y el POST aceptaba cualquier `unidadId` de la
    // comunidad. Con `tipo: "al_dia"` el gate de saldo respondía **409** con el
    // monto pendiente de la unidad ajena en el mensaje (información financiera de
    // un tercero, sin vínculo con él). Se cierra con la misma regla: la unidad
    // pedida tiene que ser una de las vinculadas del actor.
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloCertificadosCT(), "POST", "certificados-ct", {
        body: {
          id: "ppo-cert-intruso",
          tipo: "al_dia",
          unidadId: U_A2,
          personaId: P_A2,
          solicitanteNombre: "Ana Auno",
          resumen: "Emisión para la unidad ajena.",
          detalle: [{ clave: "Unidad", valor: "102" }],
          fechaEmision: "2026-11-06",
        },
      })
      const json = await cuerpoJson<Record<string, unknown>>(res)
      // El mensaje lleva el cuerpo observado: en rojo muestra el monto filtrado.
      expect(res.status, JSON.stringify(json)).toBe(404)
      expect(json).toEqual({ error: "Registro no encontrado." })
      expect(JSON.stringify(json)).not.toContain("543")
      expect(
        await prisma.certificadoCT.findUnique({ where: { id: "ppo-cert-intruso" } })
      ).toBeNull()
    })
  })

  it("residente A-1: emitir con la persona ajena → 404 y no crea el documento", async () => {
    // Tercera pata del alcance: `personaId` tampoco es del cliente. Un residente
    // no emite un documento a nombre de otra persona de la comunidad.
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloCertificadosCT(), "POST", "certificados-ct", {
        body: {
          id: "ppo-cert-fantasma",
          tipo: "liquidacion_sueldo",
          personaId: P_A2,
          solicitanteNombre: "Beto Ados",
          resumen: "Certificado a nombre de otra persona.",
          detalle: [{ clave: "Persona", valor: "Beto Ados" }],
          fechaEmision: "2026-11-06",
        },
      })
      const json = await cuerpoJson<Record<string, unknown>>(res)
      expect(res.status, JSON.stringify(json)).toBe(404)
      expect(json).toEqual({ error: "Registro no encontrado." })
      expect(
        await prisma.certificadoCT.findUnique({ where: { id: "ppo-cert-fantasma" } })
      ).toBeNull()
    })
  })

  it("residente A-1: emitir para su propia unidad sigue funcionando → 201", async () => {
    // Preserva lo que ya hacía: el residente emite el certificado de su unidad
    // (`ct` crear) con folio y código explícitos, como el QA-Lab del e2e.
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloCertificadosCT(), "POST", "certificados-ct", {
        body: {
          id: "ppo-cert-propio-nuevo",
          folio: "CT-9101",
          codigoVerificacion: "VC-RESA1",
          tipo: "residencia",
          unidadId: U_A1,
          personaId: P_A1,
          solicitanteNombre: "Ana Auno",
          resumen: "Certificado de residencia de la unidad 101.",
          detalle: [{ clave: "Unidad", valor: "101" }],
          fechaEmision: "2026-11-06",
        },
      })
      const json = await cuerpoJson<Record<string, unknown>>(res)
      expect(res.status, JSON.stringify(json)).toBe(201)
      const enBd = await prisma.certificadoCT.findUnique({
        where: { id: "ppo-cert-propio-nuevo" },
      })
      expect(enBd?.unidadId).toBe(U_A1)
      expect(enBd?.personaId).toBe(P_A1)
    })
  })

  it("residente A-1: un certificado de otra comunidad → 404 (la comunidad sí se filtra)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloCertificadoCT(), "GET", "certificados-ct/[id]", {
        params: { id: CERT_B1 },
      })
      // lib/api/crud-factory.ts:335 — `record.comunidadId !== scope.comunidadId` → 404
      // genérico. Es el único filtro de la ruta además de la clave: la comunidad queda
      // cerrada y el DUEÑO no, que es el hallazgo que fijan los dos casos de arriba.
      expect(res.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })
})

describe("in/infracciones — dueño por unidad: lectura de gestión y apelación propia (lote 3)", () => {
  it("control: conserjería (`in` ver) lee el expediente de las dos unidades", async () => {
    await conSesion(EMAIL.conserjeA, async () => {
      const item = await invocarApi(moduloInfraccion(), "GET", "in/infracciones/[id]", {
        params: { id: INFR_A2 },
      })
      // lib/authz.ts:199 — `in` ver/crear para conserjería + lib/api/crud-factory.ts:327:
      // el detalle de la unidad 102 se sirve completo a un rol de gestión.
      expect(item.status).toBe(200)
      expect((await cuerpoJson<{ id: string; unidadId: string }>(item)).unidadId).toBe(U_A2)

      const coleccion = await invocarApi(moduloInfracciones(), "GET", "in/infracciones?pageSize=100")
      expect(coleccion.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(coleccion)
      // lib/api/crud-factory.ts:236 — el `where` es la comunidad, así que la gestión
      // (comité por `lib/authz.ts:112`, conserjería por `:199`) ve las dos filas. No es
      // una fuga: el único rol con unidad —el residente— no tiene `in` (caso siguiente).
      expect(new Set(j.data.map((i) => i.id))).toEqual(new Set([INFR_A1, INFR_A2]))
    })
  })

  it("residente A-1: el expediente IN → 403 por CLAVE, idéntico con su infracción y con la ajena", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const coleccion = await invocarApi(moduloInfracciones(), "GET", "in/infracciones?pageSize=100")
      // lib/authz.ts:280 — el residente solo tiene `in:apelar` crear: no hay clave `in`
      // (ni base que la conceda), y `lib/api/crud-factory.ts:220` corta antes de armar
      // el `where`. LÍMITE DOCUMENTADO: la lectura del expediente no es ejercitable por
      // fila en este recurso, porque el dueño de la fila no entra a la ruta.
      expect(coleccion.status).toBe(403)
      const cuerpo = await cuerpoJson<{ error: string }>(coleccion)
      expect(cuerpo).toEqual({ error: "Permiso denegado." })

      const propia = await invocarApi(moduloInfraccion(), "GET", "in/infracciones/[id]", {
        params: { id: INFR_A1 },
      })
      // Control del límite: el mismo 403 llega con SU unidad, así que no hay regla de
      // fila que pinchar en la lectura. La regla por fila de este recurso vive en
      // `apelar` (los dos casos siguientes), que es la ruta que el residente sí alcanza.
      expect(propia.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(propia)).toEqual(cuerpo)
    })
  })

  it("residente A-1: apelar la infracción de A-2 → 404 y la fila ajena no cambia", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.infraccionIN.findUnique({ where: { id: INFR_A2 } })
      const res = await invocarApi(
        moduloApelarInfraccion(),
        "POST",
        "in/infracciones/[id]/apelar",
        { params: { id: INFR_A2 }, body: { descargos: DESCARGO } }
      )
      // app/api/in/infracciones/[id]/apelar/route.ts:44 — `!unidadesVinculadas.includes(
      // infraccion.unidadId)` → 404: el patrón canónico ABAC→404 del mapa de T1. La
      // unidad de la sesión sale de `unidadesVinculadasDb` (`sesion-persona.ts:26`), no
      // del cliente.
      expect(res.status).toBe(404)
      const cuerpo = await cuerpoJson<{ error: string }>(res)
      expect(cuerpo).toEqual({ error: "Registro no encontrado." })
      // apelar/route.ts:44-46 — el 404 de pertenencia sale antes del `update`, que vive
      // en `:60`: el estado y la apelación de la fila ajena quedan iguales y no se firma
      // ningún `IN_APELACION` (`:68`).
      expect(await prisma.infraccionIN.findUnique({ where: { id: INFR_A2 } })).toEqual(antes)
      expect(
        await prisma.eventoAuditoria.count({
          where: { comunidadId: COM_A, referenciaId: INFR_A2, tipoAccion: "IN_APELACION" },
        })
      ).toBe(0)

      // Mismo 404 que un id inexistente: el ajeno de mi comunidad y el fantasma son
      // indistinguibles (app/api/in/infracciones/_acciones.ts:86 para el cross-comunidad).
      const fantasma = await invocarApi(
        moduloApelarInfraccion(),
        "POST",
        "in/infracciones/[id]/apelar",
        { params: { id: "ppo-infr-no-existe" }, body: { descargos: DESCARGO } }
      )
      expect(fantasma.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(fantasma)).toEqual(cuerpo)
    })
  })

  it("residente A-1: apelar SU infracción → 200 con los descargos persistidos (control negativo)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(
        moduloApelarInfraccion(),
        "POST",
        "in/infracciones/[id]/apelar",
        { params: { id: INFR_A1 }, body: { descargos: DESCARGO } }
      )
      // apelar/route.ts:44 — con la unidad vinculada el predicado deja pasar: sin esta
      // cara, «404 a toda apelación» pasaría por regla por fila.
      expect(res.status).toBe(200)
      expect(await cuerpoJson<{ ok: boolean }>(res)).toEqual({ ok: true })
      const fila = await prisma.infraccionIN.findUnique({ where: { id: INFR_A1 } })
      // apelar/route.ts:60-66 — el estado pasa a `apelada` y los descargos quedan en la
      // fila propia (no en la ajena); `:68` emite el único `IN_APELACION`.
      expect(fila?.estado).toBe("apelada")
      expect(fila?.apelacion).toMatchObject({ descargos: DESCARGO })
      expect(
        await prisma.eventoAuditoria.count({
          where: { comunidadId: COM_A, referenciaId: INFR_A1, tipoAccion: "IN_APELACION" },
        })
      ).toBe(1)
    })
  })
})

describe("pe/encomiendas — clave vacía: el residente no lee el portón (lote 3)", () => {
  it("control: conserjería de A abre la encomienda de la unidad de A-2", async () => {
    await conSesion(EMAIL.conserjeA, async () => {
      const res = await invocarApi(moduloEncomienda(), "GET", "pe/encomiendas/[id]", {
        params: { id: ENC_A2 },
      })
      // lib/authz.ts:151 — `pe:encomienda` ver/crear/editar para conserjería, más
      // lib/api/crud-factory.ts:327: el portón lee la fila completa (destinatario,
      // unidad, descripción del paquete). El 403 del residente de abajo es la CLAVE,
      // no la ausencia de la fila.
      expect(res.status).toBe(200)
      expect((await cuerpoJson<{ id: string }>(res)).id).toBe(ENC_A2)

      const otraComunidad = await invocarApi(moduloEncomienda(), "GET", "pe/encomiendas/[id]", {
        params: { id: ENC_B1 },
      })
      // lib/api/crud-factory.ts:335 — 404 cross-comunidad, el mismo contrato del resto.
      expect(otraComunidad.status).toBe(404)
    })
  })

  it("residente A-1 (destinatario de ENC_A1): 403 en la propia, en la ajena y en la colección", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const propia = await invocarApi(moduloEncomienda(), "GET", "pe/encomiendas/[id]", {
        params: { id: ENC_A1 },
      })
      // lib/authz.ts:234 — `pe:encomienda` es un Set vacío EXPLÍCITO para el residente
      // (decisión owner 2026-11-05: el paquete llega por notificación, no leyendo la
      // planilla del portón); el exact key corta el fallback de prefijo de `puede()`
      // (`lib/authz.ts:407-411`). El 403 sale en `lib/api/crud-factory.ts:327` antes de
      // leer la fila. No hay regla por fila que pinchar acá: NINGÚN rol con unidad lee
      // el recurso (solo administración y conserjería, que ven la comunidad entera).
      expect(propia.status).toBe(403)
      const cuerpo = await cuerpoJson<{ error: string }>(propia)
      expect(cuerpo).toEqual({ error: "Permiso denegado." })

      // Control del límite: el 403 es el mismo para la encomienda de la unidad vecina,
      // así que la respuesta no distingue dueño de tercero (ni siquiera confirma que
      // el paquete exista).
      const ajena = await invocarApi(moduloEncomienda(), "GET", "pe/encomiendas/[id]", {
        params: { id: ENC_A2 },
      })
      expect(ajena.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(ajena)).toEqual(cuerpo)

      const coleccion = await invocarApi(moduloEncomiendas(), "GET", "pe/encomiendas?pageSize=100")
      // Misma clave en la colección (`lib/api/crud-factory.ts:220`): no hay lista que
      // filtrar y la de la unidad vecina tampoco aparece.
      expect(coleccion.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(coleccion)).toEqual(cuerpo)
    })
  })
})

describe("ir/entregas-epp — el dueño es `EntregaEPP.personaId` (lote 4)", () => {
  it("control: el administrador de A ve las dos entregas de su comunidad, no la de B", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloEntregasEPP(), "GET", "ir/entregas-epp?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // lib/api/crud-factory.ts:236 — el `where` base es la comunidad: las dos entregas
      // de A existen y son legibles para gestión, así que lo que decide si el residente
      // ve la de A-2 es el alcance por fila, no la ausencia de la fila.
      expect(new Set(j.data.map((e) => e.id))).toEqual(new Set([EPP_A1, EPP_A2]))
    })
  })

  it("residente A-1: la colección no trae la entrega hecha a otra persona", async () => {
    // CERRADO (antes fuga): `GET /api/ir/entregas-epp?pageSize=100` respondía **200**
    // con `data: [ppo-epp-a1, ppo-epp-a2]` —la entrega de A-2 entera, con
    // `personaId: "ppo-p-a2"`, `recursoId: "ppo-rec-guantes"`, `talla: "L"` y
    // `estado: "renovar"`— porque el residente tiene `ir:mantenimiento` ver
    // (lib/authz.ts:259) y la colección filtraba SÓLO la comunidad. Ahora
    // `alcanceEntregasEPP` (app/api/ir/entregas-epp/_alcance.ts) suma `{ personaId }`
    // al `where` del `findMany` Y del `count`, así que la fila ajena no entra ni en
    // la lista ni en el total.
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloEntregasEPP(), "GET", "ir/entregas-epp?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string; personaId: string }>>(res)
      expect(j.data.map((e) => e.id)).toEqual([EPP_A1])
      expect(j.data.every((e) => e.personaId === P_A1)).toBe(true)
      expect(j.total).toBe(1)
    })
  })

  it("residente A-1: su propia entrega → 200; la de otra comunidad → 404", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const propia = await invocarApi(moduloEntregaEPP(), "GET", "ir/entregas-epp/[id]", {
        params: { id: EPP_A1 },
      })
      // app/api/ir/entregas-epp/[id]/route.ts:14-15 + lib/api/crud-factory.ts:327 — el
      // residente tiene `ir:mantenimiento` ver, así que el 200 no es un descuido de la
      // clave: la ruta lo deja pasar y sirve la fila que SÍ es suya (control negativo
      // del 404 que falta en el caso siguiente).
      expect(propia.status).toBe(200)
      expect((await cuerpoJson<{ personaId: string }>(propia)).personaId).toBe(P_A1)

      const otraComunidad = await invocarApi(moduloEntregaEPP(), "GET", "ir/entregas-epp/[id]", {
        params: { id: EPP_B1 },
      })
      // lib/api/crud-factory.ts:335 — `record.comunidadId !== scope.comunidadId` → 404
      // genérico. La comunidad queda cerrada; el DUEÑO de la fila no, que es lo que
      // fijan los dos casos vecinos.
      expect(otraComunidad.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(otraComunidad)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("residente A-1: la entrega de la persona A-2 → 404, no 200 con su talla", async () => {
    // CERRADO (antes fuga): `GET /api/ir/entregas-epp/ppo-epp-a2` respondía **200**
    // con la fila completa (`personaId: "ppo-p-a2"`, `talla: "L"`, `estado:
    // "renovar"`, `proximaRenovacion: "2026-12-04"`) porque la factory leía por id y
    // sólo comparaba la comunidad. Ahora el `findFirst` lleva
    // `{ id, comunidadId, personaId }`: la fila ajena NO se carga y la respuesta es
    // el 404 genérico, sin filtrar que exista.
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloEntregaEPP(), "GET", "ir/entregas-epp/[id]", {
        params: { id: EPP_A2 },
      })
      expect(res.status).toBe(404)
      const cuerpo = await cuerpoJson<Record<string, unknown>>(res)
      expect(cuerpo).toEqual({ error: "Registro no encontrado." })
      expect(cuerpo).not.toHaveProperty("personaId")
      expect(cuerpo).not.toHaveProperty("talla")
      // La fila existe: el 404 es ALCANCE, no ausencia. Si mañana se borrara el
      // arnés, este caso seguiría verde por la razón equivocada.
      expect(await prisma.entregaEPP.findUnique({ where: { id: EPP_A2 } })).not.toBeNull()
    })
  })

  it("residente A-1: PUT de la entrega ajena → 404 por ALCANCE; DELETE → 404 por ALCANCE, la fila intacta", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.entregaEPP.findUnique({ where: { id: EPP_A2 } })
      const put = await invocarApi(moduloEntregaEPP(), "PUT", "ir/entregas-epp/[id]", {
        params: { id: EPP_A2 },
        body: { talla: "XL" },
      })
      // ANTES (hasta que `put-merge` recibió el alcance): este PUT daba **403 por CLAVE**
      // porque la ruta no declaraba `alcance`; `findUnique({ where: { id } })` + comunidad
      // cargaba la fila ajena y el único corte era `authzCheck`. AHORA el PUT resuelve la
      // fila con `findFirst({ id, comunidadId, ...alcanceEntregasEPP })`, igual que el PUT
      // de la factory: la entrega de A-2 no se carga y responde el 404 genérico ANTES de
      // la clave. El 403 por clave sigue fijado en
      // `test/api/ir-entregas-epp-item.test.ts` (comité con la fila propia) y en el
      // control de la entrega PROPIA al final de este mismo caso.
      expect(put.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(put)).toEqual({ error: "Registro no encontrado." })
      expect(await prisma.entregaEPP.findUnique({ where: { id: EPP_A2 } })).toEqual(antes)

      const del = await invocarApi(moduloEntregaEPP(), "DELETE", "ir/entregas-epp/[id]", {
        params: { id: EPP_A2 },
      })
      // El DELETE sí va por la factory (`handlers.DELETE`): la fila se carga con el
      // `where` acotado por `alcanceEntregasEPP`, así que la ajena responde el 404
      // genérico —no 403— y no se toca.
      expect(del.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(del)).toEqual({ error: "Registro no encontrado." })
      expect(await prisma.entregaEPP.findUnique({ where: { id: EPP_A2 } })).toEqual(antes)

      // Control de la frontera: con la entrega PROPIA la fila sí se carga y el corte es
      // por CLAVE (`eliminar` no está en `ir:mantenimiento` del residente).
      const delPropia = await invocarApi(moduloEntregaEPP(), "DELETE", "ir/entregas-epp/[id]", {
        params: { id: EPP_A1 },
      })
      expect(delPropia.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(delPropia)).toEqual({ error: "Permiso denegado." })
      expect(await prisma.entregaEPP.findUnique({ where: { id: EPP_A1 } })).not.toBeNull()
    })
  })

  it("conserjería con identidad MP: PUT de la entrega de otra persona → 404 y la fila intacta; la propia → 200", async () => {
    // El hueco que cierra este caso: `conserjeria` y `mantencion` tienen
    // `ir:mantenimiento` editar (lib/authz.ts:194 y :334) y en el seed real llevan
    // `personaId` (`scripts/seed-authz.mjs:55,57`), así que ya eran alcance por filas
    // para LEER. El PUT de `put-merge` resolvía la fila con `findUnique({ where: { id } })`
    // + comunidad y dejaba escribir la entrega hecha a OTRA persona: la clave `editar`
    // la tenía el rol y el dueño de la fila no se miraba. La sesión es la conserjería
    // con identidad MP (persona A-1).
    await conSesion(EMAIL.trabajadorA, async () => {
      const antes = await prisma.entregaEPP.findUnique({ where: { id: EPP_A2 } })
      const ajena = await invocarApi(moduloEntregaEPP(), "PUT", "ir/entregas-epp/[id]", {
        params: { id: EPP_A2 },
        body: { talla: "XL" },
      })
      // lib/api/put-merge.ts — con `alcance` el `findFirst` lleva
      // `{ id, comunidadId, personaId }`: la entrega de A-2 no se carga y la respuesta es
      // el 404 genérico, no un 200 con la talla cambiada.
      expect(ajena.status).toBe(404)
      const cuerpo = await cuerpoJson<Record<string, unknown>>(ajena)
      expect(cuerpo).toEqual({ error: "Registro no encontrado." })
      expect(cuerpo).not.toHaveProperty("personaId")
      expect(cuerpo).not.toHaveProperty("talla")
      // La fila sigue existiendo y sin tocar: el 404 es ALCANCE, no ausencia.
      expect(await prisma.entregaEPP.findUnique({ where: { id: EPP_A2 } })).toEqual(antes)

      // Control de la frontera: la entrega PROPIA del MISMO rol sí se escribe (200).
      // Sin este control, un alcance que negara todo pasaría el caso de arriba.
      try {
        const propia = await invocarApi(moduloEntregaEPP(), "PUT", "ir/entregas-epp/[id]", {
          params: { id: EPP_A1 },
          body: { talla: "S" },
        })
        expect(propia.status).toBe(200)
        const enBd = await prisma.entregaEPP.findUnique({ where: { id: EPP_A1 } })
        expect(enBd?.talla).toBe("S")
        expect(enBd?.personaId).toBe(P_A1)
      } finally {
        // La talla original vuelve para no dejar el arnés mutado a los casos vecinos.
        await prisma.entregaEPP.update({ where: { id: EPP_A1 }, data: { talla: "M" } })
      }
    })
  })
})

describe("pe/bitacora-visitas — dueño `unidadId`/`destinoPersonaId`, pero ningún rol con unidad entra (lote 4)", () => {
  it("control: la conserjería de A abre la visita de la unidad de A-2", async () => {
    await conSesion(EMAIL.conserjeA, async () => {
      const res = await invocarApi(moduloBitacoraVisita(), "GET", "pe/bitacora-visitas/[id]", {
        params: { id: VIS_A2 },
      })
      // lib/authz.ts:146 — conserjería tiene `pe:bitacora` ver/crear/editar, y
      // lib/api/crud-factory.ts:327 sirve la fila completa: el registro existe y es
      // legible para el portón, con `unidadId`, `destinoPersonaId`, `nombre` y `dni`.
      // El 403 del residente de abajo es la CLAVE, no la ausencia de la fila.
      expect(res.status).toBe(200)
      const fila = await cuerpoJson<{ id: string; unidadId: string }>(res)
      expect(fila.id).toBe(VIS_A2)
      expect(fila.unidadId).toBe(U_A2)

      const collection = await invocarApi(moduloBitacoraVisitas(), "GET", "pe/bitacora-visitas?pageSize=100")
      expect(collection.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(collection)
      // lib/api/crud-factory.ts:236 — la conserjería ve las dos visitas de la comunidad,
      // incluida la de la unidad vecina: el portón no está acotado por unidad.
      expect(new Set(j.data.map((v) => v.id))).toEqual(new Set([VIS_A1, VIS_A2]))
    })
  })

  it("residente A-1: 403 en la visita de SU unidad y en la ajena, con el mismo cuerpo (límite documentado)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const propia = await invocarApi(moduloBitacoraVisita(), "GET", "pe/bitacora-visitas/[id]", {
        params: { id: VIS_A1 },
      })
      // lib/authz.ts:227 — `pe:bitacora` es un Set vacío EXPLÍCITO para el residente: el
      // check exacto de `puede()` lo deja en 403 (lib/authz.ts:407-410) y corta el
      // fallback de prefijo hacia `pe` (lib/authz.ts:415-419). El 403 sale en
      // lib/api/crud-factory.ts:327 antes de leer la fila. LÍMITE DOCUMENTADO: `BitacoraVisitaPE.unidadId` y
      // `destinoPersonaId` tienen dueño, pero NINGÚN rol con alcance de unidad alcanza la
      // ruta (administración, comité, conserjería y mantención ven la comunidad entera),
      // así que la regla por fila de este recurso no es ejercitable: no hay caso por
      // relación que escribir sin inventar un rol. El campo de pertenencia queda nombrado
      // en el inventario de T5 (`permisos-por-objeto-inventario.test.ts`).
      expect(propia.status).toBe(403)
      const cuerpo = await cuerpoJson<{ error: string }>(propia)
      expect(cuerpo).toEqual({ error: "Permiso denegado." })

      // Control del límite: el cuerpo es idéntico para la visita de la unidad vecina, así
      // que la respuesta no distingue dueño de tercero (ni confirma que exista).
      const ajena = await invocarApi(moduloBitacoraVisita(), "GET", "pe/bitacora-visitas/[id]", {
        params: { id: VIS_A2 },
      })
      expect(ajena.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(ajena)).toEqual(cuerpo)

      const coleccion = await invocarApi(
        moduloBitacoraVisitas(),
        "GET",
        "pe/bitacora-visitas?pageSize=100"
      )
      // Misma clave en la colección (lib/api/crud-factory.ts:220): no hay lista que
      // filtrar y la visita de la unidad vecina tampoco aparece.
      expect(coleccion.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(coleccion)).toEqual(cuerpo)
    })
  })
})

describe("ge/solicitudes — el dueño es `SolicitudGE.unidadId` (lote 4)", () => {
  it("control: el administrador de A ve las dos solicitudes de su comunidad, no la de B", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloSolicitudesGE(), "GET", "ge/solicitudes?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // lib/api/crud-factory.ts:236 — el `where` base es la comunidad: las dos solicitudes
      // de A existen y son legibles, así que lo que decide si el residente ve la de la
      // unidad 102 es el alcance por fila, no la ausencia de la fila.
      expect(new Set(j.data.map((s) => s.id))).toEqual(new Set([SOL_A1, SOL_A2]))
    })
  })

  it("residente A-1: la colección no trae la solicitud de la unidad 102", async () => {
    // CERRADO (antes fuga): `GET /api/ge/solicitudes?pageSize=100` respondía **200**
    // con `data: [ppo-sol-a1, ppo-sol-a2]` —la solicitud de la unidad vecina con
    // `unidadId: "ppo-u-a2"`, `solicitantePersonaId: "ppo-p-a2"`, `titulo: "Ruidos
    // molestos de la unidad 102"` y su descripción— porque el residente tiene `ge`
    // ver (lib/authz.ts:262) y la colección filtraba SÓLO la comunidad. Ahora
    // `alcanceSolicitudesGE` (app/api/ge/solicitudes/_alcance.ts) suma
    // `OR: [{ unidadId: { in: vínculos vigentes } }, { solicitantePersonaId }]`, con
    // los vínculos y la persona resueltos en el servidor.
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloSolicitudesGE(), "GET", "ge/solicitudes?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string; unidadId: string }>>(res)
      expect(j.data.map((s) => s.id)).toEqual([SOL_A1])
      expect(j.data.every((s) => s.unidadId === U_A1)).toBe(true)
      expect(j.total).toBe(1)
    })
  })

  it("residente A-1: su propia solicitud → 200; la de otra comunidad → 404", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const propia = await invocarApi(moduloSolicitudGE(), "GET", "ge/solicitudes/[id]", {
        params: { id: SOL_A1 },
      })
      // app/api/ge/solicitudes/[id]/route.ts:13-14 + lib/api/crud-factory.ts:327 — el
      // residente tiene `ge` ver, así que su propia solicitud se sirve (control negativo
      // del 404 que falta en el caso siguiente).
      expect(propia.status).toBe(200)
      expect((await cuerpoJson<{ unidadId: string }>(propia)).unidadId).toBe(U_A1)

      const otraComunidad = await invocarApi(moduloSolicitudGE(), "GET", "ge/solicitudes/[id]", {
        params: { id: SOL_B1 },
      })
      // lib/api/crud-factory.ts:335 — `record.comunidadId !== scope.comunidadId` → 404
      // genérico: la comunidad queda cerrada, el dueño de la fila no.
      expect(otraComunidad.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(otraComunidad)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("residente A-1: la solicitud de la unidad 102 → 404, no 200 con su contenido", async () => {
    // CERRADO (antes fuga): `GET /api/ge/solicitudes/ppo-sol-a2` respondía **200** con
    // la fila completa (`unidadId: "ppo-u-a2"`, `solicitantePersonaId: "ppo-p-a2"`,
    // `titulo: "Ruidos molestos de la unidad 102"`, `estado: "en_revision"` y la
    // descripción del reclamo del vecino) porque la factory leía por id y sólo
    // comparaba la comunidad. Ahora la lectura por id lleva el `where` acotado y la
    // fila ajena no se carga.
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloSolicitudGE(), "GET", "ge/solicitudes/[id]", {
        params: { id: SOL_A2 },
      })
      expect(res.status).toBe(404)
      const cuerpo = await cuerpoJson<Record<string, unknown>>(res)
      expect(cuerpo).toEqual({ error: "Registro no encontrado." })
      expect(cuerpo).not.toHaveProperty("unidadId")
      expect(cuerpo).not.toHaveProperty("titulo")
      // La fila existe: el 404 es ALCANCE, no ausencia.
      expect(await prisma.solicitudGE.findUnique({ where: { id: SOL_A2 } })).not.toBeNull()
    })
  })

  it("residente A-1: crear una solicitud con la unidad y la persona ajenas → rechazada", async () => {
    // CERRADO (antes fuga de ESCRITURA): `POST /api/ge/solicitudes` con
    // `{ unidadId: "ppo-u-a2", solicitantePersonaId: "ppo-p-a2" }` respondía **201** y
    // la fila quedaba creada a nombre de la unidad vecina: el residente tiene `ge`
    // crear (lib/authz.ts:262) y el POST validaba el body sin comparar
    // `unidadId`/`solicitantePersonaId` con los vínculos del actor. Un alta no se
    // puede validar con un `where` (la fila no existe todavía), así que la ruta
    // declara `rechazoDeSolicitudAjena` en `antesDeEscribir`, la misma forma que
    // `rechazoDeEmisionAjena` en `app/api/certificados-ct/route.ts`.
    const intrusa = "ppo-sol-intrusa"
    const propia = "ppo-sol-propia"
    try {
      await conSesion(EMAIL.resA1, async () => {
        const res = await invocarApi(moduloSolicitudesGE(), "POST", "ge/solicitudes", {
          body: {
            id: intrusa,
            folio: "GE-9001",
            tipo: "buzon",
            titulo: "Solicitud a nombre de la unidad 102",
            descripcion: "Alta con la unidad y la persona de un tercero.",
            solicitantePersonaId: P_A2,
            unidadId: U_A2,
            estado: "nuevo",
            fechaCreacion: "2026-11-05",
            comentarios: [],
            historialEstados: [],
          },
        })
        expect(res.status).toBe(404)
        expect(await cuerpoJson<{ error: string }>(res)).toEqual({
          error: "Registro no encontrado.",
        })
        expect(await prisma.solicitudGE.findUnique({ where: { id: intrusa } })).toBeNull()

        // Control de la frontera: la misma alta con la unidad y la persona PROPIAS sí
        // entra (201). Sin este control, un guardia que negara todo pasaría el caso.
        const alta = await invocarApi(moduloSolicitudesGE(), "POST", "ge/solicitudes", {
          body: {
            id: propia,
            folio: "GE-9002",
            tipo: "buzon",
            titulo: "Filtración en el baño de mi unidad",
            descripcion: "Alta con la unidad y la persona de la propia sesión.",
            solicitantePersonaId: P_A1,
            unidadId: U_A1,
            estado: "nuevo",
            fechaCreacion: "2026-11-05",
            comentarios: [],
            historialEstados: [],
          },
        })
        expect(alta.status).toBe(201)
        const enBd = await prisma.solicitudGE.findUnique({ where: { id: propia } })
        expect(enBd?.comunidadId).toBe(COM_A)
        expect(enBd?.unidadId).toBe(U_A1)
      })
    } finally {
      // La base es descartable, el orden no: si el guardia se rompe, la fila intrusa se
      // crea y contaminaría los casos de la colección de este archivo.
      await prisma.solicitudGE.deleteMany({ where: { id: { in: [intrusa, propia] } } })
    }
  })

  it("residente A-1: PUT de la solicitud ajena → 403 por CLAVE y la fila intacta", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.solicitudGE.findUnique({ where: { id: SOL_A2 } })
      const res = await invocarApi(moduloSolicitudGE(), "PUT", "ge/solicitudes/[id]", {
        params: { id: SOL_A2 },
        body: { estado: "cerrado" },
      })
      // lib/api/put-merge.ts:79-80 — `authzCheck(rol, "editar")` sobre `ge`
      // (app/api/ge/solicitudes/[id]/route.ts:13-14): el residente sólo tiene ver+crear
      // (lib/authz.ts:262), así que el 403 es por CLAVE y no por fila. LÍMITE DOCUMENTADO:
      // la escritura de la solicitud no es ejercitable por relación acá (el mismo 403
      // llegaría con la propia); se fija que la fila ajena no cambia.
      expect(res.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({ error: "Permiso denegado." })
      expect(await prisma.solicitudGE.findUnique({ where: { id: SOL_A2 } })).toEqual(antes)
    })
  })
})

describe("ir/solicitudes-insumo — el modelo no tiene `unidadId`: el dueño es `solicitantePersonaId` (lote 4)", () => {
  it("control: el administrador de A ve las dos solicitudes de su comunidad, no la de B", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(
        moduloSolicitudesInsumo(),
        "GET",
        "ir/solicitudes-insumo?pageSize=100"
      )
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // lib/api/crud-factory.ts:236 — las dos solicitudes de A existen y son legibles; lo
      // que oculta (o no) la de A-2 al residente es el alcance por fila.
      expect(new Set(j.data.map((s) => s.id))).toEqual(new Set([INSU_A1, INSU_A2]))
    })
  })

  it("residente A-1: la colección no trae la solicitud de otra persona", async () => {
    // CERRADO (antes fuga): `GET /api/ir/solicitudes-insumo?pageSize=100` respondía
    // **200** con `data: [ppo-insu-a1, ppo-insu-a2]` —la fila ajena con
    // `solicitantePersonaId: "ppo-p-a2"`, `cantidad: 6` y `areaDestino:
    // "Estacionamiento de la unidad 102"`— porque el residente tiene
    // `ir:mantenimiento` ver (lib/authz.ts:259) y la colección filtraba SÓLO la
    // comunidad. Ahora `alcanceSolicitudesInsumoIR` suma `{ solicitantePersonaId }`
    // al `where` del `findMany` Y del `count`. Nota de modelo: `SolicitudInsumoIR`
    // NO tiene `unidadId` (prisma/schema.prisma, model SolicitudInsumoIR), así que
    // el campo de pertenencia real es `solicitantePersonaId`.
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(
        moduloSolicitudesInsumo(),
        "GET",
        "ir/solicitudes-insumo?pageSize=100"
      )
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string; solicitantePersonaId: string }>>(res)
      expect(j.data.map((s) => s.id)).toEqual([INSU_A1])
      expect(j.data.every((s) => s.solicitantePersonaId === P_A1)).toBe(true)
      expect(j.total).toBe(1)
    })
  })

  it("residente A-1: su propia solicitud → 200; la de otra comunidad → 404", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const propia = await invocarApi(
        moduloSolicitudInsumo(),
        "GET",
        "ir/solicitudes-insumo/[id]",
        { params: { id: INSU_A1 } }
      )
      // app/api/ir/solicitudes-insumo/[id]/route.ts:14-15 + lib/api/crud-factory.ts:327 —
      // con `ir:mantenimiento` ver la fila propia se sirve (control negativo).
      expect(propia.status).toBe(200)
      expect((await cuerpoJson<{ solicitantePersonaId: string }>(propia)).solicitantePersonaId).toBe(
        P_A1
      )

      const otraComunidad = await invocarApi(
        moduloSolicitudInsumo(),
        "GET",
        "ir/solicitudes-insumo/[id]",
        { params: { id: INSU_B1 } }
      )
      // lib/api/crud-factory.ts:335 — 404 cross-comunidad, el mismo contrato del resto.
      expect(otraComunidad.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(otraComunidad)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("residente A-1: la solicitud de la persona A-2 → 404, no 200 con su área", async () => {
    // CERRADO (antes fuga): `GET /api/ir/solicitudes-insumo/ppo-insu-a2` respondía
    // **200** con la fila completa (`solicitantePersonaId: "ppo-p-a2"`, `cantidad: 6`,
    // `estado: "entregada"`, `entregaFecha: "2026-11-06"` y `areaDestino` del
    // estacionamiento de la unidad 102) porque la factory sólo comparaba la comunidad.
    // Ahora el `findFirst` lleva `{ id, comunidadId, solicitantePersonaId }`: la fila
    // ajena no se carga.
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(
        moduloSolicitudInsumo(),
        "GET",
        "ir/solicitudes-insumo/[id]",
        { params: { id: INSU_A2 } }
      )
      expect(res.status).toBe(404)
      const cuerpo = await cuerpoJson<Record<string, unknown>>(res)
      expect(cuerpo).toEqual({ error: "Registro no encontrado." })
      expect(cuerpo).not.toHaveProperty("solicitantePersonaId")
      expect(cuerpo).not.toHaveProperty("areaDestino")
      // La fila existe: el 404 es ALCANCE, no ausencia.
      expect(await prisma.solicitudInsumoIR.findUnique({ where: { id: INSU_A2 } })).not.toBeNull()
    })
  })

  it("residente A-1: PUT de la solicitud ajena → 404 por ALCANCE y la fila intacta", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.solicitudInsumoIR.findUnique({ where: { id: INSU_A2 } })
      const res = await invocarApi(
        moduloSolicitudInsumo(),
        "PUT",
        "ir/solicitudes-insumo/[id]",
        { params: { id: INSU_A2 }, body: { estado: "rechazada" } }
      )
      // ANTES (hasta que `put-merge` recibió el alcance): este PUT daba **403 por CLAVE**
      // porque la ruta no declaraba `alcance` y `findUnique` + comunidad cargaba la fila
      // ajena. AHORA `put-merge` resuelve con
      // `findFirst({ id, comunidadId, ...alcanceSolicitudesInsumoIR })`, igual que el PUT
      // de la factory: la solicitud de A-2 no se carga y responde el 404 genérico ANTES
      // de la clave. El 403 por clave sigue fijado en
      // `test/api/ir-solicitudes-insumo-item.test.ts` (comité con la fila propia).
      expect(res.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({ error: "Registro no encontrado." })
      expect(await prisma.solicitudInsumoIR.findUnique({ where: { id: INSU_A2 } })).toEqual(antes)
    })
  })

  it("conserjería con identidad MP: PUT de la solicitud de otra persona → 404 y la fila intacta; la propia → 200", async () => {
    // Mismo hueco que en `ir/entregas-epp`: conserjería y mantención tienen
    // `ir:mantenimiento` editar (lib/authz.ts:194 y :334) y `personaId` en el seed real
    // (`scripts/seed-authz.mjs:55,57`), así que el PUT resolvía la fila con el único
    // filtro de la comunidad y dejaba escribir la solicitud de otra persona.
    await conSesion(EMAIL.trabajadorA, async () => {
      const antes = await prisma.solicitudInsumoIR.findUnique({ where: { id: INSU_A2 } })
      const ajena = await invocarApi(
        moduloSolicitudInsumo(),
        "PUT",
        "ir/solicitudes-insumo/[id]",
        { params: { id: INSU_A2 }, body: { areaDestino: "Intento ajeno" } }
      )
      // lib/api/put-merge.ts — el `findFirst` lleva
      // `{ id, comunidadId, solicitantePersonaId }`: la solicitud de A-2 no se carga.
      expect(ajena.status).toBe(404)
      const cuerpo = await cuerpoJson<Record<string, unknown>>(ajena)
      expect(cuerpo).toEqual({ error: "Registro no encontrado." })
      expect(cuerpo).not.toHaveProperty("solicitantePersonaId")
      expect(await prisma.solicitudInsumoIR.findUnique({ where: { id: INSU_A2 } })).toEqual(antes)

      // Control de la frontera: la solicitud PROPIA del MISMO rol sí se escribe (200).
      try {
        const propia = await invocarApi(
          moduloSolicitudInsumo(),
          "PUT",
          "ir/solicitudes-insumo/[id]",
          { params: { id: INSU_A1 }, body: { areaDestino: "Bodega norte" } }
        )
        expect(propia.status).toBe(200)
        const enBd = await prisma.solicitudInsumoIR.findUnique({ where: { id: INSU_A1 } })
        expect(enBd?.areaDestino).toBe("Bodega norte")
        expect(enBd?.solicitantePersonaId).toBe(P_A1)
      } finally {
        // El área original vuelve para no dejar el arnés mutado a los casos vecinos.
        await prisma.solicitudInsumoIR.update({
          where: { id: INSU_A1 },
          data: { areaDestino: "Pasillo de la unidad 101" },
        })
      }
    })
  })
})

describe("cv/avisos — el visor es de la comunidad: el modelo no tiene dueño por fila (lote 4)", () => {
  it("control: la conserjería de A ve los dos avisos de su comunidad, no el de B", async () => {
    await conSesion(EMAIL.conserjeA, async () => {
      const res = await invocarApi(moduloAvisosCV(), "GET", "cv/avisos?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // lib/authz.ts:196 — `cv` ver para conserjería + lib/api/crud-factory.ts:236: los dos
      // avisos de A existen y son legibles, y el de B queda fuera por comunidad.
      expect(new Set(j.data.map((a) => a.id))).toEqual(new Set([AVISO_A1, AVISO_A2]))
    })
  })

  it("residente A-1: ve los mismos avisos que la gestión y la fila no tiene unidad ni persona dueña", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloAvisosCV(), "GET", "cv/avisos?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<Record<string, unknown> & { id: string }>>(res)
      // lib/authz.ts:276 — `cv` ver para el residente; lib/api/crud-factory.ts:236 — el
      // `where` es la comunidad. LÍMITE DOCUMENTADO: acá NO hay regla de fila que pinchar
      // y el 200 con la colección completa NO es una fuga: el aviso del visor es un
      // mensaje de la comunidad, y el modelo `AvisoCV` (prisma/schema.prisma) no tiene
      // `unidadId` ni `personaId` dueña. Se fija el hecho que lo sostiene, para que la
      // exención del inventario de T5 no se apoye en una suposición.
      expect(new Set(j.data.map((a) => a.id))).toEqual(new Set([AVISO_A1, AVISO_A2]))
      expect(j.data.every((a) => !("unidadId" in a))).toBe(true)
      // `creadoPorPersonaId` es quién publicó el aviso (gestión), no a quién pertenece: en
      // el arnés ningún aviso lo trae, y el residente no crea avisos (`cv` crear es de
      // administración y comité, lib/authz.ts:107).
      expect(j.data.every((a) => a.creadoPorPersonaId == null)).toBe(true)

      const porId = await invocarApi(moduloAvisoCV(), "GET", "cv/avisos/[id]", {
        params: { id: AVISO_A2 },
      })
      // app/api/cv/avisos/[id]/route.ts:15-16 + lib/api/crud-factory.ts:327 — el detalle
      // del aviso es igual de comunitario que la lista: no hay dueño con quien compararlo.
      expect(porId.status).toBe(200)
      expect((await cuerpoJson<{ id: string }>(porId)).id).toBe(AVISO_A2)

      const otraComunidad = await invocarApi(moduloAvisoCV(), "GET", "cv/avisos/[id]", {
        params: { id: AVISO_B1 },
      })
      // lib/api/crud-factory.ts:335 — el único límite que sí existe: el aviso de la otra
      // comunidad responde 404 genérico.
      expect(otraComunidad.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(otraComunidad)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })
})

describe("rol acotado SIN identidad MP — falla cerrado (T16)", () => {
  it("conserjería sin `personaId`: `ir/entregas-epp` no devuelve filas ni por id, y el PUT no escribe", async () => {
    // La trampa: `alcanceEntregasEPP` devolvía `null` («sin restricción por fila»)
    // cuando el `Usuario` no tenía `personaId`. Para administrador y comité eso es
    // correcto —no están acotados por fila—, pero para conserjería (acotada por
    // fila: `ir:mantenimiento` ver, lib/authz.ts:194) era un fail-open: la sesión
    // sin ficha MP veía y escribía TODAS las entregas de la comunidad. Sin
    // identidad no hay «lo propio» que comparar, así que la respuesta correcta es
    // el fragmento que no matchea nada —`{ id: { in: [] } }`—, el mismo patrón de
    // `alcanceCertificadosCT` (app/api/certificados-ct/route.ts).
    await conSesion(EMAIL.conserjeA, async () => {
      const lista = await invocarApi(moduloEntregasEPP(), "GET", "ir/entregas-epp?pageSize=100")
      expect(lista.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(lista)
      // ANTES (RED): `data: [ppo-epp-a1, ppo-epp-a2]` y `total: 2`, con la entrega
      // hecha a otra persona incluida.
      expect(j.data).toEqual([])
      expect(j.total).toBe(0)

      const porId = await invocarApi(moduloEntregaEPP(), "GET", "ir/entregas-epp/[id]", {
        params: { id: EPP_A1 },
      })
      // ANTES (RED): 200 con la fila completa. El 404 es ALCANCE, no ausencia: la
      // fila existe y el caso siguiente lo comprueba.
      expect(porId.status).toBe(404)
      const cuerpo = await cuerpoJson<Record<string, unknown>>(porId)
      expect(cuerpo).toEqual({ error: "Registro no encontrado." })
      expect(cuerpo).not.toHaveProperty("personaId")
      expect(cuerpo).not.toHaveProperty("talla")

      const antes = await prisma.entregaEPP.findUnique({ where: { id: EPP_A1 } })
      expect(antes).not.toBeNull()
      const put = await invocarApi(moduloEntregaEPP(), "PUT", "ir/entregas-epp/[id]", {
        params: { id: EPP_A1 },
        body: { talla: "XL" },
      })
      // ANTES (RED): 200 y la talla cambiada — conserjería tiene `editar` y el
      // `findFirst` del put-merge no llevaba fragmento, así que la fila se cargaba
      // con el único filtro de la comunidad.
      expect(put.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(put)).toEqual({
        error: "Registro no encontrado.",
      })
      expect(await prisma.entregaEPP.findUnique({ where: { id: EPP_A1 } })).toEqual(antes)
    })
  })

  it("conserjería sin `personaId`: `ir/solicitudes-insumo` no devuelve filas ni por id, y el PUT no escribe", async () => {
    // Misma trampa y misma regla en `alcanceSolicitudesInsumoIR`: el dueño de la
    // fila es `solicitantePersonaId` y sin persona no hay dueño con quien comparar.
    await conSesion(EMAIL.conserjeA, async () => {
      const lista = await invocarApi(
        moduloSolicitudesInsumo(),
        "GET",
        "ir/solicitudes-insumo?pageSize=100"
      )
      expect(lista.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(lista)
      // ANTES (RED): `data: [ppo-insu-a1, ppo-insu-a2]` y `total: 2`.
      expect(j.data).toEqual([])
      expect(j.total).toBe(0)

      const porId = await invocarApi(moduloSolicitudInsumo(), "GET", "ir/solicitudes-insumo/[id]", {
        params: { id: INSU_A1 },
      })
      expect(porId.status).toBe(404)
      expect(await cuerpoJson<Record<string, unknown>>(porId)).toEqual({
        error: "Registro no encontrado.",
      })

      const antes = await prisma.solicitudInsumoIR.findUnique({ where: { id: INSU_A1 } })
      expect(antes).not.toBeNull()
      const put = await invocarApi(moduloSolicitudInsumo(), "PUT", "ir/solicitudes-insumo/[id]", {
        params: { id: INSU_A1 },
        body: { areaDestino: "Intento sin identidad" },
      })
      expect(put.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(put)).toEqual({
        error: "Registro no encontrado.",
      })
      expect(await prisma.solicitudInsumoIR.findUnique({ where: { id: INSU_A1 } })).toEqual(antes)
    })
  })

  it("residente sin `personaId`: `ge/solicitudes` no devuelve filas ni por id", async () => {
    // `ge` ver lo tienen administrador, comité y residente (lib/authz.ts:262); el
    // único rol ACOTADO por fila es el residente, así que la sesión sin identidad
    // que llega a esta ruta es un residente sin ficha MP. `alcanceSolicitudesGE`
    // devolvía `null` en ese caso y la colección traía las solicitudes de TODA la
    // comunidad. La ESCRITURA de este rol ya fallaba cerrado: no tiene `ge` editar
    // (el PUT responde 403 por CLAVE) y el POST pasa por
    // `rechazoDeSolicitudAjena`, que sin persona/vínculos rechaza cualquier
    // payload con unidad o persona; por eso acá se fija la LECTURA.
    await conSesion(EMAIL.resSinId, async () => {
      const lista = await invocarApi(moduloSolicitudesGE(), "GET", "ge/solicitudes?pageSize=100")
      expect(lista.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(lista)
      // ANTES (RED): `data: [ppo-sol-a1, ppo-sol-a2]` y `total: 2`.
      expect(j.data).toEqual([])
      expect(j.total).toBe(0)

      const porId = await invocarApi(moduloSolicitudGE(), "GET", "ge/solicitudes/[id]", {
        params: { id: SOL_A1 },
      })
      expect(porId.status).toBe(404)
      const cuerpo = await cuerpoJson<Record<string, unknown>>(porId)
      expect(cuerpo).toEqual({ error: "Registro no encontrado." })
      expect(cuerpo).not.toHaveProperty("unidadId")
      expect(cuerpo).not.toHaveProperty("titulo")
      // La fila existe: el 404 es ALCANCE, no ausencia.
      expect(await prisma.solicitudGE.findUnique({ where: { id: SOL_A1 } })).not.toBeNull()

      // PRESERVE de la guardia de escritura: `rechazoDeSolicitudAjena` ya fallaba
      // cerrado sin identidad (sin persona/vínculos, cualquier unidad o persona del
      // payload es ajena) y el cambio de definición compartida no puede aflojarla.
      const intrusa = "ppo-sol-sin-id"
      try {
        const alta = await invocarApi(moduloSolicitudesGE(), "POST", "ge/solicitudes", {
          body: {
            id: intrusa,
            folio: "GE-9100",
            tipo: "buzon",
            titulo: "Alta de una sesión sin identidad",
            descripcion: "Intento de alta con la unidad y la persona de un tercero.",
            solicitantePersonaId: P_A1,
            unidadId: U_A1,
            estado: "nuevo",
            fechaCreacion: "2026-11-05",
            comentarios: [],
            historialEstados: [],
          },
        })
        expect(alta.status).toBe(404)
        expect(await cuerpoJson<{ error: string }>(alta)).toEqual({
          error: "Registro no encontrado.",
        })
        expect(await prisma.solicitudGE.findUnique({ where: { id: intrusa } })).toBeNull()
      } finally {
        await prisma.solicitudGE.deleteMany({ where: { id: intrusa } })
      }
    })
  })

  it("control: el administrador de A, también sin `personaId`, sigue viendo la comunidad entera", async () => {
    // El complemento obligatorio del bloque: la corrección es «rol acotado sin
    // identidad → nada», NO «sin `personaId` → nada». El administrador del arnés
    // se siembra con `personaId: null` a propósito, así que si el arreglo se
    // hubiera hecho por «personaId ausente» en vez de por ROL, este caso caería
    // con las tres colecciones vacías.
    await conSesion(EMAIL.adminA, async () => {
      const epp = await cuerpoJson<Envelope<{ id: string }>>(
        await invocarApi(moduloEntregasEPP(), "GET", "ir/entregas-epp?pageSize=100")
      )
      expect(new Set(epp.data.map((e) => e.id))).toEqual(new Set([EPP_A1, EPP_A2]))

      const insumo = await cuerpoJson<Envelope<{ id: string }>>(
        await invocarApi(moduloSolicitudesInsumo(), "GET", "ir/solicitudes-insumo?pageSize=100")
      )
      expect(new Set(insumo.data.map((s) => s.id))).toEqual(new Set([INSU_A1, INSU_A2]))

      const ge = await cuerpoJson<Envelope<{ id: string }>>(
        await invocarApi(moduloSolicitudesGE(), "GET", "ge/solicitudes?pageSize=100")
      )
      expect(new Set(ge.data.map((s) => s.id))).toEqual(new Set([SOL_A1, SOL_A2]))

      // El detalle de gestión tampoco se acota: la fila se sirve completa.
      const detalle = await invocarApi(moduloEntregaEPP(), "GET", "ir/entregas-epp/[id]", {
        params: { id: EPP_A2 },
      })
      expect(detalle.status).toBe(200)
      expect((await cuerpoJson<{ personaId: string }>(detalle)).personaId).toBe(P_A2)
    })
  })
})

// ── Lote 5: cierres de turno, reservas y los tres recursos sin dueño por fila ─

describe("pe/cierres-turno — el dueño es `CierreTurnoPE.trabajadorPersonaId` (lote 5)", () => {
  it("control: el administrador de A lee los dos cierres de su comunidad, no el de B", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloCierresTurno(), "GET", "pe/cierres-turno?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      // lib/api/crud-factory.ts:236 — el `where` base es la comunidad: los dos cierres de A
      // existen y son legibles para gestión, así que lo que decide si la conserjería ve el
      // cierre del otro trabajador es el alcance por fila, no la ausencia de la fila.
      expect(new Set(j.data.map((c) => c.id))).toEqual(new Set([CIERRE_A1, CIERRE_A2]))
    })
  })

  it("conserjería A-1: la colección devuelve solo el cierre de SU persona, no el del trabajador A-2", async () => {
    // CERRADO (antes fuga): `GET /api/pe/cierres-turno?pageSize=100` respondía **200**
    // con `data: [ppo-cierre-a1, ppo-cierre-a2]` —el cierre del otro trabajador con sus
    // `novedadesGenerales`— porque la conserjería tiene `pe:cierre_turno` ver
    // (lib/authz.ts:158) y la colección filtraba SÓLO la comunidad. Ahora
    // `alcanceCierresTurnoPE` (`app/api/pe/cierres-turno/_alcance.ts`) suma
    // `{ trabajadorPersonaId }` al `where` del `findMany` Y del `count`
    // (lib/api/crud-factory.ts:320,325), así que la fila ajena no entra ni en la lista
    // ni en el total. La pantalla que lo consumía (`app/personas/personal/page.tsx`,
    // monitor de jornadas) está en el menú de administración, que conserva la
    // comunidad entera; ningún consumidor es un rol acotado que necesite ver el turno
    // del otro.
    await conSesion(EMAIL.trabajadorA, async () => {
      const res = await invocarApi(moduloCierresTurno(), "GET", "pe/cierres-turno?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<
        Envelope<{ id: string; trabajadorPersonaId: string; novedadesGenerales: string }>
      >(res)
      expect(j.data.map((c) => c.id)).toEqual([CIERRE_A1])
      expect(j.data.every((c) => c.trabajadorPersonaId === P_A1)).toBe(true)
      // El dato de tercero que viajaba en la lista: las novedades del turno ajeno.
      expect(j.data.map((c) => c.novedadesGenerales)).not.toContain(
        `Novedades del turno de ${P_A2}`
      )
      expect(j.total).toBe(1)
    })
  })

  it("conserjería sin identidad MP: la colección de cierres → total 0 (falla cerrado, T16)", async () => {
    // Misma decisión que en el detalle: `alcancePorFilasDeSesion` devuelve `denegado` y
    // el fragmento es `{ id: { in: [] } }`, no `null`. Sin este caso, «sin persona» en la
    // COLECCIÓN podría volver a leerse como «sin restricción por fila» y el portón vería
    // los turnos de todo el edificio.
    await conSesion(EMAIL.conserjeA, async () => {
      const res = await invocarApi(moduloCierresTurno(), "GET", "pe/cierres-turno?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(res)
      expect(j.data).toEqual([])
      expect(j.total).toBe(0)
    })
  })

  it("conserjería A-1: el cierre de SU persona → 200; el del trabajador A-2 → 404, no 200 con sus novedades", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const propia = await invocarApi(moduloCierreTurno(), "GET", "pe/cierres-turno/[id]", {
        params: { id: CIERRE_A1 },
      })
      // lib/authz.ts:158 — conserjería tiene `pe:cierre_turno` ver, y
      // `alcanceCierresTurnoPE` (`app/api/pe/cierres-turno/_alcance.ts`) deja pasar la fila
      // porque `trabajadorPersonaId` es la persona de la sesión. Control negativo del 404:
      // sin esta mitad, un alcance que negara TODO pasaría el caso de abajo.
      expect(propia.status).toBe(200)
      expect((await cuerpoJson<{ trabajadorPersonaId: string }>(propia)).trabajadorPersonaId).toBe(
        P_A1
      )

      const ajena = await invocarApi(moduloCierreTurno(), "GET", "pe/cierres-turno/[id]", {
        params: { id: CIERRE_A2 },
      })
      // ANTES (fuga): 200 con la fila completa del otro trabajador —`novedadesGenerales`,
      // `incidencias`, los dos checklist y el `historialCambios`— porque la factory leía por
      // id y sólo comparaba la comunidad. AHORA el `findFirst` lleva
      // `{ id, comunidadId, trabajadorPersonaId }` y la respuesta es el 404 genérico.
      expect(ajena.status).toBe(404)
      const cuerpo = await cuerpoJson<Record<string, unknown>>(ajena)
      expect(cuerpo).toEqual({ error: "Registro no encontrado." })
      expect(cuerpo).not.toHaveProperty("trabajadorPersonaId")
      expect(cuerpo).not.toHaveProperty("novedadesGenerales")
      // La fila EXISTE: el 404 es ALCANCE, no ausencia.
      expect(await prisma.cierreTurnoPE.findUnique({ where: { id: CIERRE_A2 } })).not.toBeNull()
    })
  })

  it("conserjería A-1: PUT del cierre del trabajador A-2 → 404 y la fila intacta; el propio → 200", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const antes = await prisma.cierreTurnoPE.findUnique({ where: { id: CIERRE_A2 } })
      const ajena = await invocarApi(moduloCierreTurno(), "PUT", "pe/cierres-turno/[id]", {
        params: { id: CIERRE_A2 },
        body: { novedadesGenerales: "Edición del cierre ajeno" },
      })
      // ANTES (fuga): 200 y `novedadesGenerales` del otro trabajador reescrita — la
      // conserjería tiene `pe:cierre_turno` editar (lib/authz.ts:158) y `put-merge`
      // resolvía la fila con `findUnique({ where: { id } })` + comunidad. AHORA recibe el
      // MISMO `alcanceCierresTurnoPE` que la lectura, no un segundo filtro.
      expect(ajena.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(ajena)).toEqual({
        error: "Registro no encontrado.",
      })
      expect(await prisma.cierreTurnoPE.findUnique({ where: { id: CIERRE_A2 } })).toEqual(antes)

      // Control de la frontera: el cierre PROPIO del mismo rol sí se escribe (200).
      try {
        const propia = await invocarApi(moduloCierreTurno(), "PUT", "pe/cierres-turno/[id]", {
          params: { id: CIERRE_A1 },
          body: { novedadesGenerales: "Novedades corregidas por el propio trabajador" },
        })
        expect(propia.status).toBe(200)
        const enBd = await prisma.cierreTurnoPE.findUnique({ where: { id: CIERRE_A1 } })
        expect(enBd?.novedadesGenerales).toBe("Novedades corregidas por el propio trabajador")
        expect(enBd?.trabajadorPersonaId).toBe(P_A1)
      } finally {
        // Las novedades originales vuelven para no dejar el arnés mutado a los casos vecinos.
        await prisma.cierreTurnoPE.update({
          where: { id: CIERRE_A1 },
          data: { novedadesGenerales: `Novedades del turno de ${P_A1}` },
        })
      }
    })
  })

  it("conserjería sin identidad MP: el detalle y el PUT de un cierre → 404 (falla cerrado, T16)", async () => {
    // `conserjeA` es conserjería (`pe:cierre_turno` ver/editar) SIN ficha MP: el fragmento
    // es `{ id: { in: [] } }`, no `null`. Sin este caso, «sin persona» podría volver a
    // leerse como «sin restricción por fila» y la comunidad quedaría abierta.
    await conSesion(EMAIL.conserjeA, async () => {
      const antes = await prisma.cierreTurnoPE.findUnique({ where: { id: CIERRE_A2 } })
      const detalle = await invocarApi(moduloCierreTurno(), "GET", "pe/cierres-turno/[id]", {
        params: { id: CIERRE_A2 },
      })
      expect(detalle.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(detalle)).toEqual({
        error: "Registro no encontrado.",
      })

      const put = await invocarApi(moduloCierreTurno(), "PUT", "pe/cierres-turno/[id]", {
        params: { id: CIERRE_A2 },
        body: { novedadesGenerales: "Intento sin identidad" },
      })
      expect(put.status).toBe(404)
      expect(await prisma.cierreTurnoPE.findUnique({ where: { id: CIERRE_A2 } })).toEqual(antes)
    })
  })
})

describe("ra/reservas — el dueño es `ReservaRA.solicitantePersonaId` (lote 5)", () => {
  it("residente A-1: su reserva → 200; la de la unidad 102 → 404, no 200 con su folio y sus montos", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const propia = await invocarApi(moduloReservaRA(), "GET", "ra/reservas/[id]", {
        params: { id: RES_A1 },
      })
      // lib/authz.ts:261 — el residente tiene `ra` ver, y `alcanceReservasRA`
      // (`app/api/ra/reservas/_alcance.ts`) deja pasar la fila porque
      // `solicitantePersonaId` es su persona.
      expect(propia.status).toBe(200)
      expect(
        (await cuerpoJson<{ solicitantePersonaId: string }>(propia)).solicitantePersonaId
      ).toBe(P_A1)

      const ajena = await invocarApi(moduloReservaRA(), "GET", "ra/reservas/[id]", {
        params: { id: RES_A2 },
      })
      // ANTES (fuga): 200 con `folio`, `horaInicio`/`horaFin`, `montoTarifa`,
      // `montoGarantia`, `unidadId` y `solicitantePersonaId` de otra unidad. AHORA el
      // `findFirst` lleva `{ id, comunidadId, solicitantePersonaId }` → 404 genérico.
      expect(ajena.status).toBe(404)
      const cuerpo = await cuerpoJson<Record<string, unknown>>(ajena)
      expect(cuerpo).toEqual({ error: "Registro no encontrado." })
      expect(cuerpo).not.toHaveProperty("solicitantePersonaId")
      expect(cuerpo).not.toHaveProperty("folio")
      // La fila EXISTE: el 404 es ALCANCE, no ausencia.
      expect(await prisma.reservaRA.findUnique({ where: { id: RES_A2 } })).not.toBeNull()

      const otraComunidad = await invocarApi(moduloReservaRA(), "GET", "ra/reservas/[id]", {
        params: { id: RES_B1 },
      })
      expect(otraComunidad.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(otraComunidad)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("residente A-1: PUT de la reserva ajena → 404 por ALCANCE; la propia → 403 por CLAVE (sin `editar` en `ra`)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const antes = await prisma.reservaRA.findUnique({ where: { id: RES_A2 } })
      const ajena = await invocarApi(moduloReservaRA(), "PUT", "ra/reservas/[id]", {
        params: { id: RES_A2 },
        body: { horaFin: "15:00" },
      })
      // Orden del put-merge (`lib/api/put-merge.ts`): la fila se resuelve ANTES del authz,
      // así que la ajena responde 404 —el delta de contrato aceptado en
      // `odd/tasks/permisos-por-objeto.md` (L18)— y no un 403 que confirmaría existencia.
      expect(ajena.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(ajena)).toEqual({
        error: "Registro no encontrado.",
      })
      expect(await prisma.reservaRA.findUnique({ where: { id: RES_A2 } })).toEqual(antes)

      // La fila PROPIA se carga y el corte es la CLAVE: el residente no tiene `ra`
      // editar (lib/authz.ts:261), así que el PUT es 403 y no escribe nada.
      const propia = await invocarApi(moduloReservaRA(), "PUT", "ra/reservas/[id]", {
        params: { id: RES_A1 },
        body: { horaFin: "13:00" },
      })
      expect(propia.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(propia)).toEqual({ error: "Permiso denegado." })
      expect((await prisma.reservaRA.findUnique({ where: { id: RES_A1 } }))?.horaFin).toBe("12:00")
    })
  })

  it("residente A-1: la colección conserva el tramo AJENO (ocupación) y redacta quién, unidad y montos (T18)", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloReservasRA(), "GET", "ra/reservas?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<Record<string, unknown>>>(res)
      // ANTES (fuga): `GET /api/ra/reservas` servía la fila ajena COMPLETA —
      // `solicitantePersonaId`, `unidadId`, `montoTarifa`, `montoGarantia`,
      // `cargoFIReferencia`, la penalización de la cancelación y la garantía retenida de
      // la otra unidad— porque la colección no tiene alcance a propósito (es el calendario
      // que el residente necesita para ver los tramos ocupados) y la factory no tenía
      // proyección de respuesta. AHORA `proyectarReservaRA`
      // (`app/api/ra/reservas/_alcance.ts`) redacta la fila ajena en la RESPUESTA.
      const total = await prisma.reservaRA.count({ where: { comunidadId: COM_A } })
      // El `total` NO se redacta: es la ocupación, no la identidad.
      expect(j.total).toBe(total)
      expect(j.data).toHaveLength(total)
      expect(new Set(j.data.map((r) => r.id))).toEqual(
        new Set([RES_A1, RES_A2, RES_CANCELABLE, RES_A2_CARGO])
      )

      const ajena = j.data.find((r) => r.id === RES_A2_CARGO)!
      // La OCUPACIÓN del tramo se conserva (es lo que el calendario necesita).
      expect(ajena).toMatchObject({
        id: RES_A2_CARGO,
        folio: `RA-${RES_A2_CARGO}`,
        elementoId: "ppo-elemento-quincho",
        fecha: "2026-11-12",
        horaInicio: "18:00",
        horaFin: "20:00",
        estado: "cancelada",
      })
      // La IDENTIDAD y el DINERO no: todo campo que nombra a la persona, a la unidad
      // o al monto de la fila ajena viaja en `null`.
      expect(ajena.solicitantePersonaId).toBeNull()
      expect(ajena.unidadId).toBeNull()
      expect(ajena.montoTarifa).toBeNull()
      expect(ajena.montoGarantia).toBeNull()
      expect(ajena.cargoFIReferencia).toBeNull()
      expect(ajena.garantiaRetenida).toBeNull()
      // La penalización es dinero: de la cancelación sobreviven los hechos del tramo.
      expect(ajena.cancelacion).toEqual({
        fecha: "2026-11-10",
        tardia: true,
        penalizacion: null,
      })

      // La fila de la BD sigue completa: la redacción es de la respuesta, no del dato.
      const enBD = await prisma.reservaRA.findUnique({ where: { id: RES_A2_CARGO } })
      expect(enBD?.solicitantePersonaId).toBe(P_A2)
      expect(enBD?.unidadId).toBe(U_A2)
      expect(enBD?.montoTarifa).toBe(15000)
      expect(enBD?.montoGarantia).toBe(5000)
      expect(enBD?.cargoFIReferencia).toBe("ppo-cargo-fi-ajeno")

      // La fila PROPIA no se toca: el dueño conserva su identidad y sus montos.
      const propia = j.data.find((r) => r.id === RES_A1)!
      expect(propia.solicitantePersonaId).toBe(P_A1)
      expect(propia.unidadId).toBe(U_A1)
      expect(propia.montoTarifa).toBe(15000)
      expect(propia.montoGarantia).toBe(5000)
    })
  })

  it("control: el administrador de A recibe la misma colección SIN redactar (T18)", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloReservasRA(), "GET", "ra/reservas?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<Envelope<Record<string, unknown>>>(res)
      // Gestión no está acotada por fila (`alcancePorFilasDeSesion` → `comunidad`), así
      // que la proyección devuelve la fila tal cual: nada se nullifica.
      const ajena = j.data.find((r) => r.id === RES_A2_CARGO)!
      expect(ajena).toMatchObject({
        solicitantePersonaId: P_A2,
        unidadId: U_A2,
        montoTarifa: 15000,
        montoGarantia: 5000,
        cargoFIReferencia: "ppo-cargo-fi-ajeno",
        garantiaRetenida: { monto: 5000, motivo: MOTIVO_RETENCION_A2 },
      })
      // El motivo de la cancelación es dato de la fila: gestión lo conserva completo.
      expect(ajena.cancelacion).toEqual({
        fecha: "2026-11-10",
        tardia: true,
        penalizacion: 2500,
        motivo: MOTIVO_CANCELACION_A2,
      })
    })
  })

  it("residente sin identidad MP: el detalle de una reserva → 404 (falla cerrado, T16)", async () => {
    await conSesion(EMAIL.resSinId, async () => {
      const res = await invocarApi(moduloReservaRA(), "GET", "ra/reservas/[id]", {
        params: { id: RES_A1 },
      })
      // Misma regla que el bloque T16: un rol acotado sin `personaId` no tiene «lo propio»
      // que comparar, así que el fragmento no matchea nada.
      expect(res.status).toBe(404)
      expect(await cuerpoJson<Record<string, unknown>>(res)).toEqual({
        error: "Registro no encontrado.",
      })
      expect(await prisma.reservaRA.findUnique({ where: { id: RES_A1 } })).not.toBeNull()
    })
  })

  it("cancelar: ningún rol acotado alcanza la acción — residente 403 con el MISMO cuerpo para la propia y la ajena (límite documentado)", async () => {
    // Control: la acción existe y funciona para el único rol que la alcanza. Sin esta
    // mitad, el 403 del residente podría ser una ruta rota y no una clave.
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(
        moduloCancelarReservaRA(),
        "POST",
        "ra/reservas/[id]/cancelar",
        { params: { id: RES_CANCELABLE } }
      )
      expect(res.status).toBe(200)
      expect(await cuerpoJson<{ ok: boolean }>(res)).toEqual({ ok: true })
      expect((await prisma.reservaRA.findUnique({ where: { id: RES_CANCELABLE } }))?.estado).toBe(
        "cancelada"
      )
    })

    // LÍMITE DOCUMENTADO: `contextoAccionRA` (`app/api/ra/_acciones.ts:56`) exige
    // `puede(rol, "editar", "ra")` y la matriz sólo se lo da a administración
    // (lib/authz.ts:261 — el residente tiene ver/crear). Ningún rol acotado alcanza la
    // acción, así que no hay regla por fila que ejercitar: el residente no puede cancelar
    // NI SU PROPIA reserva. Disparador para cuando la matriz le dé `editar`: esta ruta
    // tiene que resolver la fila con `alcanceReservasRA`, igual que el `[id]`.
    await conSesion(EMAIL.resA1, async () => {
      const propia = await invocarApi(
        moduloCancelarReservaRA(),
        "POST",
        "ra/reservas/[id]/cancelar",
        { params: { id: RES_A1 } }
      )
      expect(propia.status).toBe(403)
      const cuerpo = await cuerpoJson<{ error: string }>(propia)
      expect(cuerpo).toEqual({ error: "Permiso denegado." })

      // El cuerpo es idéntico para la reserva de la unidad vecina: la respuesta no
      // distingue dueño de tercero (ni confirma que la fila exista).
      const ajena = await invocarApi(
        moduloCancelarReservaRA(),
        "POST",
        "ra/reservas/[id]/cancelar",
        { params: { id: RES_A2 } }
      )
      expect(ajena.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(ajena)).toEqual(cuerpo)

      // Nada se canceló: el rechazo por clave ocurre antes de la transición de estado.
      expect((await prisma.reservaRA.findUnique({ where: { id: RES_A1 } }))?.estado).toBe(
        "confirmada"
      )
      expect((await prisma.reservaRA.findUnique({ where: { id: RES_A2 } }))?.estado).toBe(
        "confirmada"
      )
    })
  })
})

describe("pe/mantenciones, pe/proyecciones y leads-portal — el modelo no tiene dueño por fila (lote 5)", () => {
  it("`pe:mantenciones`: la conserjería lee la mantención de su comunidad y la fila no tiene unidad ni persona", async () => {
    await conSesion(EMAIL.conserjeA, async () => {
      const res = await invocarApi(moduloMantencionPE(), "GET", "pe/mantenciones/[id]", {
        params: { id: MANT_A1 },
      })
      // lib/authz.ts:166 — conserjería y mantención tienen `pe:mantenciones` ver, y la
      // ruta sirve la fila completa. NO es una fuga: `MantencionPreventivaPE`
      // (prisma/schema.prisma) no tiene `unidadId` ni `personaId` —`proveedorId` es el
      // maestro del proveedor, no el dueño de la fila—, así que no hay campo por el que
      // acotar. Es el motivo del `exento` del inventario de T5, fijado sobre la fila real.
      expect(res.status).toBe(200)
      const fila = await cuerpoJson<Record<string, unknown>>(res)
      expect(fila.id).toBe(MANT_A1)
      expect(fila).not.toHaveProperty("unidadId")
      expect(fila).not.toHaveProperty("personaId")
      expect(fila).not.toHaveProperty("trabajadorPersonaId")

      // Único límite que existe: la comunidad (404 genérico).
      const otraComunidad = await invocarApi(moduloMantencionPE(), "GET", "pe/mantenciones/[id]", {
        params: { id: MANT_B1 },
      })
      expect(otraComunidad.status).toBe(404)

      // Y ningún rol acotado la escribe: `pe:mantenciones` sólo da `ver` a conserjería y
      // mantención (lib/authz.ts:166,327), así que el corte es por CLAVE.
      const put = await invocarApi(moduloMantencionPE(), "PUT", "pe/mantenciones/[id]", {
        params: { id: MANT_A1 },
        body: { alertaDiasAntes: 14 },
      })
      expect(put.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(put)).toEqual({ error: "Permiso denegado." })
      expect(
        (await prisma.mantencionPreventivaPE.findUnique({ where: { id: MANT_A1 } }))
          ?.alertaDiasAntes
      ).toBe(7)
    })
  })

  it("`pe:proyeccion`: la conserjería edita la proyección de la comunidad y la fila no tiene dueño", async () => {
    await conSesion(EMAIL.conserjeA, async () => {
      const res = await invocarApi(moduloProyeccionPE(), "GET", "pe/proyecciones/[id]", {
        params: { id: PROY_A1 },
      })
      // `ProyeccionPE` no tiene `unidadId` ni `personaId`: es el cálculo de costo del
      // personal del edificio, una fila de la comunidad. Por eso la exención del
      // inventario de T5, y por eso la conserjería la escribe con `pe:proyeccion` editar
      // (lib/authz.ts:179) sin que haya dueño que comparar.
      expect(res.status).toBe(200)
      const fila = await cuerpoJson<Record<string, unknown>>(res)
      expect(fila).not.toHaveProperty("unidadId")
      expect(fila).not.toHaveProperty("personaId")
      expect(fila).not.toHaveProperty("trabajadorPersonaId")

      const put = await invocarApi(moduloProyeccionPE(), "PUT", "pe/proyecciones/[id]", {
        params: { id: PROY_A1 },
        body: { costoEstimado: 1234567 },
      })
      expect(put.status).toBe(200)
      expect(
        (await prisma.proyeccionPE.findUnique({ where: { id: PROY_A1 } }))?.costoEstimado
      ).toBe(1234567)
    })
  })

  it("leads-portal: sólo la administración llega (403 por clave para residente y conserjería) y la fila no tiene dueño", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(moduloLeadPortal(), "GET", "leads-portal/[id]", {
        params: { id: LEAD_A1 },
      })
      // `LeadPortal` sólo tiene `comunidadId`: el dato es de un prospecto del portal, no de
      // una unidad ni de una persona de la comunidad. Es el motivo del `exento` de T5.
      expect(res.status).toBe(200)
      const fila = await cuerpoJson<Record<string, unknown>>(res)
      expect(fila.id).toBe(LEAD_A1)
      expect(fila).not.toHaveProperty("unidadId")
      expect(fila).not.toHaveProperty("personaId")
    })

    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(moduloLeadPortal(), "GET", "leads-portal/[id]", {
        params: { id: LEAD_A1 },
      })
      // `pi` no existe en la matriz (lib/authz.ts): sólo el wildcard del administrador
      // pasa, así que el 403 es por CLAVE y no queda rol acotado con acceso que acotar
      // por fila (segunda razón del `exento`).
      expect(res.status).toBe(403)
      const cuerpo = await cuerpoJson<{ error: string }>(res)
      expect(cuerpo).toEqual({ error: "Permiso denegado." })
      expect(await prisma.leadPortal.findUnique({ where: { id: LEAD_A1 } })).not.toBeNull()
    })

    await conSesion(EMAIL.conserjeA, async () => {
      const res = await invocarApi(moduloLeadPortal(), "GET", "leads-portal/[id]", {
        params: { id: LEAD_A1 },
      })
      expect(res.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({ error: "Permiso denegado." })
    })
  })
})

// ── Lote 6 (T17): el ALTA no puede atribuir la fila a otro dueño ─────────────
//
// El alcance por filas (`alcance`, `_alcance.ts` de cada recurso) acota filas
// EXISTENTES: colección, detalle, PUT y DELETE. Un alta no se puede validar con un
// `where` porque la fila todavía no existe, así que el portón de escritura necesita su
// propia guardia, previa a Prisma, que compare el dueño que el PAYLOAD reclama contra
// la identidad de la sesión resuelta en BD (`alcancePorFilasDeSesion`,
// `unidadesVinculadasDb`). Es la forma de `rechazoDeSolicitudAjena`
// (`app/api/ge/solicitudes/_alcance.ts`), factorizada en
// `lib/api/propiedad-de-alta.ts` para que los recursos no la reinventen.

describe("T17 · el alta no puede atribuir la fila a otro dueño", () => {
  it("ra/reservas: el residente A-1 no crea una reserva con la persona y la unidad ajenas → 404 y sin fila", async () => {
    const intrusa = "ppo-res-intrusa"
    try {
      await conSesion(EMAIL.resA1, async () => {
        const res = await invocarApi(moduloReservasRA(), "POST", "ra/reservas", {
          body: {
            id: intrusa,
            elementoId: ELEMENTO_CON_TARIFA,
            solicitantePersonaId: P_A2,
            unidadId: U_A2,
            fecha: "2026-11-14",
            horaInicio: "09:00",
            horaFin: "10:00",
            estado: "confirmada",
          },
        })
        // OBSERVADO antes del guardia (2026-11-07, `ppo-res-a1@test.cl`, residente con
        // `personaId` `ppo-p-a1`): el mismo POST respondía **201** con la fila completa
        // —`{"id":"ppo-res-intrusa","comunidadId":"ppo-com-a","folio":"RA-…",
        // "solicitantePersonaId":"ppo-p-a2","unidadId":"ppo-u-a2",…}`— y la reserva
        // quedaba en la BD a nombre de la unidad vecina. El residente tiene `ra`
        // ver/crear (lib/authz.ts:261) y el POST transaccional validaba el payload sin
        // comparar `solicitantePersonaId` ni `unidadId` con la sesión. Contrato seguro:
        // el de `ge/solicitudes` (404 genérico, sin fila).
        expect(res.status).toBe(404)
        expect(await cuerpoJson<{ error: string }>(res)).toEqual({
          error: "Registro no encontrado.",
        })
        expect(await prisma.reservaRA.findUnique({ where: { id: intrusa } })).toBeNull()
        // Y el LIBRO FI no registra el cargo de la reserva ajena: con tarifa > 0 y
        // fondo de amenities activo, el alta materializaba `reserva_ra` con
        // `origenRef` = id de la reserva y lo imputaba a la unidad del payload
        // (`unidadDeCobro`), es decir el vecino recibía la deuda de una reserva que
        // no pidió. La relectura del libro es la prueba de que el efecto desapareció.
        expect(
          await prisma.cobroFI.count({
            where: { comunidadId: COM_A, origenModulo: "RA", origenRef: intrusa },
          })
        ).toBe(0)
      })
    } finally {
      await prisma.cobroFI.deleteMany({ where: { comunidadId: COM_A, origenRef: intrusa } })
      await prisma.reservaRA.deleteMany({ where: { id: intrusa } })
    }
  })

  it("ra/reservas: control de la frontera — el residente A-1 SÍ crea su propia reserva (201) y el cargo va a SU unidad", async () => {
    const propia = "ppo-res-propia-a1"
    try {
      await conSesion(EMAIL.resA1, async () => {
        const res = await invocarApi(moduloReservasRA(), "POST", "ra/reservas", {
          body: {
            id: propia,
            elementoId: ELEMENTO_CON_TARIFA,
            solicitantePersonaId: P_A1,
            unidadId: U_A1,
            fecha: "2026-11-15",
            horaInicio: "10:00",
            horaFin: "11:00",
            estado: "confirmada",
          },
        })
        // Sin esta mitad, una guardia que negara TODO pasaría el caso de la fuga.
        expect(res.status).toBe(201)
        const enBd = await prisma.reservaRA.findUnique({ where: { id: propia } })
        expect(enBd?.comunidadId).toBe(COM_A)
        expect(enBd?.solicitantePersonaId).toBe(P_A1)
        expect(enBd?.unidadId).toBe(U_A1)
        // Y el camino real del alta sigue materializando el cargo —tarifa > 0 y fondo
        // activo—, ahora imputado a la unidad del DUEÑO: el guardia no rompe el cobro,
        // solo niega la atribución a un tercero.
        const cargos = await prisma.cobroFI.findMany({
          where: { comunidadId: COM_A, origenModulo: "RA", origenRef: propia },
        })
        expect(cargos).toHaveLength(1)
        expect(cargos[0]?.unidadId).toBe(U_A1)
        expect(cargos[0]?.concepto).toBe("reserva_ra")
        expect(cargos[0]?.montoBase).toBe(TARIFA_CON_TARIFA)
      })
    } finally {
      await prisma.cobroFI.deleteMany({ where: { comunidadId: COM_A, origenRef: propia } })
      await prisma.reservaRA.deleteMany({ where: { id: propia } })
    }
  })

  it("pe/cierres-turno: la conserjería no crea el cierre de turno del otro trabajador → 404 y sin fila", async () => {
    const intruso = "ppo-cierre-intruso"
    try {
      await conSesion(EMAIL.trabajadorA, async () => {
        const res = await invocarApi(moduloCierresTurno(), "POST", "pe/cierres-turno", {
          body: cierrePE(intruso, P_A2),
        })
        // Fuga de ESCRITURA: `trabajadorA` es conserjería con `personaId` P_A1
        // (lib/authz.ts:158, `pe:cierre_turno` crear) y el POST de la factory sólo
        // aplicaba el alcance a la fila EXISTENTE; el alta quedaba a nombre del trabajador
        // que el payload nombrara. INV-02 no la frena: es otro trabajador.
        expect(res.status).toBe(404)
        expect(await cuerpoJson<{ error: string }>(res)).toEqual({
          error: "Registro no encontrado.",
        })
        expect(await prisma.cierreTurnoPE.findUnique({ where: { id: intruso } })).toBeNull()
      })
    } finally {
      await prisma.cierreTurnoPE.deleteMany({ where: { id: intruso } })
    }
  })

  it("pe/cierres-turno: control de la frontera — el cierre de SU persona sí entra (201)", async () => {
    const propio = "ppo-cierre-propio-a1"
    try {
      await conSesion(EMAIL.trabajadorA, async () => {
        const res = await invocarApi(moduloCierresTurno(), "POST", "pe/cierres-turno", {
          body: cierrePE(propio, P_A1, { fecha: "2026-11-08" }),
        })
        expect(res.status).toBe(201)
        const enBd = await prisma.cierreTurnoPE.findUnique({ where: { id: propio } })
        expect(enBd?.comunidadId).toBe(COM_A)
        expect(enBd?.trabajadorPersonaId).toBe(P_A1)
      })
    } finally {
      await prisma.cierreTurnoPE.deleteMany({ where: { id: propio } })
    }
  })

  it("pe/cierres-turno: mover el cierre PROPIO al otro trabajador → 404 y la fila intacta", async () => {
    // La guardia también corre en el PUT parcial (put-merge): sin ella, el propio
    // trabajador podía "regalar" su cierre a otro —dejando asentado que A-2 cerró un
    // turno que A-2 nunca cerró— aunque el alcance ya le impedía LEER el cierre ajeno.
    await conSesion(EMAIL.trabajadorA, async () => {
      const antes = await prisma.cierreTurnoPE.findUnique({ where: { id: CIERRE_A1 } })
      const res = await invocarApi(moduloCierreTurno(), "PUT", "pe/cierres-turno/[id]", {
        params: { id: CIERRE_A1 },
        body: { trabajadorPersonaId: P_A2, fecha: "2026-11-09" },
      })
      expect(res.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Registro no encontrado.",
      })
      expect(await prisma.cierreTurnoPE.findUnique({ where: { id: CIERRE_A1 } })).toEqual(antes)
    })
  })

  it("pe/turnos/iniciar: la conserjería no inicia el turno de otra persona → 404 y sin evento", async () => {
    // OBSERVADO antes del guardia (2026-11-07, `ppo-trabajador-a@test.cl`, conserjería
    // con `personaId` `ppo-p-a1`): `POST /api/pe/turnos/iniciar` con
    // `{ personaId: "ppo-p-a2", jornadaId: "ppo-jornada-manana" }` respondía **200**
    // `{"ok":true,"eventoId":"ev-…"}` y escribía el evento `PE_START_SHIFT` con
    // `referenciaId: "ppo-p-a2"` en la bitácora —constancia de que A-2 inició un turno
    // que A-2 no inició—. La ruta vive en la auditoría y `PE_START_SHIFT` alimenta
    // «Turnos iniciados hoy» y la descripción «<nombre> inicia turno».
    await conSesion(EMAIL.trabajadorA, async () => {
      const res = await invocarApi(moduloIniciarTurnoPE(), "POST", "pe/turnos/iniciar", {
        body: { personaId: P_A2, jornadaId: JORNADA_MANANA },
      })
      expect(res.status).toBe(404)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: "Registro no encontrado.",
      })
      // Y la bitácora no registra el turno de la persona ajena: sin esta relectura, un
      // 404 que igual hubiera escrito el evento también pasaría el caso.
      expect(
        await prisma.eventoAuditoria.count({
          where: { comunidadId: COM_A, tipoAccion: "PE_START_SHIFT", referenciaId: P_A2 },
        })
      ).toBe(0)
    })
  })

  it("pe/turnos/iniciar: control de la frontera — el turno de SU persona sí se inicia (200)", async () => {
    await conSesion(EMAIL.trabajadorA, async () => {
      const res = await invocarApi(moduloIniciarTurnoPE(), "POST", "pe/turnos/iniciar", {
        body: { personaId: P_A1, jornadaId: JORNADA_MANANA },
      })
      expect(res.status).toBe(200)
      const cuerpo = await cuerpoJson<{ ok: boolean; eventoId: string }>(res)
      expect(cuerpo.ok).toBe(true)
      const evento = await prisma.eventoAuditoria.findUnique({
        where: { id: cuerpo.eventoId },
      })
      expect(evento?.categoria).toBe("PE")
      expect(evento?.tipoAccion).toBe("PE_START_SHIFT")
      expect(evento?.referenciaId).toBe(P_A1)
      expect(evento?.comunidadId).toBe(COM_A)
    })
  })

  it("ir/entregas-epp: el residente no registra la entrega de EPP de otra persona (clave sin `crear`)", async () => {
    // VERIFICADO con la petición real: acá NO hay fuga de alta por falta de guardia.
    // `ir:mantenimiento` crear lo tienen conserjería y mantención (lib/authz.ts:194 y
    // :334), NO el residente (lib/authz.ts:259 — sólo `ver`, decisión owner
    // 2026-10-21). El 403 llega por CLAVE, antes de la escritura, así que el alta con
    // dueño ajeno no está abierta a ningún rol de ciudadano y no hay nada que cerrar:
    // `personaId` es el RECEPTOR de la entrega que el operador registra, no la
    // atribución que el actor hace de sí mismo.
    const intrusa = "ppo-epp-intrusa"
    try {
      await conSesion(EMAIL.resA1, async () => {
        const res = await invocarApi(moduloEntregasEPP(), "POST", "ir/entregas-epp", {
          body: {
            id: intrusa,
            recursoId: "ppo-rec-casco",
            personaId: P_A2,
            fechaEntrega: "2026-11-09",
            estado: "nuevo",
          },
        })
        expect(res.status).toBe(403)
        expect(await cuerpoJson<{ error: string }>(res)).toEqual({
          error: "Permiso denegado.",
        })
        expect(await prisma.entregaEPP.findUnique({ where: { id: intrusa } })).toBeNull()
      })
    } finally {
      await prisma.entregaEPP.deleteMany({ where: { id: intrusa } })
    }
  })

  it("ir/solicitudes-insumo: el residente no crea una solicitud a nombre de otra persona (clave sin `crear`)", async () => {
    // Mismo caso que `ir/entregas-epp` y por la misma razón: el residente sólo tiene
    // `ir:mantenimiento` ver (lib/authz.ts:259), así que `solicitantePersonaId` no es
    // una atribución que él pueda falsificar. El alta la ejerce el rol operativo.
    const intrusa = "ppo-insu-intrusa"
    try {
      await conSesion(EMAIL.resA1, async () => {
        const res = await invocarApi(moduloSolicitudesInsumo(), "POST", "ir/solicitudes-insumo", {
          body: {
            id: intrusa,
            folio: "",
            solicitantePersonaId: P_A2,
            estadoComodin: "no_comodin",
            cantidad: 1,
            areaDestino: "Bodega de la unidad 102",
            estado: "pendiente",
            fechaSolicitud: "2026-11-09",
          },
        })
        expect(res.status).toBe(403)
        expect(await cuerpoJson<{ error: string }>(res)).toEqual({
          error: "Permiso denegado.",
        })
        expect(await prisma.solicitudInsumoIR.findUnique({ where: { id: intrusa } })).toBeNull()
      })
    } finally {
      await prisma.solicitudInsumoIR.deleteMany({ where: { id: intrusa } })
    }
  })
})

describe("fi/avisos-cobro — el residente lee y descarga SU aviso (F27 · T7)", () => {
  it("control: la administración de A ve los DOS avisos del arnés y abre el de la unidad 102", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const coleccion = await invocarApi(
        moduloAvisosCobro(),
        "GET",
        "avisos-cobro?pageSize=100"
      )
      expect(coleccion.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string; unidadId: string }>>(coleccion)
      // Las DOS filas de A existen y son legibles por gestión: el 404 del
      // residente de los casos siguientes es ALCANCE, no ausencia de la fila.
      expect(new Set(j.data.map((a) => a.id))).toEqual(new Set([AVCOB_A1, AVCOB_A2]))
      expect(j.total).toBe(2)

      const detalle = await invocarApi(
        moduloAvisoCobro(),
        "GET",
        "avisos-cobro/[id]",
        { params: { id: AVCOB_A2 } }
      )
      expect(detalle.status).toBe(200)
      const fila = await cuerpoJson<{ id: string; unidadId: string }>(detalle)
      expect(fila.id).toBe(AVCOB_A2)
      expect(fila.unidadId).toBe(U_A2)
    })
  })

  it("residente A-1: lee SU aviso (200) y el de la unidad ajena responde el 404 genérico", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const propio = await invocarApi(
        moduloAvisoCobro(),
        "GET",
        "avisos-cobro/[id]",
        { params: { id: AVCOB_A1 } }
      )
      // Antes de T7 esta misma petición respondía 403: el detalle solo aceptaba
      // `fi:gasto_comun` (la clave de la administración) y el residente no la
      // tiene. Abrir la lectura sin el filtro habría dejado leer la deuda de la
      // unidad vecina cambiando el id.
      expect(propio.status).toBe(200)
      const fila = await cuerpoJson<{ id: string; folio: string; unidadId: string }>(propio)
      expect(fila.id).toBe(AVCOB_A1)
      expect(fila.folio).toBe("AC-7001")
      expect(fila.unidadId).toBe(U_A1)

      const ajena = await invocarApi(
        moduloAvisoCobro(),
        "GET",
        "avisos-cobro/[id]",
        { params: { id: AVCOB_A2 } }
      )
      // La fila ajena no se carga ni se sirve: 404 y el cuerpo genérico, nunca
      // 403 (un 403 confirmaría que el aviso existe).
      expect(ajena.status).toBe(404)
      expect(await cuerpoJson<Record<string, unknown>>(ajena)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("residente A-1: la colección solo trae los avisos de sus unidades y el total cuenta esas filas", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const coleccion = await invocarApi(
        moduloAvisosCobro(),
        "GET",
        "avisos-cobro?pageSize=100"
      )
      expect(coleccion.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string; unidadId: string }>>(coleccion)
      // Lo propio viaja; lo ajeno ni siquiera entra al conjunto.
      expect(j.data.map((a) => a.id)).toEqual([AVCOB_A1])
      expect(j.data.every((a) => a.unidadId === U_A1)).toBe(true)
      // El `total` se cuenta con el MISMO where: no anuncia filas que no viajan.
      expect(j.total).toBe(1)

      // `?unidadId=` solo puede INTERSECTAR el alcance, nunca ampliarlo.
      const ajena = await invocarApi(
        moduloAvisosCobro(),
        "GET",
        "avisos-cobro?unidadId=ppo-u-a2&pageSize=100"
      )
      expect(ajena.status).toBe(200)
      const jAjena = await cuerpoJson<Envelope<{ id: string }>>(ajena)
      expect(jAjena.data).toEqual([])
      expect(jAjena.total).toBe(0)

      const propia = await invocarApi(
        moduloAvisosCobro(),
        "GET",
        "avisos-cobro?unidadId=ppo-u-a1&pageSize=100"
      )
      expect(propia.status).toBe(200)
      const jPropia = await cuerpoJson<Envelope<{ id: string }>>(propia)
      expect(jPropia.data.map((a) => a.id)).toEqual([AVCOB_A1])
      expect(jPropia.total).toBe(1)
    })
  })

  it("residente A-1: descarga SU aviso como PDF real, y el de la unidad ajena → 404", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const res = await invocarApi(
        moduloAvisoCobroPdf(),
        "GET",
        "avisos-cobro/[id]/pdf",
        { params: { id: AVCOB_A1 } }
      )
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/pdf")
      // El nombre del archivo lleva el folio: quien descarga dos avisos no los
      // confunde en la carpeta de descargas.
      expect(res.headers.get("content-disposition")).toBe(
        'attachment; filename="aviso-cobro-AC-7001.pdf"'
      )
      const bytes = Buffer.from(await res.arrayBuffer())
      // Bytes de un PDF de verdad: firma %PDF- y un documento no trivial. Un
      // cuerpo JSON o vacío con `application/pdf` no pasa esta mitad.
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-")
      expect(bytes.length).toBeGreaterThan(1000)

      const ajena = await invocarApi(
        moduloAvisoCobroPdf(),
        "GET",
        "avisos-cobro/[id]/pdf",
        { params: { id: AVCOB_A2 } }
      )
      // Mismo alcance que la lectura: sin PDF para el aviso ajeno.
      expect(ajena.status).toBe(404)
      expect(ajena.headers.get("content-type")).toContain("application/json")
      expect(await cuerpoJson<Record<string, unknown>>(ajena)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("control: la administración descarga el PDF del aviso que al residente le da 404", async () => {
    await conSesion(EMAIL.adminA, async () => {
      const res = await invocarApi(
        moduloAvisoCobroPdf(),
        "GET",
        "avisos-cobro/[id]/pdf",
        { params: { id: AVCOB_A2 } }
      )
      // La fila existe y el papel se puede armar: el 404 del residente es el
      // alcance por unidad, no una ruta que no sabe imprimir.
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/pdf")
      const bytes = Buffer.from(await res.arrayBuffer())
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-")
      expect(bytes.length).toBeGreaterThan(1000)
    })
  })

  it("residente A-1: el aviso de otra comunidad → 404 en el detalle y en el PDF", async () => {
    await conSesion(EMAIL.resA1, async () => {
      const detalle = await invocarApi(
        moduloAvisoCobro(),
        "GET",
        "avisos-cobro/[id]",
        { params: { id: AVCOB_B1 } }
      )
      expect(detalle.status).toBe(404)

      const pdf = await invocarApi(moduloAvisoCobroPdf(), "GET", "avisos-cobro/[id]/pdf", {
        params: { id: AVCOB_B1 },
      })
      expect(pdf.status).toBe(404)
      expect(await cuerpoJson<Record<string, unknown>>(pdf)).toEqual({
        error: "Registro no encontrado.",
      })
    })
  })

  it("residente SIN ficha MP: la lectura falla CERRADO (colección vacía y detalle 404)", async () => {
    await conSesion(EMAIL.resSinId, async () => {
      const coleccion = await invocarApi(
        moduloAvisosCobro(),
        "GET",
        "avisos-cobro?pageSize=100"
      )
      // El rol está acotado por fila y no hay identidad para resolver «lo
      // propio»: el fragmento no matchea nada. Devolver la comunidad entera
      // sería el fail-open que `alcancePorFilasDeSesion` cierra.
      expect(coleccion.status).toBe(200)
      const j = await cuerpoJson<Envelope<{ id: string }>>(coleccion)
      expect(j.data).toEqual([])
      expect(j.total).toBe(0)

      const detalle = await invocarApi(
        moduloAvisoCobro(),
        "GET",
        "avisos-cobro/[id]",
        { params: { id: AVCOB_A1 } }
      )
      expect(detalle.status).toBe(404)
    })
  })

  it("conserjería de A: sin `fi:aviso:propio` la lectura sigue cerrada (403 en detalle y PDF)", async () => {
    await conSesion(EMAIL.conserjeA, async () => {
      // La clave del residente es SUYA: el hecho de leer un aviso no se concede
      // a quien no la tiene, ni siquiera para el aviso de otra persona.
      const detalle = await invocarApi(
        moduloAvisoCobro(),
        "GET",
        "avisos-cobro/[id]",
        { params: { id: AVCOB_A1 } }
      )
      expect(detalle.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(detalle)).toEqual({
        error: "Permiso denegado.",
      })

      const pdf = await invocarApi(moduloAvisoCobroPdf(), "GET", "avisos-cobro/[id]/pdf", {
        params: { id: AVCOB_A1 },
      })
      expect(pdf.status).toBe(403)
    })
  })
})
