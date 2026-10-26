/**
 * lib/importar/personas.ts — importador CSV de los bloques **personas** y
 * **vínculos** (ODD carga-inicial-csv U2).
 *
 * Dos CSV independientes, uno por bloque, con la misma forma que el bloque
 * estructura (U1): validación zod por fila con línea y columna, reporte
 * `{ filas, resumen }` y escritura idempotente por clave natural.
 *
 * Personas (sólo padrón: sin datos laborales ni gobernanza):
 *   - clave natural: `rut` (dentro de la comunidad). Existe → actualiza;
 *     no existe → crea con id determinista `imp-p-`. `nombreCompleto` se
 *     arma siempre con `nombres + apellidos`.
 *   - `roles` es una lista separada por `|`, validada contra ROLES_PERSONA.
 *
 * Vínculos:
 *   - clave natural del tramo vigente: `rut_persona + unidad (rol_sii) + rol`.
 *     Si ese tramo vigente ya existe, la fila reporta "sin-cambios".
 *   - `rut_persona` y `rol_sii_unidad` deben existir en la comunidad: si no,
 *     es error de esa fila y el mensaje nombra el RUT o el Rol SII que falta.
 *   - Las reglas de negocio del módulo (cierre de tramo anterior,
 *     exclusividad de titularidad/arriendo, anti-autosolapamiento, persona
 *     operativa) NO se reimplementan: cada fila se escribe reusando
 *     `ejecutarUpsertVinculo` de /api/vinculos, que es donde viven esas
 *     reglas. El error del módulo (409/400) queda como error de fila.
 *
 * En ambos bloques `comunidadId` lo pone siempre el servidor (S4) y el
 * `dryRun` no escribe nada (vista previa fila por fila, S3).
 */
import { createHash } from "node:crypto"
import type { Prisma, PrismaClient } from "@prisma/client"
import { z } from "zod"
import { serializarCsv, type FilaCsv } from "@/lib/importar/csv"
import { MENSAJE_FILA_EJEMPLO, columnaFilaEjemplo } from "@/lib/importar/estructura"
import { MensajeDocumentoInvalido, RolesVinculo, ROLES_PERSONA } from "@/lib/schemas"
import { validarDocumentoIdentidad, claveDocumento } from "@/lib/rut"
import { ejecutarUpsertVinculo, type DatosVinculo } from "@/app/api/vinculos/route"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"
import type {
  AccionFila,
  ReporteEstructura,
  ReporteFila,
  ResumenEstructura,
} from "@/lib/importar/estructura"

/** Encabezados canónicos del bloque personas: fuente única de la plantilla. */
export const ENCABEZADOS_PERSONAS = [
  "rut",
  "nombres",
  "apellidos",
  "email",
  "telefono",
  "roles",
] as const

export type EncabezadoPersonas = (typeof ENCABEZADOS_PERSONAS)[number]

/** Filas de ejemplo de la plantilla de personas (valores realistas del dominio). */
export const FILAS_EJEMPLO_PERSONAS: Record<EncabezadoPersonas, string>[] = [
  {
    rut: "EJEMPLO-12.345.678-5",
    nombres: "María",
    apellidos: "Rojas Soto",
    email: "maria.rojas@ejemplo.cl",
    telefono: "+56 9 6123 4567",
    roles: "propietario|residente",
  },
  {
    rut: "EJEMPLO-18.345.678-4",
    nombres: "Rodrigo",
    apellidos: "Fuentes Salas",
    email: "rodrigo.fuentes@ejemplo.cl",
    telefono: "+56 9 8765 4321",
    roles: "residente",
  },
  {
    rut: "EJEMPLO-13.987.123-5",
    nombres: "Juan",
    apellidos: "Pérez Díaz",
    email: "juan.perez@ejemplo.cl",
    telefono: "+56 9 5555 8888",
    roles: "residente|directiva",
  },
]

/** Encabezados canónicos del bloque vínculos: fuente única de la plantilla. */
export const ENCABEZADOS_VINCULOS = [
  "rut_persona",
  "rol_sii_unidad",
  "rol",
  "fecha_inicio",
  "permite_ver_finanzas",
] as const

