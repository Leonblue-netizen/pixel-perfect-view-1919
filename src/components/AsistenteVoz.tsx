import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";

const AGENT_ID = "agent_1801m26tgnv2eq0b0xb43znyz0qv";
const WIDGET_SRC = "https://elevenlabs.io/convai-widget/index.js";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "elevenlabs-convai": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & { "agent-id"?: string };
    }
  }
}

let scriptPromise: Promise<void> | null = null;

function cargarScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${WIDGET_SRC}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = WIDGET_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("No se pudo cargar el asistente"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

async function esperarLauncher(el: HTMLElement, intentos = 40): Promise<HTMLButtonElement | null> {
  for (let i = 0; i < intentos; i++) {
    const root = el.shadowRoot;
    const btn = root?.querySelector("button");
    if (btn) return btn;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

export function AsistenteVoz() {
  const widgetRef = useRef<HTMLElement | null>(null);
  const [montado, setMontado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const launcherOculto = useRef(false);

  async function abrirAsistente() {
    if (cargando) return;
    setCargando(true);
    try {
      await cargarScript();
      if (!montado) {
        setMontado(true);
        // esperar a que React pinte el custom element
        await new Promise((r) => setTimeout(r, 50));
      }
      await customElements.whenDefined("elevenlabs-convai");
      const el = widgetRef.current;
      if (!el) return;
      const btn = await esperarLauncher(el);
      if (!btn) return;
      if (!launcherOculto.current) {
        // ocultar el botón circular propio del widget; usamos el nuestro
        btn.style.display = "none";
        launcherOculto.current = true;
      }
      btn.click();
    } catch {
      /* el widget no cargó; no interrumpir la página */
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // precargar el script para que el primer clic sea instantáneo
    const t = setTimeout(() => void cargarScript().catch(() => undefined), 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={abrirAsistente}
        disabled={cargando}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-2xl bg-primary px-5 py-4 text-base font-bold text-primary-foreground shadow-xl transition-transform hover:scale-[1.03] active:scale-[0.98] disabled:opacity-60"
      >
        <Mic className="h-5 w-5" aria-hidden />
        {cargando ? "Abriendo…" : "Habla con nuestro asistente"}
      </button>
      {montado ? (
        <elevenlabs-convai
          ref={widgetRef as React.RefObject<HTMLElement>}
          agent-id={AGENT_ID}
        />
      ) : null}
    </>
  );
}
