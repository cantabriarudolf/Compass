# Proposal: GD Ficha de Gobernanza editable

## Problema
Al crear una persona con rol `directiva` en el Directorio (`/comunidad/personas`), el
`FormularioPersona` solo guarda el flag en `roles`. El detalle (`datosGobernanza`:
cargo + fecha de asunción + firma) no tiene ningún formulario en la UI: solo existe
en los seeds y se muestra en solo-lectura en el perfil. A diferencia de `personal`
(que tiene su ficha laboral en `/personas/personal`), `directiva` no tiene dónde
administrarse.

Agravante: la directiva vigente se deriva de `datosGobernanza`
(`personas.filter(p => p.datosGobernanza && activa)`), usada para quórum 100% de
actas y firmas. Si a alguien se le quita el rol `directiva` pero conserva
`datosGobernanza`, queda un miembro fantasma que corrompe el quórum. Hoy nada lo
impide.

## Propuesta
1. Nuevo componente `FormularioGobernanza` (cargo, fecha de asunción, firma por URL)
   integrado como diálogo de crear/editar en la pestaña Gobernanza del perfil
   (`/comunidad/personas/[id]`).
2. Regla de coherencia en `savePersona`: si `roles` no incluye `directiva` pero
   viene `datosGobernanza`, se depura + evento de auditoría. Cubre todos los
   escritores (UI, QA Lab, futuras APIs), no solo el formulario.
3. Tests de store para la ficha y la regla. Sin cambios de schema, sin bump de
   `STORE_VERSION` (la forma persistida no cambia).

## No-objetivos
- Pestaña de miembros en `/comunidad/directiva` (esa página administra actas).
- Cambios en quórum, firmas o flujo de aprobación.
- Regla espejo para `personal`/`datosLaborales` (fuera de alcance).
