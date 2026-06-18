import { NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/google-calendar";
import { updateDb } from "@/lib/simple-db";
import { appPublicRedirect } from "@/lib/app-public-url";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      appPublicRedirect(`/?calendar_error=${encodeURIComponent(error)}`),
    );
  }

  if (!code) {
    return NextResponse.redirect(appPublicRedirect("/?calendar_error=missing_code"));
  }

  const tokens = await exchangeGoogleCode(code);
  if (!tokens?.refreshToken) {
    return NextResponse.redirect(appPublicRedirect("/?calendar_error=no_refresh_token"));
  }

  await updateDb((draft) => {
    draft.settings.googleCalendar = {
      ...draft.settings.googleCalendar,
      refreshToken: tokens.refreshToken,
      connectedAt: new Date().toISOString(),
      calendarId: draft.settings.googleCalendar?.calendarId || "primary",
    };
    return draft;
  });

  return NextResponse.redirect(appPublicRedirect("/?calendar_connected=1"));
}
