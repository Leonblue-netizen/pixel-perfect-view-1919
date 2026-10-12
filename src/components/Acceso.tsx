import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Modo = "entrar" | "registro" | "recuperar";

const inputCls =
  "w-full rounded-2xl bg-muted px-5 py-4 text-lg outline-none ring-ring placeholder:text-muted-foreground focus:ring-2";

export function Acceso() {
  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setCargando(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError("Correo o contraseña incorrectos, o falta confirmar tu correo.");
      } else if (modo === "registro") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) setError(error.message);
        else if (!data.session)
          setAviso("Te enviamos un correo. Confírmalo y luego inicia sesión aquí.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) setError(error.message);
        else setAviso("Si el correo existe, te llegará un enlace para crear una nueva contraseña.");
      }
    } finally {
      setCargando(false);
    }
  }

  const titulo =
    modo === "entrar" ? "Entra a tu cuenta" : modo === "registro" ? "Crea tu cuenta" : "Recupera tu contraseña";

  return (
    <section className="rounded-4xl bg-card p-7 shadow-xl sm:p-9">
      <h1 className="text-display text-3xl sm:text-4xl">{titulo}</h1>
      <form onSubmit={enviar} className="mt-7 space-y-4">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Tu correo"
          autoComplete="email"
          className={inputCls}
        />
        {modo !== "recuperar" ? (
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            autoComplete={modo === "registro" ? "new-password" : "current-password"}
            className={inputCls}
          />
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {aviso ? <p className="text-sm text-primary">{aviso}</p> : null}
        <button
          type="submit"
          disabled={cargando}
          className="w-full rounded-2xl bg-primary px-6 py-5 text-lg font-bold text-primary-foreground disabled:opacity-60"
        >
          {cargando
            ? "Un momento…"
            : modo === "entrar"
              ? "Entrar"
              : modo === "registro"
                ? "Crear cuenta"
                : "Enviar enlace"}
        </button>
      </form>
      <div className="mt-6 flex flex-col gap-2 text-sm text-muted-foreground">
        {modo !== "entrar" ? (
          <button onClick={() => setModo("entrar")} className="text-left hover:text-foreground">
            ¿Ya tienes cuenta? Inicia sesión
          </button>
        ) : (
          <>
            <button onClick={() => setModo("registro")} className="text-left hover:text-foreground">
              ¿No tienes cuenta? Regístrate
            </button>
            <button onClick={() => setModo("recuperar")} className="text-left hover:text-foreground">
              Olvidé mi contraseña
            </button>
          </>
        )}
      </div>
    </section>
  );
}
