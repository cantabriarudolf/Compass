#!/usr/bin/env node
/* eslint-disable no-undef -- Node.js runtime file, process is global */
/* eslint-disable turbo/no-undeclared-env-vars -- VERCEL_TOKEN is required env var */
/**
 * Script de deploy manual a Vercel (fallback cuando CD no está configurado).
 * SERIE-PRODUCCION P5
 *
 * Uso:
 *   VERCEL_TOKEN=tk_xxx npm run deploy:vercel
 *
 * Requiere:
 *   - VERCEL_TOKEN en environment
 *   - VERCEL_ORG_ID y VERCEL_PROJECT_ID (opcional, se leen de .vercel/project.json)
 */

import { execSync } from "node:child_process"

const TOKEN = process.env.VERCEL_TOKEN
if (!TOKEN) {
  console.error("❌ VERCEL_TOKEN no está definido. Obtén uno en https://vercel.com/account/tokens")
  process.exit(1)
}

const ENV = process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV
if (ENV === "development" && process.argv.includes("--prod")) {
  console.warn("⚠️  Deploy a producción con NEXT_PUBLIC_APP_ENV=development. Las APIs de escritura quedarán habilitadas.")
  console.warn("   Considera setear NEXT_PUBLIC_APP_ENV=production antes del deploy.")
}

try {
  console.log("📦 Pull de variables de entorno desde Vercel...")
  execSync("npx vercel pull --yes --environment=production", { stdio: "inherit" })

  console.log("🔨 Build de producción...")
  execSync("npx vercel build --prod", { stdio: "inherit" })

  console.log("🚀 Deploy...")
  execSync("npx vercel deploy --prebuilt --prod", { stdio: "inherit" })

  console.log("✅ Deploy completado.")
} catch (err) {
  console.error("❌ Deploy falló:", err.message)
  process.exit(1)
}
