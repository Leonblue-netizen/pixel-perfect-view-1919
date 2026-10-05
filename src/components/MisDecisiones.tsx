import { useState } from "react";
import { leerDecisiones, totalEvitado, type Decision } from "@/lib/limites";
import { pesos } from "@/lib/numeros";

export function MisDecisiones() {
  const [decisiones] = useState<Decision[]>(() => leerDecisiones());

  if (decisiones.length === 0) {
    return (
      <section className="rounded-4xl bg-card p-7 shadow-xl sm:p-9">
        <h1 className="text-display text-3xl sm:text-4xl">Mis decisiones</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Aquí vas a ver qué decidiste cada vez que un límite se acercó o se pasó, y cuánto evitaste
          perder. Todavía no tienes ninguna decisión registrada.
        </p>
      </section>
    );
  }

  const total = totalEvitado(decisiones);

  return (
    <section className="space-y-6">
      <div className="rounded-4xl bg-primary p-7 text-primary-foreground shadow-xl sm:p-9">
        <p className="text-sm font-bold uppercase tracking-widest opacity-70">
          Desde que usas Limit
        </p>
        <p className="text-display mt-2 text-4xl sm:text-5xl">evitaste perder {pesos(total)}</p>
        <p className="mt-2 text-sm opacity-70">
          Cifra estimada. Falta que se confirme en la revisión mensual.
        </p>
      </div>

      <div className="rounded-4xl bg-card p-7 shadow-xl sm:p-9">
        <h2 className="text-display text-xl">Historial</h2>
        <div className="mt-5 space-y-4">
          {decisiones.map((d) => (
            <div key={d.id} className="rounded-3xl bg-muted p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-lg font-bold">{d.limiteDescripcion}</p>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase ${
                    d.decision === "corto"
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-border text-foreground"
                  }`}
                >
                  {d.decision === "corto" ? "Corté" : "Seguí"}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{d.loQueDeciaAlerta}</p>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="opacity-60">
                  {new Date(d.fecha).toLocaleDateString("es-MX", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="font-bold">
                  {d.pesosEvitados > 0 ? `Evitaste perder ${pesos(d.pesosEvitados)}` : "—"}
                  {d.pesosEvitados > 0 && d.estimado ? (
                    <span className="ml-1 font-normal opacity-60">(estimado)</span>
                  ) : null}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
