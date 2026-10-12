import { supabase } from "@/integrations/supabase/client";
import type { FilaNumero, NumerosGuardados } from "./numeros";
import type { ComparaCon, Decision, EstadoAlerta } from "./limites";

export type PerfilDB = { nombre: string; negocio: string; color: string };

export type LimiteDB = {
  id: string;
  descripcion: string;
  contexto: string;
  monto: number;
  fecha: string;
  consejo?: string | undefined;
  comparaCon: ComparaCon;
  llevaManual: number;
  avisosRespondidos: EstadoAlerta[];
};

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sin sesión");
  return data.user.id;
}

// ---------- perfil ----------
export async function leerPerfilDB(): Promise<PerfilDB | null> {
  const id = await uid();
  const { data, error } = await supabase
    .from("profiles")
    .select("nombre, negocio, color")
    .eq("user_id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { nombre: data.nombre, negocio: data.negocio ?? "", color: data.color };
}

export async function guardarPerfilDB(p: PerfilDB) {
  const id = await uid();
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: id, nombre: p.nombre, negocio: p.negocio || null, color: p.color });
  if (error) throw error;
}

// ---------- límites ----------
type FilaLimite = {
  id: string;
  descripcion: string;
  contexto: string;
  monto: number;
  fecha: string;
  consejo: string | null;
  compara_con: unknown;
  lleva_manual: number;
  avisos_respondidos: string[];
};

function aLimite(r: FilaLimite): LimiteDB {
  return {
    id: r.id,
    descripcion: r.descripcion,
    contexto: r.contexto ?? "",
    monto: Number(r.monto),
    fecha: r.fecha,
    consejo: r.consejo ?? undefined,
    comparaCon: (r.compara_con as ComparaCon) ?? { tipo: "manual" },
    llevaManual: Number(r.lleva_manual ?? 0),
    avisosRespondidos: (r.avisos_respondidos ?? []) as EstadoAlerta[],
  };
}

export async function leerLimitesDB(): Promise<LimiteDB[]> {
  const { data, error } = await supabase
    .from("limites")
    .select("*")
    .eq("cerrado", false)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => aLimite(r as FilaLimite));
}

export async function crearLimiteDB(l: Omit<LimiteDB, "id">): Promise<LimiteDB> {
  const id = await uid();
  const { data, error } = await supabase
    .from("limites")
    .insert({
      user_id: id,
      descripcion: l.descripcion,
      contexto: l.contexto,
      monto: l.monto,
      fecha: l.fecha,
      consejo: l.consejo ?? null,
      compara_con: l.comparaCon as never,
      lleva_manual: l.llevaManual,
      avisos_respondidos: l.avisosRespondidos,
    })
    .select("*")
    .single();
  if (error) throw error;
  return aLimite(data as FilaLimite);
}

export async function actualizarLimiteDB(
  id: string,
  cambios: Partial<{ llevaManual: number; avisosRespondidos: EstadoAlerta[]; cerrado: boolean }>,
) {
  const patch: { lleva_manual?: number; avisos_respondidos?: string[]; cerrado?: boolean } = {};
  if (cambios.llevaManual !== undefined) patch.lleva_manual = cambios.llevaManual;
  if (cambios.avisosRespondidos !== undefined) patch.avisos_respondidos = cambios.avisosRespondidos;
  if (cambios.cerrado !== undefined) patch.cerrado = cambios.cerrado;
  const { error } = await supabase.from("limites").update(patch).eq("id", id);
  if (error) throw error;
}

// ---------- números ----------
export async function leerNumerosDB(): Promise<NumerosGuardados | null> {
  const { data, error } = await supabase
    .from("numeros")
    .select("*")
    .order("fila", { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return null;
  const filas: FilaNumero[] = data.map((r) => ({
    fila: r.fila,
    fecha: r.fecha,
    tipo: r.tipo as FilaNumero["tipo"],
    concepto: r.concepto,
    monto: Number(r.monto),
    cliente: r.cliente ?? "",
    fechaVencimiento: r.fecha_vencimiento ?? "",
  }));
  const actualizadoEn = data.reduce(
    (max, r) => (r.created_at > max ? r.created_at : max),
    data[0]!.created_at,
  );
  return { filas, actualizadoEn };
}

export async function guardarNumerosDB(filas: FilaNumero[]): Promise<NumerosGuardados> {
  const id = await uid();
  const { error: errDel } = await supabase.from("numeros").delete().eq("user_id", id);
  if (errDel) throw errDel;
  if (filas.length > 0) {
    const { error } = await supabase.from("numeros").insert(
      filas.map((f) => ({
        user_id: id,
        fila: f.fila,
        fecha: f.fecha,
        tipo: f.tipo,
        concepto: f.concepto,
        monto: f.monto,
        cliente: f.cliente || null,
        fecha_vencimiento: f.tipo === "por_cobrar" && f.fechaVencimiento ? f.fechaVencimiento : null,
      })),
    );
    if (error) throw error;
  }
  return { filas, actualizadoEn: new Date().toISOString() };
}

// ---------- decisiones ----------
export async function leerDecisionesDB(): Promise<Decision[]> {
  const { data, error } = await supabase
    .from("decisiones")
    .select("*")
    .order("fecha", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    fecha: r.fecha,
    limiteDescripcion: r.limite_descripcion,
    loQueDeciaAlerta: r.lo_que_decia_alerta,
    decision: r.decision as Decision["decision"],
    pesosEvitados: Number(r.pesos_evitados),
    estimado: r.estimado,
  }));
}

export async function agregarDecisionDB(d: Omit<Decision, "id" | "fecha">) {
  const id = await uid();
  const { error } = await supabase.from("decisiones").insert({
    user_id: id,
    limite_descripcion: d.limiteDescripcion,
    lo_que_decia_alerta: d.loQueDeciaAlerta,
    decision: d.decision,
    pesos_evitados: d.pesosEvitados,
    estimado: d.estimado,
  });
  if (error) throw error;
}
