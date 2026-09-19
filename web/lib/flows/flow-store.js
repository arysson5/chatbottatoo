import { updateDb } from "@/lib/simple-db";
import { rowMatchesScope } from "@/lib/scope-key";

/**
 * @param {object} db
 * @param {string} number
 * @param {string} [instance]
 * @returns {object | null}
 */
export function getPendingSchedule(db, number, instance = "") {
  const list = Array.isArray(db?.pendingSchedules) ? db.pendingSchedules : [];
  return list.find((item) => rowMatchesScope(item, number, instance)) || null;
}

/**
 * @param {object} db
 * @param {string} number
 * @param {string} [instance]
 * @returns {object | null}
 */
export function getPendingPayment(db, number, instance = "") {
  const list = Array.isArray(db?.pendingPayments) ? db.pendingPayments : [];
  return list.find((item) => rowMatchesScope(item, number, instance)) || null;
}

/**
 * @param {string} number
 * @param {object} data
 * @param {string} [instance]
 */
export async function upsertPendingSchedule(number, data, instance = "") {
  const inst = String(instance || data?.instance || "").trim();
  await updateDb((draft) => {
    const list = Array.isArray(draft.pendingSchedules) ? draft.pendingSchedules : [];
    const idx = list.findIndex((item) => rowMatchesScope(item, number, inst));
    const next = {
      ...data,
      number,
      instance: inst,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...next };
    } else {
      list.unshift(next);
    }
    draft.pendingSchedules = list.slice(0, 100);
    return draft;
  });
}

/**
 * @param {string} number
 * @param {string} [instance]
 */
export async function removePendingSchedule(number, instance = "") {
  await updateDb((draft) => {
    draft.pendingSchedules = (draft.pendingSchedules || []).filter(
      (item) => !rowMatchesScope(item, number, instance),
    );
    return draft;
  });
}

/**
 * @param {string} number
 * @param {object} data
 * @param {string} [instance]
 */
export async function upsertPendingPayment(number, data, instance = "") {
  const inst = String(instance || data?.instance || "").trim();
  await updateDb((draft) => {
    const list = Array.isArray(draft.pendingPayments) ? draft.pendingPayments : [];
    const idx = list.findIndex((item) => rowMatchesScope(item, number, inst));
    const next = {
      ...data,
      number,
      instance: inst,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...next };
    } else {
      list.unshift(next);
    }
    draft.pendingPayments = list.slice(0, 100);
    return draft;
  });
}

/**
 * @param {string} number
 * @param {string} [instance]
 */
export async function removePendingPayment(number, instance = "") {
  await updateDb((draft) => {
    draft.pendingPayments = (draft.pendingPayments || []).filter(
      (item) => !rowMatchesScope(item, number, instance),
    );
    return draft;
  });
}

/**
 * @param {object} appointment
 */
export async function saveAppointment(appointment) {
  await updateDb((draft) => {
    draft.appointments = draft.appointments || [];
    draft.appointments.unshift({
      ...appointment,
      createdAt: new Date().toISOString(),
    });
    draft.appointments = draft.appointments.slice(0, 200);
    return draft;
  });
}

/**
 * @param {object} db
 * @param {string} number
 * @param {string} [instance]
 * @returns {boolean}
 */
export function hasSchedulingFlow(db, number, instance = "") {
  const schedule = getPendingSchedule(db, number, instance);
  const payment = getPendingPayment(db, number, instance);
  return Boolean(schedule || payment);
}

/**
 * @param {string} number
 * @param {string} [instance]
 */
export async function clearSchedulingFlows(number, instance = "") {
  await removePendingSchedule(number, instance);
  await removePendingPayment(number, instance);
}