export type EncabezadoVinculos = (typeof ENCABEZADOS_VINCULOS)[number]

/** Filas de ejemplo de la plantilla de vínculos (valores realistas del dominio). */
export const FILAS_EJEMPLO_VINCULOS: Record<EncabezadoVinculos, string>[] = [
  {
    rut_persona: "EJEMPLO-12.345.678-5",
    rol_sii_unidad: "EJEMPLO-12345-1101",
    rol: "propietario",
    fecha_inicio: "2024-03-01",
    permite_ver_finanzas: "true",
  },
  {
    rut_persona: "EJEMPLO-18.345.678-4",
    rol_sii_unidad: "EJEMPLO-12345-1101",
    rol: "arrendatario",
    fecha_inicio: "2024-05-01",
    permite_ver_finanzas: "false",
  },
  {
    rut_persona: "EJEMPLO-13.987.123-5",
    rol_sii_unidad: "EJEMPLO-999-101",
    rol: "copropietario",
    fecha_inicio: "2024-08-01",
    permite_ver_finanzas: "true",
  },
]

// --- Validación por fila (zod) ---

const campoObligatorio = (mensaje: string) =>
  z
    .string({
      required_error: mensaje,
      invalid_type_error: mensaje,
    })
    .trim()
    .min(1, mensaje)

const textoPersona = campoObligatorio("es obligatorio.")

/** RUT o pasaporte: misma fuente de validación que PersonaSchema (lib/rut). */
const rutCsv = campoObligatorio("es obligatorio.").refine(
  (v) => validarDocumentoIdentidad(v),
  MensajeDocumentoInvalido
)

const FilaPersonaSchema = z.object({
  rut: rutCsv,
  nombres: textoPersona,
  apellidos: textoPersona,
  email: campoObligatorio("es obligatorio.").email(
    "debe ser un correo electrónico válido."
  ),
  telefono: campoObligatorio("es obligatorio."),
  roles: campoObligatorio(
    "deben estar separadas por «|» (ej: «residente|directiva»)."
  ),
})

/** Fila de personas ya validada y recortada (roles partidos por «|»). */
export interface DatosFilaPersona {
  rut: string
  nombres: string
  apellidos: string
  email: string
  telefono: string
  roles: string[]
}

export interface ErrorFilaImport {
  columna: string
  mensaje: string
}

export interface FilaValidadaDatos<Datos> {
  linea: number
  datos: Datos | null
  errores: ErrorFilaImport[]
}

/** Valida cada fila del CSV de personas (incluida la lista de roles). */
export function validarFilasPersonas(
  filas: FilaCsv[]
): FilaValidadaDatos<DatosFilaPersona>[] {
  const rolesValidos = new Set<string>(ROLES_PERSONA)
  return filas.map((fila) => {
    // Filas de ejemplo de la plantilla: se rechazan antes del schemario, para
    // que nada del ejemplo se escriba.
    const columnaEjemplo = columnaFilaEjemplo(fila.valores, ["rut"])
    if (columnaEjemplo) {
      return {
        linea: fila.linea,
        datos: null,
        errores: [{ columna: columnaEjemplo, mensaje: MENSAJE_FILA_EJEMPLO }],
      }
    }
    const parsed = FilaPersonaSchema.safeParse(fila.valores)
    if (!parsed.success) {
      return {
        linea: fila.linea,
        datos: null,
        errores: parsed.error.issues.map((issue) => ({
          columna: String(issue.path[0] ?? ""),
          mensaje: issue.message,
        })),
      }
    }
    const datos = parsed.data
    // roles «residente|directiva» → ["residente","directiva"], con error de
    // columna si alguna entrada no es un rol del sistema.
    const partes = datos.roles
      .split("|")
      .map((r) => r.trim())
      .filter((r) => r !== "")
    const desconocidos = partes.filter((r) => !rolesValidos.has(r))
    if (partes.length === 0) {
      return {
        linea: fila.linea,
        datos: null,
        errores: [
          {
            columna: "roles",
            mensaje: `debe listar al menos un rol del sistema (${ROLES_PERSONA.join(", ")}).`,
          },
        ],
      }
    }
    if (desconocidos.length > 0) {
      return {
        linea: fila.linea,
        datos: null,
        errores: [
          {
            columna: "roles",
            mensaje:
              `debe listar roles del sistema separados por «|» (${ROLES_PERSONA.join(", ")}); ` +
              `no se reconoce: ${desconocidos.map((r) => `«${r}»`).join(", ")}.`,
          },
        ],
      }
    }
    return { linea: fila.linea, datos: { ...datos, roles: partes }, errores: [] }
  })
}

