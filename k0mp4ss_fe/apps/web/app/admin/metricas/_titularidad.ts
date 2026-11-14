/**
 * app/admin/metricas/_titularidad.ts — ¿qué unidad no tiene propietario vigente?
 *
 * Una unidad sin dueño no se puede cobrar: la morosidad, el convenio de pago y la
 * emisión de gasto común necesitan una persona a quién cobrarle. Hasta el
 * 2026-11-14 la comunidad de demo tenía 132 de sus 166 unidades así, y nada en el
 * sistema lo decía: la emisión se bloqueaba con un conteo sin lista, y la
 * morosidad simplemente no mostraba esas filas.
 *
 * Este módulo es la ÚNICA definición del hecho, para que las tres superficies que
 * lo necesitan no lo cuenten distinto:
 *   1. el chequeo de integridad (`scripts/check-unidades-sin-propietario.ts`),
 *   2. el panel de administración (`/admin/metricas`),
 *   3. la prueba que exige cero sobre la semilla de demo.
 *
 * La derivación no adivina: un propietario vigente es un vínculo con rol
 * `propietario` y `fechaFin` null — el mismo criterio que usa la cobranza
 * (`lib/entrega-aviso.ts`) y la emisión (`app/api/emisiones-gc`). Las causas se
 * separan porque se arreglan distinto:
 *   - `nunca_declarado`: la unidad nunca tuvo titular. Falta darlo de alta.
 *   - `vinculo_cerrado_sin_reemplazo`: hubo dueño y su tramo se cerró sin uno
 *     nuevo. Es el error caro: parece una unidad vendida y sigue sin cobrador.
 *
 * Los BIENES COMUNES quedan fuera del universo evaluado: `tipo-es-visita` es la
 * playa de visitas de la comunidad («bien común, no se asigna a unidades», ver
 * `scripts/seed-demo-consistente.ts` paso 1 y `specs/EF-estructura-fisica`). Un
 * bien común no tiene dueño y no se le cobra a nadie: contarlo como incidente
 * sería un falso positivo permanente. El conteo de excluidas se informa igual
 * (`bienesComunes`) para que la exclusión no esconda nada.
 *
 * Este módulo NO imprime ni devuelve datos personales: unidad, número y causa.
 */
import type { PrismaClient } from "@prisma/client"

/** Tipo de unidad del estacionamiento de visitas: bien común, sin titular. */
export const TIPO_UNIDAD_BIEN_COMUN = "tipo-es-visita"

/** Rol del vínculo que responde por la unidad. */
const ROL_PROPIETARIO = "propietario"

/** Las dos formas en que una unidad puede quedar sin dueño. Se arreglan distinto. */
export type CausaSinTitular = "nunca_declarado" | "vinculo_cerrado_sin_reemplazo"

/** Lo mínimo de una unidad para derivar su titularidad. */
export interface UnidadParaTitularidad {
  id: string
  numero: string
  tipoUnidadId: string
}

/** Lo mínimo de un vínculo para derivar la titularidad de su unidad. */
export interface VinculoParaTitularidad {
  unidadId: string
  rol: string
  /**
   * `null` es «vigente» en la base; la semilla de `data/` deja el campo ausente
   * (`undefined`) para el mismo hecho. Los dos casos significan lo mismo y el
   * chequeo los trata igual: una unidad no queda sin dueño por cómo se escribió
   * la fila.
   */
  fechaFin?: string | null
}

/** Una unidad sin propietario vigente, con su causa. Nunca lleva datos de personas. */
export interface UnidadSinTitular {
  unidadId: string
  numero: string
  causa: CausaSinTitular
}

/** El reporte de titularidad de una comunidad. */
export interface Titularidad {
  /** Unidades que se evaluaron (excluye bienes comunes). */
  evaluadas: number
  /** Unidades excluidas por ser bien común (no aplica tener dueño). */
  bienesComunes: number
  /** Total de unidades sin propietario vigente. */
  total: number
  /** Conteo por causa; siempre incluye las dos claves, aunque estén en cero. */
  porCausa: Record<CausaSinTitular, number>
  /** Detalle ordenado por número de unidad, para la lista corta de la pantalla. */
  sinTitular: UnidadSinTitular[]
}

/** Orden estable y legible por número de unidad (`101`, `L-02`, `E-045`). */
function porNumero(a: UnidadSinTitular, b: UnidadSinTitular): number {
  return a.numero.localeCompare(b.numero, "es", { numeric: true })
}

/**
 * Deriva la titularidad de las unidades a partir de sus vínculos. Pura: recibe
 * las filas y devuelve el hecho, sin base ni reloj.
 */
export function evaluarTitularidad(
  unidades: readonly UnidadParaTitularidad[],
  vinculos: readonly VinculoParaTitularidad[]
): Titularidad {
  const porUnidad = new Map<string, { vigente: boolean; cerrado: boolean }>()
  for (const vinculo of vinculos) {
    if (vinculo.rol !== ROL_PROPIETARIO) continue
    const estado = porUnidad.get(vinculo.unidadId) ?? { vigente: false, cerrado: false }
    if (vinculo.fechaFin == null) estado.vigente = true
    else estado.cerrado = true
    porUnidad.set(vinculo.unidadId, estado)
  }

  const evaluables = unidades.filter((u) => u.tipoUnidadId !== TIPO_UNIDAD_BIEN_COMUN)
  const sinTitular: UnidadSinTitular[] = []
  for (const unidad of evaluables) {
    const estado = porUnidad.get(unidad.id)
    if (estado?.vigente === true) continue
    sinTitular.push({
      unidadId: unidad.id,
      numero: unidad.numero,
      causa: estado === undefined ? "nunca_declarado" : "vinculo_cerrado_sin_reemplazo",
    })
  }
  sinTitular.sort(porNumero)

  const porCausa: Record<CausaSinTitular, number> = {
    nunca_declarado: 0,
    vinculo_cerrado_sin_reemplazo: 0,
  }
  for (const fila of sinTitular) porCausa[fila.causa] += 1

  return {
    evaluadas: evaluables.length,
    bienesComunes: unidades.length - evaluables.length,
    total: sinTitular.length,
    porCausa,
    sinTitular,
  }
}

/** Lo que necesita el lector: dos delegates, no el cliente entero. */
type ClienteTitularidad = Pick<PrismaClient, "unidad" | "vinculoUnidad">

/**
 * Lee la titularidad de una comunidad: DOS consultas (unidades y sus vínculos de
 * propietario), nunca una por unidad. El cliente es obligatorio y lo pone quien
 * llama (la página, el chequeo o una prueba con otra base): este módulo no abre
 * conexiones, así lo pueden usar un script suelto y un componente de servidor
 * sin arrastrar el singleton de Prisma a ninguno de los dos.
 */
export async function leerTitularidad(
  comunidadId: string,
  cliente: ClienteTitularidad
): Promise<Titularidad> {
  const [unidades, vinculos] = await Promise.all([
    cliente.unidad.findMany({
      where: { comunidadId },
      select: { id: true, numero: true, tipoUnidadId: true },
      orderBy: [{ numero: "asc" }, { id: "asc" }],
    }),
    cliente.vinculoUnidad.findMany({
      where: { comunidadId, rol: ROL_PROPIETARIO },
      select: { unidadId: true, rol: true, fechaFin: true },
    }),
  ])
  return evaluarTitularidad(unidades, vinculos)
}
