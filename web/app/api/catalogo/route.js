import fs from "node:fs";
import { NextResponse } from "next/server";
import { getCatalogoImagePath } from "@/lib/catalogo-media";

export async function GET() {
  try {
    const imagePath = getCatalogoImagePath();
    const buffer = fs.readFileSync(imagePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[catalogo] falha ao carregar imagem", error);
    return NextResponse.json({ error: "catalogo indisponivel" }, { status: 500 });
  }
}
