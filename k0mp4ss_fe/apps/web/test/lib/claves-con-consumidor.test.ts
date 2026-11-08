/**
 * @vitest-environment node
 *
 * Serie «Permisos por objeto» · T9 — la clave declarada tiene que tener puerta.
 *
 * `pl:propia` estuvo declarada en la matriz con `ver` para conserjería y
 * **ningún archivo la pedía**: el derecho existía en el papel y no había puerta
 * por donde ejercerlo. Nadie lo notó durante meses porque nada miraba ese eje.
 * Este guardia lo cierra al revés: recorre el código y exige que toda clave que
 * concede al menos una acción tenga un consumidor real, o una exención
 * declarada acá con su motivo.
 *
 * Universo de claves: `matrizPermisos()` de `lib/authz.ts` — el motor, no una
 * lista paralela. `RECURSOS_CONOCIDOS` no sirve de universo porque la lista
 * escrita a mano omite 8 claves que la matriz sí tiene (`*`, `ad`, `ct:al_dia`,
 * `ct:propia`, `ct:residencia`, `mt:tarea`, `mt:incidente`,
 * `notificaciones:propias`): un guardia que lee la lista de al lado se queda
 * ciego justo cuando la lista se olvida de la clave nueva.
 *
 * Qué cuenta como consumidor: la clave entre comillas —`"fi"`, `'fi'` o
 * `` `fi` ``— dentro de `app/**`, `components/**`, `lib/**` o
 * `packages/ui/src/**`. El delimitador es lo que impide el falso positivo de
 * prefijo: `"fi"` no se conforma con `"fi:balance"`. Los comentarios se
 * descartan antes de buscar, porque una clave **citada** en la prosa describe
 * la intención y no la puerta: `mp:propios` y `pe:contratista` se citan en
 * comentarios y hoy ninguna ruta las pide. Quedan fuera `lib/authz.ts` (es la
 * matriz, no un consumidor) y los archivos de prueba (nombran claves para
 * probar el motor).
 *
 * Si el guardia falla hay dos salidas, y ninguna es «citar la clave en un
 * comentario». T9 sólo pone el candado: no arregla la matriz ni abre rutas.
 *   · darle un consumidor o vaciarla a propósito en la matriz con su motivo, o
 *   · declarar la deuda acá con clase `hallazgo` para que quede nombrada.
 */
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { ROLES, matrizPermisos, type Rol } from "@/lib/authz"

// ─────────────────────────────────────────────────────────────────────────────
// 1 · El universo: las claves, derivadas del motor
// ─────────────────────────────────────────────────────────────────────────────

/** `apps/web` — este archivo vive en `test/lib/`. */
const APP_DIR = path.resolve(__dirname, "../..")

/** Carpetas barridas. `packages/ui/src` entra porque la UI compartida también decide permisos. */
const RAIZES = [
  path.join(APP_DIR, "app"),
  path.join(APP_DIR, "components"),
  path.join(APP_DIR, "lib"),
  path.resolve(APP_DIR, "../../packages/ui/src"),
]

/** `lib/authz.ts` ES la matriz: no puede ser consumidora de sí misma. */
const LA_MATRIZ = path.join(APP_DIR, "lib", "authz.ts")

const EXTENSIONES = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const ES_PRUEBA = /\.(?:test|spec)\.[^./\\]+$/
const CARPETAS_IGNORADAS = new Set([
  "node_modules",
  ".next",
  "coverage",
  "dist",
])

interface ClaveDeLaMatriz {
  readonly clave: string
  /** Roles que le conceden al menos una acción. Vacío = no concede nada a nadie. */
  readonly concesores: readonly Rol[]
}

/**
 * Las claves de la matriz con los roles que les conceden algo, derivadas de
 * `matrizPermisos()` (nunca de una lista escrita a mano acá: el guardia no
 * puede desincronizarse del motor).
 */
function clavesDeLaMatriz(): ClaveDeLaMatriz[] {
  const snapshot = matrizPermisos()
  const concesores = new Map<string, Rol[]>()
  for (const rol of ROLES) {
    for (const entrada of snapshot[rol]) {
      const actuales = concesores.get(entrada.recurso) ?? []
      if (entrada.acciones.length > 0) actuales.push(rol)
      concesores.set(entrada.recurso, actuales)
    }
  }
  return [...concesores.entries()]
    .map(([clave, roles]) => ({ clave, concesores: roles }))
    .sort((a, b) => a.clave.localeCompare(b.clave))
}

