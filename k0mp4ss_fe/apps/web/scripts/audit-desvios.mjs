#!/usr/bin/env node
/**
 * scripts/audit-desvios.mjs — candado contra los patrones que hoy se descubren tarde.
 *
 * Nace de cuatro casos reales de la jornada (tests que fijaban el defecto, permisos
 * heredados por prefijo, truncamientos silenciosos, catches que confirman éxito) y del
 * catálogo de antipatrones de permisos:
 *   .agents/skills/auditoria-contratos-permisos/references/antipatrones.md  (A1, A2, A4, A7, A8)
 *   .agents/skills/auditoria-contratos-permisos/references/hallazgos.md
 *
 * Objetivo del owner: "solo quiero que el sistema funcione como sistema… no enterarme que
 * habían botones o funciones de palo". El candado no prueba el sistema: impide que vuelvan
 * los patrones que lo dejan a medias sin que nadie se entere.
 *
 * Node puro, sin dependencias. Sale 1 si hay hallazgos sin justificar.
 *
 *   node scripts/audit-desvios.mjs           # salida legible (grupos + resumen)
 *   node scripts/audit-desvios.mjs --json    # mismo resultado en JSON
 *   node scripts/audit-desvios.mjs --raiz X  # audita otra raíz (lo usa el test con fixtures)
 *
 * Reglas:
 *   R1  Recursos de permisos usados en el código y ausentes de la MATRIZ de lib/authz.ts.
 *   R2  Marcadores de postergación ("desvío", "por simplicidad", "solo admin hasta"…).
 *   R3  Tests apagados o aserciones complacientes sin justificación escrita.
 *   R4  Truncamientos silenciosos de listas (.slice(0, N) sin AvisoTruncamiento/LIMITE_SELECT).
 *   R5  Catch vacío que igual confirma éxito (el usuario cree que se guardó y no se guardó).
 *
 * Excepciones: la allowlist vive abajo, con el motivo escrito al lado. Nunca se silencia un
 * hallazgo con un catch vacío ni con un `return` temprano: si no hay motivo, es hallazgo.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const RAIZ_SCRIPT = dirname(fileURLToPath(import.meta.url))

/** Raíz auditada por defecto: k0mp4ss_fe/apps/web (el workdir de todos los comandos). */
export const RAIZ_POR_DEFECTO = resolve(RAIZ_SCRIPT, "..")

const EXTENSIONES = new Set([".ts", ".tsx"])
/**
 * Archivos que el candado NO mira, por ruta relativa a la raíz auditada.
 * El test del propio candado escribe los patrones (skip, "desvío", `.slice(0, N)`) como
 * fixtures: si se escaneara a sí mismo se reportaría como defecto del repo.
 */
const ARCHIVOS_IGNORADOS = new Set(["test/audit-desvios.test.ts"])

const DIRS_IGNORADOS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  ".vercel",
  "coverage",
  "playwright-report",
  "test-results",
  "dist",
])

// ---------------------------------------------------------------------------
// Utilidades de lectura
// ---------------------------------------------------------------------------

function esDirectorio(ruta) {
  try {
    return statSync(ruta).isDirectory()
  } catch {
    return false
  }
}

/** Lista recursiva de archivos .ts/.tsx bajo `dir` (si no existe, lista vacía). */
function listarArchivos(dir) {
  if (!esDirectorio(dir)) return []
  const salida = []
  for (const entrada of readdirSync(dir)) {
    if (DIRS_IGNORADOS.has(entrada)) continue
    const ruta = join(dir, entrada)
    let info
    try {
      info = statSync(ruta)
    } catch {
      continue
    }
    if (info.isDirectory()) {
      salida.push(...listarArchivos(ruta))
    } else if (EXTENSIONES.has(ruta.slice(ruta.lastIndexOf(".")))) {
      salida.push(ruta)
    }
  }
  return salida.sort()
}

function lineasDe(absoluta) {
  return readFileSync(absoluta, "utf8").split(/\r?\n/)
}

