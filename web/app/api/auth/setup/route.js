import { NextResponse } from "next/server";
import { setupPassword } from "@/lib/auth";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (password !== confirmPassword) {
    return NextResponse.json({ error: "As senhas não conferem." }, { status: 400 });
  }

  try {
    await setupPassword(password);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar senha." },
      { status: 400 },
    );
  }
}

