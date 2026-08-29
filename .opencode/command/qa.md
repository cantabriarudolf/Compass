---
description: Abanico de QA — elige qué probar (unit/e2e, módulo, en vivo) y córrelo
agent: build
---

Carga y sigue la skill `pruebas` (puerta de entrada de QA): presenta el abanico con el tool
`question` (tipo de prueba, alcance con CRUD por módulo usando su mapa, visualización),
ejecuta lo elegido con los comandos validados (workdir `k0mp4ss_fe/apps/web`) y reporta en
el formato estándar de la skill. Si el usuario ya especificó algo en "$ARGUMENTS", sáltate
esa pregunta del abanico.

$ARGUMENTS
