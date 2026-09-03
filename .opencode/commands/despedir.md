---
description: Ritual de egreso — cosecha de vuelta al linaje lo que el anfitrion construyo (correr en cierre de hito mayor y ANTES de cualquier bump de VERSION)
agent: build
template: |
  Ritual de egreso del arnes (MANIFIESTO.md §6 "Ciclo de vida de la encarnacion"). Recorre EN ORDEN:

  1. INVENTARIO DE EGRESO: lista qué construyó el anfitrion desde la ultima despedida
     (git log del anfitrion, skills/commands/agents nuevos, tooling nuevo). Si es la primera
     despedida, la referencia es la adopcion (registro en GENEALOGIA.md).
  2. CLASIFICA cada artefacto:
     - ESPECIFICO: depende del stack, rutas o dominio del anfitrion → queda en el anfitrion
     - TRANSPORTABLE: parametrizable con config del estilo [DESCRIBE] del kit → candidato
  3. TEST DE NEUTRALIDAD DE DOMINIO por cada candidato (MANIFIESTO §6): viaja el patron de
     ingenieria (mecanismo + decision + por que + criterio de validacion), JAMAS el dominio
     de negocio, nombres de productos, rutas especificas ni terminos del dominio del anfitrion.
  4. EVALUACION HONESTA de cada candidato: ¿que problema resuelve? ¿es mejor que lo que el
     kit tiene hoy? ¿a que costo de mantenimiento?
  5. Los que PASAN → propuesta en `propuestas/` con el formato de siempre (quedan esperando
     /promover). Los que NO → descartalos dejando registro del motivo (en la conversacion o,
     si ya habia propuesta, en `propuestas/rechazadas/`).
  6. ACTUALIZA la seccion "Capacidades" de INVENTARIO.md: mueve los candidatos clasificados
     y deja fresca la lista "Candidatas del anfitrion (revision /despedir)".
  7. RECUERDA al usuario: el bump de VERSION es DECLARATIVO — solo sube junto con lo que el
     linaje absorbe, declarando en GENEALOGIA.md que capacidades absorbió; declarar
     "ninguna capacidad nueva — revisado" tambien es un resultado valido.
