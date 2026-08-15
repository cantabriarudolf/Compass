// Maestros Administrativos (MA) - Tablas de referencia transversales del sistema.
// Estos maestros son gestionados exclusivamente por el rol Administrador Maestro.

// --- RRHH ---

export interface Afp {
  id: string;
  nombre: string;
  tasaCotizacion: number; // porcentaje imponible
}

export const AFPS: Afp[] = [
  { id: "afp-habitat", nombre: "AFP Habitat", tasaCotizacion: 10.58 },
  { id: "afp-cuprum", nombre: "AFP Cuprum", tasaCotizacion: 10.58 },
  { id: "afp-modelo", nombre: "AFP Modelo", tasaCotizacion: 10.58 },
  { id: "afp-planvital", nombre: "AFP Planvital", tasaCotizacion: 10.58 },
  { id: "afp-provida", nombre: "AFP Provida", tasaCotizacion: 10.58 },
  { id: "afp-uno", nombre: "AFP Uno", tasaCotizacion: 10.58 },
];

export interface PrevisionSalud {
  id: string;
  nombre: string;
  tipo: "fonasa" | "isapre";
}

export const PREVISIONES_SALUD: PrevisionSalud[] = [
  { id: "fonasa", nombre: "FONASA", tipo: "fonasa" },
  { id: "isapre-banmedica", nombre: "Isapre Banmédica", tipo: "isapre" },
  { id: "isapre-colmena", nombre: "Isapre Colmena", tipo: "isapre" },
  { id: "isapre-consalud", nombre: "Isapre Consalud", tipo: "isapre" },
  { id: "isapre-cruzblanca", nombre: "Isapre Cruz Blanca", tipo: "isapre" },
  { id: "isapre-vidatres", nombre: "Isapre Vida Tres", tipo: "isapre" },
];

export interface MutualCaja {
  id: string;
  nombre: string;
}

export const MUTUALES_CAJAS: MutualCaja[] = [
  { id: "achs", nombre: "ACHS" },
  { id: "mutual", nombre: "Mutual de Seguridad" },
  { id: "cmac-cordillera", nombre: "Caja de Compensación Los Andes" },
  { id: "cmac-biobio", nombre: "Caja de Compensación La Araucana" },
  { id: "cmac-losheroes", nombre: "Caja de Compensación Los Héroes" },
];

export interface Feriado {
  id: string;
  fecha: string; // YYYY-MM-DD
  nombre: string;
  irrenunciable: boolean;
}

export const FERIADOS: Feriado[] = [
  { id: "f-1", fecha: "2025-01-01", nombre: "Año Nuevo", irrenunciable: false },
  { id: "f-2", fecha: "2025-09-18", nombre: "Fiestas Patrias", irrenunciable: true },
  { id: "f-3", fecha: "2025-09-19", nombre: "Día de las Glorias del Ejército", irrenunciable: true },
  { id: "f-4", fecha: "2025-12-25", nombre: "Navidad", irrenunciable: false },
];

// --- Finanzas ---

export interface Banco {
  id: string;
  nombre: string;
}

export const BANCOS: Banco[] = [
  { id: "banco-estado", nombre: "Banco Estado" },
  { id: "banco-chile", nombre: "Banco de Chile" },
  { id: "banco-santander", nombre: "Banco Santander" },
  { id: "banco-itau", nombre: "Banco Itaú" },
  { id: "banco-bci", nombre: "BCI" },
  { id: "banco-scotiabank", nombre: "Scotiabank" },
];

export interface IndiceAjuste {
  id: string;
  nombre: string;
  codigo: string;
}

export const INDICES_AJUSTE: IndiceAjuste[] = [
  { id: "ipc", nombre: "Índice de Precios al Consumidor", codigo: "IPC" },
  { id: "uf", nombre: "Unidad de Fomento", codigo: "UF" },
];

export interface CajaFondo {
  id: string;
  nombre: string;
  tipo: "gasto-comun" | "reserva" | "especial" | "amenities";
}

export const CAJAS_FONDOS: CajaFondo[] = [
  { id: "gc", nombre: "Fondo de Gasto Común", tipo: "gasto-comun" },
  { id: "reserva", nombre: "Fondo de Reserva", tipo: "reserva" },
  { id: "amenities", nombre: "Fondo de Amenities", tipo: "amenities" },
  { id: "extraordinaria", nombre: "Fondo Cuota Extraordinaria", tipo: "especial" },
];

// --- Insumos e Inventario ---

export interface CategoriaInsumo {
  id: string;
  nombre: string;
}

export const CATEGORIAS_INSUMOS: CategoriaInsumo[] = [
  { id: "limpieza", nombre: "Limpieza" },
  { id: "oficina", nombre: "Oficina" },
  { id: "iluminacion", nombre: "Iluminación" },
  { id: "cafe", nombre: "Cafetería" },
  { id: "epp", nombre: "EPP" },
];

export interface UnidadMedida {
  id: string;
  nombre: string;
  abreviatura: string;
}

export const UNIDADES_MEDIDA: UnidadMedida[] = [
  { id: "unidad", nombre: "Unidad", abreviatura: "un" },
  { id: "litro", nombre: "Litro", abreviatura: "L" },
  { id: "kilo", nombre: "Kilogramo", abreviatura: "kg" },
  { id: "metro", nombre: "Metro", abreviatura: "m" },
  { id: "metro-cuadrado", nombre: "Metro Cuadrado", abreviatura: "m²" },
];

// --- Comunidad y Emergencias ---

export interface ContactoEmergencia {
  id: string;
  categoria?: "urgencia" | "tecnico";
  nombre: string;
  telefono: string;
  sitioWeb?: string;
}

export const CONTACTOS_EMERGENCIA: ContactoEmergencia[] = [
  { id: "e-1", categoria: "urgencia", nombre: "Carabineros", telefono: "133" },
  { id: "e-2", categoria: "urgencia", nombre: "Bomberos", telefono: "132" },
  { id: "e-3", categoria: "urgencia", nombre: "Ambulancia", telefono: "131" },
  { id: "e-4", categoria: "urgencia", nombre: "Plan Cuadrante", telefono: "+56 9 1234 5678" },
  { id: "e-5", categoria: "tecnico", nombre: "Empresa de Ascensores", telefono: "+56 2 2345 6789" },
  { id: "e-6", categoria: "tecnico", nombre: "Electricista de Guardia", telefono: "+56 9 8765 4321" },
];

// --- Personas ---

export interface CondicionEspecial {
  id: string;
  nombre: string;
  color: string;
}

export const CONDICIONES_ESPECIALES: CondicionEspecial[] = [
  { id: "c-1", nombre: "Electrodependiente", color: "bg-blue-500 text-white" },
  { id: "c-2", nombre: "Movilidad Reducida", color: "bg-amber-500 text-black" },
  { id: "c-3", nombre: "Adulto Mayor Solo", color: "bg-purple-500 text-white" },
  { id: "c-4", nombre: "Dificultad Auditiva", color: "bg-rose-500 text-white" },
  { id: "c-5", nombre: "Dificultad Visual", color: "bg-emerald-500 text-white" },
];
