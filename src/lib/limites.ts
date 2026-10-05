import type { FilaNumero } from "./numeros";

export type ComparaCon =
  | { tipo: "concepto"; valor: string }
  | { tipo: "cliente"; valor: string }
  | { tipo: "cartera_total" }
  | { tipo: "manual" };

export function calcularLlevaMonto(
  comparaCon: ComparaCon,
  filas: FilaNumero[],
  llevaManual: number,
): number {
  if (comparaCon.tipo === "manual") return llevaManual;

  if (comparaCon.tipo === "cartera_total") {
    const hoyIso = new Date().toISOString().slice(0, 10);
    return filas
      .filter((f) => f.tipo === "por_cobrar" && f.fechaVencimiento && f.fechaVencimiento < hoyIso)
      .reduce((acc, f) => acc + f.monto, 0);
  }

  if (comparaCon.tipo === "cliente") {
    const buscado = comparaCon.valor.trim().toLowerCase();
    if (!buscado) return 0;
    return filas
      .filter((f) => f.tipo === "por_cobrar" && f.cliente.trim().toLowerCase() === buscado)
      .reduce((acc, f) => acc + f.monto, 0);
  }

  // concepto
  const buscado = comparaCon.valor.trim().toLowerCase();
  if (!buscado) return 0;
  return filas
    .filter((f) => f.tipo === "gasto" && f.concepto.trim().toLowerCase() === buscado)
    .reduce((acc, f) => acc + f.monto, 0);
}

export type EstadoAlerta = "ok" | "riesgo" | "pasado";

export function calcularEstadoAlerta(args: {
  llevaMonto: number;
  monto: number;
  diasRestantes: number;
}): EstadoAlerta {
  const { llevaMonto, monto, diasRestantes } = args;
  if (diasRestantes < 0) return "pasado";
  if (monto > 0 && llevaMonto >= monto) return "pasado";
  if (diasRestantes <= 3) return "riesgo";
  if (monto > 0 && llevaMonto / monto >= 0.8) return "riesgo";
  return "ok";
}

export function conceptosDisponibles(filas: FilaNumero[]): string[] {
  const vistos = new Set<string>();
  for (const f of filas) {
    if (f.tipo === "gasto" && f.concepto.trim()) vistos.add(f.concepto.trim());
  }
  return Array.from(vistos);
}

export function clientesDisponibles(filas: FilaNumero[]): string[] {
  const vistos = new Set<string>();
  for (const f of filas) {
    if (f.tipo === "por_cobrar" && f.cliente.trim()) vistos.add(f.cliente.trim());
  }
  return Array.from(vistos);
}

export type Decision = {
  id: string;
  fecha: string; // ISO datetime
  limiteDescripcion: string;
  loQueDeciaAlerta: string;
  decision: "sigo" | "corto";
  pesosEvitados: number;
  estimado: boolean;
};

const STORAGE_KEY_DECISIONES = "limit.decisiones.v1";

export function leerDecisiones(): Decision[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_DECISIONES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Decision[]) : [];
  } catch {
    return [];
  }
}

export function agregarDecision(d: Omit<Decision, "id" | "fecha">): Decision {
  const nueva: Decision = {
    ...d,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fecha: new Date().toISOString(),
  };
  const siguientes = [nueva, ...leerDecisiones()];
  try {
    window.localStorage.setItem(STORAGE_KEY_DECISIONES, JSON.stringify(siguientes));
  } catch {
    /* ignorar */
  }
  return nueva;
}

export function totalEvitado(decisiones: Decision[]): number {
  return decisiones.reduce((acc, d) => acc + d.pesosEvitados, 0);
}
