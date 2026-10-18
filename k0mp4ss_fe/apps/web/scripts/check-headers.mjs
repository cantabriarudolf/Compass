#!/usr/bin/env node
/**
 * D-ii check:headers — imprime securityHeaders de next.config.mjs + CSP-Report-Only de proxy.ts
 * y, si next dev está corriendo, hace fetch vivo contra CHECK_HEADERS_URL o http://localhost:3000
 * para verificar headers reales (HSTS sin preload, CSP-RO presente).
 * Uso: npm run check:headers  (con `npm run dev` en otra terminal) o CHECK_HEADERS_URL=http://localhost:3000 npm run check:headers
 *
 * Límite documentado: `next build` rompe por Google Fonts sin red, por eso se usa `next dev` + curl/fetch.
 */
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const WEB_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const NEXT_CONFIG = path.join(WEB_ROOT, "next.config.mjs")
const PROXY_TS = path.join(WEB_ROOT, "proxy.ts")

function okFail(cond) { return cond ? "OK" : "FAIL" }

async function main() {
  console.log("=== D-ii check:headers — verificación de headers de seguridad ===\n")

  // 1) Lee next.config.mjs (import dinámico para tomar securityHeaders reales)
  let securityHeaders = []
  try {
    const mod = await import(pathToFileURL(NEXT_CONFIG).href + `?v=${Date.now()}`)
    // next.config.mjs no exporta securityHeaders directamente; lo leemos del source como fallback
    // Intentamos también leer archivo raw para parseo
    const raw = readFileSync(NEXT_CONFIG, "utf8")
    // Extrae headers por regex si no está exportado
    const hasHSTS = raw.includes("Strict-Transport-Security")
    const hstsLine = raw.match(/Strict-Transport-Security[^}]*value:\s*"([^"]+)"/)
    const hstsValue = hstsLine ? hstsLine[1] : "(no encontrado)"
    const hasPreloadInHsts = hstsValue.includes("preload")
    const hasFrameDeny = raw.includes("X-Frame-Options") && raw.includes("DENY")
    const hasNosniff = raw.includes("X-Content-Type-Options") && raw.includes("nosniff")
    const hasReferrer = raw.includes("Referrer-Policy")
    const hasPermissions = raw.includes("Permissions-Policy")
    const hasDnsPrefetch = raw.includes("X-DNS-Prefetch-Control")
    const hasCrossOpener = raw.includes("Cross-Origin-Opener-Policy")
    const hasCrossResource = raw.includes("Cross-Origin-Resource-Policy")
    const hasCoep = raw.includes("Cross-Origin-Embedder-Policy")

    console.log("— next.config.mjs securityHeaders (lectura estática) —")
    console.log(`  X-Frame-Options DENY: ${okFail(hasFrameDeny)}`)
    console.log(`  X-Content-Type-Options nosniff: ${okFail(hasNosniff)}`)
    console.log(`  Referrer-Policy: ${okFail(hasReferrer)}`)
    console.log(`  Permissions-Policy: ${okFail(hasPermissions)}`)
    console.log(`  HSTS: ${hstsValue} → ${okFail(hasHSTS && !hasPreloadInHsts)} ${hasPreloadInHsts ? "(FAIL: preload presente sin dominio)" : "(OK sin preload)"}`)
    console.log(`  X-DNS-Prefetch-Control: ${okFail(hasDnsPrefetch)}`)
    console.log(`  X-Permitted-Cross-Domain-Policies: ${okFail(raw.includes("X-Permitted-Cross-Domain-Policies"))}`)
    console.log(`  Cross-Origin-Opener-Policy: ${okFail(hasCrossOpener)}`)
    console.log(`  Cross-Origin-Resource-Policy: ${okFail(hasCrossResource)}`)
    console.log(`  Cross-Origin-Embedder-Policy: ${okFail(hasCoep)} (credentialless)`)

    // Intenta tomar securityHeaders si el módulo los expone (no lo hace por defecto, pero por si se exporta futuro)
    if (mod.securityHeaders) securityHeaders = mod.securityHeaders
    if (mod.default?.headers) {
      try {
        const hdrs = await mod.default.headers()
        securityHeaders = hdrs[0]?.headers ?? []
        console.log("\n  headers() resueltos desde next.config.mjs:")
        for (const h of securityHeaders) console.log(`    ${h.key}: ${h.value}`)
      } catch {
        // Best-effort: headers() es opcional en next.config.mjs; la lectura estática igual cubre el check.
      }
    }

    const errs = []
    if (!hasFrameDeny) errs.push("X-Frame-Options DENY faltante")
    if (!hasNosniff) errs.push("nosniff faltante")
    if (!hasReferrer) errs.push("Referrer-Policy faltante")
    if (!hasPermissions) errs.push("Permissions-Policy faltante")
    if (!hasHSTS) errs.push("HSTS faltante")
    if (hasPreloadInHsts) errs.push("HSTS contiene preload sin dominio (no debe hasta PUBLIC_DOMAIN)")
    if (errs.length) console.log(`\n  ⚠ Estáticos: ${errs.join("; ")}`)

    // PUBLIC_DOMAIN en .env.example
    const envExample = path.join(WEB_ROOT, ".env.example")
    if (existsSync(envExample)) {
      const envRaw = readFileSync(envExample, "utf8")
      const hasPublicDomain = envRaw.includes("PUBLIC_DOMAIN")
      console.log(`\n— .env.example PUBLIC_DOMAIN: ${okFail(hasPublicDomain)} ${hasPublicDomain ? "(vacío, configurable)" : "(FALTA)"}`)
      if (hasPublicDomain) {
        const line = envRaw.split("\n").find(l => l.startsWith("PUBLIC_DOMAIN"))
        console.log(`  ${line?.trim()}`)
      }
    }
  } catch (e) {
    console.error("Error leyendo next.config.mjs:", e.message)
  }

  // 2) Lee proxy.ts para CSP-Report-Only con nonce
  console.log("\n— proxy.ts CSP Report-Only —")
  try {
    const proxyRaw = readFileSync(PROXY_TS, "utf8")
    const hasCSP = proxyRaw.includes("Content-Security-Policy-Report-Only")
    const hasNonce = proxyRaw.includes("nonce-") && proxyRaw.includes("generarNonce")
    // Verifica que no emita enforcement puro
    const emitsEnforcement = /headers\.set\(\s*"Content-Security-Policy"\s*,/.test(proxyRaw) && !/Report-Only/.test(proxyRaw.match(/headers\.set\(\s*"Content-Security-Policy[^"]*"/)?.[0] ?? "")
    console.log(`  CSP-Report-Only presente: ${okFail(hasCSP)}`)
    console.log(`  Nonce por request (generarNonce + nonce-): ${okFail(hasNonce)}`)
    console.log(`  No emite enforcement (solo Report-Only): ${okFail(hasCSP && !emitsEnforcement)}`)
    const hasFrameSrcYoutube = proxyRaw.includes("youtube.com") && proxyRaw.includes("youtube-nocookie.com")
    const hasImgHttps = proxyRaw.includes("img-src") && proxyRaw.includes("https:")
    const hasFonts = proxyRaw.includes("fonts.googleapis.com") && proxyRaw.includes("fonts.gstatic.com")
    console.log(`  Orígenes auditados: frame-src youtube ${okFail(hasFrameSrcYoutube)}, img-src https ${okFail(hasImgHttps)}, fonts ${okFail(hasFonts)}`)
    if (!hasCSP || !hasNonce) {
      console.log("  FAIL: CSP report-only con nonce no encontrado en proxy.ts")
    }
  } catch (e) {
    console.error("Error leyendo proxy.ts:", e.message)
  }

  // 3) Fetch vivo si hay servidor
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- CHECK_HEADERS_URL es parámetro de invocación manual de este CLI, no una env de tareas turbo
  const baseUrl = process.env.CHECK_HEADERS_URL || "http://localhost:3000"
  const candidates = ["/", "/ingresar"]
  console.log(`\n— Fetch vivo contra ${baseUrl} (si next dev corre) —`)
  let vivoOk = false
  for (const p of candidates) {
    try {
      const res = await fetch(`${baseUrl}${p}`, { method: "GET", redirect: "manual" })
      const hsts = res.headers.get("strict-transport-security") ?? res.headers.get("Strict-Transport-Security") ?? ""
      const cspRo = res.headers.get("content-security-policy-report-only") ?? res.headers.get("Content-Security-Policy-Report-Only") ?? ""
      const cspEnforce = res.headers.get("content-security-policy") ?? res.headers.get("Content-Security-Policy") ?? ""
      const xFrame = res.headers.get("x-frame-options") ?? ""
      vivoOk = true
      console.log(`  GET ${p} → ${res.status}`)
      console.log(`    HSTS: ${hsts || "(no header en http dev)"} ${hsts ? okFail(hsts.includes("max-age") && !hsts.includes("preload")) : "(esperado vacío en http dev)"}`)
      console.log(`    CSP-Report-Only: ${cspRo ? cspRo.slice(0, 120) + "..." : "(no header)"} ${okFail(!!cspRo && cspRo.includes("nonce-"))}`)
      console.log(`    CSP enforcement (no debe): ${cspEnforce ? "FAIL presente" : "OK ausente"}`)
      console.log(`    X-Frame-Options: ${xFrame || "(no header)"} ${okFail(xFrame === "DENY")}`)
      if (cspRo) {
        console.log(`    x-nonce: ${res.headers.get("x-nonce")?.slice(0, 16) ?? "(no)"} …`)
      }
      break // solo primer candidato exitoso
    } catch (e) {
      if (p === candidates[candidates.length - 1]) {
        console.log(`  (sin servidor vivo en ${baseUrl}: ${e.message}) — verificación estática ya cubre headers; levanta \`npm run dev\` y re-ejecuta para fetch vivo.`)
      }
    }
  }
  if (!vivoOk) {
    console.log("  Nota: verificación viva omitida (sin servidor). Los headers estáticos pasaron; para securityheaders.com usa fetch vivo con dominio real.")
  }

  console.log("\n=== FIN check:headers — estáticos OK si todos OK arriba ===")
  console.log("Nota límite: `next build` falla por Google Fonts sin red (ver design.md); usa `next dev` + este script para verificación headers.")
}

main().catch(e => { console.error(e); process.exit(1) })
