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
 *
 * Además: una dirección que NO puede existir (los dominios ficticios de la
 * semilla y los reservados por RFC 2606/RFC 6761) se rechaza como `fallido`
 * ANTES de abrir la conexión, con el motivo que dice por qué y nombra la
 * dirección. Nunca `pendiente` (eso es "sin emisor configurado") y nunca
 * `enviado`. El choque real que lo motivó: un e2e entregó un aviso a
 * `juan.perez@email.com`, que no existe, y el servidor lo aceptó (rebote).
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
/**
 * Buzón que SÍ podría existir. No puede ser `*.test` ni `*.example`: el emisor
 * rechaza esas direcciones a propósito, así que usarlas acá probaría la guardia
 * en vez del envío.
 */
const DESTINATARIO = "residente@residenciallasacacias.cl"

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
      filaBase(servidor.port, { smtpBcc: "auditoria@administracionlasacacias.cl" }),
      mensajeDePrueba,
      { env: { SMTP_PASSWORD: CLAVE_FALSA } }
    )

    expect(resultado.estado).toBe("enviado")
    expect(servidor.mensajes[0]?.to).toEqual([
      DESTINATARIO,
      "auditoria@administracionlasacacias.cl",
    ])
    expect(servidor.mensajes[0]?.crudo).not.toContain("auditoria@administracionlasacacias.cl")
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

