import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Limit — pon tu límite antes de arriesgar" },
      {
        name: "description",
        content:
          "Escribe cuánto dinero y hasta qué fecha estás dispuesto a arriesgar. Limit te avisa cuando llega el día de decidir: sigues o cortas.",
      },
      { property: "og:title", content: "Limit — pon tu límite antes de arriesgar" },
      {
        property: "og:description",
        content: "Un solo límite, claro y por escrito. Limit te lo recuerda cuando se cumple.",
      },
    ],
  }),
  component: Index,
});

type Limite = {
  descripcion: string;
  monto: number;
  fecha: string; // YYYY-MM-DD
};

type Estado = { limite: Limite | null; cerrado: boolean };

const STORAGE_KEY = "limit.estado.v1";

function leerEstado(): Estado {
  if (typeof window === "undefined") return { limite: null, cerrado: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { limite: null, cerrado: false };
    return JSON.parse(raw) as Estado;
  } catch {
    return { limite: null, cerrado: false };
  }
}

function diasRestantes(fecha: string) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const [y, m, d] = fecha.split("-").map(Number);
  const limite = new Date(y, (m ?? 1) - 1, d ?? 1);
  limite.setHours(0, 0, 0, 0);
  return Math.round((limite.getTime() - hoy.getTime()) / 86400000);
}

function pesos(n: number) {
  return "$" + n.toLocaleString("es-MX");
}

function Blobs() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-secondary/15 blur-3xl" />
      <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute right-6 top-24 h-40 w-40 rounded-full border border-border" />
    </div>
  );
}

export default function Index() {
  const [estado, setEstado] = useState<Estado>({ limite: null, cerrado: false });
  const [listo, setListo] = useState(false);

  useEffect(() => {
    setEstado(leerEstado());
    setListo(true);
  }, []);

  function guardar(next: Estado) {
    setEstado(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignorar */
    }
  }

  return (
    <main className="relative min-h-screen px-5 py-10 sm:py-16">
      <Blobs />
      <div className="relative mx-auto w-full max-w-lg">
        <header className="mb-8 flex items-baseline gap-3">
          <span className="text-display text-3xl text-primary">Limit</span>
          <span className="text-sm text-muted-foreground">un límite a la vez</span>
        </header>

        {!listo ? null : estado.cerrado ? (
          <Cierre onNuevo={() => guardar({ limite: null, cerrado: false })} />
        ) : !estado.limite ? (
          <Formulario onGuardar={(l) => guardar({ limite: l, cerrado: false })} />
        ) : (
          <MiLimite
            limite={estado.limite}
            onSigo={() => guardar({ limite: null, cerrado: false })}
            onCorto={() => guardar({ limite: null, cerrado: true })}
          />
        )}
      </div>
    </main>
  );
}

function Formulario({ onGuardar }: { onGuardar: (l: Limite) => void }) {
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");

  const valido = descripcion.trim() !== "" && Number(monto) > 0 && fecha !== "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valido) return;
        onGuardar({ descripcion: descripcion.trim(), monto: Number(monto), fecha });
      }}
      className="rounded-4xl bg-card p-7 shadow-xl sm:p-9"
    >
      <h1 className="text-display text-4xl sm:text-5xl">
        ¿Cuánto estás
        <br />
        dispuesto a
        <br />
        <span className="text-primary">perder?</span>
      </h1>
      <p className="mt-4 text-base text-muted-foreground">
        Escríbelo ahora, antes de empezar. Después es tarde.
      </p>

      <div className="mt-8 space-y-6">
        <Campo etiqueta="¿En qué te estás metiendo?">
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: sociedad con Juan en el salón"
            className="w-full rounded-2xl bg-muted px-5 py-4 text-lg outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
          />
        </Campo>

        <Campo etiqueta="Máximo que puedes perder">
          <div className="flex items-center rounded-2xl bg-muted px-5 focus-within:ring-2 focus-within:ring-ring">
            <span className="text-display text-2xl text-muted-foreground">$</span>
            <input
              value={monto}
              onChange={(e) => setMonto(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              placeholder="50000"
              className="text-display w-full bg-transparent px-2 py-4 text-2xl outline-none placeholder:font-normal placeholder:text-muted-foreground"
            />
          </div>
        </Campo>

        <Campo etiqueta="Fecha para revisar">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-2xl bg-muted px-5 py-4 text-lg outline-none ring-ring focus:ring-2"
          />
        </Campo>
      </div>

      <button
        type="submit"
        disabled={!valido}
        className="mt-8 w-full rounded-2xl bg-primary px-6 py-5 text-lg font-bold text-primary-foreground transition-opacity disabled:opacity-40"
      >
        Guardar límite
      </button>
    </form>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-muted-foreground">{etiqueta}</span>
      {children}
    </label>
  );
}

