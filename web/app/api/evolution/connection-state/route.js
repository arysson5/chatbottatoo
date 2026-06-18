import { NextResponse } from "next/server";
import { evolutionFetch } from "@/lib/evolution-fetch";
import { isConnectedState } from "@/lib/evolution-qrcode";

function normalizeBase(url) {
  if (!url || typeof url !== "string") return "";
  return url.replace(/\/+$/, "");
}

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

  const target = `${normalizeBase(resolvedBaseUrl)}/instance/connectionState/${encodeURIComponent(String(instanceName).trim())}`;

  try {
    const res = await evolutionFetch(target, {
      method: "GET",
      headers: { apikey: resolvedApiKey },
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
    const state =
      data?.instance?.state || data?.state || data?.connectionStatus || "desconhecido";
    return NextResponse.json({ ...data, connected: isConnectedState(state) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao contactar Evolution API." },
      { status: 502 },
    );
  }
}
