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

export type FilaConError = { fila: number; motivo: string; hoja?: string };

export type ResultadoParseo =
  | { ok: true; filas: FilaNumero[]; filasConError: FilaConError[]; totalFilas: number }
  | { ok: false; motivo: "formato" }
  | { ok: false; motivo: "vacio" }
  | { ok: false; motivo: "columnas"; columnasFaltantes: string[] };

export type Totales = { caja: number; carteraVencida: number; margen: number };

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

// Modo plano (una sola hoja con columna "tipo"): usado como respaldo para CSV
// o archivos que no siguen la plantilla de pestañas por tipo.
const COLUMNAS_REQUERIDAS_PLANO: { clave: keyof typeof ALIAS_COLUMNAS; etiqueta: string }[] = [
  { clave: "fecha", etiqueta: "fecha" },
  { clave: "tipo", etiqueta: "tipo" },
  { clave: "concepto", etiqueta: "concepto" },
  { clave: "monto", etiqueta: "monto" },
];

// Modo por pestañas (plantilla recomendada): cada hoja ya dice el tipo,
// así que no hace falta escribirlo a mano.
const COLUMNAS_POR_TIPO: Record<
  TipoMovimiento,
  { clave: keyof typeof ALIAS_COLUMNAS; etiqueta: string }[]
> = {
  ingreso: [
    { clave: "fecha", etiqueta: "fecha" },
    { clave: "concepto", etiqueta: "concepto" },
    { clave: "monto", etiqueta: "monto" },
  ],
  gasto: [
    { clave: "fecha", etiqueta: "fecha" },
    { clave: "concepto", etiqueta: "concepto" },
    { clave: "monto", etiqueta: "monto" },
  ],
  por_cobrar: [
    { clave: "fecha", etiqueta: "fecha" },
    { clave: "concepto", etiqueta: "concepto" },
    { clave: "monto", etiqueta: "monto" },
    { clave: "cliente", etiqueta: "cliente" },
    { clave: "fecha_vencimiento", etiqueta: "fecha de vencimiento" },
  ],
};

const NOMBRES_HOJA: Record<TipoMovimiento, string[]> = {
  ingreso: ["ingresos", "ingreso"],
  gasto: ["gastos", "gasto"],
  por_cobrar: ["por cobrar", "por_cobrar", "cartera", "cuentas por cobrar", "cuenta por cobrar"],
};

const ETIQUETA_TIPO: Record<TipoMovimiento, string> = {
  ingreso: "Ingresos",
  gasto: "Gastos",
  por_cobrar: "Por cobrar",
};

export const EXTENSIONES_ACEPTADAS = [".xlsx", ".xls", ".csv"];

function normalizarTexto(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function esExtensionValida(nombreArchivo: string): boolean {
  const n = nombreArchivo.toLowerCase();
  return EXTENSIONES_ACEPTADAS.some((ext) => n.endsWith(ext));
}

function tipoDesdeNombreHoja(nombre: string): TipoMovimiento | null {
  const n = normalizarTexto(nombre);
  for (const [tipo, alias] of Object.entries(NOMBRES_HOJA)) {
    if (alias.includes(n)) return tipo as TipoMovimiento;
  }
  return null;
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

function filasNoVacias(hoja: XLSX.WorkSheet): unknown[][] {
  const filasCrudas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true });
  return filasCrudas.filter(
    (fila) => Array.isArray(fila) && fila.some((c) => c !== undefined && c !== null && c !== ""),
  );
}

function parsearFila(
  cruda: unknown[],
  mapa: Record<string, number>,
  tipoFijo: TipoMovimiento | null,
): { ok: true; fila: Omit<FilaNumero, "fila"> } | { ok: false; motivo: string } {
  const get = (clave: string) => (mapa[clave] !== undefined ? cruda[mapa[clave]!] : undefined);

  const fecha = normalizarFecha(get("fecha"));
  const tipo = tipoFijo ?? normalizarTipo(String(get("tipo") ?? ""));
  const concepto = String(get("concepto") ?? "").trim();
  const monto = normalizarMonto(get("monto"));
  const cliente = String(get("cliente") ?? "").trim();
  const fechaVencimientoCruda = get("fecha_vencimiento");
  const fechaVencimiento = fechaVencimientoCruda ? normalizarFecha(fechaVencimientoCruda) : null;

  if (!fecha) return { ok: false, motivo: "la fecha no se reconoce" };
  if (!tipo) return { ok: false, motivo: "el tipo debe ser ingreso, gasto o por cobrar" };
  if (concepto === "") return { ok: false, motivo: "falta el concepto" };
  if (monto === null) return { ok: false, motivo: "el monto no es un número" };
  if (tipo === "por_cobrar" && !fechaVencimiento) {
    return {
      ok: false,
      motivo: "falta la fecha de vencimiento (obligatoria para lo que está por cobrar)",
    };
  }

  return {
    ok: true,
    fila: { fecha, tipo, concepto, monto, cliente, fechaVencimiento: fechaVencimiento ?? "" },
  };
}

