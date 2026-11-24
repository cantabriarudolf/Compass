/**
 * /api/co/cola — la cola de salida del correo de las difusiones masivas de CO
 * (S2/S3/S4/S5/S6).
 *
 * `GET`  tiene DOS entradas, y el encabezado `Authorization` es el que decide
 *        cuál:
 *        - **con `Authorization` (el cron de Vercel, `vercel.json` → `crons`)**:
 *          no hay sesión, así que el llamador se autentica con el secreto
 *          compartido `CRON_SECRET` (`Bearer`) y la ruta DRENA un lote acotado de
 *          cada comunidad con trabajo pendiente (S3). Sin el secreto correcto —o
 *          sin la variable configurada en el servidor— responde 401 antes de leer
 *          la base: no hay forma de distinguir al cron de un curioso, y responder
 *          «autorizado porque no hay secreto» sería una puerta abierta.
 *        - **sin encabezado (la consola, con sesión)**: la métrica honesta de la
 *          cola —**enviados, fallidos y pendientes** con el motivo del último
 *          error— y NO drena nada. No hay tasa de apertura ni «entregados»: SMTP
 *          no informa aperturas y esa palabra es del visor (S4/S5).
 *
 * `POST` drena UN lote acotado y responde cuántas tomó, cuántas envió, cuántas
 *        fallaron y cuántas quedan. Es el acto explícito de la administración
 *        (S6): nada se envía por un `setInterval` ni por un efecto de
 *        importación. Sigue funcionando igual que antes del cron.
 *
 * Autorización del camino con sesión: es la misma operación administrativa que el
 * envío masivo. La compuerta es `co:difusiones` con `crear` —la clave granular
 * que ya usa `GET /api/co/alcance-masivo`, que existe para el mismo acto—, y
 * `ver` para la métrica. La raíz desnuda `co` no se usa en un endpoint nuevo
 * (candado R1: la MATRIZ ya declara hermanos granulares y el fallback de prefijo
 * se los heredaría a todo rol con `co`).
 *
 * El scope de comunidad sale de la sesión (`withComunidadScope`). Un `envioId`
 * de otra comunidad no es un dato ajeno que se ignora: es un envío que no existe
 * (404), y su cola no se toca. En el camino del cron la comunidad sale de la
 * cola misma (`comunidadesConColaSalidaCO`), nunca de la request.
 */
import { timingSafeEqual } from "node:crypto"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import {
  comunidadesConColaSalidaCO,
  drenarColaSalidaCO,
  resumenColaSalidaCO,
} from "@/lib/co-cola"
import { registrarDenegacionCo } from "../_lib/denegacion"

/** Variable de entorno del secreto compartido con el cron. Nunca en la base. */
const VARIABLE_CRON_SECRET = "CRON_SECRET"

/** El secreto del encabezado, o `null` si el esquema no es `Bearer` o viene vacío. */
function leerBearer(encabezado: string | null): string | null {
  if (encabezado === null) return null
  const partes = encabezado.trim().split(/\s+/)
  const esquema = partes[0] ?? ""
  if (esquema.toLowerCase() !== "bearer") return null
  const valor = partes.slice(1).join(" ")
  return valor === "" ? null : valor
}

