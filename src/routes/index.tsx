import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { pedirConsejo } from "@/lib/consejo.functions";
import { MenuLateral, type Seccion } from "@/components/MenuLateral";
import { MisNumeros } from "@/components/MisNumeros";
import { MisDecisiones } from "@/components/MisDecisiones";
import { QueHacerHoy } from "@/components/QueHacerHoy";
import { leerNumerosGuardados, type FilaNumero } from "@/lib/numeros";
import {
  agregarDecision,
  calcularEstadoAlerta,
  calcularLlevaMonto,
  clientesDisponibles,
  conceptosDisponibles,
  type ComparaCon,
  type EstadoAlerta,
} from "@/lib/limites";

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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Limite = {
  id: string;
  descripcion: string;
  contexto: string;
  monto: number;
  fecha: string; // YYYY-MM-DD
  consejo?: string;
  comparaCon: ComparaCon;
  llevaManual: number;
  avisosRespondidos: EstadoAlerta[];
};

type LimiteConEstado = Limite & { llevaMonto: number; estadoAlerta: EstadoAlerta };

type AlertaLimite = Pick<
  LimiteConEstado,
  "id" | "descripcion" | "monto" | "fecha" | "llevaMonto" | "estadoAlerta"
>;

type Estado = { limites: Limite[]; cerrado: boolean };

type Perfil = { nombre: string; color: string; negocio: string; whatsapp: string };

const STORAGE_KEY = "limit.estado.v1";
const BIENVENIDA_KEY = "limit.bienvenida.v1";
const INTRO_KEY = "limit.intro.v2";
const PERFIL_KEY = "limit.perfil.v1";

const COLORES_PERFIL = [
  { nombre: "Rosa", valor: "#FFAEEE" },
  { nombre: "Amarillo", valor: "#FEF9B0" },
  { nombre: "Morado", valor: "#A9A9EB" },
];

const COLOR_PERFIL_POR_DEFECTO = COLORES_PERFIL[0]!.valor;

function nuevoId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function leerPerfil(): Perfil {
  const porDefecto: Perfil = {
    nombre: "",
    color: COLOR_PERFIL_POR_DEFECTO,
    negocio: "",
    whatsapp: "",
  };
  if (typeof window === "undefined") return porDefecto;
  try {
    const raw = window.localStorage.getItem(PERFIL_KEY);
    if (!raw) return porDefecto;
    const parsed = JSON.parse(raw) as Partial<Perfil>;
    return {
      nombre: typeof parsed.nombre === "string" ? parsed.nombre : "",
      color: typeof parsed.color === "string" && parsed.color ? parsed.color : porDefecto.color,
      negocio: typeof parsed.negocio === "string" ? parsed.negocio : "",
      whatsapp: typeof parsed.whatsapp === "string" ? parsed.whatsapp : "",
    };
  } catch {
    return porDefecto;
  }
}

function formatoFechaGoogle(fecha: string) {
  return fecha.replace(/-/g, "");
}

