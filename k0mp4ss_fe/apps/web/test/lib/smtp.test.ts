/** @vitest-environment node */
/**
 * Emisor SMTP real (F4). Sin credenciales reales y sin red: el transporte se
 * prueba contra `servidor-smtp-falso.ts`, un servidor SMTP en memoria que
 * escucha en 127.0.0.1 con puerto efímero.
 *
 * Contrato del módulo (los tres desenlaces no se confunden):
 * - `no_configurado` → estado de CONFIGURACIÓN (falta CF, falta un campo o falta
 *   `SMTP_PASSWORD`) y no se abre ninguna conexión;
 * - `enviado` → el servidor aceptó el mensaje (250 del DATA), con su id;
 * - `fallido` → se intentó y rebotó, con motivo (auth rechazada, conexión
 *   rechazada, timeout, respuesta inesperada).
 *
 * Y la regla que no se negocia: la contraseña de `process.env.SMTP_PASSWORD` no
 * aparece en ningún motivo, ni siquiera cuando el servidor la repite.
 */
import { createServer } from "node:net"
import { afterEach, describe, expect, it } from "vitest"
import {
  enviarCorreoSMTP,
  estadoRegistroSMTP,
  motivoSMTP,
  type FilaConfiguracionSMTP,
} from "@/lib/smtp"
import {
  iniciarServidorSMTPFalso,
  type ServidorSMTPFalso,
} from "./servidor-smtp-falso"

/** Contraseña inventada: no es una credencial, es texto de prueba. */
const CLAVE_FALSA = "clave-inventada-solo-para-tests"
const USUARIO = "emisor@ejemplo.test"
const DESTINATARIO = "residente@ejemplo.test"

const servidores: ServidorSMTPFalso[] = []

async function levantarServidor(
  opciones: Parameters<typeof iniciarServidorSMTPFalso>[0] = {}
): Promise<ServidorSMTPFalso> {
  const servidor = await iniciarServidorSMTPFalso({
    usuario: USUARIO,
    secreto: CLAVE_FALSA,
    ...opciones,
  })
  servidores.push(servidor)
  return servidor
}

afterEach(async () => {
  while (servidores.length > 0) await servidores.pop()?.cerrar()
})

function filaBase(
  puerto: number,
  extra: Partial<FilaConfiguracionSMTP> = {}
): FilaConfiguracionSMTP {
  return {
    smtpHost: "127.0.0.1",
    smtpPort: puerto,
    smtpUser: USUARIO,
    smtpSecurity: "none",
    smtpFrom: "no-responder@ejemplo.test",
    smtpFromName: "Comunidad de prueba",
    smtpBcc: null,
    smtpRecepcion: null,
    ...extra,
  }
}

const mensajeDePrueba = {
  to: DESTINATARIO,
  subject: "Recordatorio de deuda vencida (Torre A 101)",
  text: "Su unidad registra $120.000 en 1 cobro(s) vencido(s).",
}

/** Puerto TCP que nadie escucha (se abre y se cierra al instante). */
async function puertoLibre(): Promise<number> {
  const servidor = createServer()
  const puerto = await new Promise<number>((resolver, rechazar) => {
    servidor.once("error", rechazar)
    servidor.listen(0, "127.0.0.1", () => {
      const direccion = servidor.address()
      if (direccion === null || typeof direccion === "string") {
        rechazar(new Error("sin puerto"))
        return
      }
      resolver(direccion.port)
    })
  })
  await new Promise<void>((resolver) => servidor.close(() => resolver()))
  return puerto
}

