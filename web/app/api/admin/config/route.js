import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { normalizeManagedNumbersList } from "@/lib/managed-numbers";
import { readDb, updateDb } from "@/lib/simple-db";

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function asString(value) {
  return typeof value === "string" ? value : "";
}

function uniqueDigitsList(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const digits = digitsOnly(value);
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    out.push(digits);
  }
  return out;
}

function sanitizeWorkingHours(value) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => ({
      day: Number(item?.day),
      start: asString(item?.start),
      end: asString(item?.end),
    }))
    .filter((item) => item.day >= 0 && item.day <= 6 && item.start && item.end);
}

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const db = await readDb();
  const calendarConnected = Boolean(db.settings?.googleCalendar?.refreshToken?.trim());
  return NextResponse.json({
    settings: db.settings,
    pricing: db.pricing,
    calendarConnected,
  });
}

function parsePixAmount(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits) / 100;
}

export async function POST(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const settings = body?.settings && typeof body.settings === "object" ? body.settings : {};
  const pricing = Array.isArray(body?.pricing) ? body.pricing : [];

  const pixKey = asString(settings?.pixKey).trim();
  const pixAmount = parsePixAmount(settings?.pixFixedAmount);
  if (!pixKey || pixAmount <= 0) {
    return NextResponse.json(
      {
        error:
          "Chave PIX e valor do sinal são obrigatórios para agendamento online. Preencha ambos antes de salvar.",
      },
      { status: 400 },
    );
  }

  const safePricing = pricing
    .map((item) => ({
      area: Number(item?.area) || 0,
      areaLabel: asString(item?.areaLabel),
      tattooNova: asString(item?.tattooNova),
      complemento: asString(item?.complemento),
      reforma: asString(item?.reforma),
    }))
    .filter((item) => item.area > 0)
    .sort((a, b) => a.area - b.area);

  await updateDb((draft) => {
    if (typeof settings?.targetNumber === "string") {
      draft.settings.targetNumber = digitsOnly(settings?.targetNumber);
    }
    draft.settings.managedNumbers = normalizeManagedNumbersList(settings?.managedNumbers);
    draft.settings.secretaryNumbers = uniqueDigitsList(settings?.secretaryNumbers);
    draft.settings.handoffNumber = digitsOnly(settings?.handoffNumber);
    draft.settings.welcomeMessage =
      asString(settings?.welcomeMessage) || draft.settings.welcomeMessage;
    draft.settings.projectPrompt =
      asString(settings?.projectPrompt) || draft.settings.projectPrompt;
    draft.settings.catalogPrompt =
      asString(settings?.catalogPrompt) || draft.settings.catalogPrompt;
    draft.settings.pixFixedAmount =
      asString(settings?.pixFixedAmount) || draft.settings.pixFixedAmount;
    draft.settings.pixKey = asString(settings?.pixKey);
    draft.settings.pixHolderName = asString(settings?.pixHolderName);
    draft.settings.pixInstructions = asString(settings?.pixInstructions);

    if (settings?.scheduling && typeof settings.scheduling === "object") {
      const wh = sanitizeWorkingHours(settings.scheduling.workingHours);
      draft.settings.scheduling = {
        ...draft.settings.scheduling,
        slotDurationMinutes:
          Number(settings.scheduling.slotDurationMinutes) ||
          draft.settings.scheduling.slotDurationMinutes,
        daysAhead: Number(settings.scheduling.daysAhead) || draft.settings.scheduling.daysAhead,
        ...(wh ? { workingHours: wh } : {}),
      };
    }

    if (settings?.googleCalendar && typeof settings.googleCalendar === "object") {
      draft.settings.googleCalendar = {
        ...draft.settings.googleCalendar,
        calendarId:
          asString(settings.googleCalendar.calendarId) ||
          draft.settings.googleCalendar.calendarId ||
          "primary",
      };
    }

    draft.pricing = safePricing;
    return draft;
  });

  return NextResponse.json({ ok: true });
}


