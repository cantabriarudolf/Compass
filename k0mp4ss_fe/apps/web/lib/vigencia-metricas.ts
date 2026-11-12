/**
 * lib/vigencia-metricas.ts — el KPI de unidades con el registro al día (S9).
 *
 * El Comité necesita una cifra que pueda mirar y comparar en el tiempo: qué
 * porcentaje de las unidades tiene el Registro de Copropietarios actualizado.
 * Esa cifra se cuelga del módulo de métricas existente (`/admin/metricas`) y se
 * calcula acá, en una función **pura**.
 *
 * La decisión que este módulo protege: el KPI **no deriva el estado**, lo recibe
 * ya derivado por `estadoDelCaso` de `lib/vigencia-registro.ts`. Esa es la única
 * definición del calendario (mes 10, mes 12, los 60 días). Si el KPI volviera a
 * calcular «al día» por su cuenta habría dos verdades del mismo hecho y la
 * pantalla del Registro podría decir una cosa y la métrica otra. Además el
 * estado nunca se guarda: se deriva de los hechos congelados de cada unidad.
 *
 * Aritmética que puede mentir, y por eso se prueba: dividir por cero en una
 * comunidad sin unidades daría `NaN` en pantalla; un porcentaje sin redondear
 * mostraría `33.33333333333333`; y un desglose que ignore `sin_declaracion`
 * dejaría la suma distinta del total, que es como una métrica tapa un incidente
 * de datos.
 */
import type { EstadoCasoRegistro } from "@/lib/vigencia-registro"

export interface KpiVigencia {
  /** Unidades de la comunidad: el denominador del porcentaje. */
  total: number
  /** Unidades con el registro al día (`al_dia`), en número y no en porcentaje. */
  alDia: number
  /**
   * `alDia / total` en porcentaje redondeado a **un decimal** (`25`, `33.3`).
   * Una comunidad sin unidades informa `0`: no se divide por cero.
   */
  porcentajeAlDia: number
  /**
   * Cuántas unidades hay en cada estado, incluidos los que todavía no son una
   * falta (`por_vencer`) y los que son un incidente de datos
   * (`sin_declaracion`). La suma de sus valores es `total`.
   */
  porEstado: Record<string, number>
}

/**
 * Cuenta los estados ya derivados de las unidades de una comunidad.
 *
 * No consulta la base ni el reloj: recibe la lista y devuelve los números. Un
 * estado nuevo que `lib/vigencia-registro.ts` agregue mañana entra al desglose
 * sin tocar esta función —por eso el mapa es `Record<string, number>`—; lo que
 * no hace es inventar estados que la lista no trae.
 */
export function kpiDeVigencia(
  filas: readonly { estado: EstadoCasoRegistro }[]
): KpiVigencia {
  const porEstado: Record<string, number> = {}
  for (const fila of filas) {
    porEstado[fila.estado] = (porEstado[fila.estado] ?? 0) + 1
  }

  const total = filas.length
  const alDia = porEstado.al_dia ?? 0

  // Un decimal = tres ceros de escala: `Math.round(x * 1000) / 10`. Sin el 1000
  // se redondearía a entero y 2 de 6 daría 33 en vez de 33,3.
  const porcentajeAlDia =
    total === 0 ? 0 : Math.round((alDia / total) * 1000) / 10

  return { total, alDia, porcentajeAlDia, porEstado }
}
