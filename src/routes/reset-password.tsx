import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nueva contraseña — Limit" },
      { name: "description", content: "Crea una nueva contraseña para tu cuenta de Limit." },
      { property: "og:title", content: "Nueva contraseña — Limit" },
      { property: "og:description", content: "Crea una nueva contraseña para tu cuenta de Limit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setCargando(false);
    if (error) setError("El enlace venció o no es válido. Pide uno nuevo.");
    else navigate({ to: "/", replace: true });
  }

  return (
    <main className="relative min-h-screen px-5 pb-24 pt-10 sm:pt-16">
      <div className="relative mx-auto w-full max-w-lg">
        <header className="mb-8">
          <span className="text-display text-3xl text-primary">Limit</span>
        </header>
        <section className="rounded-4xl bg-card p-7 shadow-xl sm:p-9">
          <h1 className="text-display text-3xl sm:text-4xl">Nueva contraseña</h1>
          <form onSubmit={enviar} className="mt-7 space-y-4">
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Escribe tu nueva contraseña"
              autoComplete="new-password"
              className="w-full rounded-2xl bg-muted px-5 py-4 text-lg outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded-2xl bg-primary px-6 py-5 text-lg font-bold text-primary-foreground disabled:opacity-60"
            >
              {cargando ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
