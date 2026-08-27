# 👥 05 - Maestro de Personas (MP)

Este módulo es el "Registro Civil" de tu comunidad. Aquí centralizamos a todo el mundo: propietarios, arrendatarios, el conserje y hasta el jardinero. La idea es que una persona sea un solo registro, sin importar cuántos roles tenga.

## 🚀 Funcionalidad Principal
Crear y gestionar las identidades de la comunidad con un enfoque en la seguridad y la ayuda proactiva.

## 🛠️ Campos Críticos
Al registrar a alguien, ponle ojo a estos datos:
- **RUT**: Es la llave única. El sistema valida formato y DV; `repararRut` corrige persistidos legacy.
- **Condiciones Especiales**: 
    *   **3ra Edad**: Marcái esto si el vecino es abuelito.
    *   **Discapacidad**: Fundamental para saber a quién hay que ayudar primero en caso de incendio o terremoto.
- **Datos de Contacto**: Teléfono y correo siempre al día para las notificaciones de gastos comunes o avisos de la directiva.

## ⚠️ Aviso de Duplicados por Nombre Completo (D5 — Plataforma P3)

Repetidos **permitidos** (D5): el sistema no bloquea nombres repetidos, pero te avisa para evitar homónimos accidentales.

- Al guardar en `components/comunidad/formulario-persona.tsx:50` con `nombreCompleto` (`nombres + apellidos` trim, case-insensitive) ya existente en `personas` (excluyendo propio `id` en edición), la UI muestra advisory: *"Ya existe una persona con ese nombre completo. ¿Deseas continuar? (D5: repetidos permitidos, es solo un aviso)"*.
- Confirmar persiste vía `savePersona`; cancelar aborta sin mutar. Llamadas directas a `savePersona` desde código/tests siguen permitiendo repetidos (el aviso es solo formulario).

## 💡 Multiperfil
No te extrañe si ves a la misma persona en distintos lados. El sistema permite que el "Seba" sea el **Propietario** de un departamento, pero que viva como **Residente** en otro. Todo queda amarrado a su mismo RUT.

## ⚠️ Privacidad
Recuerda que estos son datos sensibles. El acceso a este maestro debe estar limitado solo a personal de confianza de la administración.

*Actualizado: 27/08/2026 — P3 D5 aviso duplicados MP por nombreCompleto (no bloqueante)*
