/**
 * POST /api/acuerdos/[id]/voto — emisión de UN voto inmutable (U3).
 *
 * El votante NUNCA viene en el cuerpo: se deriva de la sesión (Usuario.personaId
 * y los vínculos en la base), igual que el `comunidadId`. El cuerpo solo trae
 * `decision`.
 *
 * - `cuerpo = comite`: exige ser MIEMBRO VIGENTE de la directiva (la única
 *   fuente de verdad es `lib/api/gd-guard.ts`). Pesa 1: un voto por miembro
 *   (Ley 21.442 art. 17). `unidadId` queda null: el voto es de la persona.
 * - `cuerpo = asamblea`: exige un vínculo VIGENTE de propietario en alguna
 *   unidad de la comunidad (`fechaFin` null). El peso es el PRORRATEO de la
 *   unidad: los votos se ponderan por derechos, nunca uno por persona (art. 15).
 *   Si la persona tiene VARIAS unidades, el peso es la SUMA de sus prorrateos y
 *   `unidadId` queda null, porque ninguna unidad sola representa ese voto (misma
 *   decisión documentada en el modelo `VotoAcuerdo`).
 *
 * Reglas de la evidencia:
 * - Un voto no se repite (@@unique acuerdoId+personaId, 409) y la unidad no se
 *   cuenta dos veces: si el prorrateo de una unidad ya está emitido en este
 *   acuerdo, otro copropietario de la MISMA unidad recibe 409. La garantía es de
 *   la BASE, no del chequeo: el índice único `(acuerdoId, claveUnidad)` —la
 *   columna `claveUnidad`, que es null cuando el voto no está atado a una unidad—
 *   impide el doble peso aunque dos emisiones simultáneas pasen el chequeo.
 *   Los dos P2002 se traducen a 409 con su mensaje: nunca a un 500.
 * - Un acuerdo que ya no está `abierto` no admite votos (409).
 * - **No existe ruta de actualización ni de borrado de un voto**: es evidencia
 *   de lo que cada persona decidió. Corregir un voto es un acto nuevo, no una
 *   edición (esa pieza no está en esta unidad de trabajo).
 *
 * Voto, auditoría y resultado se escriben en LA MISMA transacción: el acuerdo
 * nunca queda resuelto sin el voto que lo resolvió, ni al revés.
 */
import { VotoAcuerdoSchema } from "@/lib/schemas"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import {
  esMiembroVigente,
  idsDirectivaVigenteDb,
  periodoVigenteDb,
  type FichaGobernanzaMin,
} from "@/lib/api/gd-guard"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import {
  resultadoDelAcuerdo,
  type ResultadoDelAcuerdo,
} from "@/lib/acuerdos"

type Ctx = { params: Promise<{ id: string }> }

/** Rol de vínculo que emite el voto ponderado de la unidad en la asamblea. */
const ROL_PROPIETARIO = "propietario"

/** Nombre legible de cada decisión para la bitácora. */
const NOMBRE_DECISION: Record<string, string> = {
  a_favor: "a favor",
  en_contra: "en contra",
  abstencion: "abstención",
}

/** Desenlace de la transacción, resuelto dentro y traducido a HTTP después. */
type Desenlace =
  | { ok: true; computo: ResultadoDelAcuerdo }
  | { ok: false; status: 404 | 409; error: string }

/** ¿El error es un P2002 (violación de índice único)? */
function esVotoDuplicado(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  )
}

/**
 * Nombre del índice único que rechazó la escritura, leído del `meta.target` del
 * P2002 (Prisma lo entrega como lista de campos o como nombre del índice).
 */
function indiceUnicoViolado(e: unknown): string {
  if (typeof e !== "object" || e === null) return ""
  const meta = (e as { meta?: { target?: unknown } }).meta
  const target = meta?.target
  if (Array.isArray(target)) return target.join(",")
  return typeof target === "string" ? target : ""
}

