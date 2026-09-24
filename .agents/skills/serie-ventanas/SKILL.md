---
name: serie-ventanas
description: "Orquesta planes grandes de este proyecto como series finitas de prompts materializados como archivos en openspec/SERIE-<slug>/ (00-plan.md + prompt-NN.md) que el owner ejecuta en ventanas de chat nuevas ('Corre el archivo openspec/SERIE-<slug>/prompt-01.md') o que el orquestador delega a un subagente ejecutor (metodo probado en Serie NSGC, Plataforma y QA-LAB). Use cuando el owner pida 'otra serie', 'proseguir con ventanas', 'serie de prompts', 'orquestar chats', 'corre la serie', o cuando el trabajo exceda el contexto de un solo chat. La reanudacion del orquestador lee el estado desde el repo (bitacora de 00-plan.md + git), NUNCA de texto pegado de otros chats: basta con decir 'ya termino prompt N'. Autovalidacion entre ventanas (bloque ARRANQUE), reportes estandarizados y auditoria integral final. NO la use para trabajo que cabe en un solo chat: use openspec-propose/apply directo."
license: MIT
allowed-tools: Bash
---

# Serie de Ventanas — Orquestación de planes grandes por chats secuenciales

Metodología probada dos veces en este proyecto:
- **Serie NSGC** (9 ventanas): 16 módulos 1:1 implementados (PI…RE), store v10→v25.
- **Serie Plataforma** (8 ventanas): testing UI, Prisma multi-tenant, Auth.js, hardening pre-deploy, store v25→v26.

Principio central: **la memoria vive en el repo, no en los chats**. Cada ventana es
desechable; el estado durable es la subcarpeta `openspec/SERIE-<slug>/` — `00-plan.md`
(roadmap + bitácora + base de hechos) y `prompt-01.md`…`prompt-NN.md` (un archivo
autocontenido por ventana) — más los avances/manuales/specs que cada ventana documenta.
Ningún chat depende del contenido de otro chat: solo de archivos. Series históricas como
un único `openspec/SERIE-<slug>.md` plano (NSGC, Plataforma) quedan intactas: son el
formato legacy, no se replican en series nuevas.

## Roles

| Actor | Función |
|---|---|
| **Chat orquestador** (carga esta skill) | Diseña la serie, MATERIALIZA `00-plan.md` + los `prompt-NN.md`, y audita al final. NO participa ventana por ventana ni ejecuta alcances él mismo. |
| **Ventanas de trabajo** (chat nuevo por ventana, o subagente en modo delegado) | Ejecutan su `prompt-NN.md` con método openspec, se autovalidan contra la ventana anterior, documentan y pushean. |
| **Subagente ejecutor** (opcional, modo delegado) | Subagente del harness activo (Pi/Gentleman) que el orquestador lanza una ventana a la vez: lee el prompt del repo, lo ejecuta y devuelve el Reporte Final Estandarizado. |
| **Estado durable** | `openspec/SERIE-<slug>/` + avances/manuales/specs en el repo. Única fuente de verdad entre ventanas. |
| **Owner** | Modo manual: pega la línea de handoff por ventana. Modo delegado: solo aprueba permisos. En ambos trae el reporte al orquestador AL CIERRE (o emergencias) — o solo dice "ya terminó prompt N". |

## Fase 1 — Diseño de la serie (chat orquestador)

1. **Leer estado real** (chequeos baratos, en paralelo):
   `git status -sb` + `git log --oneline -10` · `openspec validate --all | tail -2` ·
   `ls openspec/specs/ | wc -l` · `grep "STORE_VERSION = " k0mp4ss_fe/apps/web/lib/store.ts` ·
   `cd k0mp4ss_fe/apps/web && npm test` (resumen) · SERIE-*.md previos · las fuentes del
   alcance (specs NSGC en `Data/NSGC/docs/especificaciones/`, auditorías en
   `Data/NSGC/docs/auditorias/`, `openspec/specs/project.md`).
2. **Partir el alcance en paquetes del tamaño de un chat.** Heurísticas probadas:
   - 1–3 changes sencillos por ventana (ver Serie NSGC: PI+AD+GD cabían en una).
   - Un módulo grande o central = ventana propia (FI, PE fueron así).
   - El cierre/QA integral SIEMPRE es su propia ventana final.
3. **Fijar el CAP duro** y declararlo al owner ("máximo N ventanas"). Prohibido abrir
   ventanas fuera del cap; si algo no cabe, se replantea con el owner, no se improvisa.
