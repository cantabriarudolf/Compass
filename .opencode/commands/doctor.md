---
description: Escanea modelos disponibles y verifica/repara el asignamiento del arnes
agent: build
template: |
  Ejecuta el doctor del arnes y resume al usuario:

  1. Corre: `node "$ARNES_RAIZ/scripts/doctor.mjs" --scan --perfil "$ARNES_PERFIL"`
     (ARNES_RAIZ y ARNES_PERFIL estan en `.opencode/arnes.json` del proyecto; si no existen, pregunta la ruta del arnes)
  2. Si hay roles "sin-candidato" o rotaciones detectadas, corre con `--auto` y muestra el diff viejo->nuevo.
  3. Si un provider no esta autenticado, indica: `opencode auth login`.
  4. Reporta en 5 lineas maximo: modelos free activos, asignamiento vigente y accion tomada.
