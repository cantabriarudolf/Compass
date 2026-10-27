#!/usr/bin/env node
/**
 * smoke:produccion — chequeo mínimo contra la app publicada (SG deploy).
 *
 * Por qué existe: nadie revisa la app publicada — el job `deploy` de CI
 * despliega y termina sin comprobar que responde. Este smoke corre justo
 * después del deploy (job `deploy` de .github/workflows/ci.yml) contra la
 * `deploy_url` capturada de `vercel deploy`, y deja el job en rojo si algo
 * no responde como corresponde. También sirve a mano:
 *
 *   npm run smoke:produccion -- https://la-app.vercel.app
 *   SMOKE_URL=https://la-app.vercel.app npm run smoke:produccion
 *   npm run smoke:produccion -- https://la-app.vercel.app --esperar 60
 *
 * Qué verifica (fetch nativo, sin dependencias, timeout ~15 s por request):
 *   1. GET /api/health                        → 200, status "ok", checks.database "ok"
 *   2. GET /ingresar                          → 200 y contiene un campo de correo (type="email")
 *   3. GET /privacidad                        → 200
 *   4. GET /api/importar/estructura/plantilla → 401 (el candado sigue puesto:
 *      si devuelve 200 es que se abrió algo que no debe)
 *
 * `--esperar N` reintenta por hasta N segundos (p. ej. cuando el deploy
 * recién acaba y la URL aún no termina de propagar). Sale `exit 1` con el
 * detalle de cada chequeo fallido.
 */
const TIMEOUT_MS = 15_000
const INTERVALO_MS = 5_000

/* ---------- argumentos ---------- */

const argv = process.argv.slice(2)
let esperarSegundos = 0
let urlBase = null

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  if (arg === "--esperar") {
    esperarSegundos = Number.parseInt(argv[++i] ?? "", 10)
    if (Number.isNaN(esperarSegundos) || esperarSegundos < 0) {
      console.error("smoke:produccion — --esperar necesita un número de segundos (ej: --esperar 60)")
      process.exit(2)
    }
  } else if (arg === "--help" || arg === "-h") {
    console.log(
      "smoke:produccion — chequeo contra la app publicada\n\n" +
        "  npm run smoke:produccion -- https://<url> [--esperar 60]\n",
    )
    process.exit(0)
  } else if (!arg.startsWith("--")) {
    urlBase = arg
  } else {
    console.error(`smoke:produccion — argumento desconocido: ${arg}`)
    process.exit(2)
  }
}
// eslint-disable-next-line turbo/no-undeclared-env-vars -- SMOKE_URL es parámetro de invocación de este CLI (y del job deploy de CI), no una env de tareas turbo
urlBase ??= process.env.SMOKE_URL?.trim()
if (!urlBase) {
  console.error("smoke:produccion — falta la URL: pasala como argumento o setea SMOKE_URL.\nej: npm run smoke:produccion -- https://la-app.vercel.app")
  process.exit(2)
}
const base = urlBase.replace(/\/+$/, "")

/* ---------- chequeos ---------- */

const CHEQUEOS = [
  {
    id: "health",
    ruta: "/api/health",
    esperado: "200 + {status:\"ok\", checks.database:\"ok\"}",
    validar: async (res) => {
      const cuerpo = await res.text()
      let json
      try {
        json = JSON.parse(cuerpo)
      } catch {
        return `status ${res.status} pero el cuerpo no es JSON: ${cuerpo.slice(0, 120)}`
      }
      if (res.status !== 200) return `esperaba 200, llegó ${res.status}`
      if (json.status !== "ok") return `esperaba status "ok", llegó ${JSON.stringify(json.status)}`
      if (json.checks?.database !== "ok") {
        return `esperaba checks.database "ok", llegó ${JSON.stringify(json.checks?.database)}`
      }
      return null
    },
  },
  {
    id: "ingresar",
    ruta: "/ingresar",
    esperado: "200 y la página incluye un campo de correo (type=\"email\")",
    validar: async (res) => {
      const cuerpo = await res.text()
      if (res.status !== 200) return `esperaba 200 con la página de ingresar, llegó ${res.status}`
      if (!/type="email"/.test(cuerpo)) return "la página llegó 200 pero no incluye un campo de correo (type=\"email\")"
      return null
    },
  },
  {
    id: "privacidad",
    ruta: "/privacidad",
    esperado: "200",
    validar: async (res) => (res.status === 200 ? null : `esperaba 200, llegó ${res.status}`),
  },
  {
    id: "candado-plantilla",
    ruta: "/api/importar/estructura/plantilla",
    esperado: "401 (el candado sigue puesto)",
    validar: async (res) => {
      if (res.status === 200) return "¡candado abierto! servía la plantilla sin sesión (200) — revisar authz de la ruta"
      return res.status === 401 ? null : `esperaba 401, llegó ${res.status}`
    },
  },
]

async function pedir(url) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" })
  } catch (err) {
    const detalle = detalleSinRespuesta(err)
    throw new Error(`sin respuesta: ${detalle}`)
  }
}

function detalleSinRespuesta(err) {
  if (!(err instanceof Error)) return String(err)
  if (err.name === "TimeoutError") return `timeout de ${TIMEOUT_MS / 1000} s sin respuesta`
  return err.message
}

async function pedirConDetalle(url, validar) {
  try {
    const res = await pedir(url)
    return validar(res)
  } catch (err) {
    return err instanceof Error ? `sin respuesta: ${err.message}` : String(err)
  }
}

async function correrChequeos() {
  const resultados = []
  for (const c of CHEQUEOS) {
    const url = `${base}${c.ruta}`
    const fallo = await pedirConDetalle(url, async (res) => c.validar(res))
    resultados.push({ id: c.id, ruta: c.ruta, esperado: c.esperado, url, fallo })
  }
  return resultados
}

/* ---------- corrida (con reintento opcional) ---------- */

const deadline = Date.now() + esperarSegundos * 1000
let resultados = await correrChequeos()
while (resultados.some((r) => r.fallo) && Date.now() < deadline) {
  console.log(`Algunos chequeos fallaron — reintento en ${INTERVALO_MS / 1000} s (espera total: ${esperarSegundos} s)…`)
  await new Promise((r) => setTimeout(r, INTERVALO_MS))
  resultados = await correrChequeos()
}

/* ---------- resumen ---------- */

const exitosos = resultados.filter((r) => !r.fallo)
const fallidos = resultados.filter((r) => r.fallo)
for (const r of resultados) {
  const marca = r.fallo ? "✘" : "✔"
  console.log(` ${marca} ${r.ruta.padEnd(40)} ${r.fallo ? r.fallo : `OK — ${r.esperado}`}`)
}
console.log("\nResumen: " + `${exitosos.length}/${resultados.length} chequeos OK`)
if (fallidos.length > 0) {
  console.error(`\nsmoke:produccion FALLÓ contra ${base}:`)
  for (const f of fallidos) console.error(`  ✘ ${f.url}\n    esperaba: ${f.esperado}\n    detalle:  ${f.fallo}`)
  process.exit(1)
}
console.log(`App publicada en ${base} responde como corresponde. ✅`)