describe("sin configuración: NO se pretende que se envió", () => {
  it("sin fila de CF la comunidad no tiene emisor y el registro queda pendiente", async () => {
    const resultado = await enviarCorreoSMTP(null, mensajeDePrueba, {
      env: { SMTP_PASSWORD: CLAVE_FALSA },
    })

    expect(resultado.estado).toBe("no_configurado")
    if (resultado.estado !== "no_configurado") throw new Error("estado inesperado")
    expect(resultado.motivo).toMatch(/sin emisor SMTP configurado/i)
    expect(resultado.motivo).toMatch(/\(CF\)/)

    // Traducción a la cola de salida: `pendiente`, nunca `enviado`.
    expect(estadoRegistroSMTP(resultado)).toBe("pendiente")
    expect(motivoSMTP(resultado)).toMatch(/no se reporta como enviado/i)
  })

  it("sin SMTP_PASSWORD en el servidor declara la variable que falta", async () => {
    const servidor = await levantarServidor()
    const resultado = await enviarCorreoSMTP(filaBase(servidor.port), mensajeDePrueba, {
      env: {},
    })

    expect(resultado.estado).toBe("no_configurado")
    if (resultado.estado !== "no_configurado") throw new Error("estado inesperado")
    expect(resultado.motivo).toMatch(/SMTP_PASSWORD/)
    expect(estadoRegistroSMTP(resultado)).toBe("pendiente")
    // Ni una conexión: el servidor no recibió nada.
    expect(servidor.mensajes).toHaveLength(0)
    expect(servidor.autenticaciones).toHaveLength(0)
  })

  it("la contraseña en blanco cuenta como no configurada", async () => {
    const servidor = await levantarServidor()
    const resultado = await enviarCorreoSMTP(filaBase(servidor.port), mensajeDePrueba, {
      env: { SMTP_PASSWORD: "   " },
    })

    expect(resultado.estado).toBe("no_configurado")
    expect(servidor.mensajes).toHaveLength(0)
  })

  it("la CF incompleta nombra el campo que falta (host)", async () => {
    const servidor = await levantarServidor()
    const resultado = await enviarCorreoSMTP(
      filaBase(servidor.port, { smtpHost: "  " }),
      mensajeDePrueba,
      { env: { SMTP_PASSWORD: CLAVE_FALSA } }
    )

    expect(resultado.estado).toBe("no_configurado")
    if (resultado.estado !== "no_configurado") throw new Error("estado inesperado")
    expect(resultado.motivo).toMatch(/smtpHost/)
    expect(servidor.mensajes).toHaveLength(0)
  })
})

describe("el servidor acepta: el registro puede decir `enviado`", () => {
  it("AUTH PLAIN aceptada: mensaje enviado con destinatario, asunto y cuerpo", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    const resultado = await enviarCorreoSMTP(filaBase(servidor.port), mensajeDePrueba, {
      env: { SMTP_PASSWORD: CLAVE_FALSA },
    })

    expect(resultado.estado).toBe("enviado")
    if (resultado.estado !== "enviado") throw new Error("estado inesperado")
    // El servidor devolvió `queued as <falso-0001@ejemplo.test>`: ese es el id.
    expect(resultado.messageId).toContain("falso-0001@ejemplo.test")

    expect(servidor.autenticaciones).toEqual([{ usuario: USUARIO, secreto: CLAVE_FALSA }])
    expect(servidor.mensajes).toHaveLength(1)
    const recibido = servidor.mensajes[0]
    expect(recibido?.from).toBe("no-responder@ejemplo.test")
    expect(recibido?.to).toEqual([DESTINATARIO])
    expect(recibido?.crudo).toContain(`To: <${DESTINATARIO}>`)
    expect(recibido?.crudo).toContain(`From: Comunidad de prueba <no-responder@ejemplo.test>`)
    expect(recibido?.crudo).toContain("Subject: Recordatorio de deuda vencida (Torre A 101)")
    expect(recibido?.crudo).toContain("Su unidad registra $120.000 en 1 cobro(s) vencido(s).")

    // Y el motivo persistido deja constancia de la aceptación con su id.
    expect(estadoRegistroSMTP(resultado)).toBe("enviado")
    expect(motivoSMTP(resultado)).toMatch(/aceptado por el servidor SMTP/i)
    expect(motivoSMTP(resultado)).toContain("falso-0001@ejemplo.test")
  })

  it("AUTH LOGIN aceptada: misma garantía cuando el servidor solo ofrece LOGIN", async () => {
    const servidor = await levantarServidor({ modo: "aceptar", mecanismos: ["LOGIN"] })
    const resultado = await enviarCorreoSMTP(filaBase(servidor.port), mensajeDePrueba, {
      env: { SMTP_PASSWORD: CLAVE_FALSA },
    })

    expect(resultado.estado).toBe("enviado")
    expect(servidor.autenticaciones).toEqual([{ usuario: USUARIO, secreto: CLAVE_FALSA }])
    expect(servidor.mensajes).toHaveLength(1)
  })

  it("el BCC de auditoría de CF viaja como destinatario y no en las cabeceras", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    const resultado = await enviarCorreoSMTP(
      filaBase(servidor.port, { smtpBcc: "auditoria@ejemplo.test" }),
      mensajeDePrueba,
      { env: { SMTP_PASSWORD: CLAVE_FALSA } }
    )

    expect(resultado.estado).toBe("enviado")
    expect(servidor.mensajes[0]?.to).toEqual([DESTINATARIO, "auditoria@ejemplo.test"])
    expect(servidor.mensajes[0]?.crudo).not.toContain("auditoria@ejemplo.test")
  })
})

