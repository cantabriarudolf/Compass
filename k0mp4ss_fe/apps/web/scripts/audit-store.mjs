#!/usr/bin/env node
/**
 * scripts/audit-store.mjs — candado contra el store legacy como fuente de datos de dominio.
 *
 * Por qué existe: la migración a la base se declaró "saldada" dos veces (SERIE-DEUDA-6 y
 * SERIE-FASE2, con "3 excepciones justificadas"), y hoy vuelve a haber 13 archivos leyendo
 * `useCompassStore`. Cada feature reusó el store porque era el camino corto y ningún gate se
 * quejó: el número vivía en un párrafo escrito a mano, no en un comando.
 *
 * Reglas:
 * 1. Un archivo nuevo de `app/` o `components/` que use `useCompassStore` FALLA. La salida es el
 *    hook de `lib/api/use-*.ts`; si falta, se escribe.
 * 2. Cada excepción vive en `EXCEPCIONES` con su motivo y su fecha. Sin motivo no compila el gate.
 * 3. Una excepción cuyo archivo ya no usa el store es un hallazgo: la lista SÓLO se achica. Esa
 *    regla es la que impide que la deuda vuelva a crecer en silencio.
 *
 * Uso: npm run audit:store   (sale 1 si hay hallazgos)
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const RAIZ = fileURLToPath(new URL("..", import.meta.url))

/** Dónde se busca: la UI. El store mismo y los tests quedan afuera por construcción. */
const DIRS = ["app", "components"]

const EXTENSIONES = new Set([".ts", ".tsx"])

const DIRS_IGNORADOS = new Set([".next", "node_modules", "playwright-report", "test-results"])

/**
 * Deuda declarada al 2026-10-25, medida con `git grep useCompassStore app components`.
 *
 * Cada entrada es un archivo que HOY lee o escribe el store para datos de dominio. Migrarlo es
 * cablearlo contra su hook de `lib/api/`; cuando eso pasa, la entrada se BORRA de acá.
 */
export const EXCEPCIONES = [
  // Paneles PE: la infraestructura ya existe (12 rutas /api/pe + lib/api/use-pe.ts con 8 hooks y
  // acciones). Falta el cableado, que es la última milla del módulo.
  { archivo: "components/pe/visitas-panel.tsx", motivo: "lecturas/escrituras de visitas; use-pe.ts listo", desde: "2026-10-25" },
  { archivo: "components/pe/encomiendas-panel.tsx", motivo: "encomiendas; useEncomiendasPE listo", desde: "2026-10-25" },
  { archivo: "components/pe/contratistas-panel.tsx", motivo: "ingresos de contratistas; useIngresosContratistasPE listo", desde: "2026-10-25" },
  // Estas tres son las excepciones justificadas históricas: operan sobre hechos del navegador y el
  // owner decidió (F9) que el módulo QA/dev se retira o aísla antes de producción.
  { archivo: "app/admin/qa-lab/page.tsx", motivo: "módulo QA/dev: se retira o aísla antes de producción (F9)", desde: "2026-10-25" },
  { archivo: "app/admin/dev-dashboard/page.tsx", motivo: "módulo QA/dev: se retira o aísla antes de producción (F9)", desde: "2026-10-25" },
  { archivo: "app/admin/mantenimiento/page.tsx", motivo: "módulo QA/dev: se retira o aísla antes de producción (F9)", desde: "2026-10-25" },
  // Resto: lecturas de dominio que todavía no tienen hook o que no se cablearon.
  { archivo: "app/finanzas/remuneraciones/page.tsx", motivo: "lecturas de PL/PE sin cablear a su hook", desde: "2026-10-25" },
  { archivo: "components/comunidad/formulario-persona.tsx", motivo: "formulario de personas sobre el store; usePersonas() existe", desde: "2026-10-25" },
  { archivo: "components/inventario/formulario-unidad.tsx", motivo: "formulario de unidades sobre el store; useUnidades() existe", desde: "2026-10-25" },
  { archivo: "components/inventario/estados-donut.tsx", motivo: "deriva estados de las unidades del store; useUnidades() existe", desde: "2026-10-25" },
  { archivo: "components/fi-espejo-bd.tsx", motivo: "espejo financiero: compara el store contra la BD", desde: "2026-10-25" },
  { archivo: "components/app-sidebar.tsx", motivo: "hidratación de sesión/rol en la navegación", desde: "2026-10-25" },
  { archivo: "components/community-header.tsx", motivo: "hidratación de la comunidad activa en el encabezado", desde: "2026-10-25" },
]

const RE_STORE = /\buseCompassStore\b/