function linkGoogleCalendar(limite: Limite) {
  const dia = formatoFechaGoogle(limite.fecha);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Revisar límite: ${limite.descripcion}`,
    dates: `${dia}/${dia}`,
    details: `Tu límite era ${pesos(limite.monto)}. ${limite.contexto ?? ""}`.trim(),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function leerEstado(): Estado {
  if (typeof window === "undefined") return { limites: [], cerrado: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { limites: [], cerrado: false };
    const parsed = JSON.parse(raw) as {
      limites?: Limite[];
      limite?: Limite | null;
      cerrado?: boolean;
    };
    // compat: estado anterior guardaba un solo límite en "limite"
    let limites: Limite[] = Array.isArray(parsed.limites) ? parsed.limites : [];
    if (limites.length === 0 && parsed.limite) {
      limites = [parsed.limite];
    }
    for (const l of limites) {
      if (typeof l.contexto !== "string") l.contexto = "";
      if (typeof l.id !== "string" || !l.id) l.id = nuevoId();
      if (!l.comparaCon) l.comparaCon = { tipo: "manual" };
      if (typeof l.llevaManual !== "number") l.llevaManual = 0;
      if (!Array.isArray(l.avisosRespondidos)) l.avisosRespondidos = [];
    }
    return { limites, cerrado: parsed.cerrado === true };
  } catch {
    return { limites: [], cerrado: false };
  }
}

function diasRestantes(fecha: string) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const [y, m, d] = fecha.split("-").map(Number);
  const limite = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);

  limite.setHours(0, 0, 0, 0);
  return Math.round((limite.getTime() - hoy.getTime()) / 86400000);
}

function pesos(n: number) {
  return "$" + n.toLocaleString("es-MX");
}

function calcularLimitesConEstado(limites: Limite[], numeros: FilaNumero[]): LimiteConEstado[] {
  return limites.map((l) => {
    const llevaMonto = calcularLlevaMonto(l.comparaCon, numeros, l.llevaManual);
    const estadoAlerta = calcularEstadoAlerta({
      llevaMonto,
      monto: l.monto,
      diasRestantes: diasRestantes(l.fecha),
    });
    return { ...l, llevaMonto, estadoAlerta };
  });
}

function mensajeAlerta(l: AlertaLimite): string {
  const dias = diasRestantes(l.fecha);
  const progreso = l.monto > 0 ? ` Llevas ${pesos(l.llevaMonto)} de ${pesos(l.monto)}.` : "";
  if (l.estadoAlerta === "pasado") {
    if (dias < 0) {
      return `Tu límite "${l.descripcion}" se pasó de fecha (era el ${l.fecha}).${progreso}`;
    }
    return `Tu límite "${l.descripcion}" llegó a su tope.${progreso}`;
  }
  return `Tu límite "${l.descripcion}" está cerca.${progreso} Te quedan ${dias} día(s).`;
}

function necesitaDecision(l: LimiteConEstado): boolean {
  return (
    l.estadoAlerta === "pasado" ||
    (l.estadoAlerta === "riesgo" && !l.avisosRespondidos.includes("riesgo"))
  );
}

function Blobs() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-secondary/15 blur-3xl" />
      <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
    </div>
  );
}

export default function Index() {
  const [estado, setEstado] = useState<Estado>({ limites: [], cerrado: false });
  const [perfil, setPerfil] = useState<Perfil>({
    nombre: "",
    color: COLOR_PERFIL_POR_DEFECTO,
    negocio: "",
    whatsapp: "",
  });
  const [bienvenidaVista, setBienvenidaVista] = useState(false);
  const [introVisto, setIntroVisto] = useState(false);
  const [listo, setListo] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [seccion, setSeccion] = useState<Seccion>("que-hacer-hoy");

  useEffect(() => {
    setEstado(leerEstado());
    setPerfil(leerPerfil());
    try {
      setBienvenidaVista(window.localStorage.getItem(BIENVENIDA_KEY) === "1");
      setIntroVisto(window.localStorage.getItem(INTRO_KEY) === "1");
    } catch {
      /* ignorar */
    }
    setListo(true);
  }, []);

  function guardarPerfil(next: Perfil) {
    setPerfil(next);
    try {
      window.localStorage.setItem(PERFIL_KEY, JSON.stringify(next));
    } catch {
      /* ignorar */
    }
  }

  function guardar(next: Estado) {
    setEstado(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignorar */
    }
  }

  function agregarLimite(l: Limite) {
    guardar({ limites: [...estado.limites, l], cerrado: false });
    setMostrarFormulario(false);
  }

  function quitarLimite(id: string, cortado: boolean) {
    const restantes = estado.limites.filter((l) => l.id !== id);
    guardar({ limites: restantes, cerrado: cortado && restantes.length === 0 });
  }

  function marcarAvisoRespondido(id: string, aviso: EstadoAlerta) {
    guardar({
      ...estado,
      limites: estado.limites.map((l) =>
        l.id === id ? { ...l, avisosRespondidos: [...l.avisosRespondidos, aviso] } : l,
      ),
    });
  }

  function actualizarLlevaManual(id: string, valor: number) {
    guardar({
      ...estado,
      limites: estado.limites.map((l) => (l.id === id ? { ...l, llevaManual: valor } : l)),
    });
  }

  function manejarSigo(l: AlertaLimite) {
    agregarDecision({
      limiteDescripcion: l.descripcion,
      loQueDeciaAlerta: mensajeAlerta(l),
      decision: "sigo",
      pesosEvitados: 0,
      estimado: false,
    });
    if (l.estadoAlerta === "pasado") {
      quitarLimite(l.id, false);
    } else {
      marcarAvisoRespondido(l.id, "riesgo");
    }
  }

  function manejarCorto(l: AlertaLimite) {
    const pesosEvitados = Math.max(0, l.monto - l.llevaMonto);
    agregarDecision({
      limiteDescripcion: l.descripcion,
      loQueDeciaAlerta: mensajeAlerta(l),
      decision: "corto",
      pesosEvitados,
      estimado: true,
    });
    quitarLimite(l.id, true);
  }

  const hayLimites = estado.limites.length > 0;
  const mostrarPanel = listo && bienvenidaVista && introVisto;
  const numeros = leerNumerosGuardados();
  const limitesConEstado = calcularLimitesConEstado(estado.limites, numeros);
  const alertas = limitesConEstado.filter(necesitaDecision);

  return (
    <main className="relative min-h-screen px-5 pb-24 pt-10 sm:pb-16 sm:pt-16">
      <Blobs />
      <div className={`relative mx-auto w-full ${mostrarPanel ? "max-w-4xl" : "max-w-lg"}`}>
        <header className="mb-8 flex items-baseline gap-3">
          <span className="text-display text-3xl text-primary">Limit</span>
          <span className="text-sm text-muted-foreground">
            {perfil.nombre ? `hola, ${perfil.nombre}` : "tus límites, por escrito"}
          </span>
        </header>

        {!listo ? null : !bienvenidaVista ? (
          <Bienvenida
            onContinuar={() => {
              try {
                window.localStorage.setItem(BIENVENIDA_KEY, "1");
              } catch {
                /* ignorar */
              }
              setBienvenidaVista(true);
            }}
          />
        ) : !introVisto ? (
          <Intro
            onContinuar={(nuevoPerfil) => {
              guardarPerfil(nuevoPerfil);
              try {
                window.localStorage.setItem(INTRO_KEY, "1");
              } catch {
                /* ignorar */
              }
              setIntroVisto(true);
            }}
          />
        ) : (
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <MenuLateral activa={seccion} onCambiar={setSeccion} />

            <div className="min-w-0 flex-1">
              {seccion === "que-hacer-hoy" ? (
                <QueHacerHoy
                  negocio={perfil.negocio}
                  limites={estado.limites.map((l) => ({
                    id: l.id,
                    descripcion: l.descripcion,
                    monto: l.monto,
                    fecha: l.fecha,
                  }))}
                  numeros={numeros}
                  alertas={alertas}
                  onSigoAlerta={manejarSigo}
                  onCortoAlerta={manejarCorto}
                />
              ) : seccion === "mis-numeros" ? (
                <MisNumeros />
              ) : seccion === "mis-decisiones" ? (
                <MisDecisiones />
              ) : estado.cerrado ? (
                <Cierre onNuevo={() => guardar({ limites: estado.limites, cerrado: false })} />
              ) : (
                <div className="space-y-6">
                  {limitesConEstado.map((limite) => (
                    <MiLimite
                      key={limite.id}
                      limite={limite}
                      color={perfil.color}
                      onSigo={() => manejarSigo(limite)}
                      onCorto={() => manejarCorto(limite)}
                      onActualizarLleva={(valor) => actualizarLlevaManual(limite.id, valor)}
                    />
                  ))}

                  {hayLimites && !mostrarFormulario ? (
                    <button
                      onClick={() => setMostrarFormulario(true)}
                      className="w-full rounded-2xl border-2 border-dashed border-border px-6 py-5 text-lg font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      + Agregar otro límite
                    </button>
                  ) : (
                    <Formulario
                      numeros={numeros}
                      onGuardar={agregarLimite}
                      onCancelar={hayLimites ? () => setMostrarFormulario(false) : undefined}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Bienvenida({ onContinuar }: { onContinuar: () => void }) {
  return (
    <section className="rounded-4xl bg-card p-7 shadow-xl sm:p-9">
      <h1 className="text-display text-3xl sm:text-4xl">
        Antes de arriesgar,
        <br />
        <span className="text-primary">pon un límite.</span>
      </h1>
      <div className="mt-6 space-y-3 text-lg leading-relaxed text-muted-foreground">
        <p>Limit te ayuda a ver a tiempo cuándo tu negocio está perdiendo plata.</p>
        <p>
          Escribe cuánto estás dispuesto a perder y hasta cuándo, y sube tus números: caja, cartera
          y margen.
        </p>
        <p>Cada día te decimos qué hacer hoy para no perder más.</p>
      </div>

      <button
        onClick={onContinuar}
        className="mt-8 w-full rounded-2xl bg-primary px-6 py-5 text-lg font-bold text-primary-foreground transition-opacity"
      >
        Empezar
      </button>
    </section>
  );
}

function Intro({ onContinuar }: { onContinuar: (perfil: Perfil) => void }) {
  const [nombre, setNombre] = useState("");
  const [negocio, setNegocio] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [color, setColor] = useState(COLOR_PERFIL_POR_DEFECTO);

  return (
    <section className="rounded-4xl bg-card p-7 shadow-xl sm:p-9">
      <h1 className="text-display text-3xl sm:text-4xl">
        Antes de arriesgar,
        <br />
        <span className="text-primary">pon un límite.</span>
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
        Escribe en qué decisión te estás metiendo, cuánto estás dispuesto a perder y cuándo
        revisarlo. Limit te lo recuerda antes de que sea tarde.
      </p>

      <div className="mt-7 space-y-6">
        <Campo etiqueta="¿Cómo te llamas?">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Tu nombre"
            className="w-full rounded-2xl bg-muted px-5 py-4 text-lg outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
          />
        </Campo>

        <Campo etiqueta="¿Cómo se llama tu negocio? (opcional)">
          <input
            value={negocio}
            onChange={(e) => setNegocio(e.target.value)}
            placeholder="Ej: Salón Bella Vista"
            className="w-full rounded-2xl bg-muted px-5 py-4 text-lg outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
          />
        </Campo>

        <Campo etiqueta="Elige tu color">
          <div className="flex gap-3">
            {COLORES_PERFIL.map((opcion) => (
              <button
                key={opcion.valor}
                type="button"
                onClick={() => setColor(opcion.valor)}
                aria-label={opcion.nombre}
                aria-pressed={color === opcion.valor}
                className="h-12 w-12 rounded-full transition-transform"
                style={{
                  backgroundColor: opcion.valor,
                  outline: color === opcion.valor ? "3px solid currentColor" : "none",
                  outlineOffset: "2px",
                  transform: color === opcion.valor ? "scale(1.1)" : "scale(1)",
                }}
              />
            ))}
          </div>
        </Campo>

        <Campo etiqueta="Tu WhatsApp (opcional)">
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="Ej: 300 123 4567"
            inputMode="tel"
            className="w-full rounded-2xl bg-muted px-5 py-4 text-lg outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
          />
          <span className="mt-2 block text-sm text-muted-foreground">
            Para avisarte cuando un límite se acerque. Lo puedes dejar en blanco.
          </span>
        </Campo>
      </div>

      <button
        onClick={() =>
          onContinuar({
            nombre: nombre.trim(),
            color,
            negocio: negocio.trim(),
            whatsapp: whatsapp.trim(),
          })
        }
        className="mt-8 w-full rounded-2xl bg-primary px-6 py-5 text-lg font-bold text-primary-foreground transition-opacity"
      >
        Empezar
      </button>
    </section>
  );
}

const OPCIONES_COMPARAR: { tipo: ComparaCon["tipo"]; etiqueta: string }[] = [
  { tipo: "manual", etiqueta: "Lo actualizo yo a mano" },
  { tipo: "concepto", etiqueta: "Un concepto de mis números" },
  { tipo: "cliente", etiqueta: "Lo que me debe un cliente" },
  { tipo: "cartera_total", etiqueta: "Mi cartera vencida total" },
];

function Formulario({
  numeros,
  onGuardar,
  onCancelar,
}: {
  numeros: FilaNumero[];
  onGuardar: (l: Limite) => void;
  onCancelar?: (() => void) | undefined;
}) {
  const [descripcion, setDescripcion] = useState("");
  const [contexto, setContexto] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [consejoGenerado, setConsejoGenerado] = useState("");
  const [tipoComparar, setTipoComparar] = useState<ComparaCon["tipo"]>("manual");
  const [valorComparar, setValorComparar] = useState("");
  const [llevaInicial, setLlevaInicial] = useState("");

  const necesitaValor = tipoComparar === "concepto" || tipoComparar === "cliente";
  const sugerencias =
    tipoComparar === "concepto" ? conceptosDisponibles(numeros) : clientesDisponibles(numeros);

  const valido =
    descripcion.trim() !== "" &&
    contexto.trim() !== "" &&
    Number(monto) > 0 &&
    fecha !== "" &&
    (!necesitaValor || valorComparar.trim() !== "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valido) return;
        const comparaCon: ComparaCon =
          tipoComparar === "concepto"
            ? { tipo: "concepto", valor: valorComparar.trim() }
            : tipoComparar === "cliente"
              ? { tipo: "cliente", valor: valorComparar.trim() }
              : tipoComparar === "cartera_total"
                ? { tipo: "cartera_total" }
                : { tipo: "manual" };
        onGuardar({
          id: nuevoId(),
          descripcion: descripcion.trim(),
          contexto: contexto.trim(),
          monto: Number(monto),
          fecha,
          consejo: consejoGenerado,
          comparaCon,
          llevaManual: Number(llevaInicial) || 0,
          avisosRespondidos: [],
        });
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

        <Campo etiqueta="Contexto de la decisión">
          <textarea
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            rows={3}
            placeholder="Qué te lleva a esto, qué sabes, qué te preocupa. Ej: Juan quiere el dinero rápido y no hay contrato firmado."
            className="w-full resize-none rounded-2xl bg-muted px-5 py-4 text-base outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
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

        <Campo etiqueta="¿Con qué comparamos este límite?">
          <div className="grid gap-2">
            {OPCIONES_COMPARAR.map((opcion) => (
              <button
                key={opcion.tipo}
                type="button"
                onClick={() => setTipoComparar(opcion.tipo)}
                className={`rounded-2xl border-2 px-4 py-3 text-left text-sm font-bold transition-colors ${
                  tipoComparar === opcion.tipo
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {opcion.etiqueta}
              </button>
            ))}
          </div>
          <span className="mt-2 block text-sm text-muted-foreground">
            Así Limit calcula solo cuánto llevas cada vez que subes tus números.
          </span>
        </Campo>

        {necesitaValor ? (
          <Campo etiqueta={tipoComparar === "concepto" ? "¿Qué concepto?" : "¿Qué cliente?"}>
            <input
              value={valorComparar}
              onChange={(e) => setValorComparar(e.target.value)}
              list="sugerencias-comparar"
              placeholder={tipoComparar === "concepto" ? "Ej: materiales" : "Ej: Pedro Gómez"}
              className="w-full rounded-2xl bg-muted px-5 py-4 text-lg outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
            />
            <datalist id="sugerencias-comparar">
              {sugerencias.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {sugerencias.length === 0 ? (
              <span className="mt-2 block text-sm text-muted-foreground">
                Debe escribirse igual que en tu archivo de "Mis números".
              </span>
            ) : null}
          </Campo>
        ) : null}

        {tipoComparar === "manual" ? (
          <Campo etiqueta="¿Cuánto llevas hasta ahora? (opcional)">
            <div className="flex items-center rounded-2xl bg-muted px-5 focus-within:ring-2 focus-within:ring-ring">
              <span className="text-display text-2xl text-muted-foreground">$</span>
              <input
                value={llevaInicial}
                onChange={(e) => setLlevaInicial(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder="0"
                className="text-display w-full bg-transparent px-2 py-4 text-2xl outline-none placeholder:font-normal placeholder:text-muted-foreground"
              />
            </div>
          </Campo>
        ) : null}
      </div>

      <ConsejoIA
        descripcion={descripcion}
        contexto={contexto}
        monto={Number(monto) || 0}
        fecha={fecha}
        onGenerado={setConsejoGenerado}
      />

      <button
        type="submit"
        disabled={!valido}
        className="mt-8 w-full rounded-2xl bg-primary px-6 py-5 text-lg font-bold text-primary-foreground transition-opacity disabled:opacity-40"
      >
        Guardar límite
      </button>
      {onCancelar ? (
        <button
          type="button"
          onClick={onCancelar}
          className="mt-3 w-full rounded-2xl border-2 border-border px-6 py-4 text-base font-bold text-muted-foreground"
        >
          Cancelar
        </button>
      ) : null}
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

function BotonGoogleCalendar({ limite }: { limite: Limite }) {
  return (
    <a
      href={linkGoogleCalendar(limite)}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-current/20 px-6 py-4 text-base font-bold transition-opacity hover:opacity-80"
    >
      📅 Agregar recordatorio a Google Calendar
    </a>
  );
}

function BarraProgreso({
  lleva,
  monto,
  alerta,
}: {
  lleva: number;
  monto: number;
  alerta: boolean;
}) {
  if (monto <= 0) return null;
  const pct = Math.min(100, Math.round((lleva / monto) * 100));
  return (
    <div className="mt-4">
      <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
        <div
          className={`h-full rounded-full ${alerta ? "bg-alert" : "bg-black/40"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-sm opacity-70">
        Llevas {pesos(lleva)} de {pesos(monto)} ({pct}%)
      </p>
    </div>
  );
}

function MiLimite({
  limite,
  color,
  onSigo,
  onCorto,
  onActualizarLleva,
}: {
  limite: LimiteConEstado;
  color: string;
  onSigo: () => void;
  onCorto: () => void;
  onActualizarLleva: (valor: number) => void;
}) {
  const dias = diasRestantes(limite.fecha);
  const esManual = limite.comparaCon.tipo === "manual";
  const necesitaAlerta = necesitaDecision(limite);

  if (necesitaAlerta) {
    const esPasado = limite.estadoAlerta === "pasado";
    return (
      <section className="rounded-4xl bg-alert p-7 text-alert-foreground shadow-xl sm:p-9">
        <p className="text-sm font-bold uppercase tracking-widest opacity-70">
          {esPasado ? "Se cumplió tu plazo" : "Te estás acercando"}
        </p>
        <h1 className="text-display mt-3 text-4xl sm:text-5xl">
          {esPasado ? (
            <>
              Pasaste tu límite.
              <br />
              ¿Sigues o cortas?
            </>
          ) : (
            <>
              Vas cerca del tope.
              <br />
              ¿Sigues o cortas?
            </>
          )}
        </h1>
        <div className="mt-6 rounded-3xl bg-alert-foreground/10 p-5">
          <p className="text-lg font-medium">{limite.descripcion}</p>
          {limite.contexto ? <p className="mt-2 text-sm opacity-80">{limite.contexto}</p> : null}
          <p className="text-display mt-1 text-3xl">{pesos(limite.monto)}</p>
          <p className="mt-1 text-sm opacity-70">
            {dias < 0
              ? `Tu fecha era el ${new Date(limite.fecha + "T00:00:00").toLocaleDateString("es-MX")}`
              : `Te quedan ${dias} día(s), revisas el ${new Date(limite.fecha + "T00:00:00").toLocaleDateString("es-MX")}`}
          </p>
          <BarraProgreso lleva={limite.llevaMonto} monto={limite.monto} alerta />
        </div>

        <ConsejoGuardado limite={limite} />

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
          {esPasado
            ? "Si sigues, defines un monto y una fecha nuevos. No hay prórrogas silenciosas."
            : "Si sigues, lo dejamos como está. Si cortas, el límite queda cerrado ahora."}
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-4xl p-7 text-primary-foreground shadow-xl sm:p-9"
      style={{ backgroundColor: color }}
    >
      <p className="text-sm font-bold uppercase tracking-widest opacity-60">Límite vigente</p>
      <p className="text-display mt-4 text-7xl sm:text-8xl">{dias}</p>
      <p className="text-display text-2xl">{dias === 1 ? "día restante" : "días restantes"}</p>

      <div className="mt-8 rounded-3xl bg-black/5 p-5">
        <p className="text-lg font-medium">{limite.descripcion}</p>
        {limite.contexto ? <p className="mt-2 text-sm opacity-80">{limite.contexto}</p> : null}
        <p className="text-display mt-2 text-4xl">{pesos(limite.monto)}</p>
        <p className="mt-1 text-sm opacity-70">
          Revisas el {new Date(limite.fecha + "T00:00:00").toLocaleDateString("es-MX")}
        </p>
        <BarraProgreso lleva={limite.llevaMonto} monto={limite.monto} alerta={false} />
      </div>

      {esManual ? (
        <div className="mt-4 rounded-3xl bg-black/5 p-5">
          <label className="block text-sm font-medium opacity-80">
            ¿Cuánto llevas hasta ahora?
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-2xl bg-black/10 px-4 py-2">
            <span className="text-lg">$</span>
            <input
              type="text"
              inputMode="numeric"
              defaultValue={limite.llevaManual || ""}
              placeholder="0"
              onBlur={(e) => onActualizarLleva(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
              className="w-full bg-transparent text-lg outline-none"
            />
          </div>
        </div>
      ) : null}

      <ConsejoGuardado limite={limite} />

      <BotonGoogleCalendar limite={limite} />

      <p className="mt-6 text-sm opacity-70">
        Cuando se acerque o se pase, esta pantalla te va a preguntar si sigues o cortas.
      </p>
    </section>
  );
}

function ConsejoGuardado({ limite }: { limite: Limite }) {
  return (
    <div className="mt-6 rounded-3xl border border-secondary/40 bg-secondary/15 p-5">
      <div className="flex items-center gap-2">
        <span className="text-display text-lg">Recomendación</span>
      </div>
      {limite.consejo ? (
        <div className="mt-4 space-y-3 whitespace-pre-wrap text-base leading-relaxed">
          {limite.consejo
            .split("\n")
            .map((parrafo, indice) => (parrafo.trim() ? <p key={indice}>{parrafo}</p> : null))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed opacity-75">
          Este límite fue creado antes de guardar consejos. Crea un límite nuevo con su contexto
          para recibirlo aquí.
        </p>
      )}
    </div>
  );
}

function ConsejoIA({
  descripcion,
  contexto,
  monto,
  fecha,
  vencido = false,
  onGenerado,
}: {
  descripcion: string;
  contexto: string;
  monto: number;
  fecha: string;
  vencido?: boolean;
  onGenerado?: (consejo: string) => void;
}) {
  const pedir = useServerFn(pedirConsejo);
  const [consejo, setConsejo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedePedir = descripcion.trim() !== "" && contexto.trim() !== "" && monto > 0;

  const firma = `${descripcion}|${contexto}|${monto}|${fecha}|${vencido}`;
  const firmaRef = useRef("");

  useEffect(() => {
    if (!puedePedir) return;
    if (firmaRef.current === firma) return;
    firmaRef.current = firma;

    let cancelado = false;
    const timer = setTimeout(async () => {
      setCargando(true);
      setError(null);
      setConsejo(null);
      try {
        const res = await pedir({
          data: {
            descripcion: descripcion.trim(),
            contexto: contexto.trim(),
            monto,
            fecha: fecha || "Sin definir",
            dias: fecha ? diasRestantes(fecha) : 0,
            vencido,
          },
        });
        if (cancelado) return;
        if (res.ok) {
          setConsejo(res.consejo);
          onGenerado?.(res.consejo);
        } else {
          setError(
            res.motivo === "sin-llave"
              ? "La IA no está configurada todavía."
              : res.motivo === "vacio"
                ? "La IA no devolvió consejo. Inténtalo de nuevo."
                : "No pude generar el consejo. Inténtalo de nuevo.",
          );
        }
      } catch {
        if (!cancelado) setError("No pude generar el consejo. Inténtalo de nuevo.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    }, 700);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [firma, puedePedir, descripcion, contexto, monto, fecha, vencido, pedir, onGenerado]);

  if (!puedePedir) return null;

  return (
    <div className="mt-6 rounded-3xl border border-secondary/30 bg-secondary/10 p-5">
      <div className="flex items-center gap-2">
        <span className="text-display text-lg">Recomendación</span>
      </div>
      <p className="mt-1 text-sm opacity-70">
        Un consejo franco sobre esta decisión, según lo que escribiste.
      </p>

      {cargando ? (
        <div className="mt-4 flex items-center gap-2 text-sm opacity-70">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
          Pensando…
        </div>
      ) : error ? (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      ) : consejo ? (
        <div className="mt-4 space-y-3 whitespace-pre-wrap text-base leading-relaxed">
          {consejo.split("\n").map((p, i) => (p.trim() === "" ? null : <p key={i}>{p}</p>))}
        </div>
      ) : null}
    </div>
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
