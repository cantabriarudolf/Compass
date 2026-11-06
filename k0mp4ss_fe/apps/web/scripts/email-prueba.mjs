#!/usr/bin/env node
/**
 * scripts/email-prueba.mjs — prueba de fuego del emisor SMTP real (F4).
 *
 * Por qué existe: el emisor (`lib/smtp.ts`) está probado contra un servidor de
 * mentira, pero nadie había mandado un correo de verdad por este código. Este
 * script manda UN mensaje con la configuración de una comunidad (CF) tal como la
 * lee la aplicación —`enviarCorreoComunidad`, el mismo camino que usan las rutas—
 * y reporta el desenlace en una sola línea.
 *
 * Qué imprime (y nada más):
 *   OK <destinatario> <id del proveedor>       envío aceptado por el servidor; sale 0
 *   no configurado: <motivo>                   falta config/credencial; sale 3
 *   <categoría>: <detalle redactado>           el envío rebotó; sale 1
 * y los errores de uso (argumentos) por stderr con código 2.
 *
 * Categorías de fallo: `autenticación rechazada`, `no se pudo conectar`,
 * `envío rechazado`.
 *
 * El secreto NUNCA sale: la contraseña vive solo en `process.env.SMTP_PASSWORD`
 * (jamás en la base), y todo texto que este script escribe pasa por `redactar()`,
 * que borra el literal y su base64 —la forma en que viaja en AUTH—. No se imprime
 * la configuración completa de CF ni se escribe nada a un archivo.
 *
 * Reglas de la prueba: UN solo mensaje, sin reintentos ni bucles. Si falta la
 * variable de entorno no se abre ninguna conexión.
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npx vite-node --config vitest.config.ts scripts/email-prueba.mjs --to=destinatario@dominio.cl
 *   node --env-file-if-exists=.env ../../node_modules/.bin/vite-node \
 *     --config vitest.config.ts scripts/email-prueba.mjs --to=destinatario@dominio.cl
 *   ... --to=... --comunidad-id=comunidad-b    otra comunidad (default `comunidad-a`)
 *   ... --help
 *
 * Se corre con `vite-node --config vitest.config.ts` porque importa `lib/smtp.ts`
 * (TypeScript con el alias `@`) y ese config es el que resuelve el alias, igual
 * que `db:punto-cero` y `db:catalogo-nacional`. `--env-file-if-exists=.env` es la
 * receta del repo para que el script vea `DATABASE_URL` y `SMTP_PASSWORD`.
 *
 * Ojo: el emisor agrega los `smtpBcc` de CF como destinatarios del RCPT. En la
 * comunidad demo `smtpBcc` es NULL, así que el único buzón tocado es `--to`.
 */
import { basename } from "node:path"
import { fileURLToPath } from "node:url"
import { prisma } from "../lib/prisma"
import { enviarCorreoComunidad } from "../lib/smtp"

/** Comunidad demo sembrada por `npm run datos:reset`. */
const COMUNIDAD_POR_DEFECTO = "comunidad-a"
const ASUNTO = "Prueba de envío SMTP — Compass"

const AYUDA = `email-prueba — manda UN correo de prueba con el emisor SMTP real (F4)

  npx vite-node --config vitest.config.ts scripts/email-prueba.mjs --to=destinatario@dominio.cl

Flags:
  --to <correo>          destinatario del mensaje de prueba (obligatorio, uno solo)
  --comunidad-id <id>    comunidad cuya configuración global (CF) se usa
                         (default: ${COMUNIDAD_POR_DEFECTO})
  --help, -h             esta ayuda

Salidas:
  OK <destinatario> <id>          el servidor aceptó el mensaje        → código 0
  no configurado: <motivo>        falta CF o SMTP_PASSWORD             → código 3
  <categoría>: <detalle>          el envío rebotó                      → código 1
  categorías: autenticación rechazada | no se pudo conectar | envío rechazado

Variables de entorno (nunca se imprimen):
  SMTP_PASSWORD   contraseña del buzón SMTP; sin ella no se abre conexión
  DATABASE_URL    base desde donde se lee la configuración de la comunidad`

// --- Redacción del secreto ---------------------------------------------------

/**
 * Borra de `texto` el secreto y su base64. Es la última barrera: aunque el
 * motivo venga del transporte, lo que se escribe en pantalla ya no lo contiene.
 */
function redactar(texto) {
  const secreto = process.env.SMTP_PASSWORD ?? ""
  if (secreto.trim() === "") return texto
  const variantes = [secreto, Buffer.from(secreto, "utf8").toString("base64")]
  return variantes.reduce((acc, variante) => acc.split(variante).join("[redactado]"), texto)
}

function informar(texto) {
  process.stdout.write(`${redactar(texto)}\n`)
}

