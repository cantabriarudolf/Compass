import { nextJsConfig } from "@workspace/eslint-config/next-js"

/** @type {import("eslint").Linter.Config} */
export default [
  {
    // Artefactos generados: el deploy de Vercel deja un bundle compilado en
    // `.vercel/node` y `.vercel/output` (build output, no fuente del proyecto).
    // El ignore compartido (`dist/**`, `.next/**`, `**/.turbo/**`, `**/coverage/**`)
    // no los cubría y aportaban el 98 % de los warnings del linter.
    ignores: [".vercel/**"],
  },
  ...nextJsConfig,
]
