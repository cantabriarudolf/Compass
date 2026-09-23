# Proposal: GD Períodos de Directiva

## Problema
La ley exige vigencia de directiva (art. 17 Ley 21.442: período fijado por
asamblea, máximo 3 años, reelegible), pero el sistema no registra períodos:
solo `fechaAsuncion` por persona. Tampoco queda traza de qué composición
autorizó cada documento. Fuente: skill `experto-admin-comunidades`
(art. 17 + doctrina Zelkova/Edipro/ComunidadFeliz verificada).

## Propuesta
1. Entidad `PeriodoDirectiva` (inicio, duración ≤36 con validación dura,
   inscripción + referencia, estado, nómina archivada al cerrar). Un solo
   vigente; cerrar = archivar, jamás borrar (libro físico).
2. Ficha atada con `periodoId` + `fechaTermino`/`motivoTermino`
   (renuncia | remoción | fin de período). Quórum filtra período vigente;
   legado sin período cuenta solo si aún no hay período registrado.
3. Composición al activar: bloqueo si no es impar de 3–5 (art. 17); estado
   "sin comité" permitido (<3 copropietarios).
4. Trazabilidad: actas guardan `periodoId`; certificados adjuntan
   `directivaRef` (snapshot no bloqueante). Alertas de vencimiento 90/30
   solo informativas (la ley no anula actos por mora).
5. UI: sección Períodos en `/comunidad/directiva` + migración v28 con
   período inicial de fechas estimadas (actualizar desde el libro).

## No-objetivos
- Tipo de documento "acuerdo del comité" (futuro; el snapshot queda listo).
- Excepción art. 23/subadministración (documentada como abierta).
- Cambios en quórum 100%, firmas o flujo de aprobación.