function avisarError(texto) {
  process.stderr.write(`${redactar(texto)}\n`)
}

// --- Argumentos --------------------------------------------------------------

/**
 * Toma los argumentos que van después del nombre del script, de modo que
 * funcione igual bajo `node script.mjs`, `vite-node script.mjs` y con `--`.
 */
function argumentosDelScript(argv) {
  const propio = basename(fileURLToPath(import.meta.url))
  const corte = argv.findIndex((arg) => basename(arg) === propio)
  const resto = corte >= 0 ? argv.slice(corte + 1) : argv.slice(2)
  return resto[0] === "--" ? resto.slice(1) : resto
}

function leerArgs(argv) {
  const opciones = { to: null, comunidadId: COMUNIDAD_POR_DEFECTO, ayuda: false }
  const args = argumentosDelScript(argv)
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === "--help" || arg === "-h") {
      opciones.ayuda = true
    } else if (arg === "--to") {
      opciones.to = args[++i] ?? null
      if (!opciones.to) throw new Error("--to necesita un correo")
    } else if (arg.startsWith("--to=")) {
      opciones.to = arg.slice("--to=".length)
    } else if (arg === "--comunidad-id") {
      opciones.comunidadId = args[++i] ?? null
      if (!opciones.comunidadId) throw new Error("--comunidad-id necesita un id")
    } else if (arg.startsWith("--comunidad-id=")) {
      opciones.comunidadId = arg.slice("--comunidad-id=".length)
    } else {
      throw new Error(`argumento desconocido: ${arg}`)
    }
  }
  return opciones
}

/** Un solo buzón, con forma de correo; nada de listas ni de inyección de headers. */
function correoValido(valor) {
  return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(valor)
}

// --- Desenlace ---------------------------------------------------------------

/** Traduce el motivo del emisor a una de las tres categorías del reporte. */
function categoria(motivo) {
  const texto = motivo.toLowerCase()
  if (/autenticaci|535|534|530|5\.7\.8/.test(texto)) return "autenticación rechazada"
  if (
    /conect|socket|econnrefused|econnreset|enotfound|eai_again|etimedout|tiempo de espera|tls|handshake|starttls|saludo/.test(
      texto
    )
  ) {
    return "no se pudo conectar"
  }
  return "envío rechazado"
}

function cuerpoPrueba(comunidadId) {
  return [
    "Este es un correo de PRUEBA del emisor SMTP de Compass.",
    "",
    `Comunidad: ${comunidadId}`,
    `Fecha: ${new Date().toISOString()}`,
    "",
    "Si lo recibiste, el canal de correo de la plataforma quedó verificado.",
    "No es una notificación real: no requiere ninguna acción.",
  ].join("\n")
}

/**
 * Manda el único mensaje de la corrida y devuelve el código de salida.
 * No hay reintentos: un desenlace, se reporta y se termina.
 */
async function main(argv) {
  let opciones
  try {
    opciones = leerArgs(argv)
  } catch (error) {
    avisarError(`${error.message}`)
    avisarError(AYUDA)
    return 2
  }
  if (opciones.ayuda) {
    informar(AYUDA)
    return 0
  }
  if (!opciones.to) {
    avisarError("falta --to=<correo>: hace falta un destinatario para la prueba")
    avisarError(AYUDA)
    return 2
  }
  if (!correoValido(opciones.to)) {
    avisarError(`--to no es un correo válido (se espera uno solo): ${opciones.to}`)
    return 2
  }

  // Sin credencial no se abre conexión: es una condición de configuración.
  if ((process.env.SMTP_PASSWORD ?? "").trim() === "") {
    informar(
      "no configurado: falta la variable de entorno SMTP_PASSWORD en este proceso " +
        "(correr con --env-file-if-exists=.env). No se abrió ninguna conexión."
    )
    return 3
  }

  const resultado = await enviarCorreoComunidad(opciones.comunidadId, {
    to: opciones.to,
    subject: ASUNTO,
    text: cuerpoPrueba(opciones.comunidadId),
  })

  if (resultado.estado === "enviado") {
    informar(`OK ${opciones.to} ${resultado.messageId ?? "(sin id del servidor)"}`)
    return 0
  }
  if (resultado.estado === "no_configurado") {
    informar(`no configurado: ${resultado.motivo}`)
    return 3
  }
  informar(`${categoria(resultado.motivo)}: ${resultado.motivo}`)
  return 1
}

const codigo = await main(process.argv)
  .catch((error) => {
    avisarError(`falló la prueba de correo: ${error?.message ?? "error inesperado"}`)
    return 1
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {})
  })

process.exitCode = codigo
// Red de seguridad: si un handle de red quedara colgado, el código ya está fijado.
setTimeout(() => process.exit(codigo), 5_000).unref()
