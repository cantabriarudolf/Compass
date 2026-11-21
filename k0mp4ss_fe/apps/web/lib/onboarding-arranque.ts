/**
 * onboarding-arranque — los doce pasos con los que una comunidad empieza a operar
 * (F47 · S1/S2).
 *
 * Una comunidad recién creada no tiene forma de saber qué le falta: las
 * dependencias se descubren chocando con los 400 de la emisión («No existe un
 * Fondo de Gasto Común activo para imputar la emisión.», «El libro no tiene
 * acuerdos aprobados de comité o asamblea…»). El orden en que hay que cargar las
 * cosas está escrito en el manual 41 (`Data/NSGC/docs/manuales/41 - Carga Inicial
 * de una Comunidad.md`) y en `odd/tasks/onboarding-arranque.md`; acá vive una
 * sola vez, medido contra la base en cada llamada.
 *
 * Dos invariantes que no se negocian:
 *
 *   1. **Nada se persiste.** Cada paso se computa con un `count` (o una lectura)
 *      en el momento; no hay columna, tabla ni configuración con «paso hecho».
 *      Si el dato se borra, el paso vuelve a `pendiente` sin que nadie lo apague.
 *   2. **El orden es el de S2**, el del manual. No se reordena por conveniencia ni
 *      se agregan pasos: el consumer (la pantalla `/admin/arranque`) los pinta en
 *      el orden en que llegan.
 *
 * El `detalle` es el número medido, no una etiqueta: «0 unidades» dice qué falta
 * y cuánto. La pantalla no lo reinterpreta ni lo reemplaza por un texto propio.
 *
 * El firmante del paso `configuracion` NO se reimplementa: es la misma función que
 * usa `GET /api/configuracion` (`firmanteDeLaComunidad`), la única fuente de la
 * regla «membresía administrador vigente + persona del padrón».
 */
import { firmanteDeLaComunidad } from "@/app/api/configuracion/_lib/identidad-papel"
import { prisma } from "@/lib/prisma"

/**
 * Los doce pasos en el orden del manual (S2). Es una constante exportada para que
 * el test pueda pinar el orden sin copiarlo de la implementación.
 */
export const IDS_PASOS_ARRANQUE = [
  "maestros-nacionales",
  "tipos-unidad",
  "estados-ocupacion",
  "estructura",
  "personas",
  "vinculos",
  "configuracion",
  "fondos",
  "acuerdo",
  "presupuesto",
  "emision",
  "usuarios",
] as const

export type IdPasoArranque = (typeof IDS_PASOS_ARRANQUE)[number]
export type EstadoPasoArranque = "hecho" | "pendiente"

export interface PasoArranque {
  readonly id: IdPasoArranque
  readonly titulo: string
  readonly estado: EstadoPasoArranque
  /** El número medido («0 unidades»), nunca una etiqueta genérica. */
  readonly detalle: string
  /** La pantalla donde se hace ese paso. */
  readonly href: string
}

export interface ArranqueDeLaComunidad {
  readonly pasos: readonly PasoArranque[]
  /** Cuántos pasos siguen `pendiente`: lo que la pantalla anuncia arriba. */
  readonly faltantes: number
}

