"use client"

import * as React from "react"
import Link from "next/link"
import { mutate } from "swr"
import { ConfiguracionGlobal } from "@/data/admin/configuracion"
import { useConfiguracion } from "@/lib/api/use-configuracion"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  IconBuilding,
  IconMail,
  IconCalculator,
  IconBell,
  IconShield,
} from "@tabler/icons-react"
import { LogoUploader } from "@/components/admin/logo-uploader"
import { ReglamentoGC } from "@/components/admin/reglamento-gc"

/** Pestañas de la pantalla. Fuente única: la usan el formulario ya cargado y el
 * esqueleto de carga, para que la estructura de la pantalla no se bifurque. */
const PESTANAS = [
  { value: "identidad", etiqueta: "Identidad Legal", Icono: IconBuilding },
  { value: "gc", etiqueta: "Gasto Común", Icono: IconCalculator },
  { value: "smtp", etiqueta: "Correo SMTP", Icono: IconMail },
  { value: "notificaciones", etiqueta: "Notificaciones", Icono: IconBell },
  { value: "operacion", etiqueta: "Operación y Seguridad", Icono: IconShield },
] as const

/**
 * La ayuda del remitente, en criollo: qué rol cumple. La pregunta textual del dueño
 * fue «¿el correo remitente sería el correo de log, del administrador?» — no es la
 * cuenta con la que se entra al sistema, es la dirección que ve el vecino.
 */
const AYUDA_REMITENTE =
  "Es la dirección que va a ver el vecino cuando abra su correo. No es tu usuario para entrar al sistema: es la cara pública de la comunidad. Conviene que sea del mismo dominio del servidor, o el correo puede caer en spam."

/** Cómo se ve la comunidad al lado de la dirección del remitente. */
const AYUDA_NOMBRE_REMITENTE =
  "Cómo se ve la comunidad al lado de la dirección, por ejemplo Administración Los Almendros."

/**
 * La trampa de esta pestaña, dicha: los campos de arriba no guardan la contraseña del
 * buzón —vive cifrada en la credencial POR COMUNIDAD—, así que acá se avisa dónde se
 * carga en vez de dejar que se busque una y otra vez en el formulario equivocado.
 */
const AVISO_CREDENCIAL_EN_CONSOLA =
  "La contraseña del buzón no se edita acá: se carga cifrada en la consola de la comunidad, junto con el servidor, el puerto y la casilla, y esa credencial se usa antes que la del entorno."

/**
 * Lo que se aplica en TODOS los envíos, tenga o no credencial la comunidad: el
 * remitente, su nombre, la copia de auditoría y la seguridad de la conexión. No
 * tienen equivalente en la consola de la comunidad (esa carga servidor, puerto,
 * casilla y contraseña), así que quedan acá, primero y dichos como tales.
 */
const TITULO_SIEMPRE_APLICA = "Estos datos se usan siempre"

const DESCRIPCION_SIEMPRE_APLICA =
  "El remitente, su nombre, la copia de auditoría y la seguridad de la conexión no se cargan en la consola de la comunidad: se aplican en todos los envíos, tenga o no credencial propia."

/**
 * El bloque de la credencial del entorno, declarado por lo que es: el RESPALDO.
 *
 * La precedencia no la inventa esta pantalla, la decide el emisor: `lib/smtp.ts:513`
 * («la credencial de la comunidad manda sobre host/puerto/usuario y sobre el
 * secreto», con el remitente y la seguridad viniendo siempre de CF) y
 * `lib/smtp.ts:295` (el secreto es `credencial.secreto` o `SMTP_PASSWORD`). Si la
 * comunidad no cargó credencial, el envío usa estos datos y `SMTP_PASSWORD`
 * (`lib/smtp.ts:560` nombra la variable que falta).
 */
const TITULO_RESPALDO_SERVIDOR =
  "Respaldo del servidor (sólo si la comunidad no cargó su credencial)"

const FRASE_PRECEDENCIA_CREDENCIAL =
  "Si la comunidad cargó su credencial, esa manda y estos datos no se usan. Si no la cargó, el sistema usa esto. La contraseña de la comunidad se carga allá, no acá."

