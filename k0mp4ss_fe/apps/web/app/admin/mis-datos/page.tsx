"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Card, CardContent } from "@workspace/ui/components/card"

/**
 * SERIE-PRODUCCION-FASE2 P6 — "Mis datos personales" (derechos ARCO, Ley 21.719).
 * Acceso, portabilidad (descarga JSON), rectificación (form) y solicitud de
 * eliminación. La autenticación la exige /api/mis-datos (401 → link a /ingresar).
 */
interface DatosARCO {
  cuenta: {
    id: string
    email: string
    activo: boolean
    creadoEn: string
    autenticacion2FA: boolean
    solicitudEliminacion: boolean
    solicitudEliminacionAt: string | null
  }
  persona: Record<string, unknown> | null
  membresias: Array<{ comunidad: { id: string; nombre: string }; rol: string; desde: string }>
  actividad: Array<{ tipoAccion: string; descripcion: string; timestamp: string }>
}

export default function MisDatosPage() {
  const [datos, setDatos] = React.useState<DatosARCO | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [cargando, setCargando] = React.useState(true)
  const [email, setEmail] = React.useState("")
  const [movil, setMovil] = React.useState("")
  const [fijo, setFijo] = React.useState("")
  const [mensaje, setMensaje] = React.useState<string | null>(null)
  const [confirmando, setConfirmando] = React.useState(false)

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch("/api/mis-datos", { headers: { Accept: "application/json" } })
      if (res.status === 401) {
        setError("no-autenticado")
        return
      }
      if (!res.ok) {
        setError("No fue posible cargar sus datos.")
        return
      }
      const j = (await res.json()) as DatosARCO
      setDatos(j)
      const persona = j.persona ?? {}
      setEmail(typeof persona.email === "string" ? (persona.email as string) : j.cuenta.email)
      setMovil(typeof persona.telefonoMovil === "string" ? (persona.telefonoMovil as string) : "")
      setFijo(typeof persona.telefonoFijo === "string" ? (persona.telefonoFijo as string) : "")
    } catch {
      setError("Error de conexión con el servidor.")
    } finally {
      setCargando(false)
    }
  }

  React.useEffect(() => {
    let vivo = true
    // Carga inicial en callback (no setState directo en el effect).
    void Promise.resolve().then(() => {
      if (vivo) void cargar()
    })
    return () => {
      vivo = false
    }
  }, [])

  function descargar() {
    if (!datos) return
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "mis-datos-compass.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  async function solicitarEliminacion() {
    setMensaje(null)
    try {
      const res = await fetch("/api/mis-datos", { method: "DELETE" })
      const j = (await res.json().catch(() => null)) as { mensaje?: string } | null
      setMensaje(j?.mensaje ?? "Solicitud registrada.")
      setConfirmando(false)
      await cargar()
    } catch {
      setMensaje("Error de conexión con el servidor.")
    }
  }

  async function guardarCambios(e: React.FormEvent) {
    e.preventDefault()
    setMensaje(null)
    try {
      const res = await fetch("/api/mis-datos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, telefonoMovil: movil, telefonoFijo: fijo || null }),
      })
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; cambios?: string[] } | null
      if (!res.ok || !j?.ok) {
        setMensaje(j?.error ?? "No fue posible actualizar.")
        return
      }
      setMensaje(`Actualizado: ${(j.cambios ?? []).join(", ") || "sin cambios"}.`)
      await cargar()
    } catch {
      setMensaje("Error de conexión con el servidor.")
    }
  }

  if (cargando) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <p className="text-sm text-muted-foreground">Cargando sus datos…</p>
      </main>
    )
  }

  if (error === "no-autenticado") {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <p className="text-sm">Debe <Link className="underline" href="/ingresar?next=/admin/mis-datos">iniciar sesión</Link> para ver sus datos.</p>
      </main>
    )
  }

  if (error || !datos) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <p role="alert" className="text-sm text-destructive">{error ?? "Sin datos."}</p>
        <Button className="mt-4" variant="outline" onClick={() => void cargar()}>Reintentar</Button>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Mis datos personales</h1>
        <p className="text-sm text-muted-foreground">
          Acceso, rectificación, portabilidad y eliminación (Ley 21.719).{" "}
          <Link className="underline" href="/privacidad">Política de privacidad</Link>
        </p>
      </div>

      {mensaje && (
        <p role="status" className="rounded-md border px-3 py-2 text-sm">{mensaje}</p>
      )}

      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          <h2 className="text-base font-medium">Cuenta</h2>
          <p><span className="text-muted-foreground">Correo: </span>{datos.cuenta.email}</p>
          <p><span className="text-muted-foreground">2FA: </span>{datos.cuenta.autenticacion2FA ? "activado" : "no activado"}</p>
          <p><span className="text-muted-foreground">Comunidades: </span>{datos.membresias.map((m) => `${m.comunidad.nombre} (${m.rol})`).join(", ") || "ninguna"}</p>
          <p><span className="text-muted-foreground">Eventos de actividad: </span>{datos.actividad.length}</p>
          <Button variant="outline" onClick={descargar}>Descargar mis datos (JSON)</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 text-base font-medium">Rectificar datos</h2>
          <form onSubmit={(e) => void guardarCambios(e)} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="arco-email">Correo electrónico</Label>
              <Input id="arco-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arco-movil">Teléfono móvil</Label>
              <Input id="arco-movil" value={movil} onChange={(e) => setMovil(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arco-fijo">Teléfono fijo (opcional)</Label>
              <Input id="arco-fijo" value={fijo} onChange={(e) => setFijo(e.target.value)} />
            </div>
            <Button type="submit">Guardar cambios</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4 text-sm">
          <h2 className="text-base font-medium">Solicitar eliminación (derecho a olvido)</h2>
          {datos.cuenta.solicitudEliminacion ? (
            <p className="text-muted-foreground">
              Solicitud en curso desde {datos.cuenta.solicitudEliminacionAt ? new Date(datos.cuenta.solicitudEliminacionAt).toLocaleDateString("es-CL") : "—"}.
              Será procesada en un plazo de 30 días.
            </p>
          ) : confirmando ? (
            <div className="space-y-2">
              <p>Se registrará su solicitud de eliminación. Perderá acceso a la plataforma y sus datos se eliminarán en 30 días, salvo obligaciones legales de conservación. ¿Confirmar?</p>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={() => void solicitarEliminacion()}>Confirmar eliminación</Button>
                <Button variant="outline" onClick={() => setConfirmando(false)}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <Button variant="destructive" onClick={() => setConfirmando(true)}>Solicitar eliminación</Button>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
