import { updateDb } from "@/lib/simple-db";

/**
 * @param {object} db
 * @param {string} number
 * @returns {object | null}
 */
export function getPendingSchedule(db, number) {
  const list = Array.isArray(db?.pendingSchedules) ? db.pendingSchedules : [];
  return list.find((item) => item?.number === number) || null;
}

/**
 * @param {object} db
 * @param {string} number
 * @returns {object | null}
 */
export function getPendingPayment(db, number) {
  const list = Array.isArray(db?.pendingPayments) ? db.pendingPayments : [];
  return list.find((item) => item?.number === number) || null;
}

/**
 * @param {string} number
 * @param {object} data
 */
export async function upsertPendingSchedule(number, data) {
  await updateDb((draft) => {
    const list = Array.isArray(draft.pendingSchedules) ? draft.pendingSchedules : [];
    const idx = list.findIndex((item) => item?.number === number);
    const next = {
      number,
      updatedAt: new Date().toISOString(),
      ...data,
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
 */
export async function removePendingSchedule(number) {
  await updateDb((draft) => {
    draft.pendingSchedules = (draft.pendingSchedules || []).filter(
      (item) => item?.number !== number,
    );
    return draft;
  });
}

/**
 * @param {string} number
 * @param {object} data
 */
export async function upsertPendingPayment(number, data) {
  await updateDb((draft) => {
    const list = Array.isArray(draft.pendingPayments) ? draft.pendingPayments : [];
    const idx = list.findIndex((item) => item?.number === number);
    const next = {
      number,
      updatedAt: new Date().toISOString(),
      ...data,
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
 */
export async function removePendingPayment(number) {
  await updateDb((draft) => {
    draft.pendingPayments = (draft.pendingPayments || []).filter(
      (item) => item?.number !== number,
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
 * @returns {boolean}
 */
export function hasSchedulingFlow(db, number) {
  const schedule = getPendingSchedule(db, number);
  const payment = getPendingPayment(db, number);
  return Boolean(schedule || payment);
}

/**
 * @param {string} number
 */
export async function clearSchedulingFlows(number) {
  await removePendingSchedule(number);
  await removePendingPayment(number);
}
