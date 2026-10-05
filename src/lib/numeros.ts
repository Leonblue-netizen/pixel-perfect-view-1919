import * as XLSX from "xlsx";

export type TipoMovimiento = "ingreso" | "gasto" | "por_cobrar";

export type FilaNumero = {
  fila: number;
  fecha: string; // YYYY-MM-DD
  tipo: TipoMovimiento;
  concepto: string;
  monto: number;
  cliente: string;
  fechaVencimiento: string; // YYYY-MM-DD, solo para por_cobrar
};

export type FilaConError = { fila: number; motivo: string };

export type ResultadoParseo =
  | { ok: true; filas: FilaNumero[]; filasConError: FilaConError[]; totalFilas: number }
  | { ok: false; motivo: "formato" }
  | { ok: false; motivo: "vacio" }
  | { ok: false; motivo: "columnas"; columnasFaltantes: string[] };

export type Totales = { caja: number; carteraVencida: number; margen: number };

const COLUMNAS_REQUERIDAS: { clave: keyof typeof ALIAS_COLUMNAS; etiqueta: string }[] = [
  { clave: "fecha", etiqueta: "fecha" },
  { clave: "tipo", etiqueta: "tipo" },
  { clave: "concepto", etiqueta: "concepto" },
  { clave: "monto", etiqueta: "monto" },
];

const ALIAS_COLUMNAS = {
  fecha: ["fecha"],
  tipo: ["tipo"],
  concepto: ["concepto"],
  monto: ["monto"],
  cliente: ["cliente"],
  fecha_vencimiento: [
    "fecha de vencimiento",
    "fecha_vencimiento",
    "fechavencimiento",
    "vencimiento",
  ],
};

export const EXTENSIONES_ACEPTADAS = [".xlsx", ".xls", ".csv"];

