-- Multi-número: chave composta instance + number

-- muted_leads
ALTER TABLE "muted_leads" ADD COLUMN IF NOT EXISTS "instance" TEXT NOT NULL DEFAULT '';
ALTER TABLE "muted_leads" DROP CONSTRAINT IF EXISTS "muted_leads_pkey";
ALTER TABLE "muted_leads" ADD PRIMARY KEY ("instance", "number");
CREATE INDEX IF NOT EXISTS "muted_leads_number_idx" ON "muted_leads"("number");

-- pending_schedules
ALTER TABLE "pending_schedules" ADD COLUMN IF NOT EXISTS "instance" TEXT NOT NULL DEFAULT '';
ALTER TABLE "pending_schedules" DROP CONSTRAINT IF EXISTS "pending_schedules_pkey";
ALTER TABLE "pending_schedules" ADD PRIMARY KEY ("instance", "number");
CREATE INDEX IF NOT EXISTS "pending_schedules_number_idx" ON "pending_schedules"("number");

-- pending_payments
ALTER TABLE "pending_payments" ADD COLUMN IF NOT EXISTS "instance" TEXT NOT NULL DEFAULT '';
ALTER TABLE "pending_payments" DROP CONSTRAINT IF EXISTS "pending_payments_pkey";
ALTER TABLE "pending_payments" ADD PRIMARY KEY ("instance", "number");
CREATE INDEX IF NOT EXISTS "pending_payments_number_idx" ON "pending_payments"("number");

-- pending_interactions
ALTER TABLE "pending_interactions" ADD COLUMN IF NOT EXISTS "instance" TEXT NOT NULL DEFAULT '';
ALTER TABLE "pending_interactions" DROP CONSTRAINT IF EXISTS "pending_interactions_pkey";
ALTER TABLE "pending_interactions" ADD PRIMARY KEY ("instance", "number", "step");

-- managed_numbers connection status
ALTER TABLE "managed_numbers" ADD COLUMN IF NOT EXISTS "connection_status" TEXT NOT NULL DEFAULT '';
ALTER TABLE "managed_numbers" ADD COLUMN IF NOT EXISTS "needs_qr" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "managed_numbers" ADD COLUMN IF NOT EXISTS "last_disconnect_at" TIMESTAMP(3);
