-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "app_auth" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "password_hash" TEXT NOT NULL DEFAULT '',
    "session_token" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "target_number" TEXT NOT NULL DEFAULT '',
    "handoff_number" TEXT NOT NULL DEFAULT '',
    "welcome_message" TEXT NOT NULL DEFAULT '',
    "project_prompt" TEXT NOT NULL DEFAULT '',
    "catalog_prompt" TEXT NOT NULL DEFAULT '',
    "pix_fixed_amount" TEXT NOT NULL DEFAULT '',
    "pix_key" TEXT NOT NULL DEFAULT '',
    "pix_holder_name" TEXT NOT NULL DEFAULT '',
    "pix_instructions" TEXT NOT NULL DEFAULT '',
    "scheduling" JSONB NOT NULL DEFAULT '{}',
    "google_calendar" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managed_numbers" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "managed_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secretary_numbers" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "secretary_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_areas" (
    "id" SERIAL NOT NULL,
    "area" INTEGER NOT NULL,
    "area_label" TEXT NOT NULL DEFAULT '',
    "tattoo_nova" TEXT NOT NULL DEFAULT '',
    "complemento" TEXT NOT NULL DEFAULT '',
    "reforma" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "pricing_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "project_type" TEXT NOT NULL DEFAULT '',
    "handoff_number" TEXT NOT NULL DEFAULT '',
    "selected_areas" JSONB NOT NULL DEFAULT '[]',
    "estimated_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "has_photos" BOOLEAN NOT NULL DEFAULT false,
    "origin_number" TEXT NOT NULL DEFAULT '',
    "origin_number_name" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending_handoff',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_outcomes" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "client_name" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL,
    "selected_areas" JSONB NOT NULL DEFAULT '[]',
    "estimated_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quote_issued_at" TIMESTAMP(3),
    "quote_expires_at" TIMESTAMP(3),
    "expiry_notice_sent_at" TIMESTAMP(3),
    "instance" TEXT NOT NULL DEFAULT '',
    "origin_number" TEXT NOT NULL DEFAULT '',
    "origin_number_name" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "muted_leads" (
    "number" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'handoff',
    "muted_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "muted_leads_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "pending_schedules" (
    "number" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_schedules_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "pending_payments" (
    "number" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_payments_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "client_name" TEXT NOT NULL DEFAULT '',
    "client_phone" TEXT NOT NULL DEFAULT '',
    "tattoo_location" TEXT NOT NULL DEFAULT '',
    "slot_start" TIMESTAMP(3),
    "slot_end" TIMESTAMP(3),
    "slot_label" TEXT NOT NULL DEFAULT '',
    "calendar_event_id" TEXT NOT NULL DEFAULT '',
    "pix_paid_at" TIMESTAMP(3),
    "amount_paid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount_required" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "selected_areas" JSONB NOT NULL DEFAULT '[]',
    "estimated_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pix_verification_method" TEXT NOT NULL DEFAULT '',
    "pix_transaction_id" TEXT NOT NULL DEFAULT '',
    "manual_amount_used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "used_pix_transactions" (
    "transaction_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "used_pix_transactions_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_areas_area_key" ON "pricing_areas"("area");

-- CreateIndex
CREATE INDEX "leads_number_idx" ON "leads"("number");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- CreateIndex
CREATE INDEX "lead_outcomes_number_idx" ON "lead_outcomes"("number");

-- CreateIndex
CREATE INDEX "lead_outcomes_created_at_idx" ON "lead_outcomes"("created_at");

-- CreateIndex
CREATE INDEX "appointments_number_idx" ON "appointments"("number");

-- CreateIndex
CREATE INDEX "appointments_created_at_idx" ON "appointments"("created_at");