/** Archivos fuente bajo los directorios auditados, ordenados y con "/". */
export function listarArchivos(raiz = RAIZ) {
  const salida = []
  const recorrer = (dir) => {
    let entradas
    try {
      entradas = readdirSync(dir)
    } catch {
      return
    }
    for (const entrada of entradas) {
      if (DIRS_IGNORADOS.has(entrada)) continue
      const ruta = join(dir, entrada)
      let info
      try {
        info = statSync(ruta)
      } catch {
        continue
      }
      if (info.isDirectory()) recorrer(ruta)
      else if (EXTENSIONES.has(ruta.slice(ruta.lastIndexOf(".")))) salida.push(ruta)
    }
  }
  for (const dir of DIRS) recorrer(join(raiz, dir))
  return salida.sort()
}

/**
 * Evalúa las fuentes contra la allowlist. Función pura: los tests le pasan textos en memoria.
 *
 * Devuelve `{ sinExcepcion, obsoletas }`:
 * - `sinExcepcion`: archivos que usan el store y no están declarados (el gate falla).
 * - `obsoletas`: excepciones cuyo archivo ya no usa el store (el gate también falla: la deuda
 *   saldada se borra de la lista, no se deja podrida).
 */
export function evaluar(archivos, excepciones = EXCEPCIONES) {
  const declaradas = new Set(excepciones.map((e) => e.archivo))
  const sinExcepcion = []
  const sigueUsando = new Set()

  for (const { ruta, texto } of archivos) {
    if (!RE_STORE.test(texto)) continue
    sigueUsando.add(ruta)
    if (!declaradas.has(ruta)) sinExcepcion.push(ruta)
  }

  const obsoletas = excepciones
    .map((e) => e.archivo)
    .filter((archivo) => !sigueUsando.has(archivo))

  return { sinExcepcion, obsoletas }
}

/**
 * Verifica que el número escrito en la documentación sea el real.
 *
 * El «SALDADO» de BACKLOG-100 se escribió a mano dos veces con números que la realidad desmentía.
 * El documento lleva un marcador `<!-- audit:store: archivos=N -->` y este candado falla si N no
 * es el tamaño de la allowlist: es la única forma de que nadie —tampoco el agente— declare un
 * avance que el comando no respalda.
 */
export function verificarMarcador(texto, esperado) {
  const m = texto.match(/<!--\s*audit:store:\s*archivos=(\d+)\s*-->/)
  if (!m) {
    return "falta el marcador <!-- audit:store: archivos=N --> en la documentación"
  }
  const documentado = Number(m[1])
  if (documentado !== esperado) {
    return `la documentación declara ${documentado} y la allowlist tiene ${esperado}: actualizá el número (o la allowlist)`
  }
  return null
}

function main() {
  const archivos = listarArchivos().map((absoluta) => ({
    ruta: relative(RAIZ, absoluta).split("\\").join("/"),
    texto: readFileSync(absoluta, "utf8"),
  }))

  const { sinExcepcion, obsoletas } = evaluar(archivos)
  const rutaBacklog = join(RAIZ, "../../..", "openspec", "BACKLOG-100.md")
  let driftDoc = null
  try {
    driftDoc = verificarMarcador(readFileSync(rutaBacklog, "utf8"), EXCEPCIONES.length)
  } catch {
    driftDoc = "no se pudo leer openspec/BACKLOG-100.md"
  }
  const conStore = archivos.filter((a) => RE_STORE.test(a.texto)).length

  console.log("audit:store — el store legacy no vuelve a crecer")
  console.log(`  archivos con \`useCompassStore\`: ${conStore} (allowlist: ${EXCEPCIONES.length})`)

  if (driftDoc) {
    console.log(`  ✗ documentación desactualizada: ${driftDoc}`)
  } else {
    console.log(`  ok · la documentación declara ${EXCEPCIONES.length} (coincide)`)
  }

  if (sinExcepcion.length === 0 && obsoletas.length === 0 && !driftDoc) {
    console.log("  ok · 0 hallazgos")
    console.log("\nRESUMEN: candado en verde")
    return
  }

  for (const archivo of sinExcepcion) {
    console.log(`  ✗ ${archivo} usa el store sin excepción`)
    console.log("     -> usá el hook de lib/api/use-*.ts; si falta, escribilo")
  }
  for (const archivo of obsoletas) {
    console.log(`  ✗ excepción obsoleta: ${archivo} ya no usa el store`)
    console.log("     -> borrá la entrada de EXCEPCIONES (la lista sólo se achica)")
  }
  console.log(
    `\nRESUMEN: ${sinExcepcion.length + obsoletas.length + (driftDoc ? 1 : 0)} hallazgo(s) · candado en rojo`
  )
  process.exitCode = 1
}

if (process.argv[1] && process.argv[1].endsWith("audit-store.mjs")) main()