function normalizarTexto(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function esExtensionValida(nombreArchivo: string): boolean {
  const n = nombreArchivo.toLowerCase();
  return EXTENSIONES_ACEPTADAS.some((ext) => n.endsWith(ext));
}

function mapaEncabezados(encabezados: string[]): Record<string, number> {
  const normalizados = encabezados.map(normalizarTexto);
  const mapa: Record<string, number> = {};
  for (const [clave, alias] of Object.entries(ALIAS_COLUMNAS)) {
    const indice = normalizados.findIndex((h) => alias.includes(h));
    if (indice !== -1) mapa[clave] = indice;
  }
  return mapa;
}

function normalizarTipo(valor: string): TipoMovimiento | null {
  const v = normalizarTexto(valor).replace(/_/g, " ");
  if (v === "ingreso") return "ingreso";
  if (v === "gasto") return "gasto";
  if (v === "por cobrar" || v === "cartera" || v === "cuenta por cobrar") return "por_cobrar";
  return null;
}

function normalizarMonto(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/[^0-9,.-]/g, "").replace(/[.,]/g, "");
  if (limpio === "" || limpio === "-") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function excelSerialAFecha(serial: number): Date {
  // Excel cuenta los días desde 1899-12-30
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

function normalizarFecha(valor: unknown): string | null {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return valor.toISOString().slice(0, 10);
  }
  if (typeof valor === "number") {
    const d = excelSerialAFecha(valor);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (typeof valor !== "string") return null;
  const s = valor.trim();
  if (s === "") return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  const latino = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (latino) {
    const [, d, m, y] = latino;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return null;
}

export async function parseArchivoNumeros(file: File): Promise<ResultadoParseo> {
  if (!esExtensionValida(file.name)) {
    return { ok: false, motivo: "formato" };
  }

  const buffer = await file.arrayBuffer();
  const libro = XLSX.read(buffer, { type: "array", cellDates: true, codepage: 65001 });
  const hoja = libro.Sheets[libro.SheetNames[0]!];
  if (!hoja) return { ok: false, motivo: "vacio" };

  const filasCrudas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true });
  const filasSinVacias = filasCrudas.filter(
    (fila) => Array.isArray(fila) && fila.some((c) => c !== undefined && c !== null && c !== ""),
  );

  if (filasSinVacias.length === 0) {
    return { ok: false, motivo: "vacio" };
  }

  const encabezados = (filasSinVacias[0] as unknown[]).map((c) => String(c ?? ""));
  const mapa = mapaEncabezados(encabezados);

  const faltantes = COLUMNAS_REQUERIDAS.filter((c) => mapa[c.clave] === undefined).map(
    (c) => c.etiqueta,
  );
  if (faltantes.length > 0) {
    return { ok: false, motivo: "columnas", columnasFaltantes: faltantes };
  }

  const cuerpo = filasSinVacias.slice(1);
  if (cuerpo.length === 0) {
    return { ok: false, motivo: "vacio" };
  }

  const filas: FilaNumero[] = [];
  const filasConError: FilaConError[] = [];

  cuerpo.forEach((cruda, indice) => {
    const numeroFila = indice + 2; // +1 por encabezado, +1 porque Excel empieza en 1
    const get = (clave: string) =>
      mapa[clave] !== undefined ? (cruda as unknown[])[mapa[clave]!] : undefined;

    const fecha = normalizarFecha(get("fecha"));
    const tipo = normalizarTipo(String(get("tipo") ?? ""));
    const concepto = String(get("concepto") ?? "").trim();
    const monto = normalizarMonto(get("monto"));
    const cliente = String(get("cliente") ?? "").trim();
    const fechaVencimientoCruda = get("fecha_vencimiento");
    const fechaVencimiento = fechaVencimientoCruda ? normalizarFecha(fechaVencimientoCruda) : null;

    if (!fecha) {
      filasConError.push({ fila: numeroFila, motivo: "la fecha no se reconoce" });
      return;
    }
    if (!tipo) {
      filasConError.push({
        fila: numeroFila,
        motivo: "el tipo debe ser ingreso, gasto o por cobrar",
      });
      return;
    }
    if (concepto === "") {
      filasConError.push({ fila: numeroFila, motivo: "falta el concepto" });
      return;
    }
    if (monto === null) {
      filasConError.push({ fila: numeroFila, motivo: "el monto no es un número" });
      return;
    }
    if (tipo === "por_cobrar" && !fechaVencimiento) {
      filasConError.push({
        fila: numeroFila,
        motivo: "falta la fecha de vencimiento (obligatoria para lo que está por cobrar)",
      });
      return;
    }

    filas.push({
      fila: numeroFila,
      fecha,
      tipo,
      concepto,
      monto,
      cliente,
      fechaVencimiento: fechaVencimiento ?? "",
    });
  });

  return { ok: true, filas, filasConError, totalFilas: cuerpo.length };
}

export function calcularTotales(filas: FilaNumero[]): Totales {
  const hoyIso = new Date().toISOString().slice(0, 10);
  let ingresos = 0;
  let gastos = 0;
  let carteraVencida = 0;

  for (const f of filas) {
    if (f.tipo === "ingreso") ingresos += f.monto;
    else if (f.tipo === "gasto") gastos += f.monto;
    else if (f.tipo === "por_cobrar" && f.fechaVencimiento && f.fechaVencimiento < hoyIso) {
      carteraVencida += f.monto;
    }
  }

  const caja = ingresos - gastos;
  const margen = ingresos > 0 ? ((ingresos - gastos) / ingresos) * 100 : 0;

  return { caja, carteraVencida, margen };
}

export function carteraVencidaDetallada(
  filas: FilaNumero[],
): { cliente: string; concepto: string; monto: number; diasVencido: number }[] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  return filas
    .filter(
      (f) =>
        f.tipo === "por_cobrar" &&
        f.fechaVencimiento &&
        f.fechaVencimiento < hoy.toISOString().slice(0, 10),
    )
    .map((f) => {
      const [y, m, d] = f.fechaVencimiento.split("-").map(Number);
      const venc = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
      venc.setHours(0, 0, 0, 0);
      const diasVencido = Math.round((hoy.getTime() - venc.getTime()) / 86400000);
      return {
        cliente: f.cliente || "(sin nombre)",
        concepto: f.concepto,
        monto: f.monto,
        diasVencido,
      };
    })
    .sort((a, b) => b.monto - a.monto);
}

const ENCABEZADOS_PLANTILLA = [
  "fecha",
  "tipo",
  "concepto",
  "monto",
  "cliente",
  "fecha de vencimiento",
];

const FILA_EJEMPLO = ["2026-10-01", "ingreso", "Venta de contado", "350000", "", ""];

const FILA_EJEMPLO_COBRO = [
  "2026-09-15",
  "por cobrar",
  "Servicio prestado",
  "2400000",
  "Pedro Gómez",
  "2026-09-20",
];

export function descargarPlantilla() {
  const filas = [ENCABEZADOS_PLANTILLA, FILA_EJEMPLO, FILA_EJEMPLO_COBRO];
  const csv = filas
    .map((fila) => fila.map((valor) => `"${String(valor).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-limit.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function pesos(n: number) {
  return "$" + Math.round(n).toLocaleString("es-MX");
}

const STORAGE_KEY_NUMEROS = "limit.numeros.v1";

export type NumerosGuardados = { filas: FilaNumero[]; actualizadoEn: string };

export function leerNumeros(): NumerosGuardados | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_NUMEROS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NumerosGuardados;
    if (!Array.isArray(parsed.filas)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function guardarNumeros(filas: FilaNumero[]): NumerosGuardados {
  const data: NumerosGuardados = { filas, actualizadoEn: new Date().toISOString() };
  try {
    window.localStorage.setItem(STORAGE_KEY_NUMEROS, JSON.stringify(data));
  } catch {
    /* ignorar */
  }
  return data;
}

export function leerNumerosGuardados(): FilaNumero[] {
  return leerNumeros()?.filas ?? [];
}
