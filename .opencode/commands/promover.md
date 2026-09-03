---
description: Revisa y aplica/descarta propuestas en cuarentena (anti-retroceso)
agent: build
template: |
  Gestiona la cuarentena de propuestas del arnes:

  1. Corre: `node "$ARNES_RAIZ/scripts/doctor.mjs" promover` (ARNES_RAIZ en `.opencode/arnes.json`)
  2. Para cada propuesta pendiente, presenta al usuario: tipo, base, situacion, propuesta y archivos afectados.
  3. Explica el riesgo de retroceso de cada una comparando contra el "porque" vigente (ver MANIFIESTO.md).
  4. Pide al usuario decidir por cada una. Aplica con `promover --mantener <id>` o archiva con
     `promover --descartar <id> "motivo"`. NUNCA apliques sin aprobacion explicita del usuario.
  5. Las propuestas tipo "aditivo" (nuevos patrones de error) puedes recomendar mantenerlas: son seguras por diseño.
