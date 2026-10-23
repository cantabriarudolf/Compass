"use client"

/**
 * bandeja-residente — bandeja de comunicaciones del residente y bandeja de
 * lectura del comité (change co-lectura-residente, tarea 1.7 · S1/S7 · D1/D2).
 *
 * Reglas que este componente materializa:
 *   - El rol NO se elige acá: llega resuelto del servidor (`page.tsx`). No hay
 *     selector de vista en ninguna parte de la pantalla.
 *   - Consume el shape proyectado por la API para estos roles (`EnvioBandejaCO`):
 *     sin `destinatarios`, sin `lecturas`, sin totales para el residente. Abrir
 *     un envío ajeno es imposible porque tampoco está en la lista (404 en la API).
 *   - Los textos del dictamen van literales (`textos-lectura.ts`): el aviso de
 *     registro bajo cada mensaje y el aviso de tratamiento permanente arriba.
 *     El comité, que ve agregados, recibe el descargo de la métrica (texto 2).
 *   - El vacío por falta de pertenencia no se disfraza de «no hay mensajes»: si
 *     la cuenta no está vinculada a una persona del Maestro de Personas, se dice
 *     explícitamente y se nombra a quién corresponde resolverlo.
 */
import * as React from "react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { IconInfoCircle, IconLock, IconSpeakerphone, IconUnlink } from "@tabler/icons-react"
import { useEnviosCO, useLecturaCO, type EnvioBandejaCO } from "@/lib/api/use-co"
import type { EnvioCO } from "@/lib/schemas"
import { MetricaLecturas } from "./metrica-lecturas"
import { AVISO_REGISTRO_LECTURA, textoAvisoTratamiento } from "./textos-lectura"
import type { RolBandejaCO } from "./rol-vista"

export interface BandejaResidenteProps {
  /** Rol resuelto en el servidor: nunca lo elige el usuario. */
  rol: RolBandejaCO
  /** La cuenta de sesión está vinculada a una persona del Maestro de Personas. */
  cuentaVinculada: boolean
  /** Nombre de la comunidad responsable del tratamiento (texto 3). */
  nombreComunidad: string | null
}

/**
 * Proyecta la fila que llega del hook al shape de la bandeja. El tipo del
 * recurso (`CrudCollection<EnvioCO>`) describe el shape del administrador
 * porque es el del schema; acá solo se toman los campos que la bandeja puede
 * mostrar, así ningún dato de terceros se cuela a la pantalla por descarte.
 */
export function aEnvioBandeja(envio: EnvioCO): EnvioBandejaCO {
  const proyectado = envio as Partial<EnvioBandejaCO>
  return {
    id: envio.id,
    asunto: envio.asunto,
    cuerpo: envio.cuerpo,
    ...(envio.plantillaId ? { plantillaId: envio.plantillaId } : {}),
    fechaEnvio: envio.fechaEnvio,
    ...(proyectado.lecturaPropia ? { lecturaPropia: proyectado.lecturaPropia } : {}),
    ...(typeof proyectado.totalDestinatarios === "number"
      ? { totalDestinatarios: proyectado.totalDestinatarios }
      : {}),
    ...(typeof proyectado.totalLecturas === "number"
      ? { totalLecturas: proyectado.totalLecturas }
      : {}),
  }
}

/**
 * Fecha y hora de la lectura propia en formato visible (dd-mm-aaaa hh:mm).
 * Un valor corrupto se muestra tal cual: mejor un dato raro a la vista que una
 * fecha inventada.
 */
