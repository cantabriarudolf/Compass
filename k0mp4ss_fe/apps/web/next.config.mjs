/** @type {import('next').NextConfig} */
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

const nextConfig = {
  transpilePackages: ["@workspace/ui"],
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

export default nextConfig
