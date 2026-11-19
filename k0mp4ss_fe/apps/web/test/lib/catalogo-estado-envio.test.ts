/** @vitest-environment node */
/**
 * F43 · hallazgos de la revisión — un solo catálogo de estados para la columna
 * `envioEstado` (S1) y el catch de la constancia que dice el motivo (S3).
 *
 * La revisión de F43 encontró dos orillas del mismo dato escritas por separado:
 * el escritor (`enviarBienvenida` en `lib/correo-bienvenida.ts`, vía
 * `estadoDelCorreo`) y el lector/proyección (`envioInvitacionPublico` en
 * `lib/invitacion-acceso.ts`), cada uno con su copia del catálogo. Si una copia
 * gana un estado o se renombra, el escritor graba un valor que el lector no
 * reconoce y lo proyecta como `null`: la pantalla dice «Nunca se intentó»
 * mientras la base tiene una constancia real. Este archivo hace esa divergencia
 * imposible por construcción, no por inspección del fuente:
 *
 *   1. El catálogo vive en `lib/schemas.ts` (módulo puro, sin Prisma) junto a
 *      `ESTADOS_ENTREGA_AVISO`, y ninguno de los dos módulos declara el suyo.
 *   2. El conjunto que el escritor persiste y el que la proyección acepta son el
 *      MISMO, y es el del catálogo compartido: un valor fuera del catálogo lo
 *      rechazan los dos (el escritor lo declara `fallido`, la proyección `null`).
 *   3. Un `envioEstado` presente en la base se proyecta como ese estado y nunca
 *      como `null`: los tres valores, pinados.
 *   4. Cuando la constancia no se puede persistir, el log
 *      `INVITACION_ENVIO_SIN_CONSTANCIA` lleva el motivo —ya redactado por
 *      `sinEnlaceEnElMotivo`— además del estado y la invitación: quien investiga
 *      el envío no tiene que adivinar por qué concluyó lo que concluyó.
 *   5. La etiqueta del rol también es una sola (S2): `ETIQUETA_ROL` vive en
 *      `lib/authz.ts` con la forma que el correo usa en la oración, y la pantalla
 *      la capitaliza con `etiquetaRol`. Acá se pinan las dos formas y se exige
 *      que el correo reexporte esa misma fuente, no una copia.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { ETIQUETA_ROL, ROLES, etiquetaRol } from "@/lib/authz"
import { enviarBienvenida } from "@/lib/correo-bienvenida"
import { envioInvitacionPublico } from "@/lib/invitacion-acceso"
import { logger } from "@/lib/logger"
import { ESTADOS_ENVIO_INVITACION, EstadoEnvioInvitacionSchema } from "@/lib/schemas"
import * as moduloCorreo from "@/lib/correo-bienvenida"
import * as moduloInvitacion from "@/lib/invitacion-acceso"

/**
 * Prisma y el emisor se doblan: acá se mide la traducción estado → constancia →
 * log, no el diálogo SMTP ni la base (eso lo cubren las pruebas de la ruta).
 */
