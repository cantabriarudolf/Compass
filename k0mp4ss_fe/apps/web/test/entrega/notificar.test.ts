/** @vitest-environment node */
/**
 * El puente de entrega, partido en dos (T1b — specs S3 y S3b de
 * `odd/tasks/un-camino-de-entrega.md`).
 *
 * Qué fija este archivo, contra la base real y con el transporte DOBLADO (nunca
 * se abre una conexión: `enviarCorreoComunidad` es un mock, y `planDeCanal` —la
 * política canal→estado— corre de verdad):
 *
 *   1. `avisar()` — S2 — el canal de la constancia in-app viaja desde el
 *      llamador. El test usa un valor SENTINELA distinto del
 *      `@default("email_simulado")`: si el puente omitiera el campo y dejara
 *      actuar al default, la aserción falla. Escribe el aviso y su fila de
 *      `visor`, sin red, dentro de la transacción del llamador.
 *   2. `avisar()` + `entregarPorCorreo()` — S3 — cada intento deja UNA fila en
 *      `entregas_notificacion` con su canal, estado, motivo, intentos y fecha;
 *      el visor queda `entregado` sólo porque la `Notificacion` se escribió en
 *      la misma transacción, y el correo se cuelga de ese aviso.
 *   3. `entregarPorCorreo()` sin aviso — S3b — el módulo que entrega SÓLO por
 *      correo deja su fila con `notificacionId: null` y NO crea ninguna
 *      `Notificacion`: un correo que sale sin fila es el defecto que la spec
 *      prohíbe, y un aviso inventado sería el canal que el módulo no declaró.
 *   4. S6 — el aviso in-app no se pierde por el correo: sin dirección, sin SMTP,
 *      con rebote o con el transporte lanzando una excepción, la entrega dice
 *      qué pasó con su motivo y `entregarPorCorreo` nunca lanza.
 *   5. La `Notificacion` entra en la transacción del LLAMADOR: si el llamador
 *      revierte, no queda ni el aviso ni su entrega.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  MOTIVO_SIN_DESTINATARIO,
  MOTIVO_SIN_SMTP,
} from "@/lib/entrega-aviso"
import {
  MOTIVO_TRANSPORTE_FALLO,
  avisar,
  entregarPorCorreo,
  type AvisoInApp,
  type CorreoPorEntregar,
} from "@/lib/entrega/notificar"
import { CANAL_NOTIFICACION_EMAIL_SIMULADO } from "@/lib/schemas"

/**
 * El doble del transporte: `planDeCanal` sigue siendo el real, así que los
 * motivos que se persisten son los del catálogo. Acá sólo se decide qué
 * devuelve el servidor de correo (o si lanza).
 */
const transporte = vi.hoisted(() => ({ enviar: vi.fn() }))

vi.mock("@/lib/smtp", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/smtp")>()
  return { ...real, enviarCorreoComunidad: transporte.enviar }
})

const COM = "entrega-notif-comunidad"
const PERSONA_CON_CORREO = "entrega-notif-p-con-correo"
const PERSONA_SIN_CORREO = "entrega-notif-p-sin-correo"
const CORREO = "residente@residencialpruebadestino.cl"
const RUT_BASE = 20_000_000

let rut = RUT_BASE

/** Persona del maestro con la dirección que el test decide (o vacía). */
async function crearPersona(id: string, email: string): Promise<void> {
  rut += 1
  await prisma.persona.create({
    data: {
      id,
      comunidadId: COM,
      rut: `${rut}-0`,
      nombreCompleto: `Persona ${id}`,
      nombres: "Persona",
      apellidos: id,
      email,
      telefonoMovil: "+56900000000",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: ["propietario"],
    },
  })
}

/** Un aviso in-app mínimo; cada test cambia sólo lo que mide. */
function aviso(cambios: Partial<AvisoInApp> = {}): AvisoInApp {
  return {
    comunidadId: COM,
    destinatarioRol: "residente",
    destinatarioPersonaId: PERSONA_CON_CORREO,
    unidadId: "entrega-notif-unidad-101",
    asunto: "Encomienda recibida en conserjería",
    cuerpo: "Tiene una encomienda recibida el 2026-03-23. Retírela con su identificación.",
    canal: CANAL_NOTIFICACION_EMAIL_SIMULADO,
    moduloOrigen: "PE",
    fecha: "2026-03-23T12:00:00.000Z",
    ...cambios,
  }
}

/** Un correo mínimo; `notificacionId` es obligatorio y explícito (S3b). */
function correo(cambios: Partial<CorreoPorEntregar> = {}): CorreoPorEntregar {
  return {
    comunidadId: COM,
    asunto: "Encomienda recibida en conserjería",
    cuerpo: "Tiene una encomienda recibida el 2026-03-23. Retírela con su identificación.",
    destinatarioPersonaId: PERSONA_CON_CORREO,
    notificacionId: null,
    ...cambios,
  }
}