4. **Dependencias cruzadas**: si un módulo actual debe integrarse con uno futuro que aún no
   existe, usar el patrón **"referencia pendiente"** (campo `xxxReferencia: "pendiente"`
   como hizo GD con `avisoCVReferencia`); la ventana que implemente el consumidor lo
   materializa con delta MODIFIED.
5. **Nombrar la serie**: subcarpeta `openspec/SERIE-<slug>/` (slug kebab en español) con
   `00-plan.md` y un `prompt-NN.md` por ventana. El ORQUESTADOR materializa la subcarpeta
   completa en su sesión de diseño: la Ventana 1 NO crea el roadmap, solo marca su fila
   EN CURSO (rompe con el patrón legacy de las series NSGC/Plataforma). Si el owner trae
   una serie legacy de archivo plano, la Ventana 1 sí crea el roadmap embebido (§2.3 legacy).

## Fase 2 — Plantillas obligatorias de los prompts

Un prompt de ventana SIEMPRE tiene 4 bloques en este orden, materializados en su archivo
`openspec/SERIE-<slug>/prompt-NN.md`. Cada archivo abre con este encabezado:

```markdown
> **Este archivo ES tu prompt.** Ventana N de la serie <slug>.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.
```

NUNCA referencies el contenido de otro prompt ("idéntico al de la ventana anterior" NO
funciona: un chat nuevo no puede leerlo). El CONTEXTO COMÚN va copiado VERBATIM en todos.

### 2.1 CONTEXTO COMÚN (verbatim en todos los prompts)
```text
## Contexto común (válido para TODA la serie <nombre>)
<Estado previo relevante: capabilities, STORE_VERSION real, conteo de tests, series cerradas.>
Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change
→ validar → commitear (conventional español) → sincronizar specs mains y archivar con
openspec-archive-change → skill nsgc-prepush antes de cualquier push.
Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult);
mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en
localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.
Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores)
&& npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja
el estado exacto en openspec/SERIE-<slug>/00-plan.md.
```

### 2.2 ARRANQUE (ventanas 2..N — NUNCA en la primera)
```text
## Arranque: verificación de la ventana anterior (antes de tu alcance)
1. git status (tree limpio) y git status -sb (sin "ahead": todo pusheado) y git log --oneline -8.
2. openspec validate --all → sin fallos.
3. cd k0mp4ss_fe/apps/web && npm test → suite completa verde.
4. Contrasta con openspec/SERIE-<slug>/00-plan.md:
   - Fila anterior HECHA y todo OK → marca tu fila EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero (change fix pequeño + test), anótalo en la
     Bitácora, y solo después empieza tu alcance.
   - PARCIAL o repo a medias → completa ESE alcance antes del tuyo (deriva de la Bitácora
     y las specs).
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.
```

### 2.3 Roadmap `00-plan.md` (lo MATERIALIZA el orquestador — la Ventana 1 ya no lo crea)
El orquestador escribe `openspec/SERIE-<slug>/00-plan.md` al diseñar la serie:
```markdown
# Serie <Nombre> — Plan y Estado Canónico
> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila EN CURSO
> y actualizarla antes del push final. La Bitácora es el registro durable de la serie.
| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | <alcance> | EN CURSO | — |
| ... | ... | pendiente | — |
MÁXIMO: N ventanas. Post-serie: <lo que queda fuera>. Base de hechos: <archivos/rutas>.
## Bitácora
(vacía — cada ventana añade antes del push: `- [fecha] P<n> HECHA: resumen (commit hash)`)
```
**LEGACY** (series NSGC/Plataforma, archivo plano): la Ventana 1 creaba el roadmap embebido
en su prompt; ese patrón solo se usa si el owner retoma una serie de ese formato.

### 2.4 Reporte Final Estandarizado (obligatorio al final de CADA prompt)
```text
## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)
1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números: STORE_VERSION, tests X/Y,
   tsc/eslint OK, métricas específicas de la ventana. 5. Desviaciones vs el prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
```

## Fase 3 — Entregables del orquestador al owner

1. **Handoff de una línea por ventana** (modo manual): el orquestador entrega al owner
   exactamente `Corre el archivo openspec/SERIE-<slug>/prompt-01.md` — y el owner repite
   cambiando 01→02→…→NN en un chat nuevo por ventana. Los prompts ya viven como archivos
   en el repo (commiteados), NO como bloques de texto pegables.