export default function ConfiguracionPage() {
  const { config: configuracionRemota, error, updateConfig } = useConfiguracion()
  const [config, setConfig] = React.useState<ConfiguracionGlobal | null>(null)

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset intencional al llegar la config del servidor
    if (configuracionRemota) setConfig(configuracionRemota as unknown as ConfiguracionGlobal)
  }, [configuracionRemota])

  const updateField = <K extends keyof ConfiguracionGlobal>(
    field: K,
    value: ConfiguracionGlobal[K]
  ) => {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  /**
   * Renombra la comunidad por su ruta (`PUT /api/comunidad-actual`), que es la
   * única superficie de escritura de `Comunidad.nombre`. Devuelve el motivo del
   * fallo, o `null` si se guardó. La ruta exige `cf: editar` y valida el nombre.
   */
  const guardarNombreDeLaComunidad = async (
    nombre: string
  ): Promise<string | null> => {
    try {
      const res = await fetch("/api/comunidad-actual", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre }),
      })
      const cuerpo = (await res.json().catch(() => null)) as
        | {
            error?: string
            // La ruta transporta el mensaje exacto del schema (ahí vive el máximo).
            detalles?: { fieldErrors?: { nombre?: string[] } }
          }
        | null
      if (!res.ok) {
        return (
          cuerpo?.detalles?.fieldErrors?.nombre?.[0] ??
          cuerpo?.error ??
          `Error ${res.status} al guardar el nombre de la comunidad.`
        )
      }
      // La barra lateral y el encabezado leen esta proyección: se refresca con el
      // nombre nuevo en el mismo acto.
      void mutate("/api/comunidad-actual")
      return null
    } catch {
      return "Sin conexión con el servidor."
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!config) return

    // S1: el nombre no se guarda en la configuración global. Se escribe contra la
    // fuente única (`Comunidad.nombre`) por su propia ruta, y ANTES del resto: si
    // el renombre falla, la pantalla no puede decir «guardado» con un nombre que
    // quedó viejo.
    const nombre = config.nombreComunidad.trim()
    if (nombre !== (configuracionRemota?.nombreComunidad ?? "")) {
      const errorNombre = await guardarNombreDeLaComunidad(nombre)
      if (errorNombre) {
        alert(`No se pudo guardar el nombre de la comunidad: ${errorNombre}`)
        return
      }
      setConfig((prev) => (prev ? { ...prev, nombreComunidad: nombre } : prev))
    }

    // SAFETY: el formulario edita el shape de data/admin (seed); la API valida
    // por schema y rechaza campos inválidos con error visible.
    const resultado = await updateConfig(config as unknown as Parameters<typeof updateConfig>[0])
    if (!resultado.ok) {
      alert(`No se pudo guardar la configuración: ${resultado.error}`)
      return
    }
    console.log("[AM] CF_UPDATE_PARAM", config)
    alert("Configuración guardada en la base de datos")
  }

  // El encabezado y las pestañas se pintan SIEMPRE, también sin datos: son
  // estructura, no datos. Así la pantalla nunca queda vacía (antes, mientras
  // la API no respondía, esto era un bloque gris sin título ni pestañas: el
  // "no muestra nada" del reporte) y el HTML del servidor ya trae las
  // pestañas. Los VALORES del formulario siguen viniendo sólo de la base.
  if (!config) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Configuración Global
          </h1>
          <p className="text-muted-foreground">
            Parámetros base que rigen el comportamiento del sistema.
          </p>
        </div>
        <Tabs defaultValue="identidad" className="w-full">
          <TabsList className="mb-6 flex h-auto flex-wrap bg-muted/50 p-1">
            {PESTANAS.map(({ value, etiqueta, Icono }) => (
              <TabsTrigger key={value} value={value} className="gap-2">
                <Icono className="size-4" /> {etiqueta}
              </TabsTrigger>
            ))}
          </TabsList>
          {error ? (
            <Card>
              <CardHeader>
                <CardTitle>No se pudo leer la configuración</CardTitle>
                <CardDescription>
                  La configuración vive en la base y la API no respondió:{" "}
                  {error.message}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  type="button"
                  onClick={() => void mutate("/api/configuracion")}
                >
                  Reintentar
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="flex animate-pulse flex-col gap-4">
              <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
              <div className="h-64 w-full rounded-lg bg-muted/30" />
            </div>
          )}
        </Tabs>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Configuración Global
          </h1>
          <p className="text-muted-foreground">
            Parámetros base que rigen el comportamiento del sistema.
          </p>
        </div>
        <Button type="submit" form="config-form">
          Guardar Cambios
        </Button>
      </div>

      <form id="config-form" onSubmit={handleSave}>
        <Tabs defaultValue="identidad" className="w-full">
          <TabsList className="mb-6 flex h-auto flex-wrap bg-muted/50 p-1">
            {PESTANAS.map(({ value, etiqueta, Icono }) => (
              <TabsTrigger key={value} value={value} className="gap-2">
                <Icono className="size-4" /> {etiqueta}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="identidad">
            <Card>
              <CardHeader>
                <CardTitle>Identidad y Representación Legal</CardTitle>
                <CardDescription>
                  Datos oficiales de la comunidad para documentos y
                  comunicaciones.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <LogoUploader
                    value={config.logoUrl}
                    onChange={(value) => updateField("logoUrl", value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nombre de la Comunidad *</Label>
                  <Input
                    value={config.nombreComunidad}
                    onChange={(e) =>
                      updateField("nombreComunidad", e.target.value)
                    }
                    required
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Es el nombre que ve el vecino en toda la app y el que se
                    imprime en los papeles. Se guarda en la ficha de la
                    comunidad, no en estos parámetros: al guardar, el cambio
                    llega a todas las pantallas y a los documentos.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>RUT de la Comunidad *</Label>
                  <Input
                    value={config.rutComunidad}
                    onChange={(e) =>
                      updateField("rutComunidad", e.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Dirección Oficial *</Label>
                  <Input
                    value={config.direccionOficial}
                    onChange={(e) =>
                      updateField("direccionOficial", e.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Administrador Responsable</Label>
                  {/* Firmante DERIVADO: sale del campo `firmante` de la configuración
                      (la persona del padrón con membresía administrador), no de una
                      columna editable ni de un nombre guardado a mano. */}
                  <Input
                    value={
                      configuracionRemota?.firmante?.nombre ||
                      "Sin administrador designado"
                    }
                    readOnly
                    aria-readonly="true"
                    className="bg-muted/40"
                  />
                </div>
                <div className="space-y-2">
                  <Label>RUT Administrador</Label>
                  <Input
                    value={configuracionRemota?.firmante?.rut || "—"}
                    readOnly
                    aria-readonly="true"
                    className="bg-muted/40"
                  />
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground md:col-span-2">
                  El firmante de los papeles no se escribe acá: se deriva de la
                  cuenta con rol administrador que tiene ficha en el padrón, con
                  su nombre y su RUT. Se cambia desde Cuentas y Personas. Si la
                  comunidad no tiene administrador con ficha, los papeles no se
                  emiten hasta que lo tenga.
                </p>
                <div className="space-y-2">
                  <Label>Teléfono Admin *</Label>
                  <Input
                    value={config.telefonoAdmin}
                    onChange={(e) =>
                      updateField("telefonoAdmin", e.target.value)
                    }
                    required
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gc">
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Parametrización del Gasto Común</CardTitle>
                  <CardDescription>
                    Define cómo se calcula el cobro base y las reglas de
                    morosidad.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Modo de Cálculo *</Label>
                    <Select
                      value={config.modoCalculoGC}
                      onValueChange={(v) =>
                        updateField(
                          "modoCalculoGC",
                          v as ConfiguracionGlobal["modoCalculoGC"]
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fijo">
                          Monto Fijo por Tipo de Unidad
                        </SelectItem>
                        <SelectItem value="variable">
                          Variable por Prorrateo
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Día de Corte de Pago (1-31) *</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={config.diaCortePago}
                      onChange={(e) =>
                        updateField("diaCortePago", Number(e.target.value))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Límite de Meses para Aviso de Corte *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={config.limiteMesesAvisoCorte}
                      onChange={(e) =>
                        updateField(
                          "limiteMesesAvisoCorte",
                          Number(e.target.value)
                        )
                      }
                      required
                    />
                  </div>
                </CardContent>
              </Card>
              <ReglamentoGC />
            </div>
          </TabsContent>

          <TabsContent value="smtp">
            <Card>
              <CardHeader>
                <CardTitle>
                  Configuración de Correo Electrónico (SMTP)
                </CardTitle>
                <CardDescription>
                  Parámetros críticos para comunicaciones y cobranza.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {/* Lo que sólo vive acá: aplica siempre, con credencial de la
                    comunidad o sin ella, y no se carga en su consola. */}
                <section
                  aria-labelledby="smtp-datos-siempre"
                  className="flex flex-col gap-4"
                >
                  <div className="space-y-1">
                    <h3
                      id="smtp-datos-siempre"
                      className="text-sm font-semibold"
                    >
                      {TITULO_SIEMPRE_APLICA}
                    </h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {DESCRIPCION_SIEMPRE_APLICA}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Correo Remitente *</Label>
                      <Input
                        value={config.smtpFrom}
                        onChange={(e) =>
                          updateField("smtpFrom", e.target.value)
                        }
                        required
                      />
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {AYUDA_REMITENTE}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Nombre Remitente</Label>
                      <Input
                        value={config.smtpFromName}
                        onChange={(e) =>
                          updateField("smtpFromName", e.target.value)
                        }
                        placeholder="Si queda vacío, se usa el nombre de la comunidad"
                      />
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {AYUDA_NOMBRE_REMITENTE}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Correo BCC (Auditoría)</Label>
                      <Input
                        value={config.smtpBcc}
                        onChange={(e) =>
                          updateField("smtpBcc", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Seguridad *</Label>
                      <Select
                        value={config.smtpSecurity}
                        onValueChange={(v) =>
                          updateField(
                            "smtpSecurity",
                            v as ConfiguracionGlobal["smtpSecurity"]
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tls">TLS</SelectItem>
                          <SelectItem value="ssl">SSL</SelectItem>
                          <SelectItem value="none">Sin seguridad</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </section>

                {/* El respaldo: visualmente secundario y dicho como respaldo. Los
                    campos NO se deshabilitan —siguen siendo el fallback de las
                    comunidades sin credencial propia—. */}
                <section
                  aria-labelledby="smtp-respaldo-servidor"
                  className="flex flex-col gap-4 rounded-lg border border-dashed bg-muted/20 p-4"
                >
                  <div className="space-y-1">
                    <h3
                      id="smtp-respaldo-servidor"
                      className="text-sm font-semibold"
                    >
                      {TITULO_RESPALDO_SERVIDOR}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {FRASE_PRECEDENCIA_CREDENCIAL}{" "}
                      <Link
                        href="/admin/configuracion/correo"
                        className="font-medium underline underline-offset-4"
                      >
                        Ir a la consola de la comunidad
                      </Link>
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Servidor SMTP *</Label>
                      <Input
                        value={config.smtpHost}
                        onChange={(e) =>
                          updateField("smtpHost", e.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Puerto *</Label>
                      <Input
                        type="number"
                        value={config.smtpPort}
                        onChange={(e) =>
                          updateField("smtpPort", Number(e.target.value))
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Usuario *</Label>
                      <Input
                        value={config.smtpUser}
                        onChange={(e) =>
                          updateField("smtpUser", e.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2 rounded-md border bg-background p-3">
                      <Label className="text-xs font-bold tracking-widest uppercase">
                        Contraseña / Token
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Gestionado por el servidor (variable de entorno{" "}
                        <code className="rounded bg-muted px-1 font-mono">
                          SMTP_PASSWORD
                        </code>
                        ) — no se edita en el cliente (C2-final).
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {AVISO_CREDENCIAL_EN_CONSOLA}{" "}
                        <Link
                          href="/admin/configuracion/correo"
                          className="font-medium underline underline-offset-4"
                        >
                          Ir a la credencial de correo de la comunidad
                        </Link>
                      </p>
                    </div>
                  </div>
                </section>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notificaciones">
            <Card>
              <CardHeader>
                <CardTitle>Reglas y Opt-in de Módulos</CardTitle>
                <CardDescription>
                  Activa o desactiva los envíos automáticos de correo.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {[
                  {
                    key: "notificarEmisionGC",
                    label: "Emisión de Gastos Comunes",
                  },
                  {
                    key: "notificarRegistroVisitas",
                    label: "Registro de Visitas",
                  },
                  {
                    key: "notificarEncomiendas",
                    label: "Recepción de Encomiendas",
                  },
                  {
                    key: "notificarReservas",
                    label: "Confirmación de Reservas",
                  },
                  { key: "notificarAvisosSistema", label: "Avisos de Sistema" },
                  {
                    key: "notificarSugerenciasReclamos",
                    label: "Sugerencias y Reclamos",
                  },
                ].map(({ key, label }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <span className="font-medium">{label}</span>
                    <Switch
                      checked={
                        config[key as keyof ConfiguracionGlobal] as boolean
                      }
                      onCheckedChange={(v) =>
                        updateField(
                          key as keyof ConfiguracionGlobal,
                          v as never
                        )
                      }
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="operacion">
            <Card>
              <CardHeader>
                <CardTitle>Parámetros Operativos y Seguridad</CardTitle>
                <CardDescription>
                  Valores base para cálculos de sueldos, prorrateos y seguridad.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Días Mes Comercial (28-31) *</Label>
                  <Input
                    type="number"
                    min={28}
                    max={31}
                    value={config.diasMesComercial}
                    onChange={(e) =>
                      updateField("diasMesComercial", Number(e.target.value))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Días Vacaciones / Mes *</Label>
                  <Input
                    type="number"
                    step={0.01}
                    value={config.diasVacacionesMes}
                    onChange={(e) =>
                      updateField("diasVacacionesMes", Number(e.target.value))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Jornada Semanal Estándar (35-48 hrs) *</Label>
                  <Input
                    type="number"
                    min={35}
                    max={48}
                    value={config.jornadaSemanalEstandar}
                    onChange={(e) =>
                      updateField(
                        "jornadaSemanalEstandar",
                        Number(e.target.value)
                      )
                    }
                    required
                  />
                </div>
                <div className="space-y-2 rounded-md border border-dashed bg-muted/20 p-3">
                  <Label className="text-xs font-bold tracking-widest uppercase">
                    Clave de Eliminación Maestro
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Gestionado por el servidor (variable de entorno{" "}
                    <code className="rounded bg-muted px-1 font-mono">
                      CLAVE_ELIMINACION_MAESTRO
                    </code>
                    ) — no se edita en el cliente (C2-final).
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </form>
    </div>
  )
}
