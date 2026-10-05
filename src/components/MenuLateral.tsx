export type Seccion = "que-hacer-hoy" | "mis-limites" | "mis-numeros" | "mis-decisiones";

const ITEMS: { id: Seccion; etiqueta: string }[] = [
  { id: "que-hacer-hoy", etiqueta: "Qué hacer hoy" },
  { id: "mis-limites", etiqueta: "Mis límites" },
  { id: "mis-numeros", etiqueta: "Mis números" },
  { id: "mis-decisiones", etiqueta: "Mis decisiones" },
];

export function MenuLateral({
  activa,
  onCambiar,
}: {
  activa: Seccion;
  onCambiar: (s: Seccion) => void;
}) {
  return (
    <nav
      aria-label="Menú principal"
      className="mb-6 flex gap-2 overflow-x-auto sm:mb-0 sm:w-48 sm:shrink-0 sm:flex-col sm:gap-1"
    >
      {ITEMS.map((item) => {
        const seleccionado = item.id === activa;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onCambiar(item.id)}
            aria-current={seleccionado ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-3 text-left text-sm font-bold transition-colors sm:w-full ${
              seleccionado
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {item.etiqueta}
          </button>
        );
      })}
    </nav>
  );
}
