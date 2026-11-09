/** Tipos de `scripts/db-prod-contar-perdidas.mjs` para el test y para `tsc`. */
export type Perdida =
  | { readonly tipo: "tabla"; readonly nombre: string }
  | { readonly tipo: "columna"; readonly tabla: string; readonly columna: string }

export declare function sinComentarios(sql: string): string
export declare function parsearPerdidas(sql: string): Perdida[]
export declare const SIN_PERDIDAS: string