describe("direcciones que no pueden existir: se rechazan ANTES de conectar", () => {
  /**
   * El caso del incidente: el e2e entregó un aviso real a `juan.perez@email.com`
   * (semilla) y el servidor lo aceptó, así que iba a rebotar. `email.com` es el
   * dominio ficticio de los datos semilla.
   */
  it("la dirección ficticia de la semilla se rechaza con su motivo y sin abrir conexión", async () => {
    // Puerto cerrado a propósito: si el emisor intentara conectar, el motivo
    // diría ECONNREFUSED. Que diga la razón de la dirección prueba que no hubo
    // intento de conexión.
    const puerto = await puertoLibre()
    const resultado = await enviarCorreoSMTP(
      filaBase(puerto),
      { ...mensajeDePrueba, to: "juan.perez@email.com" },
      { env: { SMTP_PASSWORD: CLAVE_FALSA }, tiempoLimiteMs: 2000 }
    )

    expect(resultado.estado).toBe("fallido")
    if (resultado.estado !== "fallido") throw new Error("estado inesperado")
    expect(resultado.motivo).toMatch(/falló el envío por SMTP/i)
    expect(resultado.motivo).toContain("juan.perez@email.com")
    expect(resultado.motivo).toMatch(/dirección de prueba o inexistente/i)
    expect(resultado.motivo).toMatch(/dominio ficticio de los datos semilla/i)
    expect(resultado.motivo).toContain("email.com")
    expect(resultado.motivo).toMatch(/no se envió nada/i)
    expect(resultado.motivo).not.toMatch(/ECONNREFUSED|conexión rechazada/i)

    // Y el estado persistido dice la verdad: `fallido`, nunca `pendiente`.
    expect(estadoRegistroSMTP(resultado)).toBe("fallido")
    expect(motivoSMTP(resultado)).toBe(resultado.motivo)
  })

  it("una dirección ficticia no queda `pendiente` aunque falte el emisor", async () => {
    // `pendiente` significa "no hay emisor configurado", no "dirección mala":
    // el rechazo no depende de la configuración y no puede confundirse con ella.
    const resultado = await enviarCorreoSMTP(
      null,
      { ...mensajeDePrueba, to: "juan.perez@email.com" },
      { env: {} }
    )

    expect(resultado.estado).toBe("fallido")
    if (resultado.estado !== "fallido") throw new Error("estado inesperado")
    expect(resultado.motivo).toContain("juan.perez@email.com")
    expect(estadoRegistroSMTP(resultado)).toBe("fallido")
  })

  it("con un servidor escuchando, la dirección ficticia no produce ni una conexión", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    const resultado = await enviarCorreoSMTP(
      filaBase(servidor.port),
      { ...mensajeDePrueba, to: "juan.perez@email.com" },
      { env: { SMTP_PASSWORD: CLAVE_FALSA } }
    )

    expect(resultado.estado).toBe("fallido")
    // Ni mensaje, ni autenticación: el servidor no vio nada.
    expect(servidor.mensajes).toHaveLength(0)
    expect(servidor.autenticaciones).toHaveLength(0)
  })

  /**
   * Dominios reservados por RFC 2606 / RFC 6761 (`*.test`, `*.example`,
   * `*.invalid`, `*.localhost` y los literales `example.com|org|net`) más el
   * dominio ficticio de la semilla (`email.com`). Ninguno puede tener un buzón
   * real, así que enviarles es fabricar un rebote.
   */
  it.each([
    ["residente@comunidad.test", "comunidad.test"],
    ["residente@sub.dominio.test", "sub.dominio.test"],
    ["residente@ejemplo.example", "ejemplo.example"],
    ["residente@servidor.invalid", "servidor.invalid"],
    ["residente@intranet.localhost", "intranet.localhost"],
    ["contacto@example.com", "example.com"],
    ["contacto@example.org", "example.org"],
    ["contacto@example.net", "example.net"],
    ["juan.perez@email.com", "email.com"],
  ])("rechaza %s (dominio que no puede existir)", async (direccion) => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    const resultado = await enviarCorreoSMTP(
      filaBase(servidor.port),
      { ...mensajeDePrueba, to: direccion },
      { env: { SMTP_PASSWORD: CLAVE_FALSA } }
    )

    expect(resultado.estado).toBe("fallido")
    if (resultado.estado !== "fallido") throw new Error("estado inesperado")
    expect(resultado.motivo).toContain(direccion)
    expect(resultado.motivo).toMatch(/dirección de prueba o inexistente/i)
    expect(resultado.motivo).toMatch(/no se envió nada/i)
    expect(estadoRegistroSMTP(resultado)).toBe("fallido")
    expect(servidor.mensajes).toHaveLength(0)
    expect(servidor.autenticaciones).toHaveLength(0)
  })

  it.each([
    ["juan.perez", /no tiene @/i],
    ["@email.com", /parte local/i],
    ["juan perez@gmail.com", /espacios en blanco/i],
    ["juan.perez@", /no tiene dominio/i],
  ])("rechaza la dirección malformada %s", async (direccion, razon) => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    const resultado = await enviarCorreoSMTP(
      filaBase(servidor.port),
      { ...mensajeDePrueba, to: direccion },
      { env: { SMTP_PASSWORD: CLAVE_FALSA } }
    )

    expect(resultado.estado).toBe("fallido")
    if (resultado.estado !== "fallido") throw new Error("estado inesperado")
    expect(resultado.motivo).toMatch(/no es una dirección de correo válida/i)
    expect(resultado.motivo).toMatch(razon)
    expect(resultado.motivo).toMatch(/no se envió nada/i)
    expect(estadoRegistroSMTP(resultado)).toBe("fallido")
    expect(servidor.mensajes).toHaveLength(0)
    expect(servidor.autenticaciones).toHaveLength(0)
  })

  /**
   * Decisión: un BCC a un buzón inexistente rebota igual que el destinatario,
   * así que se rechaza el envío COMPLETO (no se manda copia a nadie) y el
   * motivo nombra la dirección culpable. Descartar sólo esa copia dejaría el
   * error escondido en CF y seguiría fabricando rebotes.
   */
  it("un BCC de CF que no puede existir rechaza el envío entero y nombra esa dirección", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    const resultado = await enviarCorreoSMTP(
      filaBase(servidor.port, { smtpBcc: "auditoria@email.com" }),
      mensajeDePrueba,
      { env: { SMTP_PASSWORD: CLAVE_FALSA } }
    )

    expect(resultado.estado).toBe("fallido")
    if (resultado.estado !== "fallido") throw new Error("estado inesperado")
    expect(resultado.motivo).toContain("auditoria@email.com")
    expect(resultado.motivo).toMatch(/BCC/i)
    expect(resultado.motivo).toMatch(/no se envió nada/i)
    expect(estadoRegistroSMTP(resultado)).toBe("fallido")
    // Envío entero rechazado: el destinatario válido tampoco recibe nada.
    expect(servidor.mensajes).toHaveLength(0)
    expect(servidor.autenticaciones).toHaveLength(0)
  })

  /**
   * Misma decisión para el Reply-To (`smtpRecepcion` de CF): apunta a un buzón
   * que no existe, así que la respuesta del residente rebotaría. Se rechaza el
   * envío entero y el motivo nombra el campo de CF que hay que corregir.
   */
  it("un Reply-To de CF que no puede existir rechaza el envío y nombra la dirección", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    const resultado = await enviarCorreoSMTP(
      filaBase(servidor.port, { smtpRecepcion: "recepcion@comunidad.test" }),
      mensajeDePrueba,
      { env: { SMTP_PASSWORD: CLAVE_FALSA } }
    )

    expect(resultado.estado).toBe("fallido")
    if (resultado.estado !== "fallido") throw new Error("estado inesperado")
    expect(resultado.motivo).toContain("recepcion@comunidad.test")
    expect(resultado.motivo).toMatch(/Reply-To/i)
    expect(estadoRegistroSMTP(resultado)).toBe("fallido")
    expect(servidor.mensajes).toHaveLength(0)
    expect(servidor.autenticaciones).toHaveLength(0)
  })

  /**
   * El borde del guardia: un dominio real que sólo EMPIEZA con "test" no es un
   * dominio de prueba. La semilla usa `arrendatario@test.cl`, que sí existe como
   * dominio de internet, así que no se puede rechazar por prefijo.
   */
  it("un dominio real que empieza con test (test.cl) sí se envía", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    const resultado = await enviarCorreoSMTP(
      filaBase(servidor.port),
      { ...mensajeDePrueba, to: "arrendatario@test.cl" },
      { env: { SMTP_PASSWORD: CLAVE_FALSA } }
    )

    expect(resultado.estado).toBe("enviado")
    expect(servidor.mensajes[0]?.to).toEqual(["arrendatario@test.cl"])
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

// ── Adjuntos (F29 · T2): multipart/mixed sin cambiar el mensaje de texto ────
//
// El papel firmado del convenio de pago viaja ADJUNTO al correo (S2). La regla
// dura del cambio: SIN adjuntos el mensaje emitido queda BYTE A BYTE idéntico
// a lo que este módulo siempre envió (el camino de texto lo usa todo el correo
// del sistema); CON adjuntos el mensaje es multipart/mixed con el texto como
// primera parte y el archivo en base64.
const PDF_DE_PRUEBA = Buffer.from(
  ["%PDF-1.4", "% convenio firmado de prueba", "%%EOF", ""].join("\n"),
  "latin1"
)

function base64Trozado(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString("base64")
  return (base64.match(/.{1,76}/g) ?? []).join("\r\n")
}

/** El boundary que declara la cabecera superior del mensaje multipart. */
function boundaryDe(crudo: string): string {
  const encontrado = /Content-Type: multipart\/mixed; boundary="([^"]+)"/.exec(crudo)
  if (!encontrado) throw new Error("el mensaje no declara multipart/mixed")
  return encontrado[1]!
}