beforeAll(async () => {
  await prisma.entregaNotificacion.deleteMany({ where: { comunidadId: COM } })
  await prisma.notificacion.deleteMany({ where: { comunidadId: COM } })
  await prisma.persona.deleteMany({ where: { comunidadId: COM } })
  await prisma.comunidad.deleteMany({ where: { id: COM } })

  await prisma.comunidad.create({
    data: { id: COM, nombre: "Comunidad de la entrega", slug: "entrega-notif" },
  })
  await crearPersona(PERSONA_CON_CORREO, `  ${CORREO}  `)
  // Sin dirección: el maestro guarda la cadena vacía, no una dirección inventada.
  await crearPersona(PERSONA_SIN_CORREO, "")
}, 30_000)

afterAll(async () => {
  await prisma.entregaNotificacion.deleteMany({ where: { comunidadId: COM } })
  await prisma.notificacion.deleteMany({ where: { comunidadId: COM } })
  await prisma.persona.deleteMany({ where: { comunidadId: COM } })
  await prisma.comunidad.delete({ where: { id: COM } }).catch(() => {})
})

beforeEach(async () => {
  transporte.enviar.mockReset()
  transporte.enviar.mockResolvedValue({
    estado: "enviado",
    messageId: "<mensaje-de-prueba@servidor>",
  })
  // Cada test parte de una comunidad sin avisos ni entregas: las filas de uno
  // no se cuelan en las cuentas del siguiente.
  await prisma.entregaNotificacion.deleteMany({ where: { comunidadId: COM } })
  await prisma.notificacion.deleteMany({ where: { comunidadId: COM } })
})

function filasDeLaNotificacion(notificacionId: string) {
  return prisma.entregaNotificacion.findMany({
    where: { notificacionId },
    orderBy: { creadoEn: "asc" },
  })
}

const contarNotificaciones = () =>
  prisma.notificacion.count({ where: { comunidadId: COM } })

describe("S2 — el canal de la constancia in-app lo declara el llamador", () => {
  it("persiste el canal EXPLÍCITO, aunque sea distinto del default de Prisma", async () => {
    const sentinela = "canal-declarado-por-el-llamador"
    const resultado = await avisar(prisma, aviso({ canal: sentinela }))

    const notificacion = await prisma.notificacion.findUnique({
      where: { id: resultado.notificacionId },
    })
    expect(notificacion?.canal).toBe(sentinela)
    // El default del schema sigue intacto: no se cambió para "probar" el puente.
    expect(sentinela).not.toBe(CANAL_NOTIFICACION_EMAIL_SIMULADO)
  })
})

describe("S3 — cada intento deja su fila con canal, estado, motivo, intentos y fecha", () => {
  it("el visor queda `entregado` y prueba su hecho con la notificación escrita", async () => {
    const resultado = await avisar(prisma, aviso())

    expect(resultado.entrega).toMatchObject({
      canal: "visor",
      estado: "entregado",
      motivo: null,
      intentos: 1,
      enviadoEn: null,
    })

    const filas = await filasDeLaNotificacion(resultado.notificacionId)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      comunidadId: COM,
      canal: "visor",
      estado: "entregado",
      motivo: null,
      intentos: 1,
      enviadoEn: null,
    })
    expect(filas[0]!.creadoEn).toBeInstanceOf(Date)
    // El visor no abre ninguna conexión: la entrega es la fila in-app.
    expect(transporte.enviar).not.toHaveBeenCalled()
  })

  it("persiste UNA fila por intento, cada una con su motivo e intentos, sin duplicar el aviso", async () => {
    const primero = await avisar(prisma, aviso())
    transporte.enviar.mockResolvedValue({
      estado: "no_configurado",
      motivo: "Sin emisor SMTP configurado (F4).",
    })
    // El correo es un intento POSTERIOR al aviso: se cuelga del MISMO
    // `notificacionId`, así que el aviso in-app no se repite (S3b).
    const segundo = await entregarPorCorreo(
      prisma,
      correo({ notificacionId: primero.notificacionId })
    )

    expect(segundo).toMatchObject({
      canal: "email",
      estado: "pendiente",
      motivo: MOTIVO_SIN_SMTP,
      intentos: 1,
    })
    expect(await contarNotificaciones()).toBe(1)

    const filas = await filasDeLaNotificacion(primero.notificacionId)
    expect(filas).toHaveLength(2)
    expect(filas.find((f) => f.canal === "visor")).toMatchObject({
      estado: "entregado",
      motivo: null,
      intentos: 1,
    })
    expect(filas.find((f) => f.canal === "email")).toMatchObject({
      estado: "pendiente",
      motivo: MOTIVO_SIN_SMTP,
      intentos: 1,
    })
  })
})

describe("S3b — el correo sin aviso in-app no pierde su fila ni inventa un aviso", () => {
  it("con `notificacionId: null` deja UNA fila propia y NINGUNA notificación", async () => {
    const entrega = await entregarPorCorreo(prisma, correo())

    expect(entrega).toMatchObject({
      canal: "email",
      estado: "enviado",
      intentos: 1,
    })
    expect(entrega.enviadoEn).toBeInstanceOf(Date)
    expect(await contarNotificaciones()).toBe(0)

    const filas = await prisma.entregaNotificacion.findMany({
      where: { comunidadId: COM },
    })
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      canal: "email",
      notificacionId: null,
      estado: "enviado",
      intentos: 1,
    })
  })
})

