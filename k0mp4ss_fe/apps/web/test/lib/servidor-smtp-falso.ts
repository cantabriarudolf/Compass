/**
 * servidor-smtp-falso.ts — servidor SMTP mínimo EN MEMORIA para los tests del
 * emisor (F4, `lib/smtp.ts`).
 *
 * Habla lo justo del protocolo RFC 5321: saludo 220, EHLO (con mecanismos de
 * AUTH), AUTH PLAIN / AUTH LOGIN, MAIL FROM, RCPT TO, DATA y QUIT. Escucha solo
 * en `127.0.0.1` con puerto efímero y **nunca** abre una conexión externa: las
 * credenciales son las que el propio test decide, no una credencial real.
 *
 * Modos disponibles (lo que el test necesita provocar):
 * - `aceptar`: autentica y acepta el mensaje (250 con `queued as`).
 * - `rechazar_auth`: rechaza las credenciales con 535.
 * - `sin_saludo`: acepta el TCP y no contesta nada (fuerza el timeout).
 * - `sin_starttls`: anuncia EHLO sin STARTTLS (fuerza el fallo de CF `tls`).
 * - `rechazar_mensaje`: autentica y recibe el cuerpo, pero rechaza el mensaje con
 *   554 al cerrar el `.` (fuerza el fallo DESPUÉS de transmitir: el registro
 *   solo puede decir `enviado` si el servidor aceptó el mensaje).
 */
import { createServer, type Server, type Socket } from "node:net"

export type ModoServidorSMTP =
  | "aceptar"
  | "rechazar_auth"
  | "rechazar_mensaje"
  | "sin_saludo"
  | "sin_starttls"

export interface MensajeRecibido {
  from: string
  to: string[]
  crudo: string
}

export interface ServidorSMTPFalso {
  host: string
  port: number
  /** Mensajes aceptados (DATA completado), en orden de llegada. */
  mensajes: MensajeRecibido[]
  /** Órdenes AUTH recibidas con la contraseña ya decodificada. */
  autenticaciones: Array<{ usuario: string; secreto: string }>
  cerrar(): Promise<void>
}

export interface OpcionesServidorSMTPFalso {
  modo?: ModoServidorSMTP
  usuario?: string
  secreto?: string
  /** Mecanismos anunciados en el EHLO. Default: `["PLAIN", "LOGIN"]`. */
  mecanismos?: string[]
  /**
   * Copia la contraseña recibida (decodificada) dentro de la respuesta de
   * rechazo, para probar que el emisor la redacta antes de armar el motivo.
   */
  ecoDelSecretoEnElRechazo?: boolean
}

const CRLF = "\r\n"

function respuestaTexto(codigo: number, texto: string): string {
  return `${codigo} ${texto}${CRLF}`
}

async function iniciar(): Promise<{ server: Server; puerto: number }> {
  const server = createServer()
  const puerto = await new Promise<number>((resolver, rechazar) => {
    server.once("error", rechazar)
    server.listen(0, "127.0.0.1", () => {
      const direccion = server.address()
      if (direccion === null || typeof direccion === "string") {
        rechazar(new Error("el servidor de prueba no obtuvo un puerto TCP"))
        return
      }
      resolver(direccion.port)
    })
  })
  return { server, puerto }
}

