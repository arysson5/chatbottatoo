import {
  MAX_APPOINTMENTS,
  MAX_LEAD_OUTCOMES,
  MAX_LEADS,
  MAX_PENDING_FLOWS,
  MAX_USED_PIX_TRANSACTIONS,
  withDefaults,
} from "@/lib/db-defaults";
import { prisma } from "@/lib/prisma";

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function pendingRowToObject(row) {
  const data = row.data && typeof row.data === "object" ? row.data : {};
  return {
    ...data,
    instance: row.instance || data.instance || "",
    number: row.number,
    updatedAt: toIso(row.updatedAt),
  };
}

/**
 * @returns {Promise<object>}
 */
export async function assembleDbSnapshot() {
  const [
    auth,
    settings,
    managedNumbers,
    secretaryNumbers,
    pricing,
    leads,
    leadOutcomes,
    mutedLeads,
    pendingSchedules,
    pendingPayments,
    pendingInteractions,
    appointments,
    usedPixTransactions,
  ] = await Promise.all([
    prisma.appAuth.findUnique({ where: { id: 1 } }),
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.managedNumber.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.secretaryNumber.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.pricingArea.findMany({ orderBy: { area: "asc" } }),
    prisma.lead.findMany({ orderBy: { createdAt: "desc" }, take: MAX_LEADS }),
    prisma.leadOutcome.findMany({ orderBy: { createdAt: "desc" }, take: MAX_LEAD_OUTCOMES }),
    prisma.mutedLead.findMany(),
    prisma.pendingSchedule.findMany({ orderBy: { updatedAt: "desc" }, take: MAX_PENDING_FLOWS }),
    prisma.pendingPayment.findMany({ orderBy: { updatedAt: "desc" }, take: MAX_PENDING_FLOWS }),
    prisma.pendingInteraction.findMany({ orderBy: { updatedAt: "desc" }, take: MAX_PENDING_FLOWS }),
    prisma.appointment.findMany({ orderBy: { createdAt: "desc" }, take: MAX_APPOINTMENTS }),
    prisma.usedPixTransaction.findMany({
      orderBy: { usedAt: "desc" },
      take: MAX_USED_PIX_TRANSACTIONS,
    }),
  ]);

  const scheduling =
    settings?.scheduling && typeof settings.scheduling === "object" ? settings.scheduling : {};
  const googleCalendar =
    settings?.googleCalendar && typeof settings.googleCalendar === "object"
      ? settings.googleCalendar
      : {};

  return withDefaults({
    auth: {
      passwordHash: auth?.passwordHash || "",
      sessionToken: auth?.sessionToken || "",
    },
    settings: {
      targetNumber: settings?.targetNumber || "",
      handoffNumber: settings?.handoffNumber || "",
      welcomeMessage: settings?.welcomeMessage || "",
      projectPrompt: settings?.projectPrompt || "",
      catalogPrompt: settings?.catalogPrompt || "",
      pixFixedAmount: settings?.pixFixedAmount || "",
      pixKey: settings?.pixKey || "",
      pixHolderName: settings?.pixHolderName || "",
      pixInstructions: settings?.pixInstructions || "",
      managedNumbers: managedNumbers.map((row) => ({
        number: row.number,
        name: row.name || "",
        connectionStatus: row.connectionStatus || "",
        needsQr: Boolean(row.needsQr),
        lastDisconnectAt: toIso(row.lastDisconnectAt) || "",
      })),
      secretaryNumbers: secretaryNumbers.map((row) => row.number),
      scheduling,
      googleCalendar,
    },
    pricing: pricing.map((row) => ({
      area: row.area,
      areaLabel: row.areaLabel || "",
      tattooNova: row.tattooNova || "",
      complemento: row.complemento || "",
      reforma: row.reforma || "",
    })),
    leads: leads.map((row) => ({
      number: row.number,
      projectType: row.projectType || "",
      handoffNumber: row.handoffNumber || "",
      selectedAreas: Array.isArray(row.selectedAreas) ? row.selectedAreas : [],
      estimatedTotal: row.estimatedTotal ?? 0,
      hasPhotos: Boolean(row.hasPhotos),
      originNumber: row.originNumber || "",
      originNumberName: row.originNumberName || "",
      status: row.status || "pending_handoff",
      createdAt: toIso(row.createdAt),
    })),
    leadOutcomes: leadOutcomes.map((row) => ({
      number: row.number,
      clientName: row.clientName || "",
      outcome: row.outcome,
      selectedAreas: Array.isArray(row.selectedAreas) ? row.selectedAreas : [],
      estimatedTotal: row.estimatedTotal ?? 0,
      quoteIssuedAt: toIso(row.quoteIssuedAt),
      quoteExpiresAt: toIso(row.quoteExpiresAt),
      expiryNoticeSentAt: toIso(row.expiryNoticeSentAt),
      instance: row.instance || "",
      originNumber: row.originNumber || "",
      originNumberName: row.originNumberName || "",
      createdAt: toIso(row.createdAt),
    })),
    mutedLeadNumbers: mutedLeads.map((row) => ({
      instance: row.instance || "",
      number: row.number,
      reason: row.reason || "handoff",
      mutedAt: toIso(row.mutedAt),
      expiresAt: toIso(row.expiresAt),
    })),
    pendingSchedules: pendingSchedules.map(pendingRowToObject),
    pendingPayments: pendingPayments.map(pendingRowToObject),
    pendingInteractions: pendingInteractions.map((row) => ({
      instance: row.instance || "",
      number: row.number,
      step: row.step,
      data: row.data && typeof row.data === "object" ? row.data : {},
      updatedAt: toIso(row.updatedAt),
      expiresAt: toIso(row.expiresAt),
    })),
    appointments: appointments.map((row) => ({
      number: row.number,
      clientName: row.clientName || "",
      clientPhone: row.clientPhone || "",
      tattooLocation: row.tattooLocation || "",
      slotStart: toIso(row.slotStart),
      slotEnd: toIso(row.slotEnd),
      slotLabel: row.slotLabel || "",
      calendarEventId: row.calendarEventId || "",
      pixPaidAt: toIso(row.pixPaidAt),
      amountPaid: row.amountPaid ?? 0,
      amountRequired: row.amountRequired ?? 0,
      status: row.status || "confirmed",
      selectedAreas: Array.isArray(row.selectedAreas) ? row.selectedAreas : [],
      estimatedTotal: row.estimatedTotal ?? 0,
      pixVerificationMethod: row.pixVerificationMethod || "",
      pixTransactionId: row.pixTransactionId || "",
      manualAmountUsed: Boolean(row.manualAmountUsed),
      createdAt: toIso(row.createdAt),
    })),
    usedPixTransactionIds: usedPixTransactions.map((row) => ({
      id: row.transactionId,
      number: row.number,
      usedAt: toIso(row.usedAt),
    })),
  });
}