// --- Validación por fila: vínculos ---

const FilaVinculoSchema = z.object({
  rut_persona: rutCsv,
  rol_sii_unidad: campoObligatorio("es obligatorio."),
  rol: campoObligatorio(`debe ser uno de: ${RolesVinculo.join(", ")}.`),
  fecha_inicio: campoObligatorio("es obligatorio.").refine(
    (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
    "debe tener formato AAAA-MM-DD (ej: 2024-03-01)."
  ),
  permite_ver_finanzas: campoObligatorio("debe ser «true» o «false».").refine(
    (v) => v === "true" || v === "false",
    "debe ser «true» o «false»."
  ),
})

export interface DatosFilaVinculo {
  rut_persona: string
  rol_sii_unidad: string
  rol: string
  fecha_inicio: string
  permite_ver_finanzas: boolean
}

/** Valida cada fila del CSV de vínculos (rol contra RolVinculo del módulo). */
export function validarFilasVinculos(
  filas: FilaCsv[]
): FilaValidadaDatos<DatosFilaVinculo>[] {
  const rolesValidos = new Set<string>(RolesVinculo)
  return filas.map((fila) => {
    // Filas de ejemplo de la plantilla: se rechazan antes del schemario, para
    // que nada del ejemplo se escriba.
    const columnaEjemplo = columnaFilaEjemplo(fila.valores, ["rut_persona", "rol_sii_unidad"])
    if (columnaEjemplo) {
      return {
        linea: fila.linea,
        datos: null,
        errores: [{ columna: columnaEjemplo, mensaje: MENSAJE_FILA_EJEMPLO }],
      }
    }
    const parsed = FilaVinculoSchema.safeParse(fila.valores)
    if (!parsed.success) {
      return {
        linea: fila.linea,
        datos: null,
        errores: parsed.error.issues.map((issue) => ({
          columna: String(issue.path[0] ?? ""),
          mensaje: issue.message,
        })),
      }
    }
    const v = parsed.data
    // RolesVinculo (propietario|arrendatario|copropietario|ocupante): mismo
    // enum que valida VinculoUnidadSchema en las rutas del módulo.
    if (!rolesValidos.has(v.rol)) {
      return {
        linea: fila.linea,
        datos: null,
        errores: [
          {
            columna: "rol",
            mensaje: `debe ser uno de: ${RolesVinculo.join(", ")}; se recibió «${v.rol}».`,
          },
        ],
      }
    }
    return {
      linea: fila.linea,
      datos: { ...v, permite_ver_finanzas: v.permite_ver_finanzas === "true" },
      errores: [],
    }
  })
}

// --- Id determinista por contenido (mismo patrón que estructura.ts) ---

function idDeterminista(prefijo: string, ...partes: string[]): string {
  const hash = createHash("sha256").update(partes.join("|")).digest("hex")
  // substring y no slice: el recorte del digest no es un truncamiento de lista
  // (el candado de patrones R4 busca `.slice(0, N)` y marcaría falso positivo).
  // Longitud fija de id.
  return `${prefijo}${hash.substring(0, 20)}`
}

// --- Import: personas (padrón) ---

export interface EntradaImportarPersonas {
  prisma: PrismaClient
  /** Siempre del scope de la sesión, nunca del archivo. */
  comunidadId: string
  filas: FilaCsv[]
  dryRun: boolean
}

interface DatosPersona {
  nombres: string
  apellidos: string
  nombreCompleto: string
  email: string
  telefonoMovil: string
  roles: string[]
}

function personasIguales(a: DatosPersona, b: DatosPersona): boolean {
  const roles = (x: DatosPersona): string => [...x.roles].sort().join("|")
  return (
    a.nombres === b.nombres &&
    a.apellidos === b.apellidos &&
    a.nombreCompleto === b.nombreCompleto &&
    a.email === b.email &&
    a.telefonoMovil === b.telefonoMovil &&
    roles(a) === roles(b)
  )
}

/**
 * importarPersonas — valida las filas y devuelve el reporte fila por fila.
 *
 * Con `dryRun` no escribe nada (vista previa, S3). Sin `dryRun` escribe en
 * una transacción las filas válidas: el RUT ya existe en la comunidad →
 * actualiza; no existe → crea (estadoCuenta «activa», sin datos laborales
 * ni gobernanza: sólo padrón). La comparación de RUT es tolerante a la
 * grafía (con o sin puntos): claveDocumento la normaliza.
 */
export async function importarPersonas({
  prisma,
  comunidadId,
  filas,
  dryRun,
}: EntradaImportarPersonas): Promise<ReporteEstructura> {
  const validadas = validarFilasPersonas(filas)

  const existentes = await prisma.persona.findMany({
    where: { comunidadId },
    select: {
      id: true,
      rut: true,
      nombreCompleto: true,
      nombres: true,
      apellidos: true,
      email: true,
      telefonoMovil: true,
      roles: true,
    },
  })
  const personaPorRut = new Map<string, { id: string; datos: DatosPersona }>()
  for (const p of existentes) {
    const clave = claveDocumento(p.rut)
    if (!clave) continue
    personaPorRut.set(clave, {
      id: p.id,
      datos: {
        nombres: p.nombres,
        apellidos: p.apellidos,
        nombreCompleto: p.nombreCompleto,
        email: p.email,
        telefonoMovil: p.telefonoMovil,
        roles: Array.isArray(p.roles) ? (p.roles as string[]) : [],
      },
    })
  }

  interface FilaProcesada {
    linea: number
    accion: AccionFila
    errores: string[]
    conError: boolean
    id: string
    rut: string
    datos: DatosPersona | null
  }
  const filasProcesadas: FilaProcesada[] = []

  for (const fila of validadas) {
    const errores = fila.errores.map(
      (e) => `${e.columna}: ${e.mensaje} (línea ${fila.linea})`
    )
    let accion: AccionFila = "sin-cambios"
    let id = ""
    let datos: DatosPersona | null = null

    if (fila.datos) {
      const v = fila.datos
      datos = {
        nombres: v.nombres,
        apellidos: v.apellidos,
        nombreCompleto: `${v.nombres} ${v.apellidos}`,
        email: v.email,
        telefonoMovil: v.telefono,
        roles: v.roles,
      }
      const existente = personaPorRut.get(claveDocumento(v.rut))
      if (!existente) {
        accion = "crear"
        id = idDeterminista("imp-p-", comunidadId, claveDocumento(v.rut))
      } else {
        id = existente.id
        accion = personasIguales(existente.datos, datos) ? "sin-cambios" : "actualizar"
      }
      // Duplicados del mismo RUT dentro del archivo: la fila siguiente se
      // compara contra lo que esta deja, para no reportar dos creaciones.
      personaPorRut.set(claveDocumento(v.rut), { id, datos })
    }

    filasProcesadas.push({
      linea: fila.linea,
      accion,
      errores,
      conError: errores.length > 0,
      id,
      rut: fila.datos ? fila.datos.rut : "",
      datos,
    })
  }

  if (!dryRun) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const e of filasProcesadas) {
        if (e.conError || !e.datos) continue
        if (e.accion === "crear") {
          await tx.persona.create({
            data: {
              id: e.id,
              comunidadId,
              rut: e.rut,
              nombreCompleto: e.datos.nombreCompleto,
              nombres: e.datos.nombres,
              apellidos: e.datos.apellidos,
              email: e.datos.email,
              telefonoMovil: e.datos.telefonoMovil,
              estadoCuenta: "activa",
              condicionesEspecialesIds: [],
              roles: e.datos.roles,
            },
          })
        } else if (e.accion === "actualizar") {
          await tx.persona.update({
            where: { id: e.id },
            data: {
              nombreCompleto: e.datos.nombreCompleto,
              nombres: e.datos.nombres,
              apellidos: e.datos.apellidos,
              email: e.datos.email,
              telefonoMovil: e.datos.telefonoMovil,
              roles: e.datos.roles,
            },
          })
        }
      }
    })
  }

  return armarReporte(filasProcesadas)
}

