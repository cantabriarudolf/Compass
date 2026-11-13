/**
 * `/api/vigencia-registro/avisos` — el barrido de avisos de S8, por los dos
 * caminos que lo disparan.
 *
 * `POST` es el acto explícito de la administración: la comunidad sale del scope
 * de la sesión y el rol sin `ad` + `editar` recibe 403 (S8). `GET` es la entrada
 * del cron de Vercel (`vercel.json` → `crons`): no hay sesión, así que la
 * autenticación es el secreto compartido del encabezado `Authorization: Bearer
 * <CRON_SECRET>` y el barrido recorre TODAS las comunidades con caso de vigencia.
 *
 * **Las dos rutas corren el MISMO barrido** (`barrerAvisosDeVigencia` de
 * `lib/vigencia-barrido.ts`). Acá no hay una lógica duplicada que pueda
 * desincronizarse: lo único distinto es de dónde sale la comunidad y cómo se
 * autentica al llamador.
 *
 * Decisiones que no se reinterpretan:
 * - **El secreto del cron vive SOLO en `process.env.CRON_SECRET`.** Si falta, el
 *   `GET` responde 500 y NO hace nada: sin secreto no hay forma de distinguir al
 *   cron de un curioso, y responder "autorizado porque no hay secreto" sería una
 *   puerta abierta. Falla cerrada, igual que la clave maestra de secretos.
 * - **Sin el secreto correcto no hay ningún efecto**: 401 antes de leer la base,
 *   de emitir avisos y de auditar. La comparación es en tiempo constante.
 * - **El correo no se finge (S4)**: un aviso sin credencial de la comunidad (o
 *   sin correo de destino) queda escrito en la bandeja y el resumen dice cuántos
 *   quedaron así y por qué. El secreto del SMTP no sale de memoria.
 * - **Idempotencia**: cada aviso se identifica por `(comunidad, unidad, tipo,
 *   destinatario, hito)` en `avisos_vigencia`; el choque contra el índice único
 *   se cuenta como `omitido`, nunca como error, y una segunda corrida del `GET`
 *   con los mismos hechos no escribe nada.
 */
import { timingSafeEqual } from "node:crypto"
import { puede } from "@/lib/authz"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import {
  USUARIO_CRON,
  barrerAvisosDeVigencia,
  comunidadesConCasoDeVigencia,
  type ResumenBarridoComunidad,
} from "@/lib/vigencia-barrido"

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

/**
 * El barrido manual: la comunidad sale del scope del servidor y los hechos de la
 * base. Acepta el `Request` sólo por la firma de route handler, y no lo lee.
 */
export async function POST(_request: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "editar", "ad")) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const resumen = await barrerAvisosDeVigencia({
      comunidadId: scope.comunidadId,
      usuario: scope.usuarioId,
    })
    // Contrato histórico del botón: el correo lo cuenta la bitácora y el cron,
    // no esta respuesta, que el cliente ya consumía con estas dos cifras.
    return Response.json({
      ok: true,
      emitidos: resumen.emitidos,
      omitidos: resumen.omitidos,
    })
  } catch {
    return jsonError(500, "No se pudieron emitir los avisos de vigencia.")
  }
}

/** Una comunidad dentro del resumen del cron: su barrido, o su error. */
interface ResultadoComunidad {
  comunidadId: string
  ok: boolean
  error: string | null
  emitidos: number
  omitidos: number
  enviados: number
  fallidos: number
  sinEmisor: number
  enBandeja: number
  motivos: readonly string[]
}

function resultadoOk(resumen: ResumenBarridoComunidad): ResultadoComunidad {
  return { ...resumen, ok: true, error: null }
}

function resultadoConError(comunidadId: string): ResultadoComunidad {
  return {
    comunidadId,
    ok: false,
    error: "No se pudieron emitir los avisos de vigencia.",
    emitidos: 0,
    omitidos: 0,
    enviados: 0,
    fallidos: 0,
    sinEmisor: 0,
    enBandeja: 0,
    motivos: [],
  }
}

/**
 * El barrido automático (cron de Vercel). Sin sesión: el `comunidadId` sale de la
 * lista de comunidades con caso de vigencia, nunca de la request.
 */
export async function GET(request: Request): Promise<Response> {
  const esperado = process.env[VARIABLE_CRON_SECRET]
  // Fail-closed ANTES de leer el encabezado o la base: sin secreto configurado no
  // existe forma de autorizar a nadie.
  if (esperado === undefined || esperado.trim() === "") {
    return jsonError(
      500,
      "No se puede correr el barrido automático: falta la variable de entorno CRON_SECRET en el servidor."
    )
  }

  const recibido = leerBearer(request.headers.get("authorization"))
  if (recibido === null || !secretoCoincide(recibido, esperado)) {
    return jsonError(
      401,
      "No autorizado: el barrido automático exige el secreto del cron en el encabezado Authorization (Bearer)."
    )
  }

  try {
    const comunidades = await comunidadesConCasoDeVigencia()
    const resultados: ResultadoComunidad[] = []
    for (const comunidadId of comunidades) {
      try {
        resultados.push(
          resultadoOk(
            await barrerAvisosDeVigencia({
              comunidadId,
              usuario: USUARIO_CRON,
            })
          )
        )
      } catch {
        // Una comunidad rota no puede esconder el barrido de las demás: se
        // informa su error en su propia fila y la corrida sigue.
        resultados.push(resultadoConError(comunidadId))
      }
    }

    const sumar = (campo: keyof Omit<ResultadoComunidad, "comunidadId" | "ok" | "error" | "motivos">) =>
      resultados.reduce((total, fila) => total + fila[campo], 0)

    return Response.json({
      ok: true,
      comunidades: resultados,
      totales: {
        comunidades: resultados.length,
        emitidos: sumar("emitidos"),
        omitidos: sumar("omitidos"),
        enviados: sumar("enviados"),
        fallidos: sumar("fallidos"),
        sinEmisor: sumar("sinEmisor"),
        enBandeja: sumar("enBandeja"),
      },
    })
  } catch {
    return jsonError(
      500,
      "No se pudo correr el barrido automático de avisos de vigencia."
    )
  }
}
