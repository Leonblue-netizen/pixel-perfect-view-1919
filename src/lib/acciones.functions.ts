import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type LimiteEntrada = { descripcion: string; monto: number; fecha: string; dias: number };
type CarteraEntrada = { cliente: string; concepto: string; monto: number; diasVencido: number };

type Entrada = {
  negocio: string;
  caja: number;
  carteraVencida: number;
  margen: number;
  limites: LimiteEntrada[];
  cartera: CarteraEntrada[];
};

const SYSTEM = `Eres un asesor financiero franco para dueños de negocios pequeños en Latinoamérica, sin conocimiento contable. Te dan los números de su negocio y sus límites escritos (monto y fecha que no quieren pasar). Tu trabajo es decir, en español sencillo y sin tecnicismos, las 3 acciones más importantes que debe hacer hoy para no perder plata.

Reglas:
- Exactamente 3 acciones, ordenadas por prioridad.
- Cada acción es concreta: qué hacer, a quién o a qué aplica, con monto o fecha cuando exista el dato.
- Cada acción trae una frase corta de "por qué", basada solo en los datos que te dieron. No inventes datos.
- Si un límite está vencido o muy cerca de su fecha o monto, va primero.
- Si hay cartera vencida, prioriza cobrar al cliente con más plata vencida.
- No uses jerga financiera (nada de "flujo de caja", "margen operativo", etc.), habla como si le explicaras a un amigo.
- Si te dan el nombre del negocio, úsalo para hablar de él (ej. "en tu salón", "tu taller") en vez de decir "tu negocio" en genérico. Si no te lo dan, di "tu negocio".

Responde ÚNICAMENTE con un JSON válido, sin texto antes ni después, con esta forma exacta:
{"acciones":[{"titulo":"...","porque":"..."},{"titulo":"...","porque":"..."},{"titulo":"...","porque":"..."}]}`;

function usuario(d: Entrada): string {
  const partes = [
    `Nombre del negocio: ${d.negocio || `(no lo dio, di "tu negocio")`}.`,
    ``,
    `Números actuales:`,
  ];
  partes.push(`- Caja (ingresos menos gastos): $${Math.round(d.caja).toLocaleString("es-MX")}`);
  partes.push(`- Cartera vencida total: $${Math.round(d.carteraVencida).toLocaleString("es-MX")}`);
  partes.push(`- Margen: ${d.margen.toFixed(1)}%`);

  if (d.cartera.length > 0) {
    partes.push(``, `Detalle de cartera vencida (de mayor a menor):`);
    for (const c of d.cartera.slice(0, 5)) {
      partes.push(
        `- ${c.cliente}: $${Math.round(c.monto).toLocaleString("es-MX")}, vencido hace ${c.diasVencido} día(s). Concepto: ${c.concepto}`,
      );
    }
  }

  if (d.limites.length > 0) {
    partes.push(``, `Límites escritos del dueño:`);
    for (const l of d.limites) {
      const estado =
        l.dias < 0
          ? `vencido hace ${Math.abs(l.dias)} día(s)`
          : l.dias === 0
            ? "se cumple hoy"
            : `faltan ${l.dias} día(s)`;
      partes.push(
        `- ${l.descripcion}: máximo $${l.monto.toLocaleString("es-MX")}, fecha ${l.fecha} (${estado})`,
      );
    }
  } else {
    partes.push(``, `El dueño no tiene límites escritos todavía.`);
  }

  partes.push(``, `Dame las 3 acciones para hoy.`);
  return partes.join("\n");
}

export const pedirAcciones = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        negocio: z.string(),
        caja: z.number(),
        carteraVencida: z.number(),
        margen: z.number(),
        limites: z.array(
          z.object({
            descripcion: z.string(),
            monto: z.number(),
            fecha: z.string(),
            dias: z.number(),
          }),
        ),
        cartera: z.array(
          z.object({
            cliente: z.string(),
            concepto: z.string(),
            monto: z.number(),
            diasVencido: z.number(),
          }),
        ),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const openaiKey = process.env["OPENAI_API_KEY"];
    const lovableKey = process.env["LOVABLE_API_KEY"];
    if (!openaiKey && !lovableKey) {
      return { ok: false as const, acciones: [], motivo: "sin-llave" as const };
    }

    const url = openaiKey
      ? "https://api.openai.com/v1/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const headers: Record<string, string> = openaiKey
      ? { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` }
      : {
          "Content-Type": "application/json",
          "Lovable-API-Key": lovableKey!,
          "X-Lovable-AIG-SDK": "fetch",
        };
    const model = openaiKey ? "gpt-4o-mini" : "google/gemini-3.7-flash";

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: usuario(data) },
          ],
          response_format: { type: "json_object" },
        }),
      });
    } catch {
      return { ok: false as const, acciones: [], motivo: "red" as const };
    }

    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      console.error("Acciones IA: gateway falló", res.status, texto);
      return { ok: false as const, acciones: [], motivo: "gateway" as const, status: res.status };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const contenido = json?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!contenido) {
      return { ok: false as const, acciones: [], motivo: "vacio" as const };
    }

    try {
      const parsed = JSON.parse(contenido) as { acciones?: { titulo?: string; porque?: string }[] };
      const acciones = (parsed.acciones ?? [])
        .filter((a) => typeof a.titulo === "string" && a.titulo.trim() !== "")
        .map((a) => ({ titulo: a.titulo!.trim(), porque: (a.porque ?? "").trim() }));
      if (acciones.length === 0) {
        return { ok: false as const, acciones: [], motivo: "vacio" as const };
      }
      return { ok: true as const, acciones };
    } catch {
      return { ok: false as const, acciones: [], motivo: "formato" as const };
    }
  });
