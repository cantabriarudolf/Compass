/** @type {import('next').NextConfig} */
// SERIE-PRODUCCION P2 — configuración de producción:
// - output: 'standalone' — genera .next/standalone con solo los node_modules
//   necesarios: reduce el tamaño de imagen Docker y optimiza para serverless
//   (target de hosting: Vercel). El arranque del server es `node .next/standalone/server.js`.
// - build:analyze — `npm run build:analyze` envuelve el config con
//   @next/bundle-analyzer (devDependency). Se importa dinámicamente SOLO si
//   ANALYZE=true, así los builds normales no fallan aunque el paquete no esté
//   instalado.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // D-ii: HSTS sin preload mientras no haya dominio real (PUBLIC_DOMAIN). Se activa preload solo con dominio.
  // Ver .env.example PUBLIC_DOMAIN y docs/manual de despliegue. Mantener includeSubDomains.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Complementos securityheaders.com (no rompen next dev HMR; COEP credentialless es compatible con youtube embeds)
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
]

let nextConfig = {
  transpilePackages: ["@workspace/ui"],
  // SERIE-PRODUCCION P2: salida standalone (ver comentario de cabecera).
  output: "standalone",
  // Permite HMR / _next/* desde otros equipos en la misma red local.
  // Sin esto Next 16 bloquea peticiones cross-origin en dev.
  allowedDevOrigins: [
    "10.70.169.24",
    "10.210.145.24",
    "localhost",
    "127.0.0.1",
    // Cubre cualquier IP de la red local si el DHCP vuelve a rotar
    "10.70.169.0/24",
    "10.210.145.0/24",
    "192.168.0.0/16",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]
  },
}

// SERIE-PRODUCCION P2 — bundle analyzer solo en `npm run build:analyze`.
// Import dinámico condicional: si ANALYZE != true nunca se carga el paquete,
// por lo que los builds normales no requieren la devDependency instalada.
/* eslint-disable no-undef -- process es global en Node.js */
if (process.env.ANALYZE === "true") {
  const { default: withBundleAnalyzer } = await import("@next/bundle-analyzer")
  nextConfig = withBundleAnalyzer({ enabled: true })(nextConfig)
}

export default nextConfig