2. **Protocolo de reanudación** (cierra el ciclo sin texto de otros chats): cuando el
   owner dice solo "ya terminó prompt N" (en este chat o en uno nuevo cargando esta skill),
   el orquestador NO pide reportes pegados: lee `openspec/SERIE-<slug>/00-plan.md`
   (bitácora + estados por fila) y verifica el repo (`git log --oneline`, suites,
   spot-checks de Fase 4). El reporte del owner/subagente es pista; **la verdad es el repo**.
3. **Prompt de relevo del orquestador** (por si se queda sin contexto): instruye al nuevo
   chat cargar esta skill, leer `openspec/SERIE-<slug>/00-plan.md` + verificar repo y asumir
   la gestión; NO regenerar prompts salvo desviación declarada por el owner.
4. **Instrucciones de uso**: manual = handoff de una línea por ventana, en orden estricto;
   delegado = decir "corre la serie <slug>" (o "corre solo el prompt N"). El orquestador
   se usa al cierre o ante emergencias (ventana rota que la siguiente no pudo reparar con
   su ARRANQUE).

## Modo delegado — subagente ejecutor (opcional)

Requisito: el harness activo debe exponer subagentes con acceso total al repo
(en Pi/Gentleman: delegación estándar del orquestador).

Protocolo del orquestador:
1. Por cada ventana EN ORDEN: lanzar el subagente con "Ejecuta de principio a fin
   `openspec/SERIE-<slug>/prompt-NN.md` y devuelve el Reporte Final Estandarizado".
   Una ventana a la vez; JAMÁS en paralelo (la secuencialidad es el guardrail central).
2. Al retornar cada ventana: auditar contra el repo (git log, bitácora de 00-plan.md,
   suites). Si falla algo menor: relanzar la MISMA ventana con la corrección puntual.
   Si es estructural: dejar que el ARRANQUE de la siguiente repare, o replantear con el owner.
3. Contexto del subagente: su ventana debe caber completa. Si un paquete es demasiado
   grande, partir la serie en más ventanas AL DISEÑARLA (no comprimir prompts).
4. Push: el subagente pushea igual que una ventana manual (nsgc-prepush obligatorio antes).
5. Fallback: si el subagente falla de forma irrecuperable, el owner pasa a modo manual con
   la misma línea de handoff. Los `prompt-NN.md` son idénticos para ambos modos.

Guardrails extra en delegado: nunca lanzar la ventana N+1 sin verificar la N; prohibido
que el orquestador ejecute él mismo el alcance de una ventana (su rol es diseñar/auditar);
los permisos de escritura/commit del subagente quedan sujetos a las reglas del harness activo.

## Fase 4 — Cierre o reanudación de la serie (orquestador)

Al recibir "ya corrí P1–P<n>" (cierre) o "ya terminó prompt N" (reanudación intermedia),
ejecutar la **auditoría integral desde el repo** (la verdad es el repo, el texto pegado —
si lo hay — es solo pista):
1. `git status -sb` + `git log --oneline -15` (commits y push reales).
2. Leer `openspec/SERIE-<slug>/00-plan.md` (roadmap + bitácora) y contrastar estados y
   hashes vs git log (desincronización = reportar la verdad del repo).
3. `openspec validate --all` + `ls openspec/changes/` (sin activos).
4. Suite completa + tsc + STORE_VERSION esperada.
5. Spot-checks de los engranajes ESPECÍFICOS de esa serie (p.ej. Plataforma: prisma
   migrations, lib/repos, authz, scripts check:headers/backup:db, informe OWASP).
6. Veredicto + lo que queda fuera de la serie (decisiones del owner).

## Guardrails (inviolables)

- **Estado durable > memoria de chat**: toda ventana actualiza roadmap + bitácora antes de push.
- **Cap duro**: prohibido abrir ventanas fuera de las N declaradas.
- **Autocontención**: un prompt jamás referencia otro prompt ni conversaciones previas.
- **El repo es la verdad**: si bitácora y repo discrepan, prevalece el repo y se corrige la bitácora.
- **Sin push sin prepush**: ninguna ventana pushea sin su nsgc-prepush completado.
- **Método openspec**: los cambios de spec/código van por propose→apply→archive, no ad-hoc.
- **Alcance cerrado por ventana**: la ventana N no toca módulos de otras ventanas (salvo el
  ARRANQUE reparando a su antecesora).
