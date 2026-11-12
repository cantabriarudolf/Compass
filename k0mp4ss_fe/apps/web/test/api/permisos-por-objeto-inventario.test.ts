/**
 * @vitest-environment node
 *
 * Serie «Permisos por objeto» · T5 — el guardia del inventario.
 *
 * `test/api/permisos-por-objeto.test.ts` prueba autorización por FILA para un
 * puñado de recursos. Nada obligaba a que un recurso nuevo entrara a esa lista:
 * una ruta con segmento dinámico podía aparecer y quedar sin clasificar en
 * silencio. Este archivo cierra ese hueco (S3 de `odd/tasks/permisos-por-objeto.md`,
 * «lo nuevo no se cuela»): recorre `app/api/**`, y cada `route.ts` con al menos
 * un segmento `[param]` tiene que estar declarado acá.
 *
 * Las dos clases de declaración:
 *   · `caso`   — tiene prueba por relación en `permisos-por-objeto.test.ts`;
 *                `cubre` nombra el `describe` que la sostiene.
 *   · `exento` — no tiene caso por relación y el `motivo` dice por qué:
 *                catálogo sin dueño, sólo administración, sin dato de tercero,
 *                ruta de servicio, contenedor de la comunidad… El motivo es
 *                obligatorio en el tipo: no existe `exento` mudo.
 *
 * La tercera clase es `pendiente` — la fila SÍ tiene dueño (unidad, persona,
 * destinatario) y todavía no hay caso por relación. No es una exención: tenerla
 * como clase propia impide que la deuda se disfrace de «exento», la deja contar
 * sin grep y obliga a que el `motivo` nombre el campo de pertenencia, que es lo
 * que hace falta para escribir el caso que falta.
 *
 * No toca base, ni sesión, ni fixtures: recorre el filesystem y compara listas.
 */
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/** `apps/web` — este archivo vive en `test/api/`. */
const APP_DIR = path.resolve(__dirname, "../..")
const RAIZ_API = path.join(APP_DIR, "app", "api")
const PRUEBA_DE_FILA = path.join(APP_DIR, "test", "api", "permisos-por-objeto.test.ts")

type Declaracion =
  | { readonly ruta: string; readonly clase: "caso"; readonly cubre: string }
  | { readonly ruta: string; readonly clase: "exento"; readonly motivo: string }
  // `pendiente` no es una exención: la fila TIENE dueño y todavía no tiene caso. Tenerlo como
  // clase propia evita que la deuda se disfrace de «exento» y deja contarla sin grep.
  | { readonly ruta: string; readonly clase: "pendiente"; readonly motivo: string }

/**
 * Una entrada por ruta con segmento dinámico, ordenada como la devuelve el
 * recorrido (alfabética). Fuente: «Mapa de T1» de
 * `odd/tasks/permisos-por-objeto.md` y sus dos grupos de exención.
 */