const { prismaMock, planMock } = vi.hoisted(() => ({
  prismaMock: { invitacionAcceso: { update: vi.fn() } },
  planMock: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/entrega-aviso", () => ({ planDeCanal: planMock }))

const TOKEN = "AbC123defGHI456jklMNO789pqr_-xyzABC"
const ENLACE = `http://localhost/invitacion?token=${TOKEN}`

/** Lo mínimo que el envío necesita; el enlace y el token no pueden salir en el log. */
const DATOS = {
  invitacionId: "inv-1",
  comunidadId: "com-1",
  comunidad: "Los Aromos",
  destinatario: "ana@ejemplo.test",
  nombre: "Ana María Rojas",
  rol: "residente" as const,
  enlace: ENLACE,
}

/** Los tres estados que la columna persiste hoy, escritos de forma literal. */
const ESTADOS_ESCRITOS_HOY = ["enviado", "pendiente", "fallido"] as const

describe("S1 — un solo catálogo de estados para la misma columna envioEstado", () => {
  it("el catálogo compartido es exactamente los estados que la columna persiste hoy", () => {
    expect([...ESTADOS_ENVIO_INVITACION]).toEqual([...ESTADOS_ESCRITOS_HOY])
    for (const estado of ESTADOS_ESCRITOS_HOY) {
      expect(EstadoEnvioInvitacionSchema.safeParse(estado).success).toBe(true)
    }
    // `entregado` es del visor: el correo no crea `Notificacion`, así que no
    // pertenece a este catálogo.
    expect(EstadoEnvioInvitacionSchema.safeParse("entregado").success).toBe(false)
  })

  it("el escritor persiste y la proyección acepta el MISMO conjunto, tomado del catálogo", async () => {
    const escritos = new Set<string>()
    for (const estado of ESTADOS_ENVIO_INVITACION) {
      planMock.mockResolvedValueOnce({ canal: "email", estado, motivo: `aceptado (${estado})` })
      const constancia = await enviarBienvenida(DATOS)
      expect(constancia.estado).toBe(estado)
      expect(ESTADOS_ENVIO_INVITACION).toContain(constancia.estado)
      escritos.add(constancia.estado)
    }

    const proyectados = ESTADOS_ENVIO_INVITACION.filter(
      (estado) =>
        envioInvitacionPublico({
          envioEstado: estado,
          envioMotivo: null,
          envioEn: null,
        }) !== null
    )

    expect([...proyectados].sort()).toEqual([...ESTADOS_ENVIO_INVITACION].sort())
    expect([...escritos].sort()).toEqual([...proyectados].sort())
  })

  it("un valor fuera del catálogo lo rechazan las dos orillas", async () => {
    // La proyección no inventa una promesa: un valor que no está en el catálogo
    // se lee como ausencia de constancia.
    expect(
      envioInvitacionPublico({ envioEstado: "entregado", envioMotivo: null, envioEn: null })
    ).toBeNull()
    expect(
      envioInvitacionPublico({ envioEstado: "ENVIADO", envioMotivo: null, envioEn: null })
    ).toBeNull()
    expect(
      envioInvitacionPublico({ envioEstado: "desconocido", envioMotivo: null, envioEn: null })
    ).toBeNull()

    // El escritor lo declara `fallido`: nunca graba un estado que el catálogo no
    // tiene —ni uno que la proyección leería como `null`.
    planMock.mockResolvedValueOnce({ canal: "email", estado: "entregado", motivo: null })
    const constancia = await enviarBienvenida(DATOS)
    expect(constancia.estado).toBe("fallido")
    expect(ESTADOS_ENVIO_INVITACION).toContain(constancia.estado)
  })

  it("ninguno de los dos módulos declara su propio catálogo", () => {
    expect(moduloInvitacion).not.toHaveProperty("ESTADOS_ENVIO_INVITACION")
    expect(moduloInvitacion).not.toHaveProperty("ESTADOS_ENVIO_BIENVENIDA")
    expect(moduloCorreo).not.toHaveProperty("ESTADOS_ENVIO_BIENVENIDA")
    expect(moduloCorreo).not.toHaveProperty("ESTADOS_ENVIO_INVITACION")
  })
})

describe("S1 — la proyección no esconde una constancia que la base tiene", () => {
  const ENVIADO_EN = new Date("2026-11-19T12:00:00.000Z")

  it("un envioEstado `enviado` se proyecta como `enviado`, con su fecha", () => {
    const publico = envioInvitacionPublico({
      envioEstado: "enviado",
      envioMotivo: "Aceptado por el servidor SMTP (id <falso-0001@ejemplo.test>).",
      envioEn: ENVIADO_EN,
    })
    expect(publico).toEqual({
      estado: "enviado",
      motivo: "Aceptado por el servidor SMTP (id <falso-0001@ejemplo.test>).",
      enviadoEn: ENVIADO_EN.toISOString(),
    })
  })

  it("un envioEstado `pendiente` se proyecta como `pendiente` y sin fecha de envío", () => {
    const publico = envioInvitacionPublico({
      envioEstado: "pendiente",
      envioMotivo: "Sin emisor SMTP configurado.",
      envioEn: null,
    })
    expect(publico).not.toBeNull()
    expect(publico?.estado).toBe("pendiente")
    expect(publico?.enviadoEn).toBeNull()
  })

  it("un envioEstado `fallido` se proyecta como `fallido` y sin fecha de envío", () => {
    const publico = envioInvitacionPublico({
      envioEstado: "fallido",
      envioMotivo: "El servidor rechazó el mensaje (554).",
      envioEn: null,
    })
    expect(publico).not.toBeNull()
    expect(publico?.estado).toBe("fallido")
    expect(publico?.enviadoEn).toBeNull()
  })
})

describe("S3 — el catch de la constancia registra el motivo, ya redactado", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    prismaMock.invitacionAcceso.update.mockReset()
  })

  it("cuando la constancia no se puede guardar, el log lleva estado, invitacionId y motivo", async () => {
    prismaMock.invitacionAcceso.update.mockRejectedValueOnce(new Error("la base no respondió"))
    planMock.mockResolvedValueOnce({
      canal: "email",
      estado: "fallido",
      motivo: `El servidor rechazó el mensaje (554): copia del cuerpo ${ENLACE}`,
    })
    const espia = vi.spyOn(logger, "warn").mockImplementation(() => {})

    const constancia = await enviarBienvenida(DATOS)
    expect(constancia.estado).toBe("fallido")

    expect(espia).toHaveBeenCalledTimes(1)
    const campos = espia.mock.calls[0]?.[0] as unknown as Record<string, unknown>
    expect(campos).toMatchObject({
      event: "INVITACION_ENVIO_SIN_CONSTANCIA",
      invitacionId: "inv-1",
      estado: "fallido",
    })
    // El motivo viaja ya redactado: el enlace y el token no llegan al log.
    expect(String(campos.motivo)).toContain("El servidor rechazó el mensaje (554)")
    expect(String(campos.motivo)).not.toContain(ENLACE)
    expect(String(campos.motivo)).not.toContain(TOKEN)
  })
})

describe("S2 — una sola fuente para la etiqueta del rol", () => {
  it("el correo usa la forma de la oración y la pantalla la inicial en mayúscula", () => {
    expect(ETIQUETA_ROL).toEqual({
      administrador: "administrador",
      comite: "comité",
      conserjeria: "conserjería",
      residente: "residente",
      mantencion: "mantención",
    })
    expect(ROLES.map(etiquetaRol)).toEqual([
      "Administrador",
      "Comité",
      "Conserjería",
      "Residente",
      "Mantención",
    ])
  })

  it("un valor que no es un rol conocido se muestra crudo, sin inventar etiqueta", () => {
    expect(etiquetaRol("propietario")).toBe("propietario")
    expect(etiquetaRol("")).toBe("")
  })

  it("el correo reexporta la misma fuente, no una copia", () => {
    expect(moduloCorreo.ETIQUETA_ROL).toBe(ETIQUETA_ROL)
  })
})