describe("S6 — ningún aviso se pierde por el correo", () => {
  it("una persona sin dirección deja la entrega `fallido` con MOTIVO_SIN_DESTINATARIO y el aviso escrito", async () => {
    const escrito = await avisar(
      prisma,
      aviso({ destinatarioPersonaId: PERSONA_SIN_CORREO })
    )
    const entrega = await entregarPorCorreo(
      prisma,
      correo({
        destinatarioPersonaId: PERSONA_SIN_CORREO,
        notificacionId: escrito.notificacionId,
      })
    )

    expect(entrega).toMatchObject({
      canal: "email",
      estado: "fallido",
      motivo: MOTIVO_SIN_DESTINATARIO,
      intentos: 1,
      enviadoEn: null,
    })
    // Sin dirección no se abre ninguna conexión: no hay a quién enviarle.
    expect(transporte.enviar).not.toHaveBeenCalled()

    const notificacion = await prisma.notificacion.findUnique({
      where: { id: escrito.notificacionId },
    })
    expect(notificacion).not.toBeNull()
    expect(notificacion?.destinatarioPersonaId).toBe(PERSONA_SIN_CORREO)
  })

  it("sin emisor SMTP la entrega queda `pendiente` con MOTIVO_SIN_SMTP y el aviso escrito", async () => {
    transporte.enviar.mockResolvedValue({
      estado: "no_configurado",
      motivo: "Sin emisor SMTP configurado (F4).",
    })

    const escrito = await avisar(prisma, aviso())
    const entrega = await entregarPorCorreo(
      prisma,
      correo({ notificacionId: escrito.notificacionId })
    )

    expect(entrega).toMatchObject({
      canal: "email",
      estado: "pendiente",
      motivo: MOTIVO_SIN_SMTP,
      intentos: 1,
      enviadoEn: null,
    })
    expect(await contarNotificaciones()).toBe(1)
  })

  it("si el transporte lanza una excepción, `entregarPorCorreo` NO la propaga: `fallido` y la fila queda", async () => {
    transporte.enviar.mockRejectedValue(new Error("socket hang up"))

    const escrito = await avisar(prisma, aviso())
    const entrega = await entregarPorCorreo(
      prisma,
      correo({ notificacionId: escrito.notificacionId })
    )

    expect(entrega).toMatchObject({
      canal: "email",
      estado: "fallido",
      motivo: MOTIVO_TRANSPORTE_FALLO,
      intentos: 1,
      enviadoEn: null,
    })
    expect(await contarNotificaciones()).toBe(1)
    expect(
      await prisma.entregaNotificacion.count({
        where: { notificacionId: escrito.notificacionId },
      })
    ).toBe(2)
  })
})

describe("el correo sale por la puerta única y se reporta como pasó", () => {
  it("con el servidor aceptando, la entrega queda `enviado` con su fecha y el id del mensaje", async () => {
    const escrito = await avisar(prisma, aviso())
    const entrega = await entregarPorCorreo(
      prisma,
      correo({ notificacionId: escrito.notificacionId })
    )

    // `planDeCanal` es el que habla con `enviarCorreoComunidad`: el puente nunca
    // llama al SMTP directo, así que el destinatario resuelto y el texto del
    // aviso llegan por esa puerta.
    expect(transporte.enviar).toHaveBeenCalledTimes(1)
    expect(transporte.enviar).toHaveBeenCalledWith(COM, {
      to: CORREO,
      subject: "Encomienda recibida en conserjería",
      text: "Tiene una encomienda recibida el 2026-03-23. Retírela con su identificación.",
    })

    expect(entrega).toMatchObject({
      canal: "email",
      estado: "enviado",
      intentos: 1,
    })
    expect(entrega.motivo).toContain("<mensaje-de-prueba@servidor>")
    expect(entrega.enviadoEn).toBeInstanceOf(Date)

    const filas = await filasDeLaNotificacion(escrito.notificacionId)
    expect(filas).toHaveLength(2)
    const correoPersistido = filas.find((fila) => fila.canal === "email")
    expect(correoPersistido?.estado).toBe("enviado")
    expect(correoPersistido?.enviadoEn).toBeInstanceOf(Date)
  })
})

describe("la notificación entra en la transacción del llamador", () => {
  it("si el llamador revierte, no queda ni el aviso ni su entrega", async () => {
    let notificacionId = ""
    await expect(
      prisma.$transaction(async (tx) => {
        const resultado = await avisar(tx, aviso())
        notificacionId = resultado.notificacionId
        throw new Error("rollback-del-llamador")
      })
    ).rejects.toThrow("rollback-del-llamador")

    expect(notificacionId).not.toBe("")
    expect(
      await prisma.notificacion.findUnique({ where: { id: notificacionId } })
    ).toBeNull()
    expect(
      await prisma.entregaNotificacion.count({ where: { notificacionId } })
    ).toBe(0)
  })
})
