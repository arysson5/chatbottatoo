import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getGoogleAuthUrl } from "@/lib/google-calendar";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const url = getGoogleAuthUrl();
  if (!url) {
    return NextResponse.json(
      { error: "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI no .env" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(url);
}