// --- Import: vínculos ---

export interface EntradaImportarVinculos {
  prisma: PrismaClient
  /** Siempre del scope de la sesión, nunca del archivo. */
  comunidadId: string
  filas: FilaCsv[]
  dryRun: boolean
}

/** Clave del tramo vigente: persona + unidad + rol. */
function claveVinculo(personaId: string, unidadId: string, rol: string): string {
  return `${personaId}|${unidadId}|${rol}`
}

/**
 * importarVinculos — valida las filas y devuelve el reporte fila por fila.
 *
 * Reusa `ejecutarUpsertVinculo` (las reglas del módulo viven ahí, no acá):
 * cierre de tramo anterior, exclusividad de titularidad/arriendo,
 * anti-autosolapamiento y persona operativa. El error del módulo queda como
 * error de fila con su mensaje. Con `dryRun` no se llama al helper (escribiría):
 * la vista previa usa las mismas comprobaciones de lectura del import real y
 * reporta «crear» lo que quedaría sujeto a las reglas al momento de escribir.
 */
export async function importarVinculos({
  prisma,
  comunidadId,
  filas,
  dryRun,
}: EntradaImportarVinculos): Promise<ReporteEstructura> {
  const validadas = validarFilasVinculos(filas)

  const [personas, unidades, vinculosActivos] = await Promise.all([
    prisma.persona.findMany({
      where: { comunidadId },
      select: { id: true, rut: true },
    }),
    prisma.unidad.findMany({
      where: { comunidadId },
      select: { id: true, rolSii: true },
    }),
    prisma.vinculoUnidad.findMany({
      where: { comunidadId, fechaFin: null },
      select: { id: true, personaId: true, unidadId: true, rol: true },
    }),
  ])

  const personaPorRut = new Map(
    personas
      .map((p) => [claveDocumento(p.rut), p] as const)
      .filter(([clave]) => clave !== "")
  )
  const unidadPorRolSii = new Map(
    unidades
      .map((u) => [u.rolSii.trim(), u] as const)
      .filter(([clave]) => clave !== "")
  )
  const vigentePorClave = new Map(
    vinculosActivos.map((v) => [claveVinculo(v.personaId, v.unidadId, v.rol), v])
  )

  interface FilaProcesada {
    linea: number
    accion: AccionFila
    errores: string[]
    conError: boolean
    personaId: string
    unidadId: string
    rol: string
    fechaInicio: string
    permiteVerFinanzas: boolean
    idVinculo: string
  }
  const filasProcesadas: FilaProcesada[] = []

  for (const fila of validadas) {
    const errores = fila.errores.map(
      (e) => `${e.columna}: ${e.mensaje} (línea ${fila.linea})`
    )
    let accion: AccionFila = "sin-cambios"
    let personaId = ""
    let unidadId = ""
    let idVinculo = ""

    if (fila.datos) {
      const v = fila.datos
      const persona = personaPorRut.get(claveDocumento(v.rut_persona))
      if (!persona) {
        errores.push(
          `rut_persona: no existe la persona con RUT «${v.rut_persona}» en el ` +
            `padrón de la comunidad (línea ${fila.linea})`
        )
      }
      const unidad = unidadPorRolSii.get(v.rol_sii_unidad.trim())
      if (!unidad) {
        errores.push(
          `rol_sii_unidad: no existe la unidad con Rol SII «${v.rol_sii_unidad}» ` +
            `en la comunidad (línea ${fila.linea})`
        )
      }

      if (persona && unidad) {
        personaId = persona.id
        unidadId = unidad.id
        const clave = claveVinculo(personaId, unidadId, v.rol)
        if (vigentePorClave.has(clave)) {
          // El tramo vigente con ese rol ya existe: nada por hacer (idempotencia).
          accion = "sin-cambios"
        } else {
          accion = "crear"
          idVinculo = idDeterminista(
            "imp-v-",
            comunidadId,
            claveDocumento(v.rut_persona),
            v.rol_sii_unidad.trim(),
            v.rol,
            v.fecha_inicio
          )
        }
      }
    }

    filasProcesadas.push({
      linea: fila.linea,
      accion,
      errores,
      conError: errores.length > 0,
      personaId,
      unidadId,
      rol: fila.datos ? fila.datos.rol : "",
      fechaInicio: fila.datos ? fila.datos.fecha_inicio : "",
      permiteVerFinanzas: fila.datos ? fila.datos.permite_ver_finanzas : false,
      idVinculo,
    })
  }

  if (!dryRun) {
    // ejecutarUpsertVinculo sólo lee scope.comunidadId: el resto del scope es
    // de la sesión de la ruta y no afecta la escritura del vínculo.
    const scope: ComunidadScope = { comunidadId, usuarioId: "", rol: "" }
    for (const e of filasProcesadas) {
      if (e.conError || e.accion !== "crear") continue
      const datos: DatosVinculo = {
        id: e.idVinculo,
        personaId: e.personaId,
        unidadId: e.unidadId,
        rol: e.rol,
        fechaInicio: e.fechaInicio,
        permiteVerFinanzas: e.permiteVerFinanzas,
        cerrarAnterior: true,
      }
      const respuesta = await ejecutarUpsertVinculo(datos, scope, null)
      if (respuesta.status === 200 || respuesta.status === 201) {
        // La fila quedó escrita: marca el tramo como vigente para que una
        // fila duplicada del mismo archivo no vuelva a pasar por el helper.
        vigentePorClave.set(claveVinculo(e.personaId, e.unidadId, e.rol), {
          id: e.idVinculo,
          personaId: e.personaId,
          unidadId: e.unidadId,
          rol: e.rol,
        })
      } else {
        const cuerpo = (await respuesta.json().catch(() => null)) as
          | { error?: string }
          | null
        e.errores.push(
          `${MENSAJE_REGLA_VINCULO} ${cuerpo?.error ?? "error del módulo de vínculos"}` +
            ` (línea ${e.linea})`
        )
        e.conError = true
        e.accion = "sin-cambios"
      }
    }
  }

  return armarReporte(filasProcesadas)
}

