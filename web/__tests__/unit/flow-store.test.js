import {
  getPendingSchedule,
  getPendingPayment,
  hasSchedulingFlow,
} from "@/lib/flows/flow-store";

const TEST_NUMBER = "5511999887766";

describe("flow-store", () => {
  const db = {
    pendingSchedules: [
      { number: TEST_NUMBER, step: "slot_choice", clientName: "João" },
      { number: "5511888777666", step: "name" },
    ],
    pendingPayments: [{ number: "5511777666555", step: "pix", amount: 200 }],
  };

  describe("getPendingSchedule", () => {
    it("retorna schedule do número", () => {
      const schedule = getPendingSchedule(db, TEST_NUMBER);

      expect(schedule).toEqual(expect.objectContaining({ step: "slot_choice", clientName: "João" }));
    });

    it("retorna null quando não existe", () => {
      expect(getPendingSchedule(db, "5511000000000")).toBeNull();
    });
  });

  describe("getPendingPayment", () => {
    it("retorna payment do número", () => {
      const payment = getPendingPayment(db, "5511777666555");

      expect(payment).toEqual(expect.objectContaining({ step: "pix", amount: 200 }));
    });

    it("retorna null quando não existe", () => {
      expect(getPendingPayment(db, TEST_NUMBER)).toBeNull();
    });
  });

  describe("hasSchedulingFlow", () => {
    it("retorna true quando há schedule", () => {
      expect(hasSchedulingFlow(db, TEST_NUMBER)).toBe(true);
    });

    it("retorna true quando há payment", () => {
      expect(hasSchedulingFlow(db, "5511777666555")).toBe(true);
    });

    it("retorna false quando não há fluxo", () => {
      expect(hasSchedulingFlow(db, "5511000000000")).toBe(false);
    });
  });
});
