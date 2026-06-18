import { google } from "googleapis";
import { readDb } from "@/lib/simple-db";
import { filterSlots } from "@/lib/slot-filters";

const TIMEZONE = "America/Sao_Paulo";

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGoogleAuthUrl() {
  const oauth2 = getOAuthClient();
  if (!oauth2) return null;
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
  });
}

/**
 * @param {string} code
 * @returns {Promise<{ refreshToken: string } | null>}
 */
export async function exchangeGoogleCode(code) {
  const oauth2 = getOAuthClient();
  if (!oauth2) return null;
  const { tokens } = await oauth2.getToken(code);
  if (!tokens?.refresh_token) return null;
  return { refreshToken: tokens.refresh_token };
}

/**
 * @param {object} googleCalendarSettings
 * @returns {import("googleapis").calendar_v3.Calendar | null}
 */
async function getCalendarClient(googleCalendarSettings) {
  const oauth2 = getOAuthClient();
  const refreshToken = googleCalendarSettings?.refreshToken?.trim();
  if (!oauth2 || !refreshToken) return null;
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth: oauth2 });
}

/**
 * @param {Date} date
 * @param {string} time HH:mm
 * @returns {Date}
 */
function combineDateTime(date, time) {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * @param {object} scheduling
 * @param {object} [filters] dateStart, dateEnd, weekdays[]
 * @returns {Promise<{ id: number, start: string, end: string, label: string }[]>}
 */
export async function listFreeSlots(scheduling, filters) {
  const db = await readDb();
  const calendar = await getCalendarClient(db.settings.googleCalendar);
  if (!calendar) return [];

  const slotDuration = Number(scheduling?.slotDurationMinutes) || 120;
  const daysAhead = Number(scheduling?.daysAhead) || 14;
  const workingHours = Array.isArray(scheduling?.workingHours) ? scheduling.workingHours : [];
  const calendarId = db.settings.googleCalendar?.calendarId || "primary";

  const now = new Date();
  const rangeEnd = new Date(now);
  rangeEnd.setDate(rangeEnd.getDate() + daysAhead);

  let busy = [];
  try {
    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: now.toISOString(),
        timeMax: rangeEnd.toISOString(),
        timeZone: TIMEZONE,
        items: [{ id: calendarId }],
      },
    });
    busy = freeBusy.data?.calendars?.[calendarId]?.busy || [];
  } catch (error) {
    console.error("[google-calendar] freebusy falhou", error);
    return [];
  }

  const busyRanges = busy.map((b) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));

  const slots = [];
  let slotId = 1;
  const cursor = new Date(now);
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 1);

  while (cursor < rangeEnd && slots.length < 60) {
    const dayOfWeek = cursor.getDay();
    const dayConfig = workingHours.find((w) => Number(w.day) === dayOfWeek);
    if (dayConfig) {
      const dayStart = combineDateTime(cursor, dayConfig.start);
      const dayEnd = combineDateTime(cursor, dayConfig.end);
      let slotStart = new Date(Math.max(dayStart.getTime(), cursor.getTime()));

      while (slotStart.getTime() + slotDuration * 60_000 <= dayEnd.getTime() && slots.length < 60) {
        const slotEnd = new Date(slotStart.getTime() + slotDuration * 60_000);
        const overlaps = busyRanges.some(
          (b) => slotStart < b.end && slotEnd > b.start,
        );
        if (!overlaps && slotStart > now) {
          const label = new Intl.DateTimeFormat("pt-BR", {
            timeZone: TIMEZONE,
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }).format(slotStart);
          slots.push({
            id: slotId,
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            label,
          });
          slotId += 1;
        }
        slotStart = new Date(slotStart.getTime() + slotDuration * 60_000);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  if (filters && typeof filters === "object") {
    return filterSlots(slots, filters);
  }

  return slots;
}

/**
 * @param {object} params
 * @returns {Promise<string | null>} event id
 */
export async function createCalendarEvent(params) {
  const db = await readDb();
  const calendar = await getCalendarClient(db.settings.googleCalendar);
  if (!calendar) return null;

  const calendarId = db.settings.googleCalendar?.calendarId || "primary";
  const { clientName, clientPhone, tattooLocation, slotStart, slotEnd, whatsappNumber } = params;

  try {
    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `Tattoo - ${clientName}`,
        description: [
          `Cliente: ${clientName}`,
          `Telefone: ${clientPhone}`,
          `WhatsApp: ${whatsappNumber}`,
          `Local da tattoo: ${tattooLocation}`,
        ].join("\n"),
        start: { dateTime: slotStart, timeZone: TIMEZONE },
        end: { dateTime: slotEnd, timeZone: TIMEZONE },
      },
    });
    return event.data?.id || null;
  } catch (error) {
    console.error("[google-calendar] createEvent falhou", error);
    return null;
  }
}

export function isGoogleCalendarConnected(googleCalendarSettings) {
  return Boolean(googleCalendarSettings?.refreshToken?.trim());
}
