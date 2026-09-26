import { normalizeManagedNumbersList } from "@/lib/managed-numbers";
import { DEFAULT_FAQ_ENTRIES, normalizeFaqEntries } from "@/lib/faq-tattoo-tribal";

export const MAX_USED_PIX_TRANSACTIONS = 300;
export const MAX_LEADS = 200;
export const MAX_LEAD_OUTCOMES = 500;
export const MAX_PENDING_FLOWS = 100;
export const MAX_APPOINTMENTS = 200;

const DEFAULT_PRICING = [
  { area: 1, tattooNova: "R$ 4.000,00", complemento: "", reforma: "" },
  { area: 2, tattooNova: "R$ 5.000,00", complemento: "", reforma: "" },
  { area: 3, tattooNova: "R$ 2.000,00", complemento: "", reforma: "" },
  { area: 4, tattooNova: "R$ 2.000,00", complemento: "", reforma: "" },
  { area: 5, tattooNova: "R$ 3.000,00", complemento: "", reforma: "" },
  { area: 6, tattooNova: "R$ 1.000,00", complemento: "", reforma: "" },
  { area: 7, tattooNova: "R$ 3.500,00", complemento: "", reforma: "" },
  { area: 8, tattooNova: "R$ 3.500,00", complemento: "", reforma: "" },
  { area: 9, tattooNova: "R$ 3.000,00", complemento: "", reforma: "" },
  { area: 10, tattooNova: "R$ 3.000,00", complemento: "", reforma: "" },
  { area: 11, tattooNova: "R$ 3.500,00", complemento: "", reforma: "" },
  { area: 12, tattooNova: "R$ 3.500,00", complemento: "", reforma: "" },
  { area: 13, tattooNova: "R$ 2.000,00", complemento: "", reforma: "" },
  { area: 14, tattooNova: "incluido 4", complemento: "", reforma: "" },
  { area: 15, tattooNova: "incluido 5", complemento: "", reforma: "" },
  { area: 16, tattooNova: "R$ 3.000,00", complemento: "", reforma: "" },
];

const DEFAULT_WORKING_HOURS = [
  { day: 1, start: "10:00", end: "19:00" },
  { day: 2, start: "10:00", end: "19:00" },
  { day: 3, start: "10:00", end: "19:00" },
  { day: 4, start: "10:00", end: "19:00" },
  { day: 5, start: "10:00", end: "19:00" },
  { day: 6, start: "10:00", end: "19:00" },
];

export function createDefaultDb() {
  return {
    auth: {
      passwordHash: "",
      sessionToken: "",
    },
    settings: {
      targetNumber: "",
      managedNumbers: [],
      handoffNumber: "",
      secretaryNumbers: [],
      welcomeMessage:
        "Fala, meu amigo! Tudo certo? 🤝\nAqui é o Matheus Brizza, especialista em Neo Tribal e Geométrico 🔥\nTambém trabalho com Fine Line, Blackwork e outros estilos.\nVamos tirar sua ideia do papel com um projeto brabo! 🎯",
      projectPrompt: "Me conta: qual é o tipo do seu projeto? 👇",
      catalogPrompt:
        "Agora me envie os números das áreas da imagem que você quer tatuar (ex: 1, 4 e 7) ✍️",
      pixFixedAmount: "R$ 200,00",
      pixKey: "",
      pixHolderName: "",
      pixInstructions: "Envie o comprovante do PIX após realizar o pagamento do sinal.",
      scheduling: {
        slotDurationMinutes: 120,
        daysAhead: 14,
        workingHours: DEFAULT_WORKING_HOURS,
      },
      googleCalendar: {
        calendarId: "primary",
        refreshToken: "",
        connectedAt: "",
      },
      faqEntries: DEFAULT_FAQ_ENTRIES.map((e) => ({
        ...e,
        keywords: [...e.keywords],
      })),
    },
    pricing: DEFAULT_PRICING,
    leads: [],
    leadOutcomes: [],
    mutedLeadNumbers: [],
    pendingSchedules: [],
    pendingPayments: [],
    pendingInteractions: [],
    appointments: [],
    usedPixTransactionIds: [],
  };
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function resolveSecretaryNumbers(settings) {
  const fromArray = Array.isArray(settings?.secretaryNumbers)
    ? settings.secretaryNumbers.map(digitsOnly).filter(Boolean)
    : [];
  if (fromArray.length) return [...new Set(fromArray)];
  const legacy = digitsOnly(settings?.handoffNumber);
  return legacy ? [legacy] : [];
}

/**
 * @param {object | null | undefined} db
 * @returns {object}
 */
export function withDefaults(db) {
  const defaults = createDefaultDb();
  return {
    ...defaults,
    ...db,
    auth: { ...defaults.auth, ...(db?.auth || {}) },
    settings: {
      ...defaults.settings,
      ...(db?.settings || {}),
      managedNumbers: normalizeManagedNumbersList(db?.settings?.managedNumbers),
      scheduling: {
        ...defaults.settings.scheduling,
        ...(db?.settings?.scheduling || {}),
        workingHours: Array.isArray(db?.settings?.scheduling?.workingHours)
          ? db.settings.scheduling.workingHours
          : defaults.settings.scheduling.workingHours,
      },
      googleCalendar: {
        ...defaults.settings.googleCalendar,
        ...(db?.settings?.googleCalendar || {}),
      },
      secretaryNumbers: resolveSecretaryNumbers(db?.settings || {}),
      faqEntries: normalizeFaqEntries(db?.settings?.faqEntries),
    },
    pricing: Array.isArray(db?.pricing)
      ? db.pricing.map((row) => ({
          ...row,
          areaLabel: typeof row?.areaLabel === "string" ? row.areaLabel : "",
        }))
      : defaults.pricing,
    leads: Array.isArray(db?.leads) ? db.leads : [],
    leadOutcomes: Array.isArray(db?.leadOutcomes) ? db.leadOutcomes : [],
    mutedLeadNumbers: Array.isArray(db?.mutedLeadNumbers) ? db.mutedLeadNumbers : [],
    pendingSchedules: Array.isArray(db?.pendingSchedules) ? db.pendingSchedules : [],
    pendingPayments: Array.isArray(db?.pendingPayments) ? db.pendingPayments : [],
    pendingInteractions: Array.isArray(db?.pendingInteractions) ? db.pendingInteractions : [],
    appointments: Array.isArray(db?.appointments) ? db.appointments : [],
    usedPixTransactionIds: Array.isArray(db?.usedPixTransactionIds) ? db.usedPixTransactionIds : [],
  };
}

export function normalizeTransactionId(transactionId) {
  return String(transactionId || "")
    .trim()
    .toUpperCase();
}
