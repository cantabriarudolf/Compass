/** @type {import('next').NextConfig} */
// SERIE-PRODUCCION P2 — configuración de producción:
// - outputFileTracingExcludes — recorta el bundle de cada Vercel Function (ver
//   el bloque dentro de `nextConfig`): saca del trace los motores Prisma WASM
//   de las bases que el proyecto no usa. Sin esto cada función pesaba ~80 MB y
//   Functions Storage del plan Hobby (10 GB) quedaba excedido.
// - build:analyze — `npm run build:analyze` envuelve el config con
//   @next/bundle-analyzer (devDependency). Se importa dinámicamente SOLO si
//   ANALYZE=true, así los builds normales no fallan aunque el paquete no esté
//   instalado.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // camera=(self): la politica vacia `camera=()` bloquea getUserMedia en la propia pagina,
  // sin pedir permiso, y rompia el escaner QR de la cedula (PE). El resto sigue cerrado.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
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
  // DEV: caché de filesystem de Turbopack APAGADO (viene encendido por defecto
  // en Next 16: `experimental.turbopackFileSystemCacheForDev: true`).
  //
  // Por qué: ese caché es una base de datos en `.next/dev/cache/turbopack/`
  // (segmentos `.sst` + `.meta`) que se escribe desde el proceso del dev
  // server. Si el proceso muere a mitad de una escritura o si se borra `.next`
  // mientras el server está vivo —las dos cosas que se hacen acá todo el
  // tiempo para "destrabar" el dev—, la base queda con referencias colgadas y
  // el server siguiente no falla: queda a medias. Caso medido (2026-11-06):
  // `GET /api/configuracion` se quedaba en `○ Compiling /api/configuracion ...`
  // para siempre (curl 000 a los 25s y a los 60s) mientras
  // `/api/comunidad-actual` respondía 200, y el log mostraba
  // `panicked ... Unable to open static sorted file 00003142.sst`. La misma
  // ruta, con el caché limpio, responde 200 en ~6s la primera compilación y
  // ~100ms después. O sea: el cuelgue no estaba en el código de la ruta.
  //
  // Costo medido en esta máquina con `npm run dev`: Ready 6,1s sin caché,
  // contra 9,6s con `.next` en frío y 2,7s reusando un caché ya caliente; la
  // primera compilación de /api/configuracion tarda 5,8s sin caché contra
  // ~100ms con el caché caliente. Se paga unos segundos por arranque y se
  // elimina el cuelgue permanente. Si algún día se quiere el caché de vuelta,
  // alcanza con borrar este bloque — pero entonces NUNCA borrar `.next` ni
  // matar el server a mitad de compilación, porque eso es lo que lo envenena.
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  // Vercel Functions Storage: cada `route.ts` se empaqueta como su propia Vercel
  // Function y arrastra su propio `node_modules` trazado. Sin exclusiones, cada
  // función pesaba ~80,6 MB y de esos ~57 MB eran `@prisma/client`, casi todo
  // blobs `.wasm-base64` con los motores de CockroachDB, MySQL, SQL Server y
  // SQLite. El proyecto usa SOLO PostgreSQL (`prisma/schema.prisma`) y no tiene
  // rutas edge ni driver adapters, así que esos motores son peso muerto
  // duplicado 156 veces (una por `route.ts`).
  // Medido: 156 route.ts + 40 page.tsx × 80,6 MB ≈ 12,5 GB por deployment,
  // contra el tope de 10 GB del plan Hobby. Con estas exclusiones cada función
  // queda en ~24 MB. Lo vigila `npm run check:trazado`.
  outputFileTracingExcludes: {
    "**/*": [
      // OJO con el anclaje: Next resuelve cada glob con `path.join(dir, glob)`,
      // donde `dir` es el directorio del proyecto (`apps/web`). Los node_modules
      // del monorepo están hoisted en `k0mp4ss_fe/node_modules`, así que los
      // archivos trazados caen fuera de `apps/web` y un glob anclado ahí no los
      // alcanza nunca. Por eso cada patrón va también con `../../`, que es el
      // prefijo hasta la raíz del monorepo. La variante sin prefijo cubre un
      // node_modules local (pnpm sin hoisting).
      ...[
        // Motores WASM en base64 (`query_engine_bg.*` y `query_compiler_bg.*`)
        // de las 5 bases soportadas: ~55 MB por función. Solo se cargan en el
        // edge runtime o con driver adapters; acá corre el motor nativo.
        "**/node_modules/@prisma/client/runtime/*.wasm-base64.*",
        // Variante WASM del motor dentro del cliente generado (~2 MB).
        "**/node_modules/.prisma/client/query_engine_bg.*",
        // sharp/libvips para musl: Vercel corre glibc. La función de /_next/image
        // la arma Vercel fuera del trace de Next, por eso acá no se mide.
        "**/node_modules/@img/sharp-libvips-linuxmusl-x64/**",
        "**/node_modules/@img/sharp-linuxmusl-x64/**",
      ].flatMap((patron) => [patron, `../../${patron}`]),
    ],
  },
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
if (process.env.ANALYZE === "true") {
  const { default: withBundleAnalyzer } = await import("@next/bundle-analyzer")
  nextConfig = withBundleAnalyzer({ enabled: true })(nextConfig)
}

// SERIE-PRODUCCION-FASE2 P5 — Sentry solo con SENTRY_DSN (sin DSN el build es
// idéntico al anterior: el SDK queda deshabilitado). Source maps se suben solo
// en producción y solo con SENTRY_AUTH_TOKEN (CI/Vercel); sin token se omiten
// sin romper el build.
if (process.env.SENTRY_DSN) {
  const { withSentryConfig } = await import("@sentry/nextjs")
  nextConfig = withSentryConfig(nextConfig, {
    silent: true,
    sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  })
}

export default nextConfig
