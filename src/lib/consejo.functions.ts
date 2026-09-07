import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Entrada = {
  descripcion: string;
  contexto: string;
  monto: number;
  fecha: string;
  dias: number;
  vencido: boolean;
};

const SYSTEM = `Eres un consejero decisional franco y directo. Alguien te pide consejo sobre una decisión donde está arriesgando dinero. Hablas en español de México, en segunda persona, con tono cercano. No moralizas ni regañas.

Tu consejo tiene tres partes claras, en párrafos cortos y sin viñetas:
1. Lo más probable que pase con esta decisión, según lo que te cuentan.
2. Si el monto y el plazo son razonables para esa apuesta, o si son una señal de que se está pasando.
3. Una sola señal de alarma concreta —algo medible u observable— que, si ocurre, debería hacerle parar y cortar.

Sé honesto. Si lo que cuentan suena impulsivo o mal medido, dilo. Si suena razonable, dilo también. Máximo 130 palabras. No inventes datos que no te dieron.`;

function usuario(d: Entrada): string {
  const plazo =
    d.vencido
      ? "El plazo ya se cumplió (la fecha pasó). Hay que decidir ahora: seguir o cortar."
      : d.dias === 0
        ? "El plazo se cumple hoy."
        : `Faltan ${d.dias} día(s) para la fecha de revisión.`;
  return [
    `Decisión: ${d.descripcion || "(no la describió)"}.`,
    `Contexto: ${d.contexto || "(no dio contexto)"}.`,
    `Máximo que está dispuesto a perder: $${d.monto.toLocaleString("es-MX")}.`,
    `Fecha límite para revisar: ${d.fecha}. ${plazo}`,
    ``,
    `Dame un consejo decisional.`,
  ].join("\n");
}

export const pedirConsejo = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({
      descripcion: z.string(),
      contexto: z.string(),
      monto: z.number(),
      fecha: z.string(),
      dias: z.number(),
      vencido: z.boolean(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, consejo: "", motivo: "sin-llave" as const };
    }

    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "google/gemini-3.7-flash",
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: usuario(data) },
          ],
        }),
      });
    } catch {
      return { ok: false as const, consejo: "", motivo: "red" as const };
    }

    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      console.error("Consejo IA: gateway falló", res.status, texto);
      return { ok: false as const, consejo: "", motivo: "gateway" as const, status: res.status };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const consejo = json?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!consejo) {
      return { ok: false as const, consejo: "", motivo: "vacio" as const };
    }
    return { ok: true as const, consejo };
  });