export function formatearLeidoEn(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  const dosDigitos = (n: number) => String(n).padStart(2, "0")
  return `${dosDigitos(fecha.getDate())}-${dosDigitos(fecha.getMonth() + 1)}-${fecha.getFullYear()} ${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
}

export function BandejaResidente({
  rol,
  cuentaVinculada,
  nombreComunidad,
}: BandejaResidenteProps) {
  const { items, total, isLoading, error } = useEnviosCO()
  const { registrar } = useLecturaCO()
  const [abierto, setAbierto] = React.useState<string | null>(null)
  const [avisoLectura, setAvisoLectura] = React.useState<string | null>(null)

  const envios = React.useMemo(() => items.map(aEnvioBandeja), [items])
  const esResidente = rol === "residente"
  const sinVinculo = esResidente && !cuentaVinculada

  const abrir = async (id: string): Promise<void> => {
    if (abierto === id) {
      setAbierto(null)
      return
    }
    setAbierto(id)
    setAvisoLectura(null)
    // Solo el destinatario registra lectura; el comité consulta agregados.
    if (!esResidente) return
    const resultado = await registrar(id)
    if (!resultado.ok) {
      setAvisoLectura(resultado.error ?? "No se pudo registrar tu lectura.")
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
        <div className="h-64 rounded-lg bg-muted/30" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <IconSpeakerphone className="size-6" /> Comunicación
        </h1>
        <p className="text-sm text-muted-foreground">
          {esResidente
            ? "Bandeja de comunicaciones de tu comunidad: ves únicamente las que la Administración dirigió a ti."
            : "Bandeja de lectura del Comité: agregados de recepción de cada comunicación, sin nómina de destinatarios."}
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-2 pt-4">
          <IconInfoCircle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {textoAvisoTratamiento(nombreComunidad)}
          </p>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {avisoLectura && <p className="text-sm text-destructive">{avisoLectura}</p>}

      {sinVinculo && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <IconUnlink className="size-4" /> Tu cuenta no está vinculada a una persona de la
              comunidad
            </CardTitle>
            <CardDescription className="leading-relaxed">
              Sin ese vínculo no podemos acreditar que seas destinatario de ninguna comunicación,
              así que la bandeja no puede mostrarte nada. No es que no haya mensajes: falta la
              vinculación. La Administración debe vincular tu cuenta a tu ficha en el Maestro de
              Personas para que puedas ver y firmar la recepción de las comunicaciones.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!sinVinculo && envios.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {esResidente
              ? "No hay comunicaciones dirigidas a tu cuenta."
              : "Todavía no hay comunicaciones en la comunidad."}
          </CardContent>
        </Card>
      )}

      {total > envios.length && (
        <p className="text-xs text-muted-foreground">
          Mostrando {envios.length} de {total} comunicaciones. La bandeja pagina: hay
          comunicaciones que no están en esta página.
        </p>
      )}

      {envios.length > 0 && (
        <ul
          className="flex flex-col gap-3"
          aria-label={esResidente ? "Comunicaciones dirigidas a ti" : "Comunicaciones de la comunidad"}
        >
          {envios.map((envio) => {
            const desplegado = abierto === envio.id
            const leidoEn = envio.lecturaPropia?.leidoEn ?? null
            return (
              <li key={envio.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-base">{envio.asunto}</CardTitle>
                        <CardDescription>Enviada el {envio.fechaEnvio}</CardDescription>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {esResidente ? (
                          leidoEn ? (
                            <Badge variant="default">{`Leído el ${formatearLeidoEn(leidoEn)}`}</Badge>
                          ) : (
                            <Badge variant="outline">Sin leer</Badge>
                          )
                        ) : (
                          <MetricaLecturas
                            leidos={envio.totalLecturas ?? 0}
                            total={envio.totalDestinatarios ?? 0}
                          />
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          aria-expanded={desplegado}
                          onClick={() => {
                            void abrir(envio.id)
                          }}
                        >
                          {desplegado ? "Cerrar" : "Abrir"}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {desplegado && (
                    <CardContent className="border-t pt-3">
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {envio.cuerpo}
                      </p>
                    </CardContent>
                  )}
                  {esResidente && (
                    <CardContent className={desplegado ? "pt-0" : "border-t pt-3"}>
                      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                        <IconLock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        <span>{AVISO_REGISTRO_LECTURA}</span>
                      </p>
                    </CardContent>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