function MiLimite({
  limite,
  onSigo,
  onCorto,
}: {
  limite: Limite;
  onSigo: () => void;
  onCorto: () => void;
}) {
  const dias = diasRestantes(limite.fecha);
  const vencido = dias < 0;

  if (vencido) {
    return (
      <section className="rounded-4xl bg-alert p-7 text-alert-foreground shadow-xl sm:p-9">
        <p className="text-sm font-bold uppercase tracking-widest opacity-70">Se cumplió tu plazo</p>
        <h1 className="text-display mt-3 text-4xl sm:text-5xl">
          Pasaste tu límite.
          <br />
          ¿Sigues o cortas?
        </h1>
        <div className="mt-6 rounded-3xl bg-alert-foreground/10 p-5">
          <p className="text-lg font-medium">{limite.descripcion}</p>
          <p className="text-display mt-1 text-3xl">{pesos(limite.monto)}</p>
          <p className="mt-1 text-sm opacity-70">
            Tu fecha era el {new Date(limite.fecha + "T00:00:00").toLocaleDateString("es-MX")}
          </p>
        </div>
        <div className="mt-7 grid gap-3">
          <button
            onClick={onSigo}
            className="w-full rounded-2xl bg-alert-foreground px-6 py-5 text-lg font-bold text-primary"
          >
            Sigo
          </button>
          <button
            onClick={onCorto}
            className="w-full rounded-2xl border-2 border-alert-foreground/40 px-6 py-5 text-lg font-bold"
          >
            Corto
          </button>
        </div>
        <p className="mt-5 text-sm opacity-80">
          Si sigues, defines un monto y una fecha nuevos. No hay prórrogas silenciosas.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-4xl bg-primary p-7 text-primary-foreground shadow-xl sm:p-9">
      <p className="text-sm font-bold uppercase tracking-widest opacity-60">Límite vigente</p>
      <p className="text-display mt-4 text-7xl sm:text-8xl">{dias}</p>
      <p className="text-display text-2xl">{dias === 1 ? "día restante" : "días restantes"}</p>

      <div className="mt-8 rounded-3xl bg-primary-foreground/10 p-5">
        <p className="text-lg font-medium">{limite.descripcion}</p>
        <p className="text-display mt-2 text-4xl">{pesos(limite.monto)}</p>
        <p className="mt-1 text-sm opacity-70">
          Revisas el {new Date(limite.fecha + "T00:00:00").toLocaleDateString("es-MX")}
        </p>
      </div>
      <p className="mt-6 text-sm opacity-70">
        Cuando llegue esa fecha, esta pantalla te va a preguntar si sigues o cortas.
      </p>
    </section>
  );
}

function Cierre({ onNuevo }: { onNuevo: () => void }) {
  return (
    <section className="rounded-4xl bg-secondary p-7 text-secondary-foreground shadow-xl sm:p-9">
      <h1 className="text-display text-4xl sm:text-5xl">
        Decidiste cortar
        <br />a tiempo.
      </h1>
      <p className="mt-4 text-lg opacity-80">Este límite queda cerrado.</p>
      <button
        onClick={onNuevo}
        className="mt-8 w-full rounded-2xl bg-secondary-foreground px-6 py-5 text-lg font-bold text-primary"
      >
        Crear un límite nuevo
      </button>
    </section>
  );
}
