# Design: au-autorizacion-roles — B3 authz por comunidad (C-extra-2)

## Context
Ver `proposal.md` Why. Autenticación existe como scaffold (`lib/auth.ts` HMAC + cookie `compass_session` + `proxy.ts` guardando `/admin/*` y `/api/*`). No hay usuarios persistidos ni roles. RP define 5 roles estándar y matrices por módulo (tabla FI/MP/ES/PE + §PE/PL/CT/RE) y principio de menor privilegio + unión de roles. AU §4 pide `membresias {usuarioId, comunidadId, rol}` con scoping solo server-side, aislamiento A/B y `lib/authz.ts:puede()`. Proxy solo autenticación. STORE_VERSION 26 sin cambio. P5 hará Auth.js + Prisma adapter.

## Goals / Non-Goals
**Goals:**
- Modelos `Usuario`/`Membresia` con constraints y migración limpia.
- `lib/authz.ts` pura, mapeando matriz RP, testeable, sin IO.
- Endpoint nuevo `/api/admin/usuarios` server-side con 403/200 según rol, usando repos scoping.
- Reforzar handler existente (`/api/backup`) con check authz (segundo punto real).
- Seed dev 2 comunidades + usuarios TEST con membresías (qa-lab).

**Non-Goals:**
- Auth.js, adapter, Google SSO, rate limit persistente (P5).
- Cambiar `proxy.ts` a autorización; sigue solo 401/redirect.
- Bump STORE_VERSION ni persistencia local de usuarios.

## Decisions
- **Prisma modelos** (`schema.prisma`):
  ```prisma
  model Usuario {
    id        String   @id @default(cuid())
    email     String   @unique
    personaId String?  // 0..1 hacia MP.Persona.id (no FK estricta para no acoplar hard)
    activo    Boolean  @default(true)
    membresias Membresia[]
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    @@map("usuarios")
  }
  model Membresia {
    id          String   @id @default(cuid())
    usuarioId   String
    usuario     Usuario  @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
    comunidadId String
    comunidad   Comunidad @relation(fields: [comunidadId], references: [id], onDelete: Cascade)
    rol         String   // Rol enum (validado en authz.ts, no DB enum para no migrar)
    createdAt   DateTime @default(now())
    @@unique([usuarioId, comunidadId])
    @@index([comunidadId])
    @@index([usuarioId])
    @@map("membresias")
  }
  ```
  `Comunidad` añade back-relations `usuarios?` no, pero `membresias Membresia[]`. `Usuario.email @unique` global (identidad D2 futura: email registrado). `personaId` nullable sin FK para desacoplar MP (persona puede no existir aún). Alternativa FK a `Persona` se descarta para no forzar migración Persona.id estable. `Membresia.rol` String validado por `authz.ts` `ROLES` union.

- **lib/authz.ts** pura:
  - `export const ROLES = ["administrador","comite","conserjeria","residente","mantencion"] as const`
  - `export type Rol = typeof ROLES[number]; export type Accion="ver"|"crear"|"editar"|"eliminar"|"ejecutar"; export type Recurso = string`
  - Matriz interna `PERMISOS: Record<Rol, Record<Recurso, Set<Accion>>>` derivada de RP tablas + specs PE/PL/CT/RE + ABAC IR. Ejemplos: `administrador: * → todas acciones true` (wildcard). `comite: FI:ver=true, FI:ejecutar(aprobar gasto)=true, MP:ver morosidad=true, RE:ver centro_mando=true, CT:ver=true, else false`. `conserjeria: PE:bitacora ver/crear/editar=true, PE:cierre_turno ejecutar=true, PE:directorio ver=true, PL:propia ver=true con filtro ABAC, CT:propia ver=true, RE:reporte_diario ver=true, IR:mantenimiento ver/crear=true, IR:interno false`. `residente: MP:propios editar=true, CT:propio ver/crear=true (own ABAC), RE false salvo distribuidos (no generador), PE:visita crear=true + directorio ver=true, IR:mantenimiento true, IR:interno false, FI false`. `mantencion: MT ver/crear/editar=true, MT:incidente ejecutar=true, IR:mantenimiento true, PE:directorio ver=true, resto false`. Recursos granulares listados en tabla comentarios para trazabilidad. `puede(rol, accion, recurso):boolean` normaliza a lower, busca exacto luego fallback wildcard. `tienePermiso(roles, accion, recurso)` = `roles.some(r=>puede(r,accion,recurso))` para unión. No IO, no prisma.