const DECLARACIONES: readonly Declaracion[] = [
  // ── gd: actas y períodos de la directiva ──────────────────────────────────
  {
    ruta: "actas-gd/[id]",
    clase: "exento",
    motivo:
      "acta de la comunidad: la fila no tiene unidad ni persona; `gd` + visibilidad por rol ya la restringen (T1 «no necesitan»).",
  },
  {
    ruta: "actas-gd/[id]/aprobar",
    clase: "exento",
    motivo: "sólo administración (`gd` editar): aprobar el acta no devuelve datos de un tercero.",
  },

  // ── servicio: Auth.js ─────────────────────────────────────────────────────
  {
    ruta: "auth/[...nextauth]",
    clase: "exento",
    motivo: "ruta de servicio de Auth.js: no hay recurso de dominio que tener por objeto.",
  },

  // ── avisos de cobro (FI) ──────────────────────────────────────────────────
  {
    ruta: "avisos-cobro/[id]",
    clase: "caso",
    cubre: "fi/avisos-cobro — el residente lee y descarga SU aviso (F27 · T7)",
  },
  {
    ruta: "avisos-cobro/[id]/entrega",
    clase: "exento",
    motivo:
      "sólo administración (`fi:gasto_comun` crear): registra la entrega del aviso, no lee la fila del residente.",
  },
  {
    ruta: "avisos-cobro/[id]/pdf",
    clase: "caso",
    cubre: "fi/avisos-cobro — el residente lee y descarga SU aviso (F27 · T7)",
  },

  // ── certificados de la comunidad (CT) ─────────────────────────────────────
  {
    ruta: "certificados-ct/[id]/pdf",
    clase: "exento",
    motivo:
      "el PDF servido por el servidor (F34) tiene su caso por relación en `test/api/certificados-ct-emision-residente.test.ts` (describe «F34 — emisión del propio certificado por tipología»): propia 200 con el archivo, ajena 404 y cross-comunidad 404. No se duplica acá para no tener dos listones del mismo contrato.",
  },
  {
    ruta: "certificados-ct/[id]",
    clase: "caso",
    cubre: "certificados-ct — el dueño es `unidadId`/`personaId` (lote 3)",
  },

  // ── CO: envíos, buzón, plantillas ─────────────────────────────────────────
  {
    ruta: "co/envios/[id]",
    clase: "caso",
    cubre: "co/envios — pertenencia por destinatario",
  },
  {
    ruta: "co/envios/[id]/lecturas",
    clase: "caso",
    cubre: "co/envios — pertenencia por destinatario",
  },
  {
    ruta: "co/envios/[id]/leer",
    clase: "pendiente",
    motivo:
      "dueño por destinatario (`esDestinatarioDeEnvio`, `co/envios/[id]/leer/route.ts:30`); T3/T4 no lo cubren.",
  },
  {
    ruta: "co/mensajes-buzon/[id]",
    clase: "caso",
    cubre: "co/mensajes-buzon — pertenencia por reportante",
  },
  {
    ruta: "co/plantillas/[id]",
    clase: "exento",
    motivo: "`co`: plantilla de la comunidad, sin unidad ni persona (T1 catálogos).",
  },

  // ── contabilidad de la comunidad (FI / GC) ────────────────────────────────
  {
    ruta: "cobros-fi/[id]",
    clase: "exento",
    motivo:
      "contabilidad de la comunidad (`fi`): el cobro se emite a una unidad, pero no es «fila propia» del residente (T1).",
  },
  {
    ruta: "cobros-fi/[id]/cobranza",
    clase: "exento",
    motivo: "contabilidad de la comunidad (`fi`): acción de cobranza, no lectura del residente (T1).",
  },
  {
    ruta: "cobros-fi/[id]/mora",
    clase: "exento",
    motivo: "contabilidad de la comunidad (`fi`): cálculo de mora (T1).",
  },
  {
    ruta: "cobros-fi/[id]/pagar",
    clase: "exento",
    motivo: "contabilidad de la comunidad (`fi`): registro de pago (T1).",
  },

  // ── controles de propiedad (AD) ───────────────────────────────────────────
  {
    ruta: "controles-propiedad/[id]",
    clase: "caso",
    cubre: "controles-propiedad — propio, otra unidad",
  },

  // ── archivo y documentos (AD / CV / GD) ───────────────────────────────────
  {
    ruta: "cv/actas/[actaId]/despublicar",
    clase: "exento",
    motivo: "`cv`/`gd`: despublicar un acta es acción de administración (T1 «servicio»).",
  },
  {
    ruta: "cv/avisos/[id]",
    clase: "exento",
    motivo:
      "`cv`: `AvisoCV` sólo tiene `comunidadId`; el mapa de T1 lo marcaba «nv» con dueño y el modelo no lo tiene.",
  },
  {
    ruta: "cv/plantillas/[id]",
    clase: "exento",
    motivo: "`cv`: plantilla de la comunidad, sin unidad ni persona (T1 catálogos).",
  },
  {
    ruta: "documentos/[id]",
    clase: "exento",
    motivo:
      "`ad`: documento del archivo de la comunidad; `Documento` sólo tiene `comunidadId` (T1 «no necesitan»).",
  },
  {
    ruta: "documentos/[id]/envio",
    clase: "exento",
    motivo: "`ad`: envío de documentos ya archivados; sin dueño por fila (T1 «servicio»).",
  },

  // ── egresos, emisiones y fondos (FI) ──────────────────────────────────────
  {
    ruta: "egresos-fi/[id]",
    clase: "exento",
    motivo: "contabilidad de la comunidad (`fi`): egreso, no fila propia del residente (T1).",
  },
  {
    ruta: "emisiones-gc/[id]",
    clase: "exento",
    motivo: "contabilidad de la comunidad (`fi`): emisión de gasto común (T1).",
  },
  {
    ruta: "fondos-fi/[id]",
    clase: "exento",
    motivo: "contabilidad de la comunidad (`fi`): `FondoFI` sólo tiene `comunidadId` (T1).",
  },
  {
    ruta: "fondos-fi/[id]/retirar",
    clase: "exento",
    motivo: "contabilidad de la comunidad (`fi`): retiro desde un fondo (T1).",
  },

  // ── gastos comunes del edificio (GE) ──────────────────────────────────────
  {
    ruta: "ge/solicitudes/[id]",
    clase: "caso",
    cubre: "ge/solicitudes — el dueño es `SolicitudGE.unidadId` (lote 4)",
  },

  // ── infracciones (IN) ─────────────────────────────────────────────────────
  {
    ruta: "in/infracciones/[id]",
    clase: "pendiente",
    motivo:
      "dueño `InfraccionIN.unidadId` (+ `reportantePersonaId`); la factory sólo filtra comunidad.",
  },
  {
    ruta: "in/infracciones/[id]/apelar",
    clase: "pendiente",
    motivo:
      "caso canónico de pertenencia (`InfraccionIN.unidadId`, 404 ABAC en `apelar/route.ts:44`); T3/T4 todavía no lo escriben.",
  },
  {
    ruta: "acuerdos/[id]/voto",
    clase: "exento",
    motivo:
      "el votante se deriva de la sesión y del padrón de la comunidad (`gd`/`ad`): emite su propio voto sobre un acuerdo del scope y responde 404/403 sin devolver datos de una fila ajena.",
  },
  {
    ruta: "vigencia-registro/multa/[id]/aplicar",
    clase: "exento",
    motivo:
      "sólo administración y Comité (`ad` editar/crear): aplica o desestima una propuesta de multa por su id con el acuerdo del Comité, y responde sin devolver datos de una fila ajena; la unidad va scoped por comunidad y el 404 no distingue casos.",
  },
  {
    ruta: "in/infracciones/[id]/aplicar",
    clase: "exento",
    motivo:
      "sólo administración (`in` editar): aplicar la infracción no devuelve la fila del infractor.",
  },
  {
    ruta: "in/infracciones/[id]/desestimar",
    clase: "exento",
    motivo: "sólo administración (`in` editar): desestimar la infracción.",
  },
  {
    ruta: "in/infracciones/[id]/respaldar",
    clase: "exento",
    motivo: "sólo administración (`in` editar): respaldar el documento de la infracción.",
  },
  {
    ruta: "in/tipos/[id]",
    clase: "exento",
    motivo: "catálogo `in`: tipo de infracción de la comunidad, sin unidad ni persona (T1).",
  },

  // ── ingresos (FI) ─────────────────────────────────────────────────────────
  {
    ruta: "ingresos-fi/[id]",
    clase: "exento",
    motivo: "contabilidad de la comunidad (`fi`): ingreso; `IngresoFI` sólo tiene `comunidadId` (T1).",
  },

  // ── insumos y EPP (IR) ────────────────────────────────────────────────────
  {
    ruta: "ir/entregas-epp/[id]",
    clase: "caso",
    cubre: "ir/entregas-epp — el dueño es `EntregaEPP.personaId` (lote 4)",
  },
  {
    ruta: "ir/recursos/[id]",
    clase: "exento",
    motivo: "catálogo `ir`: recurso de mantenimiento, sin dueño por fila (T1).",
  },
  {
    ruta: "ir/solicitudes-insumo/[id]",
    clase: "caso",
    cubre:
      "ir/solicitudes-insumo — el modelo no tiene `unidadId`: el dueño es `solicitantePersonaId` (lote 4)",
  },
  {
    ruta: "ir/solicitudes-insumo/[id]/entregar",
    clase: "exento",
    motivo: "sólo administración (`ir:mantenimiento`): marca la entrega del insumo.",
  },
  {
    ruta: "ir/solicitudes-insumo/[id]/resolver-comodin",
    clase: "exento",
    motivo:
      "sólo administración (`ir:mantenimiento`): resuelve el comodín, sin fila de un residente.",
  },

  // ── portal: leads ─────────────────────────────────────────────────────────
  {
    ruta: "leads-portal/[id]",
    clase: "exento",
    motivo:
      "`pi` no existe en la matriz (`lib/authz.ts`): sólo el wildcard de administración pasa, así que ningún rol acotado llega. Y `LeadPortal` sólo tiene `comunidadId`: el dato es de un prospecto del portal, sin unidad ni persona de la comunidad.",
  },

  // ── liquidaciones (PL) ────────────────────────────────────────────────────
  {
    ruta: "liquidaciones/[id]",
    clase: "caso",
    cubre: "liquidaciones — defecto declarado",
  },
  {
    ruta: "liquidaciones/[id]/confirmar",
    clase: "exento",
    motivo: "sólo administración (`pl` editar): confirmar la liquidación del trabajador.",
  },
  {
    ruta: "liquidaciones/[id]/pdf",
    clase: "caso",
    cubre: "liquidaciones/[id]/pdf — el trabajador descarga SU liquidación (T10)",
  },
  {
    ruta: "liquidaciones/adelantos/[id]",
    clase: "exento",
    motivo: "contabilidad de la comunidad (`pl`): adelanto de liquidación (T1).",
  },
  {
    ruta: "liquidaciones/adelantos/[id]/desestimar",
    clase: "exento",
    motivo: "sólo administración (`pl`): desestimar el adelanto (T1).",
  },

  // ── maestros y catálogos (MP) ─────────────────────────────────────────────
  {
    ruta: "macro-sectores/[id]",
    clase: "exento",
    motivo: "catálogo `mp`: macro sector de la comunidad, sin unidad ni persona (T1).",
  },
  {
    ruta: "maestros/[tipo]",
    clase: "exento",
    motivo: "maestros nacionales (`mp`): catálogo sin fila de un residente (T1).",
  },
  {
    ruta: "maestros/[tipo]/[id]",
    clase: "exento",
    motivo: "maestros nacionales (`mp`): el `[id]` es del maestro, no de una unidad ni persona (T1).",
  },
  {
    ruta: "maestros/[tipo]/ocultar",
    clase: "exento",
    motivo: "sólo administración (`mp` editar): ocultar un maestro no toca datos de un residente.",
  },
  {
    ruta: "micro-sectores/[id]",
    clase: "exento",
    motivo: "catálogo `mp`: micro sector de la comunidad (T1).",
  },

  // ── mantenimiento (MT) ────────────────────────────────────────────────────
  {
    ruta: "mt/proyectos/[id]",
    clase: "exento",
    motivo: "`mt` (T1 «mt/*»): proyecto de mantenimiento de la comunidad, sin fila propia.",
  },
  {
    ruta: "mt/trabajos/[id]",
    clase: "exento",
    motivo: "`mt` (T1 «mt/*»): el trabajo no es «fila propia» del residente.",
  },
  {
    ruta: "mt/trabajos/[id]/finalizar",
    clase: "exento",
    motivo: "`mt` editar: transición de estado del trabajo (T1 «mt/*»).",
  },
  {
    ruta: "mt/trabajos/[id]/iniciar",
    clase: "exento",
    motivo: "`mt` editar: transición de estado del trabajo (T1 «mt/*»).",
  },

  // ── notificaciones ────────────────────────────────────────────────────────
  {
    ruta: "notificaciones/[id]",
    clase: "caso",
    cubre: "notificaciones — propio, otra unidad",
  },
  {
    ruta: "notificaciones/[id]/leer",
    clase: "caso",
    cubre: "notificaciones — propio, otra unidad",
  },

  // ── portería y conserjería (PE) ───────────────────────────────────────────
  {
    ruta: "pe/bitacora-visitas/[id]",
    clase: "pendiente",
    motivo:
      "dueño `BitacoraVisitaPE.unidadId`; la factory sólo filtra comunidad (T1 «nv»).",
  },
  {
    ruta: "pe/cierres-turno/[id]",
    clase: "caso",
    cubre:
      "pe/cierres-turno — el dueño es `CierreTurnoPE.trabajadorPersonaId` (lote 5)",
  },
  {
    ruta: "pe/encomiendas/[id]",
    clase: "pendiente",
    motivo:
      "dueño `EncomiendaPE.destinatarioPersonaId`/`unidadId`; la factory sólo filtra comunidad (T1 «nv»).",
  },
  {
    ruta: "pe/ingresos-contratistas/[id]",
    clase: "pendiente",
    motivo:
      "dueño `IngresoContratistaPE.unidadId`; la factory sólo filtra comunidad (T1 «nv»).",
  },
  {
    ruta: "pe/maestros/[tipo]",
    clase: "exento",
    motivo: "maestros de operación (`mp`/`pe:bitacora`): el `[tipo]` es el maestro, sin fila de un residente (T1).",
  },
  {
    ruta: "pe/mantenciones/[id]",
    clase: "exento",
    motivo:
      "`pe:mantenciones` es ver para administración, comité, conserjería y mantención, y el modelo `MantencionPreventivaPE` no tiene `unidadId` ni `personaId` (`proveedorId` es el maestro del proveedor): no hay campo por el que acotar. Ningún rol acotado la escribe (sólo `ver`), así que tampoco hay PUT que acotar.",
  },
  {
    ruta: "pe/personas/[id]/evaluaciones",
    clase: "exento",
    motivo:
      "sólo administración (`pe:evaluacion`, declarada vacía para el resto): dato laboral del trabajador, no lo lee el residente.",
  },
  {
    ruta: "pe/personas/[id]/horas-extras",
    clase: "exento",
    motivo:
      "sólo administración (acción `pe`): horas extras del trabajador, ajenas a la lectura del residente.",
  },
  {
    ruta: "pe/proveedores/[id]",
    clase: "exento",
    motivo: "catálogo `pe:proveedor`: proveedor de la comunidad, sin unidad ni persona (T1).",
  },
  {
    ruta: "pe/proyecciones/[id]",
    clase: "exento",
    motivo:
      "`pe:proyeccion` es ver/crear/editar para conserjería y mantención, y `ProyeccionPE` no tiene `unidadId` ni `personaId`: es el cálculo de costo del personal del edificio, una fila de la comunidad sin dueño por fila que comparar.",
  },
  {
    ruta: "pe/tareas-monitoreo/[id]/completar",
    clase: "exento",
    motivo:
      "ruta de servicio (`pe` operativo): completa una tarea de monitoreo, sin dato de un tercero.",
  },
  {
    ruta: "pe/visitas-tecnicas/[id]",
    clase: "pendiente",
    motivo:
      "dueño `VisitaTecnicaPE.unidadId`; la factory sólo filtra comunidad (T1 «nv»).",
  },

  // ── períodos de la directiva (GD) ─────────────────────────────────────────
  {
    ruta: "periodos-directiva/[id]",
    clase: "exento",
    motivo: "`gd`: período de la directiva de la comunidad, sin unidad ni persona (T1).",
  },
  {
    ruta: "periodos-directiva/[id]/cerrar",
    clase: "exento",
    motivo: "sólo administración (`gd` editar): cerrar el período directivo (T1).",
  },

  // ── personas (MP) ─────────────────────────────────────────────────────────
  {
    ruta: "personas/[id]",
    clase: "caso",
    cubre: "personas — propio, otra unidad, otra comunidad",
  },

  // ── portal: publicaciones ─────────────────────────────────────────────────
  {
    ruta: "publicaciones-portal/[id]",
    clase: "exento",
    motivo:
      "escritura `pi` (administración); lectura abierta a la comunidad y el mapa de T1 la declara sin fila propia.",
  },

  // ── reservas (RA) ─────────────────────────────────────────────────────────
  {
    ruta: "ra/elementos/[id]",
    clase: "exento",
    motivo: "catálogo `ra`: elemento reservable, sin dueño por fila (T1).",
  },
  {
    ruta: "ra/reservas/[id]",
    clase: "caso",
    cubre: "ra/reservas — el dueño es `ReservaRA.solicitantePersonaId` (lote 5)",
  },
  {
    ruta: "ra/reservas/[id]/autorizar",
    clase: "exento",
    motivo:
      "sólo administración (`ra` editar): autorizar la reserva de un residente, sin devolver su fila.",
  },
  {
    ruta: "ra/reservas/[id]/cancelar",
    clase: "exento",
    motivo:
      "límite documentado: la acción exige `editar` en `ra` (`app/api/ra/_acciones.ts:56`) y la matriz sólo se lo da a administración, así que ningún rol acotado la alcanza — el residente recibe 403 por clave incluso en SU reserva. El día que la matriz le dé `editar`, esta ruta tiene que resolver la fila con `alcanceReservasRA`, igual que `[id]`.",
  },
  {
    ruta: "ra/reservas/[id]/rechazar",
    clase: "exento",
    motivo: "sólo administración (`ra` editar): rechazar la reserva de un residente.",
  },
  {
    ruta: "ra/reservas/[id]/retener",
    clase: "exento",
    motivo: "sólo administración (`ra` editar): retener la reserva de un residente.",
  },

  // ── reportería y rendiciones (RE) ─────────────────────────────────────────
  {
    ruta: "reportes-re/[id]",
    clase: "exento",
    motivo: "contabilidad de la comunidad (`re`): reporte del gasto común, sin fila propia (T1).",
  },
  {
    ruta: "reportes-re/[id]/distribuir",
    clase: "exento",
    motivo: "contabilidad de la comunidad (`re` editar): distribuir el reporte entre unidades (T1).",
  },
  {
    ruta: "reportes-re/[id]/lectura",
    clase: "exento",
    motivo: "`re` ver: lectura del reporte por la comunidad (T1).",
  },

  // ── estructura y unidades (MP) ────────────────────────────────────────────
  {
    ruta: "tipos-unidad/[id]",
    clase: "exento",
    motivo: "catálogo `mp`: tipo de unidad de la comunidad, sin unidad ni persona (T1).",
  },
  {
    ruta: "unidades/[id]",
    clase: "exento",
    motivo:
      "sólo administración (`mp`): la unidad la sirve la gestión; el residente llega por `mp:propios` (T1 no lo lista).",
  },

  // ── vínculos (MP) ─────────────────────────────────────────────────────────
  {
    ruta: "vinculos/[id]",
    clase: "caso",
    cubre: "vinculos — límite documentado, no caso por fila",
  },
]