/** Peso con hasta 4 decimales, para el texto de la bitácora. */
function pesoLegible(peso: number): string {
  return String(Number(peso.toFixed(4))).replace(".", ",")
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  const { id } = await ctx.params

  const cuerpo: unknown = await request.json().catch(() => null)
  if (cuerpo === null) return jsonError(400, "Cuerpo JSON inválido.")
  const parseado = VotoAcuerdoSchema.safeParse(cuerpo)
  if (!parseado.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parseado.error.flatten(),
    })
  }
  const decision = parseado.data.decision

  const acuerdo = await prisma.acuerdo.findFirst({
    where: { id, comunidadId: scope.comunidadId },
    select: {
      id: true,
      cuerpo: true,
      quorumRequerido: true,
      folio: true,
      estado: true,
    },
  })
  // 404 sin filtrar existencia: un acuerdo de otra comunidad no se ve.
  if (!acuerdo) return jsonError(404, "Acuerdo no encontrado.")
  if (acuerdo.cuerpo !== "comite" && acuerdo.cuerpo !== "asamblea") {
    logger.error(
      { acuerdoId: acuerdo.id, cuerpo: acuerdo.cuerpo },
      "[api/acuerdos/voto] cuerpo desconocido en la fila del acuerdo"
    )
    return jsonError(500, "El acuerdo tiene un cuerpo desconocido.")
  }

  // --- Quién vota y con qué peso: SIEMPRE desde la sesión y la base ----------
  const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
  if (!personaId) {
    return jsonError(
      403,
      "Tu usuario no tiene ficha en el Maestro de Personas: no puede emitir votos."
    )
  }
  const identidad = await prisma.persona.findFirst({
    where: { id: personaId, comunidadId: scope.comunidadId },
    select: {
      id: true,
      nombreCompleto: true,
      estadoCuenta: true,
      datosGobernanza: true,
    },
  })
  if (!identidad) {
    return jsonError(
      403,
      "Tu ficha no pertenece al Maestro de Personas de esta comunidad."
    )
  }

  let peso: number
  let unidadId: string | null = null
  // Unidades cuyo prorrateo aporta este voto (para no contarlas dos veces).
  let unidadesDelVoto: string[] = []
  let derechosTotales: number

  if (acuerdo.cuerpo === "comite") {
    const vigente = await periodoVigenteDb(scope.comunidadId)
    // SAFETY: ficha Json validada por ExtensionGobernanzaSchema al escribir; acá solo se lee periodoId/fechaTermino.
    const ficha =
      (identidad.datosGobernanza as unknown as FichaGobernanzaMin | null) ??
      null
    if (
      !esMiembroVigente(
        { estadoCuenta: identidad.estadoCuenta, datosGobernanza: ficha },
        vigente?.id
      )
    ) {
      return jsonError(
        403,
        "Solo los miembros vigentes del comité pueden votar este acuerdo."
      )
    }
    peso = 1
    // El padrón del comité son sus miembros vigentes: un voto por miembro.
    derechosTotales = (
      await idsDirectivaVigenteDb(scope.comunidadId, vigente?.id)
    ).length
  } else {
    const vinculos = await prisma.vinculoUnidad.findMany({
      where: {
        comunidadId: scope.comunidadId,
        personaId,
        rol: ROL_PROPIETARIO,
        fechaFin: null,
      },
      select: { unidadId: true },
    })
    const idsUnidades = [...new Set(vinculos.map((v) => v.unidadId))]
    const unidades =
      idsUnidades.length === 0
        ? []
        : await prisma.unidad.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: idsUnidades } },
            select: { id: true, prorrateo: true },
          })
    if (unidades.length === 0) {
      return jsonError(
        403,
        "Solo los propietarios con vínculo vigente en una unidad de la comunidad pueden votar en la asamblea."
      )
    }
    peso = unidades.reduce((suma, unidad) => suma + unidad.prorrateo, 0)
    // Varias unidades: el voto pesa la suma y ninguna unidad lo representa.
    unidadId = unidades.length === 1 ? unidades[0]!.id : null
    unidadesDelVoto = unidades.map((unidad) => unidad.id)
    // El padrón de la asamblea son los derechos de TODA la comunidad.
    const derechos = await prisma.unidad.aggregate({
      where: { comunidadId: scope.comunidadId },
      _sum: { prorrateo: true },
    })
    derechosTotales = derechos._sum.prorrateo ?? 0
  }

  const ahora = new Date()
  const cuerpoDelAcuerdo = acuerdo.cuerpo

  try {
    const desenlace = await prisma.$transaction(
      async (tx): Promise<Desenlace> => {
        // Relectura dentro de la transacción: el estado puede haber cambiado
        // entre la lectura de arriba y este punto.
        const vigente = await tx.acuerdo.findFirst({
          where: { id, comunidadId: scope.comunidadId },
          select: { estado: true, quorumRequerido: true },
        })
        if (!vigente) {
          return { ok: false, status: 404, error: "Acuerdo no encontrado." }
        }
        if (vigente.estado !== "abierto") {
          return {
            ok: false,
            status: 409,
            error:
              "El acuerdo ya fue resuelto: no admite más votos (el resultado es evidencia de lo votado).",
          }
        }

        const previo = await tx.votoAcuerdo.findUnique({
          where: { acuerdoId_personaId: { acuerdoId: id, personaId } },
          select: { id: true },
        })
        if (previo) {
          return {
            ok: false,
            status: 409,
            error:
              "Ya registraste tu voto en este acuerdo: un voto no se repite ni se edita.",
          }
        }

        // El prorrateo de una unidad se cuenta UNA vez: si otro copropietario de
        // la misma unidad ya votó, este voto duplicaría sus derechos. (Un voto
        // con varias unidades guarda `unidadId` null y no se puede cruzar así;
        // esa limitación está documentada en el modelo.)
        if (unidadesDelVoto.length > 0) {
          const unidadYaVotada = await tx.votoAcuerdo.findFirst({
            where: { acuerdoId: id, unidadId: { in: unidadesDelVoto } },
            select: { unidadId: true },
          })
          if (unidadYaVotada) {
            return {
              ok: false,
              status: 409,
              error:
                "La unidad ya emitió su voto en este acuerdo: el prorrateo no se cuenta dos veces.",
            }
          }
        }

        await tx.votoAcuerdo.create({
          data: {
            id: generarId("voto"),
            comunidadId: scope.comunidadId,
            acuerdoId: id,
            personaId,
            unidadId,
            // La unidad viaja también acá para que el índice único
            // `(acuerdoId, claveUnidad)` la cuente UNA vez: es la garantía de la
            // base, no el chequeo de arriba (que se puede cruzar en una carrera).
            claveUnidad: unidadId,
            decision,
            peso,
            registradoPor: scope.usuarioId,
            fecha: ahora,
          },
        })

        await registrarEventoAuditoria(
          {
            id: generarId("ev"),
            comunidadId: scope.comunidadId,
            timestamp: ahora.toISOString(),
            usuario: scope.usuarioId,
            categoria: "AD",
            tipoAccion: "AD_ACUERDO_VOTO",
            referenciaId: id,
            descripcion: `Voto «${NOMBRE_DECISION[decision] ?? decision}» registrado en el acuerdo ${acuerdo.folio} por ${identidad.nombreCompleto} (peso ${pesoLegible(peso)}).`,
          },
          tx
        )

        // El resultado se DERIVA de los votos: nunca se guarda un total aparte.
        const votos = await tx.votoAcuerdo.findMany({
          where: { acuerdoId: id },
          select: { decision: true, peso: true },
        })
        const computo = resultadoDelAcuerdo({
          cuerpo: cuerpoDelAcuerdo,
          quorumRequerido: vigente.quorumRequerido,
          votos,
          derechosTotales,
        })

        if (computo.resultado !== "pendiente") {
          // Toma condicional: si otra resolución ganó la carrera, no se reescribe.
          await tx.acuerdo.updateMany({
            where: { id, comunidadId: scope.comunidadId, estado: "abierto" },
            data: { estado: computo.resultado, resueltoEn: ahora },
          })
        }

        return { ok: true, computo }
      }
    )

    if (!desenlace.ok) {
      return jsonError(desenlace.status, desenlace.error)
    }
    return Response.json({ ok: true, resultado: desenlace.computo })
  } catch (e) {
    // P2002 = carrera contra un índice único: dos emisiones simultáneas. Cuál de
    // los dos chocó lo dice la base en el `target` del error, y el desenlace es
    // 409 en los dos casos, nunca 500:
    //   · `(acuerdoId, claveUnidad)`: otro copropietario de la MISMA unidad ganó la
    //     carrera, así que el prorrateo de la unidad ya está emitido.
    //   · `(acuerdoId, personaId)`: la misma persona emitió dos veces.
    if (esVotoDuplicado(e)) {
      if (indiceUnicoViolado(e).includes("claveUnidad")) {
        return jsonError(
          409,
          "La unidad ya emitió su voto en este acuerdo: el prorrateo no se cuenta dos veces."
        )
      }
      return jsonError(
        409,
        "Ya registraste tu voto en este acuerdo: un voto no se repite ni se edita."
      )
    }
    logger.error({ err: e }, "[api/acuerdos/voto] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