describe("el envío falla: `fallido`, con motivo y sin la contraseña", () => {
  it("auth rechazada por el servidor → fallido con el motivo del servidor", async () => {
    const servidor = await levantarServidor({ modo: "rechazar_auth" })
    const resultado = await enviarCorreoSMTP(filaBase(servidor.port), mensajeDePrueba, {
      env: { SMTP_PASSWORD: CLAVE_FALSA },
    })

    expect(resultado.estado).toBe("fallido")
    if (resultado.estado !== "fallido") throw new Error("estado inesperado")
    expect(resultado.motivo).toMatch(/falló el envío por SMTP/i)
    expect(resultado.motivo).toMatch(/535/)
    expect(resultado.motivo).toMatch(/autenticación rechazada/i)
    // Un intento fallido NO se confunde con "no configurado".
    expect(estadoRegistroSMTP(resultado)).toBe("fallido")
    expect(motivoSMTP(resultado)).toBe(resultado.motivo)
    // Nada se aceptó: el servidor no registró ningún mensaje.
    expect(servidor.mensajes).toHaveLength(0)
  })

  it("un servidor que repite la contraseña en el rechazo no la filtra al motivo", async () => {
    const servidor = await levantarServidor({
      modo: "rechazar_auth",
      ecoDelSecretoEnElRechazo: true,
    })
    const resultado = await enviarCorreoSMTP(filaBase(servidor.port), mensajeDePrueba, {
      env: { SMTP_PASSWORD: CLAVE_FALSA },
    })

    expect(resultado.estado).toBe("fallido")
    const texto = JSON.stringify(resultado)
    expect(texto).not.toContain(CLAVE_FALSA)
    expect(texto).not.toContain(Buffer.from(CLAVE_FALSA, "utf8").toString("base64"))
    // El motivo conserva el código del servidor, pero redactado.
    if (resultado.estado !== "fallido") throw new Error("estado inesperado")
    expect(resultado.motivo).toMatch(/535/)
    expect(resultado.motivo).toContain("[redactado]")
  })

  it("conexión rechazada → fallido (no `no_configurado`)", async () => {
    const puerto = await puertoLibre()
    const resultado = await enviarCorreoSMTP(filaBase(puerto), mensajeDePrueba, {
      env: { SMTP_PASSWORD: CLAVE_FALSA },
      tiempoLimiteMs: 2000,
    })

    expect(resultado.estado).toBe("fallido")
    if (resultado.estado !== "fallido") throw new Error("estado inesperado")
    expect(resultado.motivo).toMatch(/ECONNREFUSED|conexión/i)
    expect(resultado.motivo).not.toContain(CLAVE_FALSA)
  })

  it("servidor que no saluda → fallido por tiempo de espera", async () => {
    const servidor = await levantarServidor({ modo: "sin_saludo" })
    const resultado = await enviarCorreoSMTP(filaBase(servidor.port), mensajeDePrueba, {
      env: { SMTP_PASSWORD: CLAVE_FALSA },
      tiempoLimiteMs: 300,
    })

    expect(resultado.estado).toBe("fallido")
    if (resultado.estado !== "fallido") throw new Error("estado inesperado")
    expect(resultado.motivo).toMatch(/tiempo de espera/)
    expect(resultado.motivo).not.toContain(CLAVE_FALSA)
    expect(servidor.mensajes).toHaveLength(0)
  })

  it("CF exige TLS y el servidor no ofrece STARTTLS → fallido con el motivo", async () => {
    const servidor = await levantarServidor({ modo: "sin_starttls" })
    const resultado = await enviarCorreoSMTP(
      filaBase(servidor.port, { smtpSecurity: "tls" }),
      mensajeDePrueba,
      { env: { SMTP_PASSWORD: CLAVE_FALSA }, tiempoLimiteMs: 2000 }
    )

    expect(resultado.estado).toBe("fallido")
    if (resultado.estado !== "fallido") throw new Error("estado inesperado")
    expect(resultado.motivo).toMatch(/starttls/i)
    expect(resultado.motivo).not.toContain(CLAVE_FALSA)
  })
})

describe("traducción a la cola de salida", () => {
  it("los tres desenlaces se traducen a estados distintos y honestos", () => {
    expect(estadoRegistroSMTP({ estado: "no_configurado", motivo: "x" })).toBe("pendiente")
    expect(estadoRegistroSMTP({ estado: "enviado", messageId: null })).toBe("enviado")
    expect(estadoRegistroSMTP({ estado: "fallido", motivo: "x" })).toBe("fallido")

    expect(motivoSMTP({ estado: "enviado", messageId: null })).toBe(
      "Aceptado por el servidor SMTP."
    )
    expect(motivoSMTP({ estado: "fallido", motivo: "rebotó" })).toBe("rebotó")
  })
})
