import { NextResponse } from "next/server";
import { evolutionFetch } from "@/lib/evolution-fetch";

function normalizeBase(url) {
  if (!url || typeof url !== "string") return "";
  return url.replace(/\/+$/, "");
}

/**
 * Cria instância na Evolution e registra webhook para esta aplicação.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { instanceName, baseUrl, apiKey } = body;
  const resolvedBaseUrl =
    (typeof baseUrl === "string" ? baseUrl.trim() : "") ||
    process.env.EVOLUTION_BASE_URL?.trim() ||
    "";
  const resolvedApiKey =
    (typeof apiKey === "string" ? apiKey.trim() : "") ||
    process.env.EVOLUTION_GLOBAL_API_KEY?.trim() ||
    "";

  if (!instanceName || !resolvedBaseUrl || !resolvedApiKey) {
    return NextResponse.json(
      {
        error:
          "Campos obrigatórios: instanceName, baseUrl e EVOLUTION_GLOBAL_API_KEY no .env.local (ou apiKey no body).",
      },
      { status: 400 },
    );
  }

  const host = request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto =
    process.env.FORCE_WEBHOOK_PROTO ||
    forwardedProto ||
    (process.env.NODE_ENV === "production" ? "https" : "http");

  const webhookBase =
    process.env.WEBHOOK_PUBLIC_URL?.replace(/\/+$/, "") ||
    (host ? `${proto}://${host}` : "");

  if (!webhookBase) {
    return NextResponse.json(
      { error: "Defina WEBHOOK_PUBLIC_URL no .env.local (ex.: http://host.docker.internal:3000) se não houver header Host." },
      { status: 400 },
    );
  }

  const webhookUrl = `${webhookBase}/api/webhook`;

  const evolutionBody = {
    instanceName: String(instanceName).trim(),
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
    webhook: {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "CALL"],
    },
  };

  const target = `${normalizeBase(resolvedBaseUrl)}/instance/create`;

  try {
    const res = await evolutionFetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: resolvedApiKey,
      },
      body: JSON.stringify(evolutionBody),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data?.response?.message?.join?.(", ") ||
        data?.message ||
        data?.error ||
        `Evolution retornou ${res.status}`;
      return NextResponse.json({ error: msg, details: data }, { status: res.status });
    }

    return NextResponse.json({ ...data, _webhookUrl: webhookUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao contactar Evolution API." },
      { status: 502 },
    );
  }
}