export async function iniciarServidorSMTPFalso(
  opciones: OpcionesServidorSMTPFalso = {}
): Promise<ServidorSMTPFalso> {
  const modo = opciones.modo ?? "aceptar"
  const usuarioEsperado = opciones.usuario ?? "emisor@ejemplo.test"
  const secretoEsperado = opciones.secreto ?? ""
  const mecanismos = opciones.mecanismos ?? ["PLAIN", "LOGIN"]
  const mensajes: MensajeRecibido[] = []
  const autenticaciones: Array<{ usuario: string; secreto: string }> = []
  const sockets = new Set<Socket>()

  const { server, puerto } = await iniciar()

  const atender = (socket: Socket): void => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
    socket.on("error", () => sockets.delete(socket))

    if (modo === "sin_saludo") return

    let buffer = ""
    let enDatos = false
    let lineasDatos: string[] = []
    let autenticando: "login_usuario" | "login_secreto" | null = null
    let usuarioLogin = ""
    let ultimoFrom = ""
    let ultimosRcpt: string[] = []

    const escribir = (texto: string): void => {
      if (!socket.destroyed) socket.write(texto)
    }

    const autenticar = (usuario: string, secreto: string): void => {
      autenticaciones.push({ usuario, secreto })
      const valido = usuario === usuarioEsperado && secreto === secretoEsperado
      if (modo !== "rechazar_auth" && valido) {
        escribir(respuestaTexto(235, "2.7.0 Autenticación aceptada"))
        return
      }
      const detalle = opciones.ecoDelSecretoEnElRechazo
        ? ` credencial recibida: ${secreto}`
        : " credenciales inválidas"
      escribir(`535 5.7.8 Autenticación rechazada:${detalle}${CRLF}`)
    }

    const procesar = (linea: string): void => {
      if (enDatos) {
        if (linea === ".") {
          enDatos = false
          if (modo === "rechazar_mensaje") {
            // El servidor leyó el cuerpo y lo rechazó: no entra en `mensajes`.
            lineasDatos = []
            escribir(respuestaTexto(554, "5.6.0 Mensaje rechazado por política"))
            return
          }
          mensajes.push({ from: ultimoFrom, to: [...ultimosRcpt], crudo: lineasDatos.join(CRLF) })
          lineasDatos = []
          escribir(respuestaTexto(250, "2.0.0 Ok: queued as <falso-0001@ejemplo.test>"))
          return
        }
        lineasDatos.push(linea)
        return
      }

      if (autenticando === "login_usuario") {
        usuarioLogin = Buffer.from(linea, "base64").toString("utf8")
        autenticando = "login_secreto"
        escribir(respuestaTexto(334, "UGFzc3dvcmQ6"))
        return
      }
      if (autenticando === "login_secreto") {
        autenticando = null
        autenticar(usuarioLogin, Buffer.from(linea, "base64").toString("utf8"))
        return
      }

      const orden = linea.slice(0, 4).toUpperCase()
      if (orden === "EHLO" || orden === "HELO") {
        escribir(
          [
            `250-falso.smtp.test saluda`,
            ...(modo === "sin_starttls" ? [] : [`250-STARTTLS`]),
            ...(mecanismos.length > 0 ? [`250-AUTH ${mecanismos.join(" ")}`] : []),
            "250 8BITMIME",
          ].join(CRLF) + CRLF
        )
        return
      }
      if (orden === "STAR") {
        escribir(respuestaTexto(454, "4.7.0 TLS no disponible en el falso"))
        return
      }
      if (orden === "AUTH") {
        const [, mecanismo, carga] = linea.split(" ")
        if ((mecanismo ?? "").toUpperCase() === "PLAIN" && carga) {
          const partes = Buffer.from(carga, "base64").toString("utf8").split("\0")
          autenticar(partes[1] ?? "", partes[2] ?? "")
          return
        }
        if ((mecanismo ?? "").toUpperCase() === "LOGIN") {
          autenticando = "login_usuario"
          escribir(respuestaTexto(334, "VXNlcm5hbWU6"))
          return
        }
        escribir(respuestaTexto(504, "5.5.4 Mecanismo no soportado"))
        return
      }
      if (orden === "MAIL") {
        ultimoFrom = linea.slice(linea.indexOf(":") + 1).replace(/[<>]/g, "").trim()
        ultimosRcpt = []
        escribir(respuestaTexto(250, "2.1.0 Ok"))
        return
      }
      if (orden === "RCPT") {
        ultimosRcpt.push(linea.slice(linea.indexOf(":") + 1).replace(/[<>]/g, "").trim())
        escribir(respuestaTexto(250, "2.1.5 Ok"))
        return
      }
      if (orden === "DATA") {
        enDatos = true
        escribir(respuestaTexto(354, "End data with <CR><LF>.<CR><LF>"))
        return
      }
      if (orden === "QUIT") {
        escribir(respuestaTexto(221, "2.0.0 Bye"))
        socket.end()
        return
      }
      escribir(respuestaTexto(500, "5.5.1 Orden no reconocida"))
    }

    socket.on("data", (trozo: Buffer) => {
      buffer += trozo.toString("utf8")
      let corte = buffer.indexOf("\r\n")
      while (corte >= 0) {
        const linea = buffer.slice(0, corte)
        buffer = buffer.slice(corte + 2)
        procesar(linea)
        corte = buffer.indexOf("\r\n")
      }
    })

    escribir(respuestaTexto(220, "falso.smtp.test ESMTP listo"))
  }

  server.on("connection", atender)

  return {
    host: "127.0.0.1",
    port: puerto,
    mensajes,
    autenticaciones,
    cerrar: () =>
      new Promise<void>((resolver) => {
        for (const socket of sockets) socket.destroy()
        server.close(() => resolver())
      }),
  }
}