/**
 * Rutas con al menos un segmento dinámico, en formato URL-ish y sin el prefijo
 * `app/api/` ni el sufijo `/route.ts`:
 * `app/api/notificaciones/[id]/leer/route.ts` → `notificaciones/[id]/leer`.
 */
function rutasConSegmentoDinamico(dir: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name)
    if (entrada.isDirectory()) {
      rutasConSegmentoDinamico(completo, acumulado)
    } else if (entrada.name === "route.ts") {
      const segmentos = path.relative(RAIZ_API, dir).split(path.sep)
      if (segmentos.some((segmento) => segmento.startsWith("["))) {
        acumulado.push(segmentos.join("/"))
      }
    }
  }
  return acumulado.sort()
}

describe("T5 — inventario de rutas con segmento dinámico", () => {
  const enDisco = rutasConSegmentoDinamico(RAIZ_API)
  const declaradas = DECLARACIONES.map((declaracion) => declaracion.ruta)

  it("el recorrido de app/api encuentra rutas (un guardia que no ve nada no vigila nada)", () => {
    expect(enDisco.length).toBeGreaterThan(0)
    // Ancla de formato: si el recorrido cambia de raíz o de separador, se cae acá
    // en vez de pasar vacío y dar verde con el inventario desconectado.
    expect(enDisco).toContain("personas/[id]")
    expect(enDisco).toContain("notificaciones/[id]/leer")
    expect(enDisco).not.toContain("personas")
  })

  it("ninguna ruta está declarada dos veces", () => {
    const repetidas = declaradas.filter((ruta, indice) => declaradas.indexOf(ruta) !== indice)
    expect(repetidas).toEqual([])
  })

  it("toda ruta con segmento dinámico del filesystem está declarada", () => {
    const conocidas = new Set(declaradas)
    const sinDeclarar = enDisco.filter((ruta) => !conocidas.has(ruta))
    if (sinDeclarar.length > 0) {
      throw new Error(
        [
          "Ruta con segmento dinámico fuera del inventario de T5 (una ruta nueva sin clasificar no entra al build):",
          ...sinDeclarar.map((ruta) => `  - app/api/${ruta}/route.ts`),
          "",
          "Declarala en DECLARACIONES de test/api/permisos-por-objeto-inventario.test.ts:",
          "  · como `caso` con su prueba de fila en test/api/permisos-por-objeto.test.ts, o",
          "  · como `exento` con el motivo (catálogo sin dueño, sólo administración, sin dato de tercero, ruta de servicio…).",
          "Si la fila tiene dueño y la prueba todavía no existe, el motivo empieza con `pendiente:`.",
        ].join("\n")
      )
    }
    expect(sinDeclarar).toEqual([])
  })

  it("ninguna declaración quedó huérfana (ruta que ya no existe en el filesystem)", () => {
    const enFilesystem = new Set(enDisco)
    const huerfanas = DECLARACIONES.filter((declaracion) => !enFilesystem.has(declaracion.ruta))
    if (huerfanas.length > 0) {
      throw new Error(
        [
          "El inventario de T5 declara rutas que ya no existen: una entrada muerta oculta el hueco que dejó la ruta siguiente.",
          ...huerfanas.map(
            (declaracion) =>
              `  - ${declaracion.ruta} (${declaracion.clase}): app/api/${declaracion.ruta}/route.ts no existe`
          ),
          "",
          "Borrá esas entradas de DECLARACIONES en test/api/permisos-por-objeto-inventario.test.ts:",
          "si la ruta se movió, la entrada nueva ya la tiene que haber pedido la prueba de arriba.",
        ].join("\n")
      )
    }
    expect(huerfanas).toEqual([])
  })

  it("cada `caso` apunta a un describe que existe en permisos-por-objeto.test.ts", () => {
    const fuente = readFileSync(PRUEBA_DE_FILA, "utf8")
    const casos = DECLARACIONES.filter((declaracion) => declaracion.clase === "caso")
    const sinPrueba = casos.filter(
      (caso) => !fuente.includes(`describe("${caso.cubre}`)
    )
    expect(casos.length).toBeGreaterThan(0)
    expect(sinPrueba.map((caso) => `${caso.ruta} → ${caso.cubre}`)).toEqual([])
  })

  it("ningún `exento` ni `pendiente` queda sin motivo", () => {
    const mudos = DECLARACIONES.filter(
      (declaracion) =>
        declaracion.clase !== "caso" && declaracion.motivo.trim().length === 0
    )
    expect(mudos.map((declaracion) => declaracion.ruta)).toEqual([])
  })

  it("cada `pendiente` nombra el campo de pertenencia que le falta", () => {
    // La deuda tiene que ser accionable: sin el campo de dueño, el caso que falta
    // no se puede escribir. Un `pendiente` mudo esconde trabajo, no lo declara.
    const sinDuenio = DECLARACIONES.filter(
      (declaracion) =>
        declaracion.clase === "pendiente" &&
        !/dueño|`[A-Za-z]+\.[A-Za-z]+`/.test(declaracion.motivo)
    )
    expect(sinDuenio.map((declaracion) => declaracion.ruta)).toEqual([])
  })
})