/** Ruta relativa a la raíz auditada, con "/" (estable entre SO y en los mensajes). */
function rutaRelativa(raiz, absoluta) {
  return relative(raiz, absoluta).split("\\").join("/")
}

/** Minúsculas y sin diacríticos: "desvío" y "desvio" son el mismo marcador. */
function normaliza(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function recorta(texto, maximo = 140) {
  const limpio = texto.trim().replace(/\s+/g, " ")
  return limpio.length > maximo ? `${limpio.slice(0, maximo)}…` : limpio
}

const RE_COMENTARIO = /^\s*(\/\/|\/\*|\*)/

/** Ignora líneas vacías y de comentario a partir de `indice`. Devuelve el índice o -1. */
function siguienteCodigo(lineas, indice) {
  for (let i = indice; i < lineas.length; i++) {
    const linea = lineas[i] ?? ""
    if (linea.trim() === "" || RE_COMENTARIO.test(linea)) continue
    return i
  }
  return -1
}

// ---------------------------------------------------------------------------
// R1 — recursos de permisos no declarados en la MATRIZ
// ---------------------------------------------------------------------------

/**
 * Devuelve el bloque `{...}` que sigue al marcador, con llaves balanceadas.
 * Sirve para leer la MATRIZ de lib/authz.ts sin importar el módulo (es TS con "@/...").
 */
export function extraerBloque(texto, marcador) {
  const inicioMarcador = texto.indexOf(marcador)
  if (inicioMarcador === -1) return ""
  const inicio = texto.indexOf("{", inicioMarcador)
  if (inicio === -1) return ""
  let profundidad = 0
  for (let i = inicio; i < texto.length; i++) {
    const caracter = texto[i]
    if (caracter === "{") profundidad++
    else if (caracter === "}") {
      profundidad--
      if (profundidad === 0) return texto.slice(inicio, i + 1)
    }
  }
  return texto.slice(inicio)
}

/**
 * Claves de la MATRIZ: cada recurso declarado en algún rol, más la raíz de cada clave
 * granular (`in:apelar` declara también `in`). El wildcard `"*"` NO declara nada: es
 * justamente lo que hace invisible el defecto (solo el administrador lo obtiene).
 */
export function recursosDeclarados(textoAuthz) {
  const bloque = extraerBloque(textoAuthz, "const MATRIZ")
  const declarados = new Set()
  if (!bloque) return declarados
  let profundidad = 0
  let rolActual = null
  for (const linea of bloque.split("\n")) {
    if (profundidad === 1) {
      const rol = linea.match(/^\s*([A-Za-z_][\w]*)\s*:\s*\{/)
      if (rol) rolActual = rol[1]
    }
    if (profundidad === 2 && rolActual) {
      const clave = linea.match(/^\s*"([^"]+)"\s*:\s*new Set/)
      if (clave && clave[1] !== "*") {
        declarados.add(clave[1].trim().toLowerCase())
        declarados.add(clave[1].split(":")[0].trim().toLowerCase())
      }
    }
    profundidad += contar(linea, "{") - contar(linea, "}")
  }
  return declarados
}

function contar(linea, caracter) {
  let total = 0
  for (const c of linea) if (c === caracter) total++
  return total
}

/** Constantes de módulo del archivo (`const RECURSO_X = "recurso"`), para resolver llamadas. */
function constantesDeTexto(lineas) {
  const mapa = new Map()
  const re =
    /(?:export\s+)?const\s+([A-Za-z_][\w]*)\s*(?::\s*[^=]+)?=\s*"([^"]*)"/g
  const texto = lineas.join("\n")
  let m
  while ((m = re.exec(texto)) !== null) mapa.set(m[1], m[2])
  return mapa
}

/**
 * Parte los argumentos de una llamada desde el paréntesis de apertura.
 * Devuelve `{ args, fin }` con args ya recortados, o null si no cierra.
 */
