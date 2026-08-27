## ADDED Requirements

### Requirement: Cobertura UI del flujo de sesión y hooks con RTL+MSW
El laboratorio QA SHALL incluir cobertura UI del flujo de sesión y de hooks compartidos usando React Testing Library y MSW. El flujo de sesión SHALL estar cubierto: página `/ingresar` (validaciones, login exitoso con MSW sobre `POST /api/auth/login` y creación de cookie, login fallido con mensaje visible, respeto de `?next=` solo para destinos internos que empiecen con `/`), logout, verificación de `/api/auth/session`, y hook compartido `useStoreRehydrated`. El módulo SHALL exponer pruebas unitarias de `lib/auth.ts` que verifiquen `verificarToken` inválido/expirado/firma inválida, `credencialesValidas` y el guard `excedeIntentos`. La configuración `vitest.config.ts` SHALL mantener `environment: jsdom` y `setupFiles` apuntando al setup que carga `jest-dom`, y SHALL declarar umbrales UI solo si no degradan los thresholds globales existentes documentando en `design.md` el gap remanente y el plan de crecimiento hacia ≥80% componentes / ≥85% hooks.

#### Scenario: Login exitoso vía MSW
- **WHEN** el usuario envía credenciales válidas en `/ingresar` y MSW responde `200` con `Set-Cookie: compass_session`
- **THEN** la UI navega al destino y la cookie queda creada (verificable vía `fetch` a `/api/auth/session` → `autenticado: true`).

#### Scenario: Login fallido muestra error
- **WHEN** MSW responde `401` o `429` ante credenciales inválidas o exceso de intentos
- **THEN** `/ingresar` muestra un `role=alert` con el mensaje del servidor y no navega.

#### Scenario: Respeto de ?next=
- **WHEN** el usuario visita `/ingresar?next=/admin/qa-lab` o un valor externo como `https://evil`
- **THEN** tras login exitoso la navegación va a `/admin/qa-lab` en el primer caso y a `/admin` en el segundo.

#### Scenario: Sesión y logout
- **WHEN** se consulta `GET /api/auth/session` sin/con cookie válida y luego se hace `POST /api/auth/logout`
- **THEN** el contrato responde `{ autenticado: false/true }` y el logout invalida la cookie (subsecuente `session` → `false`).

#### Scenario: Hook useStoreRehydrated
- **WHEN** un componente monta `useStoreRehydrated` y el `localStorage` contiene un persistido previo
- **THEN** el store rehidrata, marca `hasHydrated: true` y no bloquea operaciones `save*`.

#### Scenario: lib/auth unitario
- **WHEN** se verifica un token expirado, con firma alterada y se prueban credenciales y rate-limit
- **THEN** `verificarToken` retorna `null`, `credencialesValidas` distingue éxito/fracaso según env, y `excedeIntentos` se activa tras `MAX_INTENTOS` fallos dentro de la ventana.
