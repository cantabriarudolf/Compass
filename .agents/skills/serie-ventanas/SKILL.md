---
name: serie-ventanas
description: "Trabajo multi-ventana en este proyecto: la bitácora vive en el doc de feature ODD (odd/tasks/<feature>.md) con espejo en Engram, y el handoff entre sesiones se hace con mem_context. Use cuando el trabajo exceda el contexto de una sola sesión o el owner pida 'proseguir con ventanas' o 'corre la serie'. Reemplaza el materializado retirado de 00-plan.md + prompt-NN.md bajo openspec/SERIE-<slug>/. NO la use para trabajo que cabe en una sesión: use openspec-propose/apply directo."
license: MIT
allowed-tools: Bash
---

# Serie de Ventanas — trabajo multi-ventana

## Trabajo multi-ventana

Para trabajo que abarca varias sesiones, la bitácora vive en el doc de feature ODD
(`odd/tasks/<feature>.md`): estado por ventana, decisiones cerradas, remanente declarado y el
próximo paso concreto. El espejo durable va a Engram y el handoff a una sesión nueva se hace con
`mem_context`, sin pegar texto de otro chat.

El materializado anterior — `openspec/SERIE-<slug>/00-plan.md` más `prompt-NN.md`, un archivo
autocontenido por ventana — queda retirado y no se replica en trabajo nuevo. Las series ya cerradas
quedaron indexadas en `openspec/SERIES-ARCHIVO.md`, con su registro en los commits.

Reglas que siguen vigentes: una ventana se autovalida antes de cerrar, el orquestador audita al
final contra la spec, y los commits van por unidad revisable con sus tests y docs.