describe("adjuntos: multipart/mixed sin cambiar el mensaje de texto", () => {
  it("PIN · sin adjuntos el mensaje emitido es byte a byte el de siempre (text/plain)", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    const resultado = await enviarCorreoSMTP(filaBase(servidor.port), mensajeDePrueba, {
      env: { SMTP_PASSWORD: CLAVE_FALSA },
    })

    expect(resultado.estado).toBe("enviado")
    expect(servidor.mensajes).toHaveLength(1)
    const crudo = servidor.mensajes[0]!.crudo

    // La fecha y el Message-ID son dinámicos por diseño (reloj y uuid): se
    // extraen para fijar su FORMATO, y todo lo demás se compara EXACTO.
    const fecha = /\r\nDate: ([^\r]+)\r\n/.exec(`\r\n${crudo}`)?.[1]
    const messageId = /\r\nMessage-ID: ([^\r]+)\r\n/.exec(`\r\n${crudo}`)?.[1]
    expect(fecha).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} .+GMT$/)
    expect(messageId).toMatch(/^<[^>\s]+@ejemplo\.test>$/)

    // El mensaje completo, byte a byte (cabeceras en ORDEN, cuerpo y separadores).
    expect(crudo).toBe(
      [
        "From: Comunidad de prueba <no-responder@ejemplo.test>",
        `To: <${DESTINATARIO}>`,
        "Subject: Recordatorio de deuda vencida (Torre A 101)",
        `Date: ${fecha}`,
        `Message-ID: ${messageId}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        "Su unidad registra $120.000 en 1 cobro(s) vencido(s).",
      ].join("\r\n")
    )

    // Y nada del mundo multipart se cuela en el camino de texto.
    expect(crudo).not.toContain("multipart")
    expect(crudo).not.toContain("boundary")
    expect(crudo).not.toContain("Content-Disposition")
  })

  it("con adjunto el mensaje es multipart/mixed: texto como primera parte y el PDF en base64", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    const resultado = await enviarCorreoSMTP(
      filaBase(servidor.port),
      {
        ...mensajeDePrueba,
        adjuntos: [
          {
            nombre: "convenio-firmado-101.pdf",
            bytes: PDF_DE_PRUEBA,
            tipoMime: "application/pdf",
          },
        ],
      },
      { env: { SMTP_PASSWORD: CLAVE_FALSA } }
    )

    expect(resultado.estado).toBe("enviado")
    expect(servidor.mensajes).toHaveLength(1)
    const crudo = servidor.mensajes[0]!.crudo

    // Cabecera superior multipart con su boundary único.
    expect(crudo).toMatch(/^Content-Type: multipart\/mixed; boundary="[^"]+"/m)
    const boundary = boundaryDe(crudo)

    // Primera parte: el texto de siempre, como antes.
    expect(crudo).toContain(
      [
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        "Su unidad registra $120.000 en 1 cobro(s) vencido(s).",
      ].join("\r\n")
    )

    // Segunda parte: el adjunto con su MIME, su base64 (RFC 2045: ≤76 columnas)
    // y su disposición de adjunto con el nombre.
    expect(crudo).toContain(
      [
        `--${boundary}`,
        "Content-Type: application/pdf",
        "Content-Transfer-Encoding: base64",
        'Content-Disposition: attachment; filename="convenio-firmado-101.pdf"',
        "",
        base64Trozado(PDF_DE_PRUEBA),
      ].join("\r\n")
    )

    // El cierre cierra el multipart.
    expect(crudo).toContain(`\r\n--${boundary}--`)

    // El sobre SMTP no cambia: mismo destinatario, el adjunto no toca RCPT.
    expect(servidor.mensajes[0]!.to).toEqual([DESTINATARIO])
  })

  it("el base64 del adjunto viaja en líneas de a lo más 76 columnas (RFC 2045)", async () => {
    // Un PDF más largo que una línea de 76: la envoltura se mira de verdad.
    const pdf = Buffer.concat([PDF_DE_PRUEBA, Buffer.alloc(300, 0x41)])
    const servidor = await levantarServidor({ modo: "aceptar" })
    await enviarCorreoSMTP(
      filaBase(servidor.port),
      {
        ...mensajeDePrueba,
        adjuntos: [{ nombre: "largo.pdf", bytes: pdf, tipoMime: "application/pdf" }],
      },
      { env: { SMTP_PASSWORD: CLAVE_FALSA } }
    )

    const crudo = servidor.mensajes[0]!.crudo
    const trozado = base64Trozado(pdf)
    expect(crudo).toContain(trozado)
    // El tope del RFC 2045 es para las líneas CODIFICADAS en base64 (las
    // cabeceras del mensaje se rigen por el 998 de RFC 5322): la sección del
    // adjunto no tiene ni una línea sobre 76 columnas.
    const indice = crudo.lastIndexOf("Content-Transfer-Encoding: base64")
    expect(indice).toBeGreaterThan(0)
    const bloque = crudo.slice(indice).split("\r\n\r\n")[1] ?? ""
    const lineasBase64 = bloque.split("\r\n--")[0] ?? ""
    expect(lineasBase64.length).toBeGreaterThan(0)
    for (const linea of lineasBase64.split("\r\n")) {
      expect(linea.length).toBeLessThanOrEqual(76)
    }
  })

  it("un nombre de adjunto hostil no inyecta cabeceras: se sanea antes de la cabecera", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    await enviarCorreoSMTP(
      filaBase(servidor.port),
      {
        ...mensajeDePrueba,
        adjuntos: [
          {
            // Comillas y CRLF: tal cual inyectarían una cabecera X-Inject falsa.
            nombre: 'papel".pdf\r\nX-Inject: cabecera-inyectada',
            bytes: PDF_DE_PRUEBA,
            tipoMime: "application/pdf",
          },
        ],
      },
      { env: { SMTP_PASSWORD: CLAVE_FALSA } }
    )

    const crudo = servidor.mensajes[0]!.crudo
    // La cabecera inyectada NO existe: sin CRLF, el nombre es un solo parámetro.
    expect(crudo).not.toMatch(/\r\nX-Inject:/)
    // El nombre saneado conserva lo imprimible y viaja citado en UNA línea
    // (la disposición completa cierra su cita sin nada detrás en esa línea).
    expect(crudo).toContain(
      'Content-Disposition: attachment; filename="papel.pdfX-Inject: cabecera-inyectada"\r\n'
    )
  })

  it("dos mensajes con adjunto usan boundaries distintos", async () => {
    const servidor = await levantarServidor({ modo: "aceptar" })
    const adjunto = { nombre: "papel.pdf", bytes: PDF_DE_PRUEBA, tipoMime: "application/pdf" }
    await enviarCorreoSMTP(filaBase(servidor.port), { ...mensajeDePrueba, adjuntos: [adjunto] }, {
      env: { SMTP_PASSWORD: CLAVE_FALSA },
    })
    await enviarCorreoSMTP(filaBase(servidor.port), { ...mensajeDePrueba, adjuntos: [adjunto] }, {
      env: { SMTP_PASSWORD: CLAVE_FALSA },
    })

    expect(servidor.mensajes).toHaveLength(2)
    const primero = boundaryDe(servidor.mensajes[0]!.crudo)
    const segundo = boundaryDe(servidor.mensajes[1]!.crudo)
    expect(primero).not.toBe(segundo)
  })
})
