"use client"

/**
 * use-destinatarios-archivo — a quién se le puede entregar un documento legal
 * (F35 serie A, A3 · T14).
 *
 * El envío (T13) recibe `personasIds`: los grupos se resuelven ACÁ, en el
 * cliente, con lo que la app ya expone, para no inventar una segunda fuente de
 * padrón ni un endpoint nuevo:
 *
 *   · propietarios y arrendatarios → `usePersonas({ soloResidentes: true })`, que
 *     es el directorio de residentes del servidor: la ruta filtra a quienes
 *     tienen vínculo VIGENTE (`fechaFin` null) como propietario o arrendatario y
 *     devuelve esos vínculos en `vinculosVigentes`. Filtrar en el navegador una
 *     página del padrón escondería gente.
 *   · comité → `usePeriodosDirectiva().vigente`, la nómina que el libro de
 *     gobernanza ya guarda (`miembros`), leída con `leerMiembrosPeriodo` (lectura
 *     tolerante del snapshot). Un miembro con `fechaTermino` ya no está en el
 *     cargo y no se ofrece.
 *
 * El resultado es UNA lista de personas con los grupos a los que pertenecen; la
 * pantalla no vuelve a cruzar datos. La selección final (grupos + personas
 * sueltas) es de la consola, porque es la que dispara la corrida.
 */
import * as React from "react"
import { leerMiembrosPeriodo } from "@/lib/schemas"
import { usePersonas } from "@/lib/api/use-personas"
import { usePeriodosDirectiva } from "@/lib/api/use-periodos-directiva"

/** Grupos que pide S7: propietario, arrendatario y comité. */
export const GRUPOS_DESTINATARIO = ["propietario", "arrendatario", "comite"] as const

export type GrupoDestinatario = (typeof GRUPOS_DESTINATARIO)[number]

/** Etiqueta humana de cada grupo (la pantalla no repite los nombres). */
export const ETIQUETAS_GRUPO_DESTINATARIO: Record<GrupoDestinatario, string> = {
  propietario: "Propietarios",
  arrendatario: "Arrendatarios",
  comite: "Comité",
}

/** Una persona a la que se le puede entregar el documento, con sus grupos. */
export interface DestinatarioArchivo {
  personaId: string
  nombre: string
  grupos: GrupoDestinatario[]
  /** Unidad del vínculo vigente, cuando la persona es residente. */
  unidadEtiqueta: string | null
}

export interface UseDestinatariosArchivoResultado {
  destinatarios: DestinatarioArchivo[]
  isLoading: boolean
  error: Error | null
}

/**
 * Lista de destinatarios con sus grupos, resuelta con los hooks que la app ya
 * usa (directorio de residentes + libro de gobernanza).
 */
export function useDestinatariosArchivo(): UseDestinatariosArchivoResultado {
  const {
    personas,
    vinculosVigentes,
    isLoading: cargandoResidentes,
    error: errorResidentes,
  } = usePersonas(undefined, { soloResidentes: true })
  const {
    vigente,
    isLoading: cargandoDirectiva,
    error: errorDirectiva,
  } = usePeriodosDirectiva()

  const destinatarios = React.useMemo(() => {
    const mapa = new Map<string, DestinatarioArchivo>()

    const agregar = (
      personaId: string,
      nombre: string,
      grupo: GrupoDestinatario,
      unidadEtiqueta: string | null = null
    ): void => {
      const previo = mapa.get(personaId)
      if (previo) {
        if (!previo.grupos.includes(grupo)) previo.grupos.push(grupo)
        if (!previo.nombre && nombre) previo.nombre = nombre
        if (!previo.unidadEtiqueta && unidadEtiqueta) previo.unidadEtiqueta = unidadEtiqueta
        return
      }
      mapa.set(personaId, { personaId, nombre, grupos: [grupo], unidadEtiqueta })
    }

    const nombres = new Map(personas.map((persona) => [persona.id, persona.nombreCompleto]))

    // El servidor ya filtró a los vínculos VIGENTES de propietario/arrendatario;
    // acá sólo se etiqueta el grupo de cada uno.
    for (const vinculo of vinculosVigentes) {
      const grupo: GrupoDestinatario | null =
        vinculo.rol === "propietario"
          ? "propietario"
          : vinculo.rol === "arrendatario"
            ? "arrendatario"
            : null
      if (!grupo) continue
      agregar(
        vinculo.personaId,
        nombres.get(vinculo.personaId) ?? "",
        grupo,
        vinculo.unidadEtiqueta
      )
    }

    // La nómina vigente del libro de gobernanza. El nombre viene del snapshot:
    // un miembro del comité puede no ser residente y no estar en el padrón.
    for (const miembro of leerMiembrosPeriodo(vigente?.miembros)) {
      if (miembro.fechaTermino) continue
      agregar(miembro.personaId, miembro.nombre, "comite")
    }

    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  }, [personas, vinculosVigentes, vigente])

  return {
    destinatarios,
    isLoading: cargandoResidentes || cargandoDirectiva,
    error: errorResidentes ?? errorDirectiva,
  }
}
