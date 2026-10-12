CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL DEFAULT '',
  negocio text,
  color text NOT NULL DEFAULT '#FFAEEE',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profile delete" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.limites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  descripcion text NOT NULL,
  contexto text NOT NULL DEFAULT '',
  monto numeric NOT NULL DEFAULT 0,
  fecha date NOT NULL,
  consejo text,
  compara_con jsonb NOT NULL DEFAULT '{"tipo":"manual"}'::jsonb,
  lleva_manual numeric NOT NULL DEFAULT 0,
  avisos_respondidos text[] NOT NULL DEFAULT '{}',
  cerrado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.limites TO authenticated;
GRANT ALL ON public.limites TO service_role;
ALTER TABLE public.limites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own limites" ON public.limites FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.numeros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  fila integer NOT NULL DEFAULT 0,
  fecha date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('ingreso','gasto','por_cobrar')),
  concepto text NOT NULL DEFAULT '',
  monto numeric NOT NULL DEFAULT 0,
  cliente text,
  fecha_vencimiento date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.numeros TO authenticated;
GRANT ALL ON public.numeros TO service_role;
ALTER TABLE public.numeros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own numeros" ON public.numeros FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.decisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  fecha timestamptz NOT NULL DEFAULT now(),
  limite_descripcion text NOT NULL DEFAULT '',
  lo_que_decia_alerta text NOT NULL DEFAULT '',
  decision text NOT NULL CHECK (decision IN ('sigo','corto')),
  pesos_evitados numeric NOT NULL DEFAULT 0,
  estimado boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decisiones TO authenticated;
GRANT ALL ON public.decisiones TO service_role;
ALTER TABLE public.decisiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own decisiones" ON public.decisiones FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);