/** Comparación en tiempo constante: el largo distinto se rechaza antes. */
function secretoCoincide(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido, "utf8")
  const b = Buffer.from(esperado, "utf8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Una comunidad dentro del drenaje del cron: su lote, o su error. */
interface ResultadoComunidadCron {
  comunidadId: string
  ok: boolean
  error: string | null
  tomadas: number
  enviadas: number
  fallidas: number
  pendientes: number
  ultimoError: string | null
}

/**
 * El drenaje del cron: un lote acotado por comunidad con trabajo pendiente.
 *
 * La comunidad NO sale de la request (el cron no tiene sesión): sale de la cola,
 * igual que el barrido de vigencia saca sus comunidades de los hechos. Una
 * comunidad rota no puede esconder el drenaje de las demás — se informa su error
 * en su propia fila y la corrida sigue. El lote por comunidad es el de omisión de
 * `lib/co-cola.ts`: una invocación nunca drena «todo».
 */
async function drenarDesdeElCron(autorizacion: string): Promise<Response> {
  const esperado = process.env[VARIABLE_CRON_SECRET]
  // Falla cerrada. S3 fija el 401 (no el 500 del barrido de vigencia): sin la
  // variable configurada el llamador no está autorizado, y la ruta no drena.
  if (esperado === undefined || esperado.trim() === "") {
    return jsonError(
      401,
      "No autorizado: falta la variable de entorno CRON_SECRET en el servidor, así que la cola de salida de CO no se drena."
    )
  }

  const recibido = leerBearer(autorizacion)
  if (recibido === null || !secretoCoincide(recibido, esperado)) {
    return jsonError(
      401,
      "No autorizado: la cola de salida de CO exige el secreto del cron en el encabezado Authorization (Bearer)."
    )
  }

  try {
    const comunidades = await comunidadesConColaSalidaCO()
    const resultados: ResultadoComunidadCron[] = []
    for (const comunidadId of comunidades) {
      try {
        const lote = await drenarColaSalidaCO({ comunidadId })
        resultados.push({
          comunidadId,
          ok: true,
          error: null,
          tomadas: lote.tomadas,
          enviadas: lote.enviadas,
          fallidas: lote.fallidas,
          pendientes: lote.pendientes,
          ultimoError: lote.ultimoError,
        })
      } catch (e) {
        logger.error({ err: e, comunidadId }, "[api/co/cola] error al drenar en el cron")
        resultados.push({
          comunidadId,
          ok: false,
          error: "No se pudo drenar la cola de salida de esta comunidad.",
          tomadas: 0,
          enviadas: 0,
          fallidas: 0,
          pendientes: 0,
          ultimoError: null,
        })
      }
    }

    const sumar = (campo: "tomadas" | "enviadas" | "fallidas" | "pendientes") =>
      resultados.reduce((total, fila) => total + fila[campo], 0)

    return Response.json({
      ok: true,
      comunidades: resultados,
      totales: {
        comunidades: resultados.length,
        tomadas: sumar("tomadas"),
        enviadas: sumar("enviadas"),
        fallidas: sumar("fallidas"),
        pendientes: sumar("pendientes"),
      },
    })
  } catch (e) {
    logger.error({ err: e }, "[api/co/cola] error en el drenaje del cron")
    return jsonError(500, "No se pudo drenar la cola de salida de CO.")
  }
}

/** El envío existe y es de la comunidad de la sesión. */
async function esEnvioDeLaComunidad(envioId: string, comunidadId: string): Promise<boolean> {
  const fila = await prisma.envioCO.findUnique({
    where: { id: envioId },
    select: { comunidadId: true },
  })
  return fila !== null && fila.comunidadId === comunidadId
}

export async function GET(req: Request): Promise<Response> {
  // El encabezado `Authorization` elige el camino: con él la petición se declara
  // del cron y se autentica con el secreto compartido (una sesión válida no la
  // rescata si el secreto no coincide); sin él sigue siendo la métrica de la
  // sesión, igual que antes. Un `GET` del cron con `envioId` no existe: el cron
  // recorre comunidades, no un envío.
  const autorizacion = req.headers.get("authorization")
  if (autorizacion !== null) return drenarDesdeElCron(autorizacion)

  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", "co:difusiones")) {
    registrarDenegacionCo(scope, "co:difusiones", "ver")
    return jsonError(403, "Permiso denegado.")
  }

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }
  const envioId = url.searchParams.get("envioId")?.trim() || undefined

  try {
    // Un envío de otra comunidad responde 404 antes de contar nada.
    if (envioId !== undefined && !(await esEnvioDeLaComunidad(envioId, scope.comunidadId))) {
      return jsonError(404, "Registro no encontrado.")
    }
    return Response.json(
      await resumenColaSalidaCO({ comunidadId: scope.comunidadId, envioId })
    )
  } catch (e) {
    logger.error({ err: e }, "[api/co/cola] error en GET")
    return jsonError(500, "Error interno del servidor.")
  }
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "crear", "co:difusiones")) {
    registrarDenegacionCo(scope, "co:difusiones", "crear")
    return jsonError(403, "Permiso denegado.")
  }

  // El cuerpo es opcional (`{}` drena el lote de omisión); lo que llegue tiene
  // que ser un objeto JSON. `limite` se acota en `lib/co-cola.ts`.
  const crudo: unknown = await req.json().catch(() => ({}))
  if (crudo === null || typeof crudo !== "object" || Array.isArray(crudo)) {
    return jsonError(400, "Cuerpo JSON inválido.")
  }
  const cuerpo = crudo as Record<string, unknown>
  const envioIdCrudo = cuerpo.envioId
  if (
    envioIdCrudo !== undefined &&
    (typeof envioIdCrudo !== "string" || envioIdCrudo.trim() === "")
  ) {
    return jsonError(400, "El identificador del envío es inválido.")
  }
  const envioId = typeof envioIdCrudo === "string" ? envioIdCrudo.trim() : undefined

  try {
    if (envioId !== undefined && !(await esEnvioDeLaComunidad(envioId, scope.comunidadId))) {
      return jsonError(404, "Registro no encontrado.")
    }
    return Response.json(
      await drenarColaSalidaCO({
        comunidadId: scope.comunidadId,
        envioId,
        limite: cuerpo.limite,
      })
    )
  } catch (e) {
    logger.error({ err: e }, "[api/co/cola] error en POST")
    return jsonError(500, "Error interno del servidor.")
  }
}
