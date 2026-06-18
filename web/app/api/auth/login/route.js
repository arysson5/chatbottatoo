import { NextResponse } from "next/server";
import { loginWithPassword } from "@/lib/auth";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  try {
    await loginWithPassword(password);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao entrar." },
      { status: 400 },
    );
  }
}

