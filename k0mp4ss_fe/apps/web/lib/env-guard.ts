export type AppEnv = "development" | "production"

export function getAppEnv(): AppEnv {
  const raw = (process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "").toLowerCase()
  if (raw === "production" || raw === "prod") return "production"
  if (raw === "development" || raw === "dev") return "development"
  return process.env.NODE_ENV === "production" ? "production" : "development"
}

export function isWriteApiEnabled(): boolean {
  return getAppEnv() === "development"
}
