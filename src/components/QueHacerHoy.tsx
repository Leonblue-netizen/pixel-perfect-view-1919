import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { pedirAcciones } from "@/lib/acciones.functions";
import { calcularTotales, carteraVencidaDetallada, pesos, type FilaNumero } from "@/lib/numeros";
import type { EstadoAlerta } from "@/lib/limites";

const CACHE_KEY = "limit.acciones.v1";

type Limite = { id: string; descripcion: string; monto: number; fecha: string };
type Alerta = {
  id: string;
  descripcion: string;
  monto: number;
  fecha: string;
  llevaMonto: number;
  estadoAlerta: EstadoAlerta;
};
type Accion = { titulo: string; porque: string };
type Cache = { firma: string; acciones: Accion[] };

function AlertaCard({
  alerta,
  onSigo,
  onCorto,
}: {
  alerta: Alerta;
  onSigo: () => void;
  onCorto: () => void;
}) {
  const esPasado = alerta.estadoAlerta === "pasado";
  const pct =
    alerta.monto > 0 ? Math.min(100, Math.round((alerta.llevaMonto / alerta.monto) * 100)) : 0;

  return (
    <section className="rounded-4xl bg-alert p-7 text-alert-foreground shadow-xl sm:p-9">
      <p className="text-sm font-bold uppercase tracking-widest opacity-70">
        {esPasado ? "Se cumplió tu plazo" : "Te estás acercando"}
      </p>
      <h1 className="text-display mt-2 text-3xl sm:text-4xl">{alerta.descripcion}</h1>
      <p className="mt-2 text-sm opacity-80">
        Llevas {pesos(alerta.llevaMonto)} de {pesos(alerta.monto)} ({pct}%)
      </p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/10">
        <div className="h-full rounded-full bg-alert-foreground" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={onSigo}
          className="rounded-2xl bg-alert-foreground px-4 py-4 text-base font-bold text-primary"
        >
          Sigo
        </button>
        <button
          onClick={onCorto}
          className="rounded-2xl border-2 border-alert-foreground/40 px-4 py-4 text-base font-bold"
        >
          Corto
        </button>
      </div>
    </section>
  );
}

function diasRestantes(fecha: string) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const [y, m, d] = fecha.split("-").map(Number);
  const limite = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  limite.setHours(0, 0, 0, 0);
  return Math.round((limite.getTime() - hoy.getTime()) / 86400000);
}

function leerCache(): Cache | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Cache;
  } catch {
    return null;
  }
}

function guardarCache(c: Cache) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignorar */
  }
}

export function QueHacerHoy({
  negocio,
  limites,
  numeros,
  alertas,
  onSigoAlerta,
  onCortoAlerta,
}: {
  negocio: string;
  limites: Limite[];
  numeros: FilaNumero[];
  alertas: Alerta[];
  onSigoAlerta: (a: Alerta) => void;
  onCortoAlerta: (a: Alerta) => void;
}) {
  const pedir = useServerFn(pedirAcciones);
  const [acciones, setAcciones] = useState<Accion[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firmaRef = useRef<string>("");

  const hayDatos = numeros.length > 0 || limites.length > 0;

  const totales = calcularTotales(numeros);
  const cartera = carteraVencidaDetallada(numeros);
  const firma = JSON.stringify({ numeros: numeros.length, totales, limites });

  async function pedirAcciones_(forzar: boolean) {
    if (!hayDatos) return;
    if (!forzar && firmaRef.current === firma) {
      const cache = leerCache();
      if (cache && cache.firma === firma) {
        setAcciones(cache.acciones);
        return;
      }
    }
    firmaRef.current = firma;
    setCargando(true);
    setError(null);
    try {
      const res = await pedir({
        data: {
          negocio,
          caja: totales.caja,
          carteraVencida: totales.carteraVencida,
          margen: totales.margen,
          limites: limites.map((l) => ({
            descripcion: l.descripcion,
            monto: l.monto,
            fecha: l.fecha,
            dias: diasRestantes(l.fecha),
          })),
          cartera: cartera.map((c) => ({
            cliente: c.cliente,
            concepto: c.concepto,
            monto: c.monto,
            diasVencido: c.diasVencido,
          })),
        },
      });
      if (res.ok) {
        setAcciones(res.acciones);
        guardarCache({ firma, acciones: res.acciones });
      } else {
        setError(
          res.motivo === "sin-llave"
            ? "La IA no está configurada todavía."
            : "No pude calcular tus acciones. Inténtalo de nuevo.",
        );
        const cache = leerCache();
        if (cache) setAcciones(cache.acciones);
      }
    } catch {
      setError("No pude calcular tus acciones. Inténtalo de nuevo.");
      const cache = leerCache();
      if (cache) setAcciones(cache.acciones);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    const cache = leerCache();
    if (cache && cache.firma === firma) {
      setAcciones(cache.acciones);
      firmaRef.current = firma;
      return;
    }
    void pedirAcciones_(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, hayDatos]);

  const alertasBloque =
    alertas.length > 0 ? (
      <div className="space-y-4">
        {alertas.map((a) => (
          <AlertaCard
            key={a.id}
            alerta={a}
            onSigo={() => onSigoAlerta(a)}
            onCorto={() => onCortoAlerta(a)}
          />
        ))}
      </div>
    ) : null;

  if (!hayDatos) {
    return (
      <div className="space-y-6">
        {alertasBloque}
        <section className="rounded-4xl bg-card p-7 shadow-xl sm:p-9">
          <h1 className="text-display text-3xl sm:text-4xl">Todavía no hay nada que leer</h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Sube tus números en "Mis números" o escribe tu primer límite en "Mis límites". Con
            cualquiera de los dos, Limit ya puede decirte qué hacer hoy.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {alertasBloque}
      <section className="rounded-4xl bg-card p-7 shadow-xl sm:p-9">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-display text-3xl sm:text-4xl">Qué hacer hoy</h1>
          <button
            type="button"
            onClick={() => void pedirAcciones_(true)}
            disabled={cargando}
            className="shrink-0 rounded-2xl border-2 border-border px-4 py-2 text-sm font-bold text-muted-foreground hover:border-primary disabled:opacity-40"
          >
            Actualizar
          </button>
        </div>

        {cargando && !acciones ? (
          <div className="mt-6 flex items-center gap-2 text-sm opacity-70">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
            Pensando…
          </div>
        ) : error && !acciones ? (
          <div className="mt-6">
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => void pedirAcciones_(true)}
              className="mt-4 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
            >
              Reintentar
            </button>
          </div>
        ) : acciones ? (
          <div className="mt-6 space-y-4">
            {error ? (
              <p className="text-sm text-destructive">
                {error} Mostrando la última lectura guardada.
              </p>
            ) : null}
            {acciones.map((a, i) => (
              <div key={i} className="rounded-3xl bg-muted p-5">
                <p className="text-lg font-bold">{a.titulo}</p>
                {a.porque ? <p className="mt-2 text-sm text-muted-foreground">{a.porque}</p> : null}
              </div>
            ))}
          </div>
        ) : null}

        <p className="mt-7 text-xs leading-relaxed opacity-60">
          Esto es una orientación, no asesoría contable ni legal.
        </p>
      </section>
    </div>
  );
}
