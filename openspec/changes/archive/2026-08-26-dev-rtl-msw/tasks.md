## 1. Tooling base

- [ ] 1.1 Verificar `k0mp4ss_fe/apps/web/vitest.config.ts` tiene `environment: jsdom` y `setupFiles: ["./test/setup.ts"]`; registrar gap de coverage en design.md si thresholds UI no se tocan.
- [ ] 1.2 Ampliar `k0mp4ss_fe/apps/web/test/setup.ts` con `import "@testing-library/jest-dom/vitest"`, `setupServer` MSW base y hooks `beforeAll/afterEach/afterAll`; exportar `server` y `handlers` si se requiere override por test.
- [ ] 1.3 Asegurar deps instaladas (`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `msw`) y `k0mp4ss_fe/apps/web/package.json` refleja `^6.9.1/^16.3.2/^14.6.6/^2.15.0`.

## 2. Unitario lib/auth.ts

- [ ] 2.1 Crear `k0mp4ss_fe/apps/web/test/auth/lib-auth.test.ts`: `verificarToken` (expirado, firma inválida, carga útil corrupta, token nulo, secreto ausente en prod), `crearToken`/`verificarToken` roundtrip, `nuevaExpiracion`/`cookieSesion` contrato, `credencialesValidas` (env y fallback dev), `excedeIntentos`/`registrarFallo` (ventana, reset, bloqueo tras MAX).

## 3. Rutas API auth (contrato)

- [ ] 3.1 Crear `k0mp4ss_fe/apps/web/test/auth/api-auth.test.ts`: `POST /api/auth/login` (400 sin cuerpo, 503 sin AUTH_SECRET en prod, 401, 429 rate limit, 200 Set-Cookie en éxito), `GET /api/auth/session` (false sin cookie, true con token válido, false con expirado), `POST /api/auth/logout` (borra cookie).

## 4. Página /ingresar con RTL+MSW

- [ ] 4.1 Crear `k0mp4ss_fe/apps/web/test/auth/ingresar-page.test.tsx`: render con mock `next/navigation` (`useRouter`, `useSearchParams`), `userEvent` flows: validación required, login exitoso (MSW 200 → `router.push` a `/admin` o `?next=` interno), login fallido 401/429 (role=alert), respeto de `?next=` externo → fallback `/admin`, estado cargando/disabled y error de conexión.
- [ ] 4.2 Verificar a11y mínima (role heading, labels) sin `container.querySelector`.

## 5. Hook compartido + deseable

- [ ] 5.1 Crear `k0mp4ss_fe/apps/web/test/auth/use-store-rehydrated.test.tsx`: `useStoreRehydrated` llama `rehydrateStore` en mount y expone `hasHydrated`; con persistido previo en `localStorage` marcando `hasHydrated:true`.
- [ ] 5.2 (Si context alcanza) Añadir 1 componente compartido representativo (`k0mp4ss_fe/apps/web/test/auth/persona-form.test.tsx` o similar) validando errores visibles con `savePersona` mock/store.

## 6. Validación

- [ ] 6.1 `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test` verde y `openspec validate --all --strict` sin fallos; thresholds globales intactos.
