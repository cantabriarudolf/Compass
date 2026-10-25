# Proposal: f6-personas-operacion-buscable

## Contexto

Segunda mitad de F6. La primera (`f6-unidad-destino-buscable`, archivado) destapó que el padrón de
unidades estaba detrás de `mp` y conserjería no lo tiene: se resolvió con una proyección `pe`. El
mismo muro tiene dos consecuencias abiertas en el panel de visitas, anotadas en H9:

1. **Búsqueda por RUN del QR**: `buscarPersonaPorRun` pega en `/api/personas?rut=`, que exige `mp`.
   Para conserjería siempre falla y el panel cae al padrón local del store con el aviso
   «No se pudo consultar el padrón del servidor». La identidad del portador nunca sale de la BD.
2. **«Residente destino»**: sigue leyendo el store y truncando a `LIMITE_SELECT` (100), con el aviso
   de recorte. Con 100+ personas, la mitad no se puede elegir.

## Objetivo

Que la conserjería pueda identificar a una persona por RUN y elegir un residente destino contra el
padrón real de su comunidad, con el permiso que ya tiene, sin abrir el maestro de personas.

## Alcance

**Dentro:**
1. `GET /api/pe/personas` — proyección de solo lectura: `puede(rol, "ver", "pe:bitacora")`, scope por
   `withComunidadScope`, tres campos (`id`, `rut`, `nombreCompleto`), filtro exacto `?rut=` con las
   variantes canónicas del RUN y filtro de texto `?q=` sobre nombre y RUT.
2. `buscarPersonaPorRun` pasa a esa ruta: el QR deja de depender del padrón local para el nombre.
3. «Residente destino» pasa a `SelectorBuscable` con búsqueda en el servidor; se retira su
   `AvisoTruncamiento` y se actualizan los casos que lo fijaban.
4. **`saveBitacoraVisitaPE` deja de validar `unidadId`/`destinoPersonaId` contra el padrón del
   store.** Sin eso, cablear el selector a la base rompe el registro: el guardado rechaza
   «no existe en el Maestro de Personas» cualquier id que el snapshot del cliente no tenga, y eso
   ya pasaba con el QR del administrador antes de este cambio. La jornada sigue validándose.
5. Delta `PE` (requirement nuevo `ADDED`).

**Fuera:**
- **La unidad del vínculo** que el QR usa para preseleccionar el destino: hoy sale del store
  (`vinculos`). Traerla de `/api/vinculos` es el siguiente paso, con su propio alcance.
- Datos personales más allá de identidad: nada de email, teléfono, fecha de nacimiento ni previsión.
- La matriz de permisos: no se toca (`lib/authz.ts`).

## Riesgo

Contenido. Expone nombre y RUN de la propia comunidad a conserjería y mantención —roles que hoy
verifican cédulas en la puerta y ya ven ese padrón en el store—, sin email ni datos sensibles.
La ruta es aditiva y de solo lectura; no hay cambios de schema ni de contrato existente.
