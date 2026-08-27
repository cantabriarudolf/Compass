"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

interface RespuestaLogin {
  ok: boolean
  error?: "credenciales" | "limite_intentos" | "conexion" | "desconocido"
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
    return { ok: false, error: "credenciales" }
  }
  return { ok: true }
}

function IngresarForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [cargando, setCargando] = React.useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCargando(true)
    try {
      const destino = searchParams.get("next")
      const urlDestino = destino && destino.startsWith("/") ? destino : "/admin"
      const resultado = await iniciarSesion(
        email,
        password,
        new URL(urlDestino, window.location.origin).href
      )
      if (!resultado.ok) {
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
      router.push(destino && destino.startsWith("/") ? destino : "/admin")
    } catch {
      setError("Error de conexión con el servidor.")
    } finally {
      setCargando(false)
    }
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