- **Repositorios**: `lib/repos/index.ts` añade `usuarios` y `membresias` scoped. `usuarios` es global sin comunidadId (email único global) → se expone sin scope pero membresias sí por comunidad. Para mantener D3, membresias usa `scoped()` por `comunidadId`; usuarios se expone como delegate directo `prisma.usuario` (no tenant) pero lectura filtrada por membresía. Tests usan client temporal. Alternativa scoped usuarios por comunidad se descarta por `email @unique` global.

- **/api/admin/usuarios GET**:
  ```ts
  export async function GET(request: NextRequest){
    const token=request.cookies.get(NOMBRE_COOKIE_SESION)?.value;
    const sesion=verificarToken(token);
    if(!sesion) return 401;
    const comunidadId=request.nextUrl.searchParams.get("comunidadId") ?? request.headers.get("x-comunidad-id");
    if(!comunidadId) return 400;
    const usuario=await prisma.usuario.findUnique({where:{email:sesion.sub}});
    if(!usuario) return 401;
    const membresia=await prisma.membresia.findFirst({where:{usuarioId:usuario.id, comunidadId}});
    if(!membresia) return 403; // sin pertenencia
    if(!puede(membresia.rol as Rol, "ver", "admin:usuarios")) return 403;
    const repo=crearRepositorio(comunidadId);
    // aislamiento: solo datos de esa comunidad
    const membresias=await prisma.membresia.findMany({where:{comunidadId}, include:{usuario:true}});
    const personas=await repo.personas.findMany(); // demo scoping
    return NextResponse.json({ comunidadId, membresias, count: membresias.length });
  }
  ```
  Segundo punto reforzado: `app/api/backup/route.ts POST` añade mismo bloque de auth + `puede(rol,"ejecutar","backup")` solo `administrador` true. Si falta comunidadId o rol no autorizado → 403. Sin comunidad, usa primera membresia admin. Mantiene `isWriteApiEnabled` gate antes.

- **Seed dev**: `lib/seed-authz.ts` exporta `seedUsuariosMembresias(prisma)` que crea `comunidad-a`/`comunidad-b` si no existen y 5 usuarios `admin@test.cl` etc con membresias cruzadas (admin en ambas, otros solo en A). Botón en `/admin/qa-lab` fase AU invoca via fetch a `/api/admin/seed-authz` o directo server action (usando `prisma`). Para test usa client temporal.

## Risks / Trade-offs
- [Usuario.email global único choca con multi-tenant persona.rut repetible] → Mitigación: email global único es intencional para identidad futura Auth.js (D2); persona.rut sigue scoped por comunidad (C3b). Documentado.
- [Rol como String sin DB enum] → válido porque matriz vive en código; migration futura a enum si hace falta.
- [Backup ahora exige authz + comunidadId header] → tests actuales sin cookie esperan 401/404; se actualizan. En prod requiere header, pero qa-lab lo provee.
- [pura función con recursos string sin tipado cerrado] → se mantiene string para extensibilidad módulos futuros; tests enumeran matriz.

## Migration Plan
1. prisma schema + `prisma migrate dev --name add_usuario_membresia` + `prisma generate`.
2. `lib/authz.ts` + `lib/repos/index.ts` update.
3. `app/api/admin/usuarios/route.ts` nuevo + patch `app/api/backup/route.ts`.
4. `lib/seed-authz.ts` + `app/admin/qa-lab` UI botón AU.
5. Tests authz puro + repos A/B + endpoint 403/200 con DB temporal.
6. tsc/lint/test/validate/migrate verde → archive.

## Open Questions
- Ninguna. Contexto comunidad en sesión se resolverá en P5 (Auth.js `session.comunidadId`); por ahora header/query.