/**
 * @param {object} snapshot
 */
export async function persistDbSnapshot(snapshot) {
  const db = withDefaults(snapshot);
  const settings = db.settings || {};
  const managedList = Array.isArray(settings.managedNumbers) ? settings.managedNumbers : [];
  const secretaryList = Array.isArray(settings.secretaryNumbers) ? settings.secretaryNumbers : [];

  await prisma.$transaction(
    async (tx) => {
      await tx.appAuth.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          passwordHash: db.auth.passwordHash || "",
          sessionToken: db.auth.sessionToken || "",
        },
        update: {
          passwordHash: db.auth.passwordHash || "",
          sessionToken: db.auth.sessionToken || "",
        },
      });

      await tx.appSettings.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          targetNumber: settings.targetNumber || "",
          handoffNumber: settings.handoffNumber || "",
          welcomeMessage: settings.welcomeMessage || "",
          projectPrompt: settings.projectPrompt || "",
          catalogPrompt: settings.catalogPrompt || "",
          pixFixedAmount: settings.pixFixedAmount || "",
          pixKey: settings.pixKey || "",
          pixHolderName: settings.pixHolderName || "",
          pixInstructions: settings.pixInstructions || "",
          scheduling: settings.scheduling || {},
          googleCalendar: settings.googleCalendar || {},
        },
        update: {
          targetNumber: settings.targetNumber || "",
          handoffNumber: settings.handoffNumber || "",
          welcomeMessage: settings.welcomeMessage || "",
          projectPrompt: settings.projectPrompt || "",
          catalogPrompt: settings.catalogPrompt || "",
          pixFixedAmount: settings.pixFixedAmount || "",
          pixKey: settings.pixKey || "",
          pixHolderName: settings.pixHolderName || "",
          pixInstructions: settings.pixInstructions || "",
          scheduling: settings.scheduling || {},
          googleCalendar: settings.googleCalendar || {},
        },
      });

      await tx.managedNumber.deleteMany();
      if (managedList.length) {
        await tx.managedNumber.createMany({
          data: managedList.map((item, index) => ({
            number: String(item?.number || "").replace(/\D/g, ""),
            name: String(item?.name || "").trim(),
            sortOrder: index,
            connectionStatus: String(item?.connectionStatus || "").trim(),
            needsQr: Boolean(item?.needsQr),
            lastDisconnectAt: toDate(item?.lastDisconnectAt),
          })).filter((item) => item.number),
        });
      }

      await tx.secretaryNumber.deleteMany();
      if (secretaryList.length) {
        await tx.secretaryNumber.createMany({
          data: secretaryList.map((number, index) => ({
            number: String(number || "").replace(/\D/g, ""),
            sortOrder: index,
          })).filter((item) => item.number),
        });
      }

      await tx.pricingArea.deleteMany();
      if (db.pricing.length) {
        const seenAreas = new Set();
        const pricingData = db.pricing
          .map((row) => ({
            area: Number(row.area) || 0,
            areaLabel: String(row.areaLabel || ""),
            tattooNova: String(row.tattooNova || ""),
            complemento: String(row.complemento || ""),
            reforma: String(row.reforma || ""),
          }))
          .filter((row) => {
            if (row.area <= 0 || seenAreas.has(row.area)) return false;
            seenAreas.add(row.area);
            return true;
          });
        if (pricingData.length) {
          await tx.pricingArea.createMany({ data: pricingData });
        }
      }

      await tx.lead.deleteMany();
      const leadsSlice = db.leads.slice(0, MAX_LEADS);
      if (leadsSlice.length) {
        await tx.lead.createMany({
          data: leadsSlice.map((row) => ({
            number: String(row.number || ""),
            projectType: String(row.projectType || ""),
            handoffNumber: String(row.handoffNumber || ""),
            selectedAreas: Array.isArray(row.selectedAreas) ? row.selectedAreas : [],
            estimatedTotal: Number(row.estimatedTotal) || 0,
            hasPhotos: Boolean(row.hasPhotos),
            originNumber: String(row.originNumber || ""),
            originNumberName: String(row.originNumberName || ""),
            status: String(row.status || "pending_handoff"),
            createdAt: toDate(row.createdAt) || new Date(),
          })),
        });
      }

      await tx.leadOutcome.deleteMany();
      const outcomesSlice = db.leadOutcomes.slice(0, MAX_LEAD_OUTCOMES);
      if (outcomesSlice.length) {
        await tx.leadOutcome.createMany({
          data: outcomesSlice.map((row) => ({
            number: String(row.number || ""),
            clientName: String(row.clientName || ""),
            outcome: String(row.outcome || ""),
            selectedAreas: Array.isArray(row.selectedAreas) ? row.selectedAreas : [],
            estimatedTotal: Number(row.estimatedTotal) || 0,
            quoteIssuedAt: toDate(row.quoteIssuedAt),
            quoteExpiresAt: toDate(row.quoteExpiresAt),
            expiryNoticeSentAt: toDate(row.expiryNoticeSentAt),
            instance: String(row.instance || ""),
            originNumber: String(row.originNumber || ""),
            originNumberName: String(row.originNumberName || ""),
            createdAt: toDate(row.createdAt) || new Date(),
          })),
        });
      }

      await tx.mutedLead.deleteMany();
      if (db.mutedLeadNumbers.length) {
        await tx.mutedLead.createMany({
          data: db.mutedLeadNumbers.map((row) => {
            if (typeof row === "string") {
              const now = new Date();
              return {
                instance: "",
                number: row,
                reason: "legacy_mute",
                mutedAt: now,
                expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
              };
            }
            return {
              instance: String(row.instance || ""),
              number: String(row.number || ""),
              reason: String(row.reason || "handoff"),
              mutedAt: toDate(row.mutedAt) || new Date(),
              expiresAt: toDate(row.expiresAt) || new Date(),
            };
          }).filter((row) => row.number),
        });
      }

      await tx.pendingSchedule.deleteMany();
      const schedulesSlice = db.pendingSchedules.slice(0, MAX_PENDING_FLOWS);
      for (const item of schedulesSlice) {
        const number = String(item?.number || "").replace(/\D/g, "");
        if (!number) continue;
        const instance = String(item?.instance || "").trim();
        const { number: _n, instance: _i, updatedAt, ...rest } = item;
        await tx.pendingSchedule.create({
          data: {
            instance,
            number,
            data: rest,
            updatedAt: toDate(updatedAt) || new Date(),
          },
        });
      }

      await tx.pendingPayment.deleteMany();
      const paymentsSlice = db.pendingPayments.slice(0, MAX_PENDING_FLOWS);
      for (const item of paymentsSlice) {
        const number = String(item?.number || "").replace(/\D/g, "");
        if (!number) continue;
        const instance = String(item?.instance || "").trim();
        const { number: _n, instance: _i, updatedAt, ...rest } = item;
        await tx.pendingPayment.create({
          data: {
            instance,
            number,
            data: rest,
            updatedAt: toDate(updatedAt) || new Date(),
          },
        });
      }

      await tx.pendingInteraction.deleteMany();
      const interactionsSlice = (db.pendingInteractions || []).slice(0, MAX_PENDING_FLOWS);
      for (const item of interactionsSlice) {
        const number = String(item?.number || "").replace(/\D/g, "");
        const step = String(item?.step || "").trim();
        if (!number || !step) continue;
        await tx.pendingInteraction.create({
          data: {
            instance: String(item?.instance || "").trim(),
            number,
            step,
            data: item.data && typeof item.data === "object" ? item.data : {},
            updatedAt: toDate(item.updatedAt) || new Date(),
            expiresAt: toDate(item.expiresAt),
          },
        });
      }

      await tx.appointment.deleteMany();
      const appointmentsSlice = db.appointments.slice(0, MAX_APPOINTMENTS);
      if (appointmentsSlice.length) {
        await tx.appointment.createMany({
          data: appointmentsSlice.map((row) => ({
            number: String(row.number || ""),
            clientName: String(row.clientName || ""),
            clientPhone: String(row.clientPhone || ""),
            tattooLocation: String(row.tattooLocation || ""),
            slotStart: toDate(row.slotStart),
            slotEnd: toDate(row.slotEnd),
            slotLabel: String(row.slotLabel || ""),
            calendarEventId: String(row.calendarEventId || ""),
            pixPaidAt: toDate(row.pixPaidAt),
            amountPaid: Number(row.amountPaid) || 0,
            amountRequired: Number(row.amountRequired) || 0,
            status: String(row.status || "confirmed"),
            selectedAreas: Array.isArray(row.selectedAreas) ? row.selectedAreas : [],
            estimatedTotal: Number(row.estimatedTotal) || 0,
            pixVerificationMethod: String(row.pixVerificationMethod || ""),
            pixTransactionId: String(row.pixTransactionId || ""),
            manualAmountUsed: Boolean(row.manualAmountUsed),
            createdAt: toDate(row.createdAt) || new Date(),
          })),
        });
      }

      await tx.usedPixTransaction.deleteMany();
      const pixSlice = db.usedPixTransactionIds.slice(0, MAX_USED_PIX_TRANSACTIONS);
      if (pixSlice.length) {
        await tx.usedPixTransaction.createMany({
          data: pixSlice.map((row) => ({
            transactionId: String(row.id || "").trim().toUpperCase(),
            number: String(row.number || ""),
            usedAt: toDate(row.usedAt) || new Date(),
          })).filter((row) => row.transactionId),
          skipDuplicates: true,
        });
      }
    },
    { timeout: 30000 },
  );

  return assembleDbSnapshot();
}

export async function readDbFromPostgres() {
  return assembleDbSnapshot();
}

/**
 * @param {(draft: object) => object | void | Promise<object | void>} updater
 */
export async function updateDbPostgres(updater) {
  const run = async () => {
    const current = await assembleDbSnapshot();
    const updated = await updater(structuredClone(current));
    return persistDbSnapshot(updated ?? current);
  };

  try {
    return await run();
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("deadlock") || message.includes("could not serialize")) {
      return run();
    }
    throw error;
  }
}

/**
 * @returns {Promise<boolean>}
 */
export async function isPostgresEmpty() {
  const [auth, settingsCount] = await Promise.all([
    prisma.appAuth.findUnique({ where: { id: 1 } }),
    prisma.appSettings.count(),
  ]);
  if (!auth && settingsCount === 0) return true;
  if (!auth?.passwordHash && settingsCount <= 1) {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings?.pixKey && !settings?.welcomeMessage) {
      const leads = await prisma.lead.count();
      return leads === 0;
    }
  }
  return false;
}
