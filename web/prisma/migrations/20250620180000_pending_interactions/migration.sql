CREATE TABLE "pending_interactions" (
    "number" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "pending_interactions_pkey" PRIMARY KEY ("number","step")
);

CREATE INDEX "pending_interactions_number_idx" ON "pending_interactions"("number");
