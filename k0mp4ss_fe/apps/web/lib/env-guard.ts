export type AppEnv = "development" | "production"

export function getAppEnv(): AppEnv {
  const raw = (process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "").toLowerCase()
  if (raw === "production" || raw === "prod") return "production"
  if (raw === "development" || raw === "dev") return "development"
  return process.env.NODE_ENV === "production" ? "production" : "development"
}

/**
 * SERIE-PRODUCCION P2 — endurecido.
 *
 * Antes: `getAppEnv() === "development"` bastaba. En un deploy de producción
 * con `NEXT_PUBLIC_APP_ENV` mal seteada (p. ej. "development" por error de
 * configuración), las APIs dev/QA quedaban expuestas aunque `NODE_ENV`
 * fuera `production`.
 *
 * Ahora: solo retorna true si el runtime Node real es de desarrollo
 * (`NODE_ENV=development`) Y el entorno efectivo de la app no está forzado a
 * producción (`NEXT_PUBLIC_APP_ENV`/`APP_ENV` ≠ production/prod). En un build
 * de producción Next siempre setea `NODE_ENV=production`, por lo que la
 * variable pública mal configurada ya no basta para habilitar las APIs.
 *
 * `NODE_ENV=test` (valor que usa vitest) cuenta como desarrollo: nunca existe
 * en un deploy real (Next solo produce `development` o `production`), pero
 * permite que los tests de las rutas authz sigan ejerciendo la lógica interna.
 */
export function isWriteApiEnabled(): boolean {
  const nodeEnv = process.env.NODE_ENV ?? ""
  const runtimeDev = nodeEnv === "development" || nodeEnv === "test"
  return runtimeDev && getAppEnv() === "development"
}

/** true si el entorno efectivo de la app es producción. */
export function isProduction(): boolean {
  return getAppEnv() === "production"
}

/** true si el entorno efectivo de la app es desarrollo. */
export function isDevelopment(): boolean {
  return getAppEnv() === "development"
}

/**
 * Lee una variable de entorno obligatoria.
 *
 * En producción (entorno efectivo production): lanza si falta o está vacía,
 * para fallar fast en el arranque en vez de degradar silenciosamente.
 * En desarrollo: devuelve "" para no bloquear el arranque local.
 */
export function requireEnv(name: string): string {
  const valor = process.env[name]
  if (valor === undefined || valor === "") {
    if (isProduction()) {
      throw new Error(`Variable de entorno obligatoria ausente en producción: ${name}`)
    }
    return ""
  }
  return valor
}