function argumentosDe(texto, desde) {
  const args = []
  let profundidad = 0
  let actual = ""
  let comilla = null
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i]
    if (comilla) {
      actual += c
      if (c === "\\") {
        actual += texto[i + 1] ?? ""
        i++
      } else if (c === comilla) comilla = null
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      comilla = c
      actual += c
      continue
    }
    if (c === "(" || c === "[" || c === "{") profundidad++
    if (c === ")" || c === "]" || c === "}") {
      if (profundidad === 0) {
        args.push(actual.trim())
        return { args, fin: i }
      }
      profundidad--
    }
    if (c === "," && profundidad === 0) {
      args.push(actual.trim())
      actual = ""
      continue
    }
    actual += c
  }
  return null
}

function valorLiteral(expresion, constantes) {
  if (!expresion) return null
  const literal = expresion.match(/^["'`]([^"'`]*)["'`]$/)
  if (literal) return literal[1].trim().toLowerCase()
  if (/^[A-Za-z_][\w]*$/.test(expresion)) {
    const valor = constantes.get(expresion)
    return valor === undefined ? null : valor.trim().toLowerCase()
  }
  return null
}

function reglaR1(raiz, archivos, excepciones) {
  const rutaAuthz = join(raiz, "lib", "authz.ts")
  if (!existsSync(rutaAuthz)) return []
  const declarados = recursosDeclarados(readFileSync(rutaAuthz, "utf8"))
  if (declarados.size === 0) {
    return [
      {
        regla: "R1",
        archivo: "lib/authz.ts",
        linea: 0,
        detalle: "no se pudo leer la MATRIZ — el candado quedaría ciego",
        accion:
          "revisar el formato de MATRIZ en lib/authz.ts (el candado parsea las claves)",
      },
    ]
  }
  const hallazgos = []
  const reLlamada = /\b(puede|puedeContextual)\s*\(/g
  for (const absoluta of archivos) {
    const texto = readFileSync(absoluta, "utf8")
    const lineas = texto.split(/\r?\n/)
    const constantes = constantesDeTexto(lineas)
    let m
    while ((m = reLlamada.exec(texto)) !== null) {
      // `abierto` apunta al "(" de la llamada: se arranca después para que la
      // profundidad cuente los paréntesis internos (puedeContextual(rol, accion, recurso, {})).
      const abierto = m.index + m[0].length
      const llamada = argumentosDe(texto, abierto)
      if (!llamada) continue
      const recurso = valorLiteral(llamada.args[2], constantes)
      if (!recurso) continue
      if (declarados.has(recurso) || declarados.has(recurso.split(":")[0]))
        continue
      const linea = texto.slice(0, m.index).split("\n").length
      if (exceptuado("R1", excepciones, { recurso })) continue
      hallazgos.push({
        regla: "R1",
        archivo: rutaRelativa(raiz, absoluta),
        linea,
        detalle: `${m[1]}() pide el recurso "${recurso}", que no está declarado para ningún rol`,
        accion:
          "declarar el recurso en la MATRIZ con el mínimo privilegio decidido (o justificarlo en la allowlist del candado)",
      })
    }
  }
  return hallazgos
}

// ---------------------------------------------------------------------------
// R2 — marcadores de postergación
// ---------------------------------------------------------------------------

/**
 * Marcadores del catálogo A4: frases que dejan un pendiente escrito en el código o en un
 * test y que, con el tiempo, se leen como si fueran intencionales.
 */
const MARCADORES_R2 = [
  "desvio",
  "solo admin hasta",
  "por simplicidad",
  "abac en ui",
  "hasta que rp",
  "pendiente de decision",
]

function reglaR2(raiz, archivos, excepciones) {
  const hallazgos = []
  for (const absoluta of archivos) {
    const lineas = lineasDe(absoluta)
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i] ?? ""
      const plano = normaliza(linea)
      const marcador = MARCADORES_R2.find((m) => plano.includes(m))
      if (!marcador) continue
      const archivo = rutaRelativa(raiz, absoluta)
      if (exceptuado("R2", excepciones, { archivo, texto: linea })) continue
      hallazgos.push({
        regla: "R2",
        archivo,
        linea: i + 1,
        detalle: `marcador "${marcador}": ${recorta(linea)}`,
        accion:
          "cerrar el pendiente o documentarlo como decisión tomada (allowlist) — un desvío escrito en el código se lee como intencional",
      })
    }
  }
  return hallazgos
}

// ---------------------------------------------------------------------------
// R3 — tests apagados sin justificación
// ---------------------------------------------------------------------------

const PATRONES_R3 = [
  { re: /\b(?:test|describe|it)\.skip\s*\(/, que: "skip" },
  { re: /\bxit\s*\(/, que: "xit" },
  { re: /\bxdescribe\s*\(/, que: "xdescribe" },
  { re: /\b(?:it|test)\.todo\s*\(/, que: "todo" },
  { re: /\.skip\s*\(/, que: "skip" },
  { re: /expect\(\s*true\s*\)/, que: "expect(true)" },
  {
    re: /toContain\(\s*\[[^\]]*\b(?:200|201|204|301|302|400|401|403|404|409|500)\b[^\]]*\]/,
    que: "asertación complaciente",
  },
]

const JUSTIFICACION_R3 = /porque|motivo|razon|justific|E2E_/i

function justificadaR3(lineas, indice) {
  const actual = lineas[indice] ?? ""
  const previa = indice > 0 ? (lineas[indice - 1] ?? "") : ""
  // Skip condicional por variable de entorno: la condición ES la justificación.
  if (/process\.env\.[A-Z0-9_]+/.test(actual)) return true
  return JUSTIFICACION_R3.test(actual) || JUSTIFICACION_R3.test(previa)
}

function reglaR3(raiz, archivos, excepciones) {
  const hallazgos = []
  for (const absoluta of archivos) {
    const lineas = lineasDe(absoluta)
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i] ?? ""
      const patron = PATRONES_R3.find((p) => p.re.test(linea))
      if (!patron) continue
      if (justificadaR3(lineas, i)) continue
      const archivo = rutaRelativa(raiz, absoluta)
      if (exceptuado("R3", excepciones, { archivo, texto: linea })) continue
      hallazgos.push({
        regla: "R3",
        archivo,
        linea: i + 1,
        detalle: `${patron.que} sin justificación: ${recorta(linea)}`,
        accion:
          "escribir el motivo en la misma línea o en la anterior (porque/motivo/razón/justificación) o eliminar el test",
      })
    }
  }
  return hallazgos
}

// ---------------------------------------------------------------------------
// R4 — truncamientos silenciosos de listas
// ---------------------------------------------------------------------------

/** Receptores que son texto, no listas: fechas ISO, ids, mensajes, períodos. */
const RECEPTOR_TEXTO =
  /toISOString|toTimeString|toLocale[A-Za-z]*String|\.replace\(|\.split\(|\.digest\(|\bString\(|JSON\.stringify|\.trim\(|randomUUID\(|\bhoyISO\(|\bhoyStr\b|\bmesProyeccion\b|\bfecha[A-Za-z]*\b|\.fecha\b|\.hora\b|\.message\b|novedadesGenerales/

function archivoAvisaTruncamiento(texto) {
  return /AvisoTruncamiento|LIMITE_SELECT/.test(texto)
}

/**
 * Receptor de la expresión, mirando hacia atrás si el encadenado viene partido en varias
 * líneas (`.map(...)`/`)` sueltos al final): sin esto, un `(texto).slice(0, 80)` se leería
 * como recorte de lista cuando en realidad trunca un string.
 */
function receptorDe(texto, indice, lineas) {
  const mismoRenglon =
    texto
      .slice(Math.max(0, indice - 160), indice)
      .split(/\n/)
      .pop() ?? ""
  // Hay receptor en el mismo renglón solo si termina en un identificador (con cierres opcionales).
  if (/[A-Za-z_][\w]*\s*[)\]}]*\s*$/.test(mismoRenglon)) return mismoRenglon
  // Encadenado partido: miramos las 3 líneas anteriores del archivo.
  const linea = texto.slice(0, indice).split("\n").length
  return lineas.slice(Math.max(0, linea - 3), linea).join(" ")
}

/** Contexto de la sentencia: sirve para nombrar la lista recortada y para la allowlist. */
function contextoDe(lineas, indice, atras = 8) {
  return lineas.slice(Math.max(0, indice - atras), indice + 1).join("\n")
}

/**
 * Un recorte está "declarado" si el mismo sitio comunica el total: el patrón oficial es
 * `AvisoTruncamiento`, pero también vale que el texto de al lado muestre el conteo
 * (`N más`, `de N`, `lista.length`). Lo que no vale es recortar y callar.
 */
function recorteDeclarado(lineas, indice, receptor) {
  const desde = Math.max(0, indice - 4)
  const hasta = Math.min(lineas.length, indice + 5)
  const ventana = lineas.slice(desde, hasta).join("\n")
  if (/AvisoTruncamiento|LIMITE_SELECT/.test(ventana)) return true
  const base = receptor.match(/([A-Za-z_][\w]*)\s*\.?\s*$/)
  const nombre = base ? base[1] : null
  if (nombre && new RegExp(`\\b${nombre}\\.length\\b`).test(ventana))
    return true
  return /\bm[áa]s\b|\bde\s+\d+\b|total|vista previa|resumen|recientes|pr[óo]ximos|u?ltimos/i.test(
    ventana
  )
}

function reglaR4(raiz, archivos, excepciones) {
  const hallazgos = []
  for (const absoluta of archivos) {
    const texto = readFileSync(absoluta, "utf8")
    if (archivoAvisaTruncamiento(texto)) continue
    const lineas = texto.split(/\r?\n/)
    const re = /\.slice\(\s*0\s*,\s*(\d+)\s*\)/g
    let m
    while ((m = re.exec(texto)) !== null) {
      const receptor = receptorDe(texto, m.index, lineas)
      if (RECEPTOR_TEXTO.test(receptor)) continue
      const linea = texto.slice(0, m.index).split("\n").length
      const contexto = contextoDe(lineas, linea - 1)
      if (recorteDeclarado(lineas, linea - 1, receptor)) continue
      const archivo = rutaRelativa(raiz, absoluta)
      if (exceptuado("R4", excepciones, { archivo, texto: contexto })) continue
      hallazgos.push({
        regla: "R4",
        archivo,
        linea,
        detalle: `recorte de ${m[1]} sin aviso: ${recorta(lineas[linea - 1] ?? "")}`,
        accion:
          "usar AvisoTruncamiento + LIMITE_SELECT (components/pe/aviso-truncamiento.tsx) para decir cuántos quedan fuera",
      })
    }
  }
  return hallazgos
}

// ---------------------------------------------------------------------------
// R5 — catch vacío que igual confirma éxito
// ---------------------------------------------------------------------------

const RE_CATCH_BLOQUE = /catch\s*\{\s*$/
const RE_CATCH_INLINE = /catch\s*\{\s*\}/
const RE_CATCH_FLECHA = /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/

const CIERRE_FALLIDO =
  /return\s+(null|false)\b|ok:\s*false|status:\s*[45]\d\d|redirect\(|throw\b|return\s+NextResponse\.json\([^)]*status:\s*[45]/
const CONFIRMA_EXITO =
  /ok:\s*true|success:\s*true|type:\s*["']success["']|guardad[oa] con [eé]xito|exitosamente/

/** ¿El catch tiene el cuerpo vacío (solo comentarios)? */
function cuerpoVacio(lineas, indice) {
  const siguiente = siguienteCodigo(lineas, indice + 1)
  if (siguiente === -1) return false
  const linea = (lineas[siguiente] ?? "").trim()
  return linea.startsWith("}") || linea === ""
}

/** Ventana de la misma función: corta en la próxima declaración de nivel superior. */
function ventanaFuncion(lineas, desde, maximo = 60) {
  const salida = []
  for (let i = desde; i < Math.min(lineas.length, desde + maximo); i++) {
    const linea = lineas[i] ?? ""
    if (
      /^(export\s+)?(async\s+)?function\s|^export\s+default\s|^export\s+const\s|^const\s+\w+\s*=\s*(async\s*)?\(/.test(
        linea
      )
    ) {
      break
    }
    salida.push(linea)
  }
  return salida
}

function reglaR5(raiz, archivos, excepciones) {
  const hallazgos = []
  for (const absoluta of archivos) {
    const lineas = lineasDe(absoluta)
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i] ?? ""
      const esBloque = RE_CATCH_BLOQUE.test(linea)
      const esInline = RE_CATCH_INLINE.test(linea)
      const esFlecha = RE_CATCH_FLECHA.test(linea)
      if (!esBloque && !esInline && !esFlecha) continue
      if (esBloque && !cuerpoVacio(lineas, i)) continue
      const inmediato = lineas.slice(i + 1, i + 12).join("\n")
      // Falla cerrado: el catch desemboca en error/null/false/redirección. No es hallazgo.
      if (CIERRE_FALLIDO.test(inmediato)) continue
      const ventana = ventanaFuncion(lineas, i + 1)
      if (!CONFIRMA_EXITO.test(ventana.join("\n"))) continue
      const archivo = rutaRelativa(raiz, absoluta)
      // El comentario del cuerpo es parte de la evidencia: ahí se justifica el "no bloquea".
      const texto = lineas.slice(i, i + 3).join("\n")
      if (exceptuado("R5", excepciones, { archivo, texto })) continue
      hallazgos.push({
        regla: "R5",
        archivo,
        linea: i + 1,
        detalle: `catch vacío y la misma función confirma éxito: ${recorta(linea)}`,
        accion:
          "propagar el error al resultado (ok:false / status 5xx) o registrar el fallo; nunca devolver éxito tras un catch vacío",
      })
    }
  }
  return hallazgos
}

// ---------------------------------------------------------------------------
// Allowlist — cada entrada con su motivo. Una excepción sin motivo es deuda.
// ---------------------------------------------------------------------------

/**
 * R1 · recursos que a propósito viven fuera de la MATRIZ.
 * Un recurso fuera de la matriz solo lo obtiene el administrador por el wildcard; eso es
 * correcto únicamente cuando la capacidad es de plataforma (no de rol de comunidad) y está
 * defendida en la propia ruta.
 */
const EXCEPCIONES_R1 = [
  {
    recurso: "admin:usuarios",
    motivo:
      "administración de usuarios (server-side, no es módulo de comunidad): la ruta exige sesión de admin de esa comunidad y el recurso no debe existir para comité/conserjería/residente (lib/authz.ts cabecera: 'admin:usuarios / backup (server-side)').",
  },
  {
    recurso: "backup",
    motivo:
      "respaldo/restauración de la base: capacidad de plataforma, jamás de un rol de comunidad. Solo el wildcard del administrador debe alcanzarla (comentario de MATRIZ: 'admin:usuarios, backup').",
  },
  {
    recurso: "pi",
    motivo:
      "portal inmobiliario (publicaciones y leads de captación): módulo de plataforma, fuera de la operación de una comunidad; hoy solo el administrador lo opera y ningún rol de comunidad debe verlo.",
  },
  {
    recurso: "recurso_inexistente",
    motivo:
      "fixture negativo del motor: lib/authz.test.ts lo usa para comprobar el menor privilegio (un recurso que no existe debe denegar). Que NO exista en la MATRIZ es justamente lo que el test verifica.",
  },
  {
    recurso: "notify:residente",
    motivo:
      "recurso semántico del ABAC, no de RBAC: lo evalúa puedeContextual con el control de privacidad alertasResidentesActivas y hoy ninguna ruta lo pide (el chequeo local vive en lib/store.ts:1327). Declararlo en la MATRIZ abriría un permiso que ningún rol debe tener.",
  },
  {
    recurso: "qa-lab",
    motivo:
      "herramienta interna de QA (purga de datos TEST). No es permiso de negocio: es backoffice de desarrollo y debe morir o aislarse antes de producción (mismo criterio que H6 del registro de hallazgos).",
  },
]

/**
 * R2 · menciones del marcador que NO describen un pendiente.
 */
const EXCEPCIONES_R2 = [
  {
    archivo: "lib/two-factor.ts",
    fragmento: "desvío de reloj",
    motivo:
      "falso positivo del marcador: 'desvío' acá es la deriva de reloj que tolera la ventana ±1 paso del TOTP, no un permiso postergado.",
  },
  {
    archivo: "app/api/auth/2fa/challenge/route.ts",
    fragmento: "Desvío documentado vs prompt",
    motivo:
      "documenta una decisión ya tomada y cerrada (por qué el desafío 2FA vive en su propio endpoint porque `authorize` no puede transportar el tempToken): no queda nada pendiente.",
  },
]

const EXCEPCIONES_R3 = [
  {
    archivo: "e2e/auth/roles-descubrimiento.spec.ts",
    motivo:
      "la justificación está en el encabezado del propio spec (líneas 1-7): es la evidencia histórica del gap P1 (currentRole hardcodeado en el sidebar), que se deja en skip para trazabilidad y tiene spec de reemplazo (auth/roles-menu.spec.ts). Decisión cerrada, no un pendiente.",
  },
]

const EXCEPCIONES_R4 = [
  {
    archivo: "app/api/reportes-re/_acciones.ts",
    fragmento: "porArea.entries()",
    motivo:
      "texto narrativo del reporte RE, no una lista de gestión: el bloque ya declara el total de entregas ('Solicitudes entregadas (histórico)') y el desglose por área se recorta a 5 líneas de texto. Nadie elige ni actúa sobre esas filas.",
  },
  {
    archivo: "app/finanzas/gastos-comunes/page.tsx",
    fragmento: "vistaPrevia",
    motivo:
      "el recorte está declarado en la UI: la tarjeta se titula 'Vista previa (primeras 8 líneas)' y su descripción explica que es una muestra antes de emitir. No es la lista donde se opera.",
  },
]

const EXCEPCIONES_R5 = [
  {
    archivo: "app/api/auditoria/sync/route.ts",
    fragmento: "No bloquea el batch",
    motivo:
      "contrato documentado del endpoint espejo: el catch no corta el lote y la respuesta delata el fallo (devuelve `recibidos` y `persistidos` por separado). El comentario del propio catch lo declara.",
  },
  {
    archivo: "app/api/fi/sync/route.ts",
    fragmento: "No bloquea el batch",
    motivo:
      "idem espejo FI: el lote no se corta por un registro inválido y la respuesta expone `recibidos` vs `persistidos` por colección (fondos/egresos/ingresos). El catch está declarado como 'No bloquea el batch'.",
  },
]

const EXCEPCIONES = {
  R1: EXCEPCIONES_R1,
  R2: EXCEPCIONES_R2,
  R3: EXCEPCIONES_R3,
  R4: EXCEPCIONES_R4,
  R5: EXCEPCIONES_R5,
}

/** ¿Hay una excepción para este hallazgo? Devuelve la entrada o null. */
function buscarExcepcion(regla, excepciones, hallazgo) {
  const lista = excepciones[regla] ?? []
  return (
    lista.find((excepcion) => {
      if (excepcion.recurso !== undefined)
        return excepcion.recurso === hallazgo.recurso
      if (excepcion.archivo !== hallazgo.archivo) return false
      if (excepcion.fragmento === undefined) return true
      const texto = normaliza(hallazgo.texto ?? "")
      return texto.includes(normaliza(excepcion.fragmento))
    }) ?? null
  )
}

function exceptuado(regla, excepciones, hallazgo) {
  return buscarExcepcion(regla, excepciones, hallazgo) !== null
}

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------

const TITULOS = {
  R1: "R1 · Recursos de permisos no declarados en la MATRIZ",
  R2: "R2 · Marcadores de postergación",
  R3: "R3 · Tests apagados sin justificación",
  R4: "R4 · Truncamientos silenciosos de listas",
  R5: "R5 · Catch vacío que confirma éxito",
}

function archivosDe(raiz, directorios) {
  return directorios
    .flatMap((dir) => listarArchivos(join(raiz, dir)))
    .filter((absoluta) => !ARCHIVOS_IGNORADOS.has(rutaRelativa(raiz, absoluta)))
}

/**
 * Una excepción de la allowlist: `recurso` (R1) o `archivo` + `fragmento` (R2-R5), con su motivo.
 * @typedef {{ recurso?: string, archivo?: string, fragmento?: string, motivo: string }} Excepcion
 */
/**
 * Allowlist inyectable por regla (el test la usa para probar el mecanismo sin tocar el repo).
 * @typedef {Record<string, Excepcion[]>} Excepciones
 */
/**
 * Ejecuta las 5 reglas. Pura respecto del repo: todo sale de `raiz`.
 * @param {{ raiz?: string, excepciones?: Excepciones }} opciones
 */
export function auditar(opciones = {}) {
  const raiz = opciones.raiz ?? RAIZ_POR_DEFECTO
  const excepciones = opciones.excepciones ?? EXCEPCIONES
  const codigo = archivosDe(raiz, ["app", "lib", "components"])
  const pruebas = archivosDe(raiz, ["test", "e2e"])
  return [
    ...reglaR1(raiz, codigo, excepciones),
    ...reglaR2(raiz, [...codigo, ...pruebas], excepciones),
    ...reglaR3(raiz, pruebas, excepciones),
    ...reglaR4(raiz, archivosDe(raiz, ["app", "components"]), excepciones),
    ...reglaR5(raiz, codigo, excepciones),
  ]
}

function formatear(hallazgos) {
  const lineas = []
  const reglas = Object.keys(TITULOS)
  const porRegla = new Map(
    reglas.map((r) => [r, hallazgos.filter((h) => h.regla === r)])
  )
  const conHallazgos = reglas.filter((r) => porRegla.get(r).length > 0)

  lineas.push("audit:desvios — candado de patrones que hoy se descubren tarde")
  lineas.push("")
  for (const regla of reglas) {
    const lista = porRegla.get(regla)
    lineas.push(TITULOS[regla])
    if (lista.length === 0) lineas.push("  ok · 0 hallazgos")
    else {
      for (const h of lista) {
        lineas.push(`  ✗ ${h.archivo}:${h.linea} · ${h.detalle}`)
        lineas.push(`    → ${h.accion}`)
      }
    }
    // La allowlist se muestra siempre: nada queda silenciado sin decirlo.
    const excepciones = EXCEPCIONES[regla] ?? []
    if (excepciones.length > 0) {
      const etiquetas = excepciones.map((e) => e.recurso ?? e.archivo)
      lineas.push(
        `  allowlist (${excepciones.length}): ${etiquetas.join(" · ")}`
      )
    }
    lineas.push("")
  }
  const total = hallazgos.length
  lineas.push(
    total === 0
      ? "RESUMEN: 0 hallazgos en 0 reglas · candado en verde"
      : `RESUMEN: ${total} hallazgo(s) en ${conHallazgos.length} regla(s) · ${conHallazgos.join(", ")}`
  )
  return lineas.join("\n")
}

function leerArgumentos(argv) {
  const opciones = { json: false, raiz: RAIZ_POR_DEFECTO }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--json") opciones.json = true
    else if (arg === "--raiz") {
      const valor = argv[i + 1]
      if (!valor) throw new Error("--raiz necesita una ruta")
      opciones.raiz = resolve(valor)
      i++
    } else if (arg === "--help" || arg === "-h") opciones.ayuda = true
    else throw new Error(`argumento desconocido: ${arg}`)
  }
  return opciones
}

function main(argv) {
  let opciones
  try {
    opciones = leerArgumentos(argv)
  } catch (error) {
    console.error(`audit:desvios · ${error.message}`)
    return 2
  }
  if (opciones.ayuda) {
    console.log("uso: node scripts/audit-desvios.mjs [--json] [--raiz <ruta>]")
    return 0
  }
  const hallazgos = auditar({ raiz: opciones.raiz })
  if (opciones.json) {
    console.log(
      JSON.stringify(
        { raiz: opciones.raiz, hallazgos, excepciones: EXCEPCIONES },
        null,
        2
      )
    )
  } else {
    console.log(formatear(hallazgos))
  }
  return hallazgos.length === 0 ? 0 : 1
}

const invocadoDirectamente =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invocadoDirectamente) {
  process.exitCode = main(process.argv.slice(2))
}
