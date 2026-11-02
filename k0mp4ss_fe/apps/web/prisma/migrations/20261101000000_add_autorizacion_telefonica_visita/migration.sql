-- PE-visitas — autorización telefónica del residente.
--
-- Decisión del owner (2026-11-01): cuando la visita llega SIN aviso, el conserje
-- llama al residente y pide el OK por teléfono. Si lo recibe, registra la visita
-- y marca «autorización telefónica recibida»; el sistema guarda además la hora de
-- esa gestión. Esa autorización NO se puede reeditar después de guardada: es la
-- constancia de quién dejó entrar a esa persona.
--
-- Migración ADITIVA: sólo agrega dos columnas con valor por defecto. No toca
-- ninguna fila existente, no reescribe datos y no cambia columnas previas.
--
-- `autorizacionTelefonica` lleva DEFAULT false para que las visitas ya cargadas
-- (que se registraron sin este control) queden con `false` y no con un nulo
-- ambiguo: `false` significa «no hay constancia de autorización», que es lo
-- honesto para esas filas. `horaAutorizacion` queda nula por la misma razón: no
-- conocemos la hora de una gestión que nadie registró.

-- AlterTable
ALTER TABLE "bitacora_visitas_pe" ADD COLUMN "autorizacionTelefonica" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "bitacora_visitas_pe" ADD COLUMN "horaAutorizacion" TEXT;