function parseArchivoPorHojas(
  libro: XLSX.WorkBook,
  hojasTipadas: { nombre: string; tipo: TipoMovimiento }[],
): ResultadoParseo {
  const filas: FilaNumero[] = [];
  const filasConError: FilaConError[] = [];
  const columnasFaltantes: string[] = [];
  let totalFilas = 0;

  for (const { nombre, tipo } of hojasTipadas) {
    const hoja = libro.Sheets[nombre];
    if (!hoja) continue;
    const filasSinVacias = filasNoVacias(hoja);
    if (filasSinVacias.length === 0) continue;

    const encabezados = (filasSinVacias[0] as unknown[]).map((c) => String(c ?? ""));
    const mapa = mapaEncabezados(encabezados);

    const faltantes = COLUMNAS_POR_TIPO[tipo]
      .filter((c) => mapa[c.clave] === undefined)
      .map((c) => c.etiqueta);
    if (faltantes.length > 0) {
      columnasFaltantes.push(`${ETIQUETA_TIPO[tipo]}: ${faltantes.join(", ")}`);
      continue;
    }

    const cuerpo = filasSinVacias.slice(1);
    totalFilas += cuerpo.length;

    cuerpo.forEach((cruda, indice) => {
      const numeroFila = indice + 2;
      const resultado = parsearFila(cruda as unknown[], mapa, tipo);
      if (resultado.ok) {
        filas.push({ fila: numeroFila, ...resultado.fila });
      } else {
        filasConError.push({ fila: numeroFila, motivo: resultado.motivo, hoja: nombre });
      }
    });
  }

  if (columnasFaltantes.length > 0) {
    return { ok: false, motivo: "columnas", columnasFaltantes };
  }
  if (totalFilas === 0) {
    return { ok: false, motivo: "vacio" };
  }

  return { ok: true, filas, filasConError, totalFilas };
}

function parseArchivoPlano(libro: XLSX.WorkBook): ResultadoParseo {
  const hoja = libro.Sheets[libro.SheetNames[0]!];
  if (!hoja) return { ok: false, motivo: "vacio" };

  const filasSinVacias = filasNoVacias(hoja);
  if (filasSinVacias.length === 0) return { ok: false, motivo: "vacio" };

  const encabezados = (filasSinVacias[0] as unknown[]).map((c) => String(c ?? ""));
  const mapa = mapaEncabezados(encabezados);

  const faltantes = COLUMNAS_REQUERIDAS_PLANO.filter((c) => mapa[c.clave] === undefined).map(
    (c) => c.etiqueta,
  );
  if (faltantes.length > 0) {
    return { ok: false, motivo: "columnas", columnasFaltantes: faltantes };
  }

  const cuerpo = filasSinVacias.slice(1);
  if (cuerpo.length === 0) return { ok: false, motivo: "vacio" };

  const filas: FilaNumero[] = [];
  const filasConError: FilaConError[] = [];

  cuerpo.forEach((cruda, indice) => {
    const numeroFila = indice + 2;
    const resultado = parsearFila(cruda as unknown[], mapa, null);
    if (resultado.ok) {
      filas.push({ fila: numeroFila, ...resultado.fila });
    } else {
      filasConError.push({ fila: numeroFila, motivo: resultado.motivo });
    }
  });

  return { ok: true, filas, filasConError, totalFilas: cuerpo.length };
}

export async function parseArchivoNumeros(file: File): Promise<ResultadoParseo> {
  if (!esExtensionValida(file.name)) {
    return { ok: false, motivo: "formato" };
  }

  const buffer = await file.arrayBuffer();
  const libro = XLSX.read(buffer, { type: "array", cellDates: true, codepage: 65001 });

  const hojasTipadas = libro.SheetNames.map((nombre) => ({
    nombre,
    tipo: tipoDesdeNombreHoja(nombre),
  })).filter((h): h is { nombre: string; tipo: TipoMovimiento } => h.tipo !== null);

  if (hojasTipadas.length > 0) {
    return parseArchivoPorHojas(libro, hojasTipadas);
  }

  return parseArchivoPlano(libro);
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

export function descargarPlantilla() {
  const libro = XLSX.utils.book_new();

  const ingresos = XLSX.utils.aoa_to_sheet([
    ["fecha", "concepto", "monto"],
    ["2026-10-01", "Venta de contado", "350000"],
  ]);
  ingresos["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(libro, ingresos, "Ingresos");

  const gastos = XLSX.utils.aoa_to_sheet([
    ["fecha", "concepto", "monto"],
    ["2026-10-02", "Arriendo del local", "500000"],
  ]);
  gastos["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(libro, gastos, "Gastos");

  const porCobrar = XLSX.utils.aoa_to_sheet([
    ["fecha", "cliente", "concepto", "monto", "fecha de vencimiento"],
    ["2026-09-15", "Pedro Gómez", "Servicio prestado", "2400000", "2026-09-20"],
  ]);
  porCobrar["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 30 }, { wch: 14 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(libro, porCobrar, "Por cobrar");

  XLSX.writeFile(libro, "plantilla-limit.xlsx");
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
