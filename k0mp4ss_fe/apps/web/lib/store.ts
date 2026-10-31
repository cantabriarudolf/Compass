/**
 * lib/store.ts — puerta pública de los helpers puros que sobrevivieron al retiro
 * del store legacy del navegador (F22a).
 *
 * Acá vivió el store monolito `useCompassStore`: un `persist` sobre
 * `localStorage` bajo la key `compass-store`, con `skipHydration: true`, cuya
 * hidratación nadie disparaba desde el retiro del módulo dev (F9). `hasHydrated`
 * quedaba en `false` para siempre y cada acción legacy cortaba con "El
 * almacenamiento aún se está hidratando": el estado de dominio del navegador ya
 * era código muerto. La base vía API es la única fuente de verdad
 * (ver `specs/ST-capa-datos-persistente`).
 *
 * Se retiraron junto con él: `persist`, `partialize`, `migrate`,
 * `ESQUEMAS_COLECCION`, `sanitizarColecciones`, `repararDocumentos`, `seedData`,
 * `STORE_VERSION`, los siete slices de `lib/store/slices/` y los hooks
 * `useStoreRehydrated`, `rehydrateStore` y `waitForStoreHydration`.
 *
 * Lo que sobrevive, porque tiene consumidores reales:
 * - `StoreResult`: el contrato de retorno que consumen los hooks de
 *   `lib/api/use-*.ts`.
 * - `repararRut`: la reparación del dígito verificador (módulo 11) que exigía la
 *   migración v10; la cubre `test/rut-migracion.test.ts`.
 * - Los helpers de gobernanza `esMiembroDirectivaVigente` y
 *   `periodoDirectivaVigente`, que viven en `lib/store/helpers.ts` y alimentan
 *   `app/comunidad/directiva` y `app/comunidad/certificados`.
 *
 * Para estado de UI puro (modales, filtros, toasts) usar `lib/store-ui.ts`.
 */
import { calcularDigitoVerificador, normalizarDocumento } from "./rut"

export type { StoreResult } from "./store/helpers"

// VAL-005 (migración v10): los RUT sembrados históricamente tenían dígito
// verificador ficticio. Al endurecer la validación con módulo 11, todo store
// persistido previo fallaría safeParse y perdería la colección de personas.
// Se repara recalculando el DV del cuerpo (el cuerpo no cambia, solo el DV),
// preservando el formato original del cuerpo (con o sin puntos).
export function repararRut(rut: string): string {
  const normalizado = normalizarDocumento(rut)
  const indiceGuion = normalizado.lastIndexOf("-")
  if (indiceGuion === -1) return rut
  const cuerpoConFormato = normalizado.slice(0, indiceGuion)
  const cuerpo = cuerpoConFormato.replace(/\./g, "")
  if (!/^\d{7,8}$/.test(cuerpo)) return rut
  return `${cuerpoConFormato}-${calcularDigitoVerificador(cuerpo)}`
}
