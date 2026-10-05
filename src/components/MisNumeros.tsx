import { useRef, useState } from "react";
import {
  calcularTotales,
  descargarPlantilla,
  guardarNumeros,
  leerNumeros,
  parseArchivoNumeros,
  pesos,
  type FilaConError,
  type FilaNumero,
  type NumerosGuardados as Guardado,
} from "@/lib/numeros";

type EstadoPrevia =
  | { tipo: "nada" }
  | { tipo: "error-formato" }
  | { tipo: "error-vacio" }
  | { tipo: "error-columnas"; columnasFaltantes: string[] }
  | { tipo: "revisar"; filas: FilaNumero[]; filasConError: FilaConError[]; totalFilas: number };

export function MisNumeros() {
  const [guardado, setGuardado] = useState<Guardado | null>(() => leerNumeros());
  const [previa, setPrevia] = useState<EstadoPrevia>({ tipo: "nada" });
  const [procesando, setProcesando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function manejarArchivo(file: File) {
    setProcesando(true);
    setPrevia({ tipo: "nada" });
    try {
      const resultado = await parseArchivoNumeros(file);
      if (!resultado.ok) {
        if (resultado.motivo === "formato") setPrevia({ tipo: "error-formato" });
        else if (resultado.motivo === "vacio") setPrevia({ tipo: "error-vacio" });
        else setPrevia({ tipo: "error-columnas", columnasFaltantes: resultado.columnasFaltantes });
        return;
      }
      if (resultado.filas.length === 0 && resultado.filasConError.length > 0) {
        setPrevia({
          tipo: "revisar",
          filas: [],
          filasConError: resultado.filasConError,
          totalFilas: resultado.totalFilas,
        });
        return;
      }
      setPrevia({
        tipo: "revisar",
        filas: resultado.filas,
        filasConError: resultado.filasConError,
        totalFilas: resultado.totalFilas,
      });
    } catch {
      setPrevia({ tipo: "error-formato" });
    } finally {
      setProcesando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function confirmarCarga(filas: FilaNumero[]) {
    const g = guardarNumeros(filas);
    setGuardado(g);
    setPrevia({ tipo: "nada" });
  }

  if (previa.tipo === "revisar") {
    const rango = rangoFechas(previa.filas);
    const totales = previa.filas.length > 0 ? calcularTotales(previa.filas) : null;
    return (
      <section className="rounded-4xl bg-card p-7 shadow-xl sm:p-9">
        <h1 className="text-display text-2xl sm:text-3xl">Esto entendí de tu archivo</h1>

        {previa.filas.length > 0 ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Dato etiqueta="Filas leídas" valor={String(previa.filas.length)} />
            <Dato etiqueta="Rango de fechas" valor={rango} />
          </div>
        ) : null}

        {totales ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Dato etiqueta="Caja" valor={pesos(totales.caja)} />
            <Dato etiqueta="Cartera vencida" valor={pesos(totales.carteraVencida)} />
            <Dato etiqueta="Margen" valor={`${totales.margen.toFixed(1)}%`} />
          </div>
        ) : null}

        {previa.filasConError.length > 0 ? (
          <div className="mt-5 rounded-3xl border border-alert/40 bg-alert-soft p-5">
            <p className="text-sm font-bold uppercase tracking-widest opacity-80">
              {previa.filasConError.length} fila(s) con error
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {previa.filasConError.slice(0, 10).map((e) => (
                <li key={e.fila}>
                  Fila {e.fila}: {e.motivo}
                </li>
              ))}
            </ul>
            {previa.filasConError.length > 10 ? (
              <p className="mt-2 text-sm opacity-70">y {previa.filasConError.length - 10} más…</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-7 grid gap-3">
          {previa.filas.length > 0 ? (
            <button
              onClick={() => confirmarCarga(previa.filas)}
              className="w-full rounded-2xl bg-primary px-6 py-5 text-lg font-bold text-primary-foreground"
            >
              {previa.filasConError.length > 0
                ? `Subir las ${previa.filas.length} filas sin error`
                : "Confirmar y guardar"}
            </button>
          ) : null}
          <button
            onClick={() => setPrevia({ tipo: "nada" })}
            className="w-full rounded-2xl border-2 border-border px-6 py-4 text-base font-bold text-muted-foreground"
          >
            Cancelar y corregir el archivo
          </button>
        </div>
      </section>
    );
  }

  if (!guardado || guardado.filas.length === 0) {
    return (
      <section className="rounded-4xl bg-card p-7 shadow-xl sm:p-9">
        <h1 className="text-display text-3xl sm:text-4xl">Sube tus números</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Descarga la plantilla, llénala con tus movimientos y súbela aquí. Así Limit puede calcular
          tu caja, tu cartera vencida y tu margen.
        </p>

        <MensajeError estado={previa} />

        <div className="mt-7 grid gap-3">
          <button
            type="button"
            onClick={() => descargarPlantilla()}
            className="w-full rounded-2xl border-2 border-border px-6 py-4 text-base font-bold text-foreground hover:border-primary"
          >
            ⬇️ Descargar plantilla
          </button>
          <EntradaArchivo
            inputRef={inputRef}
            procesando={procesando}
            onArchivo={manejarArchivo}
            etiqueta="Subir mi archivo (Excel o CSV)"
          />
        </div>
      </section>
    );
  }

  const totales = calcularTotales(guardado.filas);

  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <TarjetaTotal etiqueta="Caja" valor={pesos(totales.caja)} />
        <TarjetaTotal
          etiqueta="Cartera vencida"
          valor={pesos(totales.carteraVencida)}
          alerta={totales.carteraVencida > 0}
        />
        <TarjetaTotal etiqueta="Margen" valor={`${totales.margen.toFixed(1)}%`} />
      </div>

      <div className="rounded-4xl bg-card p-7 shadow-xl sm:p-9">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-display text-xl">Tus movimientos ({guardado.filas.length})</h2>
        </div>

        <div className="mt-5 -mx-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2">Tipo</th>
                <th className="px-2 py-2">Concepto</th>
                <th className="px-2 py-2 text-right">Monto</th>
                <th className="px-2 py-2">Cliente</th>
              </tr>
            </thead>
            <tbody>
              {guardado.filas.map((f) => (
                <tr key={f.fila} className="border-t border-border/60">
                  <td className="px-2 py-2">{f.fecha}</td>
                  <td className="px-2 py-2">{etiquetaTipo(f.tipo)}</td>
                  <td className="px-2 py-2">{f.concepto}</td>
                  <td className="px-2 py-2 text-right">{pesos(f.monto)}</td>
                  <td className="px-2 py-2">{f.cliente || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <MensajeError estado={previa} />

        <div className="mt-7 grid gap-3">
          <button
            type="button"
            onClick={() => descargarPlantilla()}
            className="w-full rounded-2xl border-2 border-border px-6 py-4 text-base font-bold text-foreground hover:border-primary"
          >
            ⬇️ Descargar plantilla
          </button>
          <EntradaArchivo
            inputRef={inputRef}
            procesando={procesando}
            onArchivo={manejarArchivo}
            etiqueta="Subir un archivo nuevo (reemplaza lo que tienes)"
          />
        </div>
      </div>
    </section>
  );
}

function EntradaArchivo({
  inputRef,
  procesando,
  onArchivo,
  etiqueta,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  procesando: boolean;
  onArchivo: (f: File) => void;
  etiqueta: string;
}) {
  return (
    <label className="block w-full cursor-pointer rounded-2xl bg-primary px-6 py-5 text-center text-lg font-bold text-primary-foreground transition-opacity has-[:disabled]:opacity-40">
      {procesando ? "Leyendo archivo…" : etiqueta}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        disabled={procesando}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onArchivo(f);
        }}
      />
    </label>
  );
}

function MensajeError({ estado }: { estado: EstadoPrevia }) {
  if (estado.tipo === "error-formato") {
    return (
      <p className="mt-5 text-sm text-destructive">
        Ese archivo no es Excel ni CSV. Solo se aceptan archivos .xlsx, .xls o .csv.
      </p>
    );
  }
  if (estado.tipo === "error-vacio") {
    return (
      <p className="mt-5 text-sm text-destructive">
        El archivo está vacío. No se reemplazó lo que ya tenías guardado.
      </p>
    );
  }
  if (estado.tipo === "error-columnas") {
    return (
      <p className="mt-5 text-sm text-destructive">
        Faltan estas columnas: {estado.columnasFaltantes.join(", ")}. Descarga la plantilla de nuevo
        y úsala sin cambiar los encabezados.
      </p>
    );
  }
  return null;
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-2xl bg-muted px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {etiqueta}
      </p>
      <p className="text-display mt-1 text-lg">{valor}</p>
    </div>
  );
}

function TarjetaTotal({
  etiqueta,
  valor,
  alerta = false,
}: {
  etiqueta: string;
  valor: string;
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl p-5 shadow-lg ${alerta ? "bg-alert text-alert-foreground" : "bg-card"}`}
    >
      <p className="text-xs font-bold uppercase tracking-widest opacity-70">{etiqueta}</p>
      <p className="text-display mt-2 text-3xl">{valor}</p>
    </div>
  );
}

function etiquetaTipo(t: FilaNumero["tipo"]) {
  if (t === "ingreso") return "Ingreso";
  if (t === "gasto") return "Gasto";
  return "Por cobrar";
}

function rangoFechas(filas: FilaNumero[]): string {
  if (filas.length === 0) return "—";
  const fechas = filas.map((f) => f.fecha).sort();
  const primera = fechas[0]!;
  const ultima = fechas[fechas.length - 1]!;
  return primera === ultima ? primera : `${primera} a ${ultima}`;
}
