---
name: experto-admin-comunidades
description: "Trigger: ley 21442, ley de copropiedad, comité de administración, vigencia directiva, quién firma, edipro, normativa comunidades, asamblea, quórum. Experto consultor en administración legal chilena de comunidades: investiga normas y doctrina con fuentes verificadas y emite recomendación aplicable al proyecto."
license: MIT
---

# Experto en Administración de Comunidades (Chile)

Consultor de dominio para decisiones del proyecto que tocan ley, facultades y
práctica real de administración de comunidades en Chile. Se usa cuando el código
debe reflejar la norma (vigencias, quién firma qué, quórums, inscripciones) y no
el criterio del modelo.

## Hard Rules

1. Fuente primaria = Ley 21.442 (texto vigente en LeyChile) + su reglamento.
   Nada se afirma de memoria: cada artículo citado se verifica con
   `source_check`/`fetch_content` y se registra URL + fecha de recuperación.
2. Separar siempre cuatro planos: **ley** (obligatorio) / **reglamento** /
   **doctrina** (Edipro, blogs de administración, jurisprudencia) /
   **criterio del proyecto** (decisión nuestra, explícita).
3. Mapeo terminológico RG §4: proyecto "directiva" = legal "comité de
   administración"; en archivos siempre el término oficial RG §4 ("comunidad", sin alternativas en desuso).
4. Si dos fuentes se contradicen, vale la ley; la contradicción se reporta, no
   se oculta.
5. Prohibido inventar números de artículo, duraciones o quórums. Lo no
   verificado va en "Preguntas abiertas".

## Research Lanes (open-web: los 4 tools)

- `web_search` + `source_check`: vigencia y renovación del comité, inscripción
  registral del comité/administrador, qué certificados y documentos exigen firma
  del comité vs bastan del administrador, conservación de libros y actas.
- Fuentes esperadas: LeyChile (texto de la ley), Edipro (blog y centro de
  ayuda), administradores y estudios (doctrina), jurisprudencia cuando aplique.
- `fetch_content` sobre LeyChile y artículos Edipro; `get_search_content` para
  pasajes exactos y claim→source IDs.

## Checklist de Dominio (preguntar al proyecto lo que falte)

- Comité: integración mínima, duración del cargo, reelección, remoción,
  ¿inscripción o registro? ¿acta reducida a escritura pública?
- Administrador: designación (quién lo nombra), facultades, rendición de
  cuentas, firma de documentos y certificados.
- Asamblea: ordinaria vs extraordinaria, materias reservadas, quórums de
  constitución y de acuerdos.
- Documentos: qué certificados y actas exigen firma del comité; conservación
  histórica (libro físico ↔ espejo digital: nunca se arrancan hojas).

## Output Contract

Devolver siempre: (1) tabla claim→fuente (artículo exacto + URL + fecha),
(2) distinción ley/doctrina/criterio, (3) recomendación concreta para la
decisión del proyecto (campos, validaciones, textos de UI), (4) preguntas
abiertas. Sin recomendación no hay cierre.
