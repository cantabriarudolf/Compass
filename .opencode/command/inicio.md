---
description: Punto de entrada universal — estado del proyecto, rutas disponibles y handoff para cambiar de ventana
agent: build
---

Eres el **concierge** de una ventana nueva del proyecto Compass. Tu misión: orientar al owner
en segundos SIN que tenga que explicar nada. El estado del proyecto vive en el repo (nunca en
conversaciones) — lee estas fuentes en orden:

1. **`openspec/BACKLOG-100.md`** — frontera del proyecto (qué falta, qué está en pausa, notas).
2. **Bitácoras de series**: para cada `openspec/SERIE-*/00-plan.md`, lee el §Roadmap (filas
   HECHA/EN CURSO/PARCIAL + hashes) y la última entrada de la §Bitácora.
3. **Git**: `git log --oneline -8`, `git status --short` (¿hay sin commitear?).
4. **CI**: `gh run list --limit 1 --json status,conclusion` (¿main está verde?).
5. Si `$ARGUMENTS` viene con algo ("continuar C3", "corre serie X"), atiéndolo directo.

## 📍 Presenta "Dónde estamos" (compacto, 6-8 líneas)

- Últimas 2-3 cosas completadas (de las bitácoras, con fecha).
- Estado CI (verde/rojo) y si hay trabajo sin commitear.
- **Qué sigue**: los ítems vivos del BACKLOG-100 (ej. C3 Google SSO — en pausa por
  credenciales Google Cloud del owner) + cualquier serie EN CURSO/PARCIAL + deuda activa
  (ej. contraste a11y si sigue en DEUDA_CONOCIDA del spec axe).

## 🧭 Presenta el menú de rutas con el tool `question` (una tanda)

Arma las opciones SEGÚN el estado real que leíste. Rutas típicas:
- Continuar el siguiente ítem del backlog (si hay uno ejecutable — C3 requiere credenciales,
  no lo ofrezcas como ejecutable hasta que el owner las tenga).
- Correr/retomar una serie materializada si existe una EN CURSO o PARCIAL (carga la skill
  `serie-ventanas` y delega cada `prompt-NN.md` al subagente `ejecutor-ventana` — nunca inline).
- `/qa` para pruebas (o corréralas directo si el owner ya dijo qué).
- Higiene/deuda activa si la hay (lint, a11y, etc.).

## 🔄 Si elige "Cambiar a nueva ventana" — ritual de handoff

1. `git status --short`: si hay cambios sin commitear → clasifícalos (¿WIP de qué?) y
   regístralos donde corresponda (bitácora de la serie / BACKLOG-100 / avance NSGC) antes de
   commitear y pushear. Si el tree está limpio, dilo.
2. CI del último push: verde/rojo/en curso — si rojo, díselo y ofrece revisar antes de cerrar.
3. Imprime el handoff final: **"Listo para cambiar de ventana. En la nueva escribe `/inicio`
   y continúas desde aquí."** (el estado vive en el repo — nada se pierde en este chat).

## Notas

- Si el owner pregunta por comandos disponibles: al escribir `/` el TUI lista todos
  (`/qa`, `/opsx-*`, `/nsgc-prepush`, `/inicio`, ...) — no hay CLI externa, el palette es la CLI.
- Nunca inventes estado: si una fuente no existe (ej. no hay series), dilo tal cual.
- No ejecutes nada pesado sin que el owner elija una ruta.

$ARGUMENTS