const CLAVES = clavesDeLaMatriz()
const CONOCIDAS = new Set(CLAVES.map((clave) => clave.clave))

/** Claves que conceden al menos una acción a algún rol: las que exigen consumidor. */
const CLAVES_CON_ACCIONES = CLAVES.filter(
  (clave) => clave.concesores.length > 0
)
/** Claves que no conceden nada a nadie: sólo pueden ser un corte de fallback declarado. */
const CLAVES_SIN_ACCIONES = CLAVES.filter(
  (clave) => clave.concesores.length === 0
)

// ─────────────────────────────────────────────────────────────────────────────
// 2 · El barrido: qué archivo consume qué clave
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Descarta comentarios —de línea y de bloque— conservando el código y las
 * cadenas. Es lo que separa «la clave se cita» de «la clave se ejecuta»: sin
 * esto, `mp:propios` y `pe:contratista` pasarían por consumidas porque la prosa
 * de las rutas las nombra, y el guardia tendría un agujero silencioso.
 */
function quitarComentarios(fuente: string): string {
  const salida: string[] = []
  let estado: "codigo" | "linea" | "bloque" | "cadena" = "codigo"
  let comilla = ""
  let indice = 0
  while (indice < fuente.length) {
    const caracter = fuente[indice] as string
    const siguiente = fuente[indice + 1]
    if (estado === "linea") {
      // Comentario de línea: se tira hasta el salto, que se conserva.
      if (caracter === "\n") {
        estado = "codigo"
        salida.push(caracter)
      }
      indice += 1
      continue
    }
    if (estado === "bloque") {
      if (caracter === "*" && siguiente === "/") {
        estado = "codigo"
        indice += 2
        salida.push(" ")
        continue
      }
      if (caracter === "\n") salida.push(caracter)
      indice += 1
      continue
    }
    if (estado === "cadena") {
      salida.push(caracter)
      if (caracter === "\\") {
        const escapado = fuente[indice + 1]
        if (escapado !== undefined) {
          salida.push(escapado)
          indice += 2
          continue
        }
      }
      if (caracter === comilla) estado = "codigo"
      indice += 1
      continue
    }
    if (caracter === "/" && siguiente === "/") {
      estado = "linea"
      indice += 2
      continue
    }
    if (caracter === "/" && siguiente === "*") {
      estado = "bloque"
      indice += 2
      continue
    }
    // Comilla de apertura. El apóstrofo de «don't» en texto JSX no abre cadena:
    // sólo cuenta cuando no está pegado a una letra.
    const anterior = indice === 0 ? "" : (fuente[indice - 1] as string)
    const esComilla =
      caracter === '"' ||
      caracter === "`" ||
      (caracter === "'" && !/[A-Za-z0-9_]/.test(anterior))
    if (esComilla) {
      estado = "cadena"
      comilla = caracter
      salida.push(caracter)
      indice += 1
      continue
    }
    salida.push(caracter)
    indice += 1
  }
  return salida.join("")
}

/** Token de recurso entre comillas: `"fi"`, `'fi:balance'`, `` `pe:visita` ``. */
const CITAS = /["'`]([a-z][a-z0-9_]*(?::[a-z0-9_]+)*)["'`]/g

/**
 * Claves de la matriz citadas como literal entre comillas en `fuente`, sin
 * contar las que sólo aparecen en un comentario.
 */
function clavesConsumidasEn(fuente: string): string[] {
  const encontradas: string[] = []
  for (const coincidencia of quitarComentarios(fuente).matchAll(CITAS)) {
    const clave = coincidencia[1]
    if (clave !== undefined && CONOCIDAS.has(clave)) encontradas.push(clave)
  }
  return encontradas
}

/** Recorre `dir` y devuelve las rutas absolutas de los archivos de código. */
function archivosFuente(dir: string, acumulado: string[] = []): string[] {
  let entradas
  try {
    entradas = readdirSync(dir, { withFileTypes: true })
  } catch {
    return acumulado
  }
  for (const entrada of entradas) {
    const completo = path.join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (CARPETAS_IGNORADAS.has(entrada.name)) continue
      archivosFuente(completo, acumulado)
    } else if (EXTENSIONES.test(entrada.name)) {
      acumulado.push(completo)
    }
  }
  return acumulado
}

