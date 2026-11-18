"use client"

/**
 * /invitacion — la página pública donde el invitado define su contraseña (F42 · S2/S4).
 *
 * Es el destino del enlace que emiten el alta y el reenvío. Vive FUERA de /admin
 * a propósito: quien lo abre todavía no tiene sesión, y `proxy.ts` deja pasar
 * `/invitacion` como página pública —ningún endpoint nuevo: el único POST sigue
 * siendo `POST /api/auth/invitacion`, que ya era público—.
 *
 * El token viaja en la URL. Es aceptable porque el enlace es de un solo uso y
 * vence a las 72 h: filtrado en un historial o en un log viejo ya no abre nada, y
 * el canje lo marca usado en la misma transacción que escribe la contraseña. Acá
 * no se registra ni se muestra el valor del token por ningún medio, y tampoco
 * viaja a ningún sitio: la única llamada es a la ruta del canje.
 *
 * Lo que la página NO puede decir y no finge: el correo y el rol concretos de la
 * cuenta. La ruta del canje no los devuelve (el token es la única credencial y un
 * enlace no debe contar a quién pertenece), así que el texto explica qué se está
 * activando y qué significa el rol de acceso, sin confirmar identidad. Un token
 * inválido dice exactamente lo mismo que la ruta —no es válida o ya venció— y no
 * distingue inventado, vencido y usado.
 */
import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { IconAlertTriangle, IconLoader2, IconShieldCheck } from "@tabler/icons-react"
import { MENSAJE_PASSWORD_INVALIDA, validarPassword } from "@/lib/password-policy"

/**
 * El mismo texto de `MENSAJE_INVITACION_INVALIDA` (`lib/invitacion-acceso.ts`).
 * Se repite como literal porque ese módulo importa Prisma y `node:crypto`:
 * importarlo desde un componente cliente arrastraría el cliente de base al
 * navegador. `test/componentes/invitacion-pantalla.test.tsx` compara las dos
 * copias, así que no pueden separarse en silencio.
 */
const MENSAJE_SIN_INVITACION = "La invitación no es válida o ya venció."

interface RespuestaCanje {
  ok?: boolean
  error?: string
}

const RUTA_CANJE = "/api/auth/invitacion"

function FormularioInvitacion() {
  const parametros = useSearchParams()
  const token = (parametros.get("token") ?? "").trim()

  const [password, setPassword] = React.useState("")
  const [repetida, setRepetida] = React.useState("")
  const [enviando, setEnviando] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [definida, setDefinida] = React.useState(false)

  async function definir(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    if (enviando || !token) return
    setError(null)

    // La política es la del login, no una nueva. Se evalúa antes de tocar la red:
    // un intento que la ruta va a rechazar no debe gastar el enlace.
    const politica = validarPassword(password)
    if (!politica.valido) {
      setError(politica.errores.join(" "))
      return
    }
    if (password !== repetida) {
      setError("Las dos contraseñas no coinciden.")
      return
    }

    setEnviando(true)
    let respuesta: Response
    try {
      respuesta = await fetch(RUTA_CANJE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      })
    } catch {
      setEnviando(false)
      setError(
        "No se pudo contactar al servidor. Revisá la conexión e intentá de nuevo."
      )
      return
    }
    setEnviando(false)

    let cuerpo: RespuestaCanje | null = null
    try {
      cuerpo = (await respuesta.json()) as RespuestaCanje
    } catch {
      cuerpo = null
    }

    if (!respuesta.ok) {
      // El texto lo redacta la ruta: se muestra tal cual, sin reinterpretarlo.
      setError(
        typeof cuerpo?.error === "string" ? cuerpo.error : MENSAJE_PASSWORD_INVALIDA
      )
      return
    }

    setDefinida(true)
    setPassword("")
    setRepetida("")
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <IconShieldCheck className="size-5 text-primary" aria-hidden="true" />
            Activá tu acceso
          </h1>
          <p className="text-sm text-muted-foreground">
            Este enlace activa la cuenta de acceso que la administración creó para
            vos en la comunidad. Acá definís tu contraseña: nadie más la conoce ni
            la puede definir por vos.
          </p>
          <p className="text-sm text-muted-foreground">
            El rol de acceso que la administración te asignó —administrador,
            comité, conserjería, residente o mantención— define qué ves y qué
            podés hacer en el sistema. Tu rol en el padrón —propietario,
            arrendatario o personal— no cambia ese acceso.
          </p>
        </div>

        {!token ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {MENSAJE_SIN_INVITACION}
          </p>
        ) : definida ? (
          <div className="space-y-3">
            <p
              role="status"
              className="rounded-md border border-emerald-500/40 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"
            >
              Tu contraseña quedó definida. Ya podés ingresar con tu correo y la
              contraseña que acabas de crear.
            </p>
            <a
              href="/ingresar"
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Ingresar
            </a>
          </div>
        ) : (
          <form onSubmit={definir} className="space-y-4">
            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <IconAlertTriangle
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                {error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="password-invitacion">Contraseña</Label>
              <Input
                id="password-invitacion"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(evento) => setPassword(evento.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Al menos 8 caracteres, con una mayúscula, una minúscula y un número.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password-invitacion-repetida">
                Repite la contraseña
              </Label>
              <Input
                id="password-invitacion-repetida"
                type="password"
                autoComplete="new-password"
                value={repetida}
                onChange={(evento) => setRepetida(evento.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando ? (
                <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Definir mi contraseña
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}

export default function PaginaInvitacion() {
  return (
    <React.Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center p-4">
          <p className="text-sm text-muted-foreground">Cargando…</p>
        </main>
      }
    >
      <FormularioInvitacion />
    </React.Suspense>
  )
}