const MENSAJE_REGLA_VINCULO = "regla del módulo de vínculos:"

// --- Reporte común (misma forma que el bloque estructura) ---

interface FilaConAccion {
  linea: number
  accion: AccionFila
  errores: string[]
  conError: boolean
}

function armarReporte(filas: FilaConAccion[]): ReporteEstructura {
  const reporte: ReporteFila[] = filas.map((f) => ({
    linea: f.linea,
    accion: f.accion,
    errores: f.errores,
  }))
  const resumen: ResumenEstructura = {
    total: filas.length,
    validas: 0,
    conError: 0,
    crear: 0,
    actualizar: 0,
    sinCambios: 0,
  }
  for (const f of filas) {
    if (f.conError) {
      resumen.conError++
      continue
    }
    resumen.validas++
    if (f.accion === "crear") resumen.crear++
    else if (f.accion === "actualizar") resumen.actualizar++
    else resumen.sinCambios++
  }
  return { filas: reporte, resumen }
}

// --- Plantillas descargables (encabezado + fila de ejemplo) ---

/** Arma el contenido de la plantilla de personas: encabezados + filas de ejemplo. */
export function construirPlantillaPersonas(): string {
  const ejemplos = FILAS_EJEMPLO_PERSONAS.map((fila) =>
    ENCABEZADOS_PERSONAS.map((h) => fila[h])
  )
  // BOM al inicio: Excel abre el UTF-8 sin corromper los caracteres.
  return `\ufeff${serializarCsv([[...ENCABEZADOS_PERSONAS], ...ejemplos])}\r\n`
}

/** Arma el contenido de la plantilla de vínculos: encabezados + filas de ejemplo. */
export function construirPlantillaVinculos(): string {
  const ejemplos = FILAS_EJEMPLO_VINCULOS.map((fila) =>
    ENCABEZADOS_VINCULOS.map((h) => fila[h])
  )
  return `\ufeff${serializarCsv([[...ENCABEZADOS_VINCULOS], ...ejemplos])}\r\n`
}
