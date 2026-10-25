import { nextJsConfig } from "@workspace/eslint-config/next-js"
import globals from "globals"

/** @type {import("eslint").Linter.Config} */
export default [
  {
    // Artefactos generados: el deploy de Vercel deja un bundle compilado en
    // `.vercel/node` y `.vercel/output` (build output, no fuente del proyecto).
    // El ignore compartido (`dist/**`, `.next/**`, `**/.turbo/**`, `**/coverage/**`)
    // no los cubría y aportaban el 98 % de los warnings del linter.
    //
    // `playwright-report/**` y `test-results/**` son artefactos de la lane e2e:
    // están en `.gitignore`, pero ESLint no lee ese archivo. El reporte HTML trae
    // un bundle minificado que por sí solo aporta ~3.700 warnings, y sólo aparece
    // después de correr la lane en local (el CI no los persiste).
    ignores: [".vercel/**", "playwright-report/**", "test-results/**"],
  },
  {
    // Los `.mjs` del repo son tooling de Node (scripts de migración, seeds y
    // orquestación de la lane e2e, `next.config.mjs`, `postcss.config.mjs`):
    // se les declaran los globales del runtime de Node. Va **acotado a ese
    // patrón**: declararlo en el config global marcaba `no-redeclare` en cada
    // `/* global process */` del repo (8 en el intento revertido de D6).
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  ...nextJsConfig,
]
