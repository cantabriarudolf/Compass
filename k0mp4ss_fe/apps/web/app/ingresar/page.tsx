"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

/**
 * Destino post-login por defecto cuando ?next= está ausente o inseguro.
 */
const DESTINO_POR_DEFECTO = "/admin"

/**
 * Guardia same-origin para el destino post-login (?next=). Acepta solo rutas
 * relativas al origen: rechaza URLs absolutas (https://evil.com), destinos
 * protocol-relative (//evil.com → navegación externa en router.push) y
 * backslashes (\\evil.com, que los browsers normalizan a slash). Con eso se
 * impide el open redirect / phishing post-autenticación.
 */
function esDestinoSeguro(destino: string | null): destino is string {
  return (
    destino !== null &&
    destino.startsWith("/") &&
    !destino.startsWith("//") &&
    !destino.includes("\\")
  )
}

interface RespuestaLogin {
  ok: boolean
  error?:
    | "credenciales"
    | "requiere_2fa"
    | "limite_intentos"
    | "conexion"
    | "desconocido"
}

/**
 * Login contra Auth.js (provider credentials) — AU §3 P5.
 * Danza estándar: GET /api/auth/csrf → POST /api/auth/callback/credentials
 * con X-Auth-Return-Redirect (respuesta JSON {url}; fallo codificado como
 * query params error=CredentialsSignin&code=<code>).
 */
async function iniciarSesion(email: string, password: string, callbackUrl: string): Promise<RespuestaLogin> {
  let csrfToken = ""
  try {
    const csrfRes = await fetch("/api/auth/csrf", { headers: { Accept: "application/json" } })
    if (csrfRes.ok) {
      const datos = await csrfRes.json().catch(() => null)
      csrfToken = typeof datos?.csrfToken === "string" ? datos.csrfToken : ""
    }
  } catch {
    return { ok: false, error: "conexion" }
  }

  let respuesta: Response
  try {
    respuesta = await fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "X-Auth-Return-Redirect": "1",
      },
      body: new URLSearchParams({ csrfToken, email, password, callbackUrl }),
    })
  } catch {
    return { ok: false, error: "conexion" }
  }

  const datos = (await respuesta.json().catch(() => null)) as { url?: string } | null
  if (!respuesta.ok || !datos?.url) {
    return { ok: false, error: "desconocido" }
  }
  const url = new URL(datos.url, window.location.origin)
  if (url.searchParams.get("error")) {
    const code = url.searchParams.get("code")
    if (code === "rate_limited") return { ok: false, error: "limite_intentos" }
    if (code === "requiere_2fa") return { ok: false, error: "requiere_2fa" }
    return { ok: false, error: "credenciales" }
  }
  return { ok: true }
}

/**
 * Paso 2 del login con 2FA: pide un desafío efímero con las credenciales ya
 * validadas por Auth.js y devuelve el tempToken para /api/auth/2fa/verify.
 */
async function pedirDesafio(
  email: string,
  password: string
): Promise<{ tempToken?: string; error?: string }> {
  let respuesta: Response
  try {
    respuesta = await fetch("/api/auth/2fa/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
    })
  } catch {
    return { error: "Error de conexión con el servidor." }
  }
  const datos = (await respuesta.json().catch(() => null)) as {
    requires2FA?: boolean
    tempToken?: string
    error?: string
  } | null
  if (respuesta.ok && datos?.requires2FA && typeof datos.tempToken === "string") {
    return { tempToken: datos.tempToken }
  }
  if (respuesta.status === 429) {
    return { error: "Demasiados intentos. Espere unos minutos." }
  }
  return { error: "No fue posible iniciar la verificación en dos pasos." }
}

/**
 * Verifica el código del paso 2 contra /api/auth/2fa/verify (TOTP, 6 dígitos)
 * o /api/auth/2fa/backup (código de respaldo, 8 caracteres).
 */
async function verificarCodigo(
  tempToken: string,
  codigo: string,
  modo: "totp" | "backup"
): Promise<
  | { ok: true; codigosRestantes?: number; advertencia?: string | null }
  | { ok: false; error: string; expirado?: boolean }
> {
  const endpoint = modo === "backup" ? "/api/auth/2fa/backup" : "/api/auth/2fa/verify"
  let respuesta: Response
  try {
    respuesta = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ tempToken, codigo }),
    })
  } catch {
    return { ok: false, error: "Error de conexión con el servidor." }
  }
  const datos = (await respuesta.json().catch(() => null)) as {
    ok?: boolean
    codigosRestantes?: number
    advertencia?: string | null
    error?: string
  } | null
  if (respuesta.ok && datos?.ok) {
    if (modo === "backup") {
      return {
        ok: true,
        codigosRestantes:
          typeof datos.codigosRestantes === "number" ? datos.codigosRestantes : undefined,
        advertencia: typeof datos.advertencia === "string" ? datos.advertencia : null,
      }
    }
    return { ok: true }
  }
  const mensaje = typeof datos?.error === "string" ? datos.error : "Código inválido."
  if (respuesta.status === 429) {
    return { ok: false, error: "Demasiados intentos. Espere unos minutos." }
  }
  return { ok: false, error: mensaje, expirado: /expirado/i.test(mensaje) }
}

function IngresarForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [cargando, setCargando] = React.useState(false)
  const [paso, setPaso] = React.useState<1 | 2>(1)
  const [tempToken, setTempToken] = React.useState<string | null>(null)
  const [modo2fa, setModo2fa] = React.useState<"totp" | "backup">("totp")
  const [codigo2fa, setCodigo2fa] = React.useState("")
  const [error2fa, setError2fa] = React.useState<string | null>(null)
  const [cargando2fa, setCargando2fa] = React.useState(false)
  const [infoBackup, setInfoBackup] = React.useState<{
    codigosRestantes: number
    advertencia: string | null
  } | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCargando(true)
    try {
      const destino = searchParams.get("next")
      const destinoSeguro = esDestinoSeguro(destino) ? destino : DESTINO_POR_DEFECTO
      const resultado = await iniciarSesion(
        email,
        password,
        new URL(destinoSeguro, window.location.origin).href
      )
      if (!resultado.ok) {
        if (resultado.error === "requiere_2fa") {
          const desafio = await pedirDesafio(email, password)
          if (desafio.tempToken) {
            setTempToken(desafio.tempToken)
            setModo2fa("totp")
            setCodigo2fa("")
            setInfoBackup(null)
            setError2fa(null)
            setPaso(2)
            return
          }
          setError(desafio.error ?? "No fue posible iniciar sesión.")
          return
        }
        if (resultado.error === "limite_intentos") {
          setError("Demasiados intentos. Espere unos minutos.")
        } else if (resultado.error === "credenciales") {
          setError("Credenciales inválidas.")
        } else if (resultado.error === "conexion") {
          setError("Error de conexión con el servidor.")
        } else {
          setError("No fue posible iniciar sesión.")
        }
        return
      }
      router.push(destinoSeguro)
    } catch {
      setError("Error de conexión con el servidor.")
    } finally {
      setCargando(false)
    }
  }

  function destinoActual(): string {
    const destino = searchParams.get("next")
    return esDestinoSeguro(destino) ? destino : DESTINO_POR_DEFECTO
  }

  async function verificar2fa(e: React.FormEvent) {
    e.preventDefault()
    if (!tempToken) {
      setPaso(1)
      return
    }
    const codigo = codigo2fa.trim()
    if (modo2fa === "totp" && !/^\d{6}$/.test(codigo)) {
      setError2fa("Ingresa el código de 6 dígitos.")
      return
    }
    if (modo2fa === "backup" && codigo.length < 8) {
      setError2fa("Ingresa un código de respaldo válido (8 caracteres).")
      return
    }
    setError2fa(null)
    setCargando2fa(true)
    try {
      const resultado = await verificarCodigo(tempToken, codigo, modo2fa)
      if (!resultado.ok) {
        if (resultado.expirado) {
          setPaso(1)
          setTempToken(null)
          setCodigo2fa("")
          setInfoBackup(null)
          setError(
            "La verificación en dos pasos expiró. Vuelve a ingresar tus credenciales."
          )
        } else {
          setError2fa(resultado.error)
        }
        return
      }
      if (modo2fa === "backup" && resultado.codigosRestantes !== undefined) {
        setInfoBackup({
          codigosRestantes: resultado.codigosRestantes,
          advertencia: resultado.advertencia ?? null,
        })
        return
      }
      router.push(destinoActual())
    } catch {
      setError2fa("Error de conexión con el servidor.")
    } finally {
      setCargando2fa(false)
    }
  }

  function cambiarModo2fa() {
    setModo2fa(modo2fa === "totp" ? "backup" : "totp")
    setCodigo2fa("")
    setError2fa(null)
    setInfoBackup(null)
  }

  function continuarTrasBackup() {
    router.push(destinoActual())
  }

  if (paso === 2) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <form
          onSubmit={verificar2fa}
          className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm"
        >
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Verificación en dos pasos</h1>
            <p className="text-sm text-muted-foreground">
              Ingresa el código de verificación de tu cuenta.
            </p>
          </div>
          {error2fa && (
            <p
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error2fa}
            </p>
          )}
          {infoBackup ? (
            <div className="space-y-2 rounded-md border px-3 py-2 text-sm">
              <p>Códigos de respaldo restantes: {infoBackup.codigosRestantes}</p>
              {infoBackup.advertencia && (
                <p className="text-amber-600">{infoBackup.advertencia}</p>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={continuarTrasBackup}
              >
                Continuar
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="codigo-2fa">
                  {modo2fa === "backup" ? "Código de respaldo" : "Código de verificación"}
                </Label>
                <Input
                  id="codigo-2fa"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={modo2fa === "backup" ? 8 : 6}
                  value={codigo2fa}
                  onChange={(e) => setCodigo2fa(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={cargando2fa}>
                {cargando2fa ? "Verificando…" : "Verificar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={cambiarModo2fa}
              >
                {modo2fa === "totp" ? "Usar código de respaldo" : "Usar código de la app"}
              </Button>
            </>
          )}
        </form>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Iniciar sesión</h1>
          <p className="text-sm text-muted-foreground">Acceso al panel de administración de Compass.</p>
        </div>
        {error && (
          <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" className="w-full" disabled={cargando}>
          {cargando ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>
    </main>
  )
}

export default function PaginaIngresar() {
  return (
    <React.Suspense fallback={<main className="flex min-h-screen items-center justify-center p-4"><p className="text-sm text-muted-foreground">Cargando…</p></main>}>
      <IngresarForm />
    </React.Suspense>
  )
}
