import { NextResponse } from "next/server";
import { evolutionFetch } from "@/lib/evolution-fetch";
import { fetchConnectWithQr } from "@/lib/evolution-qrcode";

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

  try {
    const result = await fetchConnectWithQr({
      baseUrl: normalizeBase(resolvedBaseUrl),
      apiKey: resolvedApiKey,
      instanceName: String(instanceName).trim(),
      fetchImpl: evolutionFetch,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, details: result.data },
        { status: result.status },
      );
    }

    return NextResponse.json(result.data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao contactar Evolution API." },
      { status: 502 },
    );
  }
}