/** Ruta relativa a `apps/web`, con `/`, para que los mensajes sean estables entre sistemas. */
function relativa(archivo: string): string {
  return path.relative(APP_DIR, archivo).split(path.sep).join("/")
}

const ARCHIVOS_ESCANEADOS = RAIZES.flatMap((raiz) => archivosFuente(raiz))
  .filter((archivo) => archivo !== LA_MATRIZ && !ES_PRUEBA.test(archivo))
  .map(relativa)
  .sort()

/** clave → archivos que la consumen, en orden de barrido. */
const CONSUMIDORES = new Map<string, string[]>()
for (const archivo of ARCHIVOS_ESCANEADOS) {
  const fuente = readFileSync(path.join(APP_DIR, archivo), "utf8")
  for (const clave of new Set(clavesConsumidasEn(fuente))) {
    const yaVistos = CONSUMIDORES.get(clave) ?? []
    yaVistos.push(archivo)
    CONSUMIDORES.set(clave, yaVistos)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Las exenciones declaradas (con motivo obligatorio)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tres clases, y ninguna muda:
 *   · `vacia-a-proposito` — la clave existe sólo para cortar el fallback de
 *     prefijo de `puede()`; no concede nada y por eso no puede tener consumidor.
 *   · `indirecta` — tiene consumidor, pero fuera del barrido; `mecanismo` dice
 *     dónde (obligatorio: una «indirecta» sin mecanismo es una exención muda).
 *   · `hallazgo` — concede acciones y nadie la pide: la deuda queda declarada,
 *     no resuelta. T9 no la arregla.
 */
type Exencion =
  | {
      readonly clave: string
      readonly clase: "vacia-a-proposito"
      readonly motivo: string
    }
  | {
      readonly clave: string
      readonly clase: "indirecta"
      readonly mecanismo: string
      readonly motivo: string
    }
  | {
      readonly clave: string
      readonly clase: "hallazgo"
      readonly motivo: string
    }

/** Motivo exacto de una deuda pendiente: se puede contar con un grep. */
const MOTIVO_PENDIENTE =
  "hallazgo: declarada y sin consumidor, decisión pendiente"

const EXENCIONES: readonly Exencion[] = [
  // ── Vaciadas por D1 (2026-11-07): concedían acciones y nadie las pedía ────
  // Son las 7 que el guardián contaba como «declarada y sin consumidor». No se
  // borran: se vacían, porque borrar la entrada devolvería la concesión por el
  // fallback de prefijo. El motivo dice por qué la capacidad no existe o sobra.
  {
    clave: "fi:balance",
    clase: "vacia-a-proposito",
    motivo:
      "redundante: el comité ya tiene `fi` ver, que es la capacidad real. No existe una pantalla de balance que pida esta clave.",
  },
  {
    clave: "ct:historial",
    clase: "vacia-a-proposito",
    motivo:
      "redundante: el comité ya tiene `ct` ver. No hay pantalla de historial de certificados; el detalle se lee con `ct`.",
  },
  {
    clave: "ct:propia",
    clase: "vacia-a-proposito",
    motivo:
      "sin superficie: el certificado de la unidad vinculada del staff no tiene ruta ni pantalla. El residente conserva `ct:propio`, `ct:residencia` y `ct:al_dia`.",
  },
  {
    clave: "mt:tarea",
    clase: "vacia-a-proposito",
    motivo:
      "redundante: mantención ya tiene `mt` completo (ver/crear/editar/ejecutar); esta clave no agregaba ninguna acción.",
  },
  {
    clave: "mt:incidente",
    clase: "vacia-a-proposito",
    motivo:
      "redundante: se resuelve con `mt` crear, que mantención ya tiene.",
  },
  {
    clave: "pe:reporte_diario",
    clase: "vacia-a-proposito",
    motivo:
      "sin superficie: el reporte diario PE nunca se construyó (los `reportes-re/*` piden `re`). Corta el fallback hacia `pe` de conserjería.",
  },
  {
    clave: "re:reporte_diario",
    clase: "vacia-a-proposito",
    motivo:
      "redundante: conserjería ya tiene `re` ver para el centro de mando y los reportes.",
  },
  // ── Vacías a propósito: existen para cortar el fallback de prefijo ────────
  {
    clave: "co:lecturas",
    clase: "vacia-a-proposito",
    motivo:
      "corta el fallback de prefijo de `co` para comité y residente: el desglose nominativo de quién leyó cada comunicación es de administración.",
  },
  {
    clave: "pe:evaluacion",
    clase: "vacia-a-proposito",
    motivo:
      "corta el fallback hacia el `pe` (ver/crear/editar) de comité, conserjería y mantención: registrar la evaluación de desempeño es del administrador.",
  },
  {
    clave: "pe:ficha",
    clase: "vacia-a-proposito",
    motivo:
      "corta el fallback hacia el `pe` de comité, conserjería y mantención: el dato previsional y bancario del trabajador es de administración.",
  },
  {
    clave: "pe:proyeccion:enviar",
    clase: "vacia-a-proposito",
    motivo:
      "corta el fallback hacia `pe:proyeccion` de conserjería y mantención: enviar la proyección a Finanzas materializa un costo en FI y es acto financiero de administración.",
  },
  {
    clave: "pl",
    clase: "vacia-a-proposito",
    motivo:
      "corta el fallback de prefijo hacia `pl:propia` y `pl:adelantos`: conserjería no ve la liquidación de toda la comunidad, sólo la propia, y no hay auto-servicio de adelantos.",
  },

  // ── Consumida de forma indirecta ────────────────────────────────────────
  {
    clave: "*",
    clase: "indirecta",
    mecanismo:
      "rama wildcard de `puede()` en lib/authz.ts, archivo excluido del barrido",
    motivo:
      "no es una clave de recurso: es el comodín del administrador y se consume en el motor, no en una ruta. El administrador pasa por esa rama antes de que la matriz se mire.",
  },

  // ── Hallazgos: declaradas con acciones y sin puerta ───────────────────────
  // T9 no las arregla: las deja nombradas para que la decisión sea explícita.
  // Cuando alguna gane consumidor, el caso de `hallazgo` de abajo lo va a pedir.
  // `ct:al_dia` y `ct:residencia` salieron de esta lista en F34: la emisión por
  // tipología las consume en `app/api/certificados-ct/route.ts`. `ct:propio` sigue
  // acá: no hay tipología que la pida (su certificado propio se emite con
  // `ct:residencia` o no se emite).
  { clave: "ct:propio", clase: "hallazgo", motivo: MOTIVO_PENDIENTE },
  { clave: "ir:interno", clase: "hallazgo", motivo: MOTIVO_PENDIENTE },
  { clave: "mp:morosidad", clase: "hallazgo", motivo: MOTIVO_PENDIENTE },
  { clave: "mp:propios", clase: "hallazgo", motivo: MOTIVO_PENDIENTE },
  { clave: "pe:contratista", clase: "hallazgo", motivo: MOTIVO_PENDIENTE },
  { clave: "pe:visita", clase: "hallazgo", motivo: MOTIVO_PENDIENTE },
]

const DECLARADAS = new Set(EXENCIONES.map((exencion) => exencion.clave))
const DECLARADAS_VACIAS = new Set(
  EXENCIONES.filter((exencion) => exencion.clase === "vacia-a-proposito").map(
    (exencion) => exencion.clave
  )
)

function concesoresDe(clave: string): readonly Rol[] {
  return CLAVES.find((candidata) => candidata.clave === clave)?.concesores ?? []
}

/** Claves que conceden acciones y ninguna línea de código las pide. */
function clavesSinConsumidor(): ClaveDeLaMatriz[] {
  return CLAVES_CON_ACCIONES.filter((clave) => !CONSUMIDORES.has(clave.clave))
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Las guardas
// ─────────────────────────────────────────────────────────────────────────────

function mensajeClavesSinPuerta(claves: readonly ClaveDeLaMatriz[]): string {
  return [
    "Clave de la matriz con acciones concedidas y sin consumidor en el código.",
    "Es el caso de `pl:propia`: el derecho existía en el papel y no había puerta.",
    ...claves.map(
      (clave) =>
        `  - ${clave.clave} — la conceden: ${clave.concesores.join(", ")}`
    ),
    "",
    "Para cada una: darle un consumidor o vaciarla a propósito en la matriz con su motivo.",
    "  · consumidor = `puede(...)`/`puedeContextual(...)` en una ruta, `tienePermiso`/`puedeVer` en una pantalla,",
    "    o un `_alcance.ts` que la cite en código (una cita en un comentario no cuenta);",
    "  · si sólo corta el fallback de prefijo, declararla acá con clase `vacia-a-proposito`;",
    `  · si la decisión sigue pendiente, clase \`hallazgo\` con el motivo "${MOTIVO_PENDIENTE}".`,
  ].join("\n")
}

function mensajeClavesVaciasSinDeclarar(
  claves: readonly ClaveDeLaMatriz[]
): string {
  return [
    "Clave de la matriz que no concede ninguna acción a ningún rol y no está declarada.",
    "Una clave vacía sólo se sostiene por dos motivos, y los dos se escriben:",
    "  · corta el fallback de prefijo de `puede()` (clase `vacia-a-proposito` con su motivo), o",
    "  · sobra en la matriz y se borra.",
    ...claves.map((clave) => `  - ${clave.clave}`),
  ].join("\n")
}

function mensajeExencionesHuerfanas(huerfanas: readonly Exencion[]): string {
  return [
    "EXENCIONES nombra claves que la matriz ya no tiene.",
    "Una entrada muerta tapa el hueco que dejó la clave siguiente: si la clave se",
    "renombró, la nueva ya la tiene que pedir la guarda de arriba.",
    ...huerfanas.map((exencion) => `  - ${exencion.clave} (${exencion.clase})`),
    "",
    "Borrá esas entradas de EXENCIONES en test/lib/claves-con-consumidor.test.ts.",
  ].join("\n")
}

describe("T9 — el barrido de consumidores", () => {
  it("cuenta la clave entre comillas y descarta la cita en un comentario", () => {
    expect(clavesConsumidasEn('const RECURSO_PL_PROPIA = "pl:propia"')).toEqual(
      ["pl:propia"]
    )
    expect(clavesConsumidasEn('puede(rol, "ver", "fi")')).toEqual(["fi"])
    expect(clavesConsumidasEn("// `pe:contratista` es del residente")).toEqual(
      []
    )
    expect(clavesConsumidasEn('/**\n * "mp:propios" — ABAC\n */')).toEqual([])
    expect(
      clavesConsumidasEn('const u = "https://x/y" // "ct:propio"')
    ).toEqual([])
    // El delimitador evita el falso positivo de prefijo: pedir la granular no
    // consume la base, y al revés tampoco.
    expect(clavesConsumidasEn('"fi:balance"')).not.toContain("fi")
    expect(clavesConsumidasEn('"fi"')).not.toContain("fi:balance")
  })

  it("el barrido ve archivos y consumidores reales (un guardia ciego no vigila nada)", () => {
    expect(ARCHIVOS_ESCANEADOS.length).toBeGreaterThan(300)
    expect(ARCHIVOS_ESCANEADOS).toContain("app/api/liquidaciones/route.ts")
    expect(ARCHIVOS_ESCANEADOS).toContain("components/dashboard/perfiles.ts")
    // Fuera: la matriz y las pruebas, que nombran claves sin ser una puerta.
    expect(ARCHIVOS_ESCANEADOS).not.toContain("lib/authz.ts")
    expect(
      ARCHIVOS_ESCANEADOS.filter((archivo) => ES_PRUEBA.test(archivo))
    ).toEqual([])
    // Anclas de consumidor: si el barrido se rompe, se cae acá y no pasa vacío.
    expect(CONSUMIDORES.get("pl:propia")).toContain(
      "app/api/liquidaciones/_alcance.ts"
    )
    expect(CONSUMIDORES.get("in:apelar")).toContain(
      "app/api/in/infracciones/_acciones.ts"
    )
    expect(CONSUMIDORES.get("fi:aviso:propio")).toContain(
      "app/api/avisos-cobro/_alcance.ts"
    )
  })

  it("la matriz se lee del motor: ninguna clave se declara acá a mano", () => {
    // El universo sale de `matrizPermisos()`, así que incluye el comodín del
    // administrador: ninguna lista escrita a mano lo repite.
    expect(CONOCIDAS.has("*")).toBe(true)
    expect(CLAVES.length).toBeGreaterThan(50)
    // Una entrada por clave: el recorrido de roles no duplica filas.
    expect(new Set(CLAVES.map((clave) => clave.clave)).size).toBe(CLAVES.length)
  })
})

describe("T9 — la clave declarada tiene que tener puerta", () => {
  it("toda clave que concede una acción tiene consumidor o exención con motivo", () => {
    const sinPuerta = clavesSinConsumidor().filter(
      (clave) => !DECLARADAS.has(clave.clave)
    )
    if (sinPuerta.length > 0) throw new Error(mensajeClavesSinPuerta(sinPuerta))
    expect(sinPuerta).toEqual([])
  })

  it("toda clave vacía en todos los roles está declarada vacía a propósito", () => {
    const sinDeclarar = CLAVES_SIN_ACCIONES.filter(
      (clave) => !DECLARADAS_VACIAS.has(clave.clave)
    )
    if (sinDeclarar.length > 0)
      throw new Error(mensajeClavesVaciasSinDeclarar(sinDeclarar))
    expect(sinDeclarar).toEqual([])
  })

  it("una clave declarada vacía a propósito de verdad no concede nada", () => {
    const mentirosas = [...DECLARADAS_VACIAS].filter(
      (clave) => concesoresDe(clave).length > 0
    )
    if (mentirosas.length > 0) {
      throw new Error(
        [
          "EXENCIONES declara vacía una clave que ya concede acciones: el motivo quedó viejo.",
          ...mentirosas.map(
            (clave) =>
              `  - ${clave} — la conceden: ${concesoresDe(clave).join(", ")}`
          ),
          "",
          "Sacala de `vacia-a-proposito`; si sigue sin consumidor, la guarda de arriba la va a nombrar.",
        ].join("\n")
      )
    }
    expect(mentirosas).toEqual([])
  })
})

describe("T9 — la lista de exenciones no se pudre", () => {
  it("ninguna clave está declarada dos veces", () => {
    const declaradas = EXENCIONES.map((exencion) => exencion.clave)
    const repetidas = declaradas.filter(
      (clave, indice) => declaradas.indexOf(clave) !== indice
    )
    expect(repetidas).toEqual([])
  })

  it("ninguna exención nombra una clave que la matriz ya no tiene", () => {
    const huerfanas = EXENCIONES.filter(
      (exencion) => !CONOCIDAS.has(exencion.clave)
    )
    if (huerfanas.length > 0)
      throw new Error(mensajeExencionesHuerfanas(huerfanas))
    expect(huerfanas.map((exencion) => exencion.clave)).toEqual([])
  })

  it("toda exención trae motivo, y toda `indirecta` nombra su mecanismo", () => {
    const mudas = EXENCIONES.filter(
      (exencion) => exencion.motivo.trim().length === 0
    )
    const sinMecanismo = EXENCIONES.filter(
      (exencion) =>
        exencion.clase === "indirecta" && exencion.mecanismo.trim().length === 0
    )
    if (mudas.length > 0 || sinMecanismo.length > 0) {
      throw new Error(
        [
          "Una exención sin motivo (o sin mecanismo, si es `indirecta`) es un agujero silencioso:",
          ...mudas.map((exencion) => `  - ${exencion.clave}: sin motivo`),
          ...sinMecanismo.map(
            (exencion) => `  - ${exencion.clave}: \`indirecta\` sin mecanismo`
          ),
        ].join("\n")
      )
    }
    expect(mudas.map((exencion) => exencion.clave)).toEqual([])
    expect(sinMecanismo.map((exencion) => exencion.clave)).toEqual([])
  })

  it("cada `hallazgo` sigue sin consumidor y declara la deuda con el motivo exacto", () => {
    const hallazgos = EXENCIONES.filter(
      (exencion) => exencion.clase === "hallazgo"
    )
    // Si apareció la puerta, la deuda está cerrada y la exención sobra: que lo diga.
    const yaResueltos = hallazgos.filter((exencion) =>
      CONSUMIDORES.has(exencion.clave)
    )
    if (yaResueltos.length > 0) {
      throw new Error(
        [
          "Estas claves ya tienen consumidor: el hallazgo está cerrado y la exención sobra.",
          ...yaResueltos.map(
            (exencion) =>
              `  - ${exencion.clave} — la consumen: ${(CONSUMIDORES.get(exencion.clave) ?? []).join(", ")}`
          ),
          "",
          "Borrálas de EXENCIONES en test/lib/claves-con-consumidor.test.ts.",
        ].join("\n")
      )
    }
    expect(yaResueltos.map((exencion) => exencion.clave)).toEqual([])
    // La deuda se cuenta con grep: el motivo tiene el prefijo `hallazgo:`.
    expect(
      hallazgos
        .filter((exencion) => !exencion.motivo.startsWith("hallazgo:"))
        .map((exencion) => exencion.clave)
    ).toEqual([])
  })
})