/** «0 unidades», «1 unidad»: el número medido con su sustantivo concordado. */
function contar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`
}

function paso(
  id: IdPasoArranque,
  titulo: string,
  hecho: boolean,
  detalle: string,
  href: string
): PasoArranque {
  return { id, titulo, estado: hecho ? "hecho" : "pendiente", detalle, href }
}

/**
 * Calcula los doce pasos de la comunidad. Se llama en cada GET y en cada carga de
 * la pantalla: el estado es siempre el de la base en ese instante.
 */
export async function calcularArranque(
  comunidadId: string,
  usuarioId: string
): Promise<ArranqueDeLaComunidad> {
  const anioEnCurso = String(new Date().getFullYear())

  const [
    afps,
    previsionesSalud,
    tiposUnidad,
    estadosOcupacion,
    unidades,
    personas,
    vinculos,
    configuracion,
    firmante,
    fondosGastoComun,
    acuerdosAprobados,
    presupuestosVigentes,
    emisionesGc,
    otrosUsuarios,
  ] = await Promise.all([
    prisma.afp.count(),
    prisma.previsionSalud.count(),
    prisma.tipoUnidad.count({ where: { comunidadId } }),
    prisma.estadoOcupacion.count({ where: { comunidadId } }),
    prisma.unidad.count({ where: { comunidadId } }),
    prisma.persona.count({ where: { comunidadId } }),
    prisma.vinculoUnidad.count({ where: { comunidadId, fechaFin: null } }),
    prisma.configuracionGlobal.findUnique({
      where: { comunidadId },
      select: { id: true },
    }),
    firmanteDeLaComunidad(comunidadId),
    prisma.fondoFI.count({
      where: { comunidadId, tipo: "gasto_comun", activo: true },
    }),
    prisma.acuerdo.count({ where: { comunidadId, estado: "aprobado" } }),
    prisma.presupuesto.count({
      where: { comunidadId, periodo: anioEnCurso, estado: "vigente" },
    }),
    prisma.emisionGC.count({ where: { comunidadId } }),
    prisma.membresia.count({ where: { comunidadId, usuarioId: { not: usuarioId } } }),
  ])

  // 1. El catálogo del país es GLOBAL (la clave primaria del maestro es sólo `id`):
  //    si existe una fila, todas las comunidades lo ven. Se mide sobre la tabla, no
  //    sobre la comunidad, y por eso el detalle nombra las dos familias del paso.
  const catalogoPais = afps + previsionesSalud
  const detalleConfiguracion = !configuracion
    ? "Sin fila de configuración"
    : firmante
      ? "Configuración creada · firmante designado"
      : "Configuración creada · sin firmante derivado"

  const pasos: PasoArranque[] = [
    paso(
      "maestros-nacionales",
      "Catálogo del país",
      catalogoPais > 0,
      `${contar(afps, "AFP", "AFP")} y ${contar(
        previsionesSalud,
        "previsión de salud",
        "previsiones de salud"
      )}`,
      "/admin/maestros"
    ),
    paso(
      "tipos-unidad",
      "Tipos de unidad",
      tiposUnidad > 0,
      contar(tiposUnidad, "tipo de unidad", "tipos de unidad"),
      "/inventario/tipos"
    ),
    paso(
      "estados-ocupacion",
      "Estados de ocupación",
      estadosOcupacion > 0,
      contar(estadosOcupacion, "estado de ocupación", "estados de ocupación"),
      "/admin/maestros"
    ),
    paso(
      "estructura",
      "Estructura física",
      unidades > 0,
      contar(unidades, "unidad", "unidades"),
      "/inventario/estructura"
    ),
    paso(
      "personas",
      "Personas del padrón",
      personas > 0,
      contar(personas, "persona en el padrón", "personas en el padrón"),
      "/personas/residentes"
    ),
    paso(
      "vinculos",
      "Vínculos con la unidad",
      vinculos > 0,
      contar(vinculos, "vínculo vigente", "vínculos vigentes"),
      "/comunidad/personas"
    ),
    // 7. La fila de configuración es la mitad del paso; la otra es que haya
    //    firmante derivado, porque sin él no se emite ningún papel (409).
    paso(
      "configuracion",
      "Configuración de la comunidad",
      configuracion !== null && firmante !== null,
      detalleConfiguracion,
      "/admin/configuracion"
    ),
    paso(
      "fondos",
      "Fondo de gasto común",
      fondosGastoComun > 0,
      contar(
        fondosGastoComun,
        "fondo de gasto común activo",
        "fondos de gasto común activos"
      ),
      "/finanzas/gastos-comunes"
    ),
    paso(
      "acuerdo",
      "Acuerdo aprobado",
      acuerdosAprobados > 0,
      contar(acuerdosAprobados, "acuerdo aprobado", "acuerdos aprobados"),
      "/comunidad/directiva/acuerdos"
    ),
    paso(
      "presupuesto",
      "Presupuesto vigente",
      presupuestosVigentes > 0,
      contar(
        presupuestosVigentes,
        `presupuesto vigente de ${anioEnCurso}`,
        `presupuestos vigentes de ${anioEnCurso}`
      ),
      "/admin/gestion/presupuestos"
    ),
    paso(
      "emision",
      "Emisión de gasto común",
      emisionesGc > 0,
      contar(emisionesGc, "emisión de gasto común", "emisiones de gasto común"),
      "/finanzas/gastos-comunes"
    ),
    // 12. «Además de la del usuario que consulta»: una comunidad de una sola cuenta
    //     todavía no tiene a quién notificar ni a quién asignarle un rol.
    paso(
      "usuarios",
      "Usuarios de la comunidad",
      otrosUsuarios > 0,
      contar(otrosUsuarios, "usuario además de tu cuenta", "usuarios además de tu cuenta"),
      "/admin/usuarios"
    ),
  ]

  return {
    pasos,
    faltantes: pasos.filter((p) => p.estado === "pendiente").length,
  }
}
