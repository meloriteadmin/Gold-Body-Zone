CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE "refunds" (
  "id" TEXT NOT NULL,
  "payment_id" TEXT NOT NULL,
  "cashfree_refund_id" TEXT NOT NULL,
  "provider_refund_id" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "note" TEXT,
  "requested_by_admin_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refunds_cashfree_refund_id_key" ON "refunds"("cashfree_refund_id");
CREATE UNIQUE INDEX "refunds_provider_refund_id_key" ON "refunds"("provider_refund_id");
CREATE INDEX "refunds_payment_id_status_idx" ON "refunds"("payment_id", "status");
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_admin_id_fkey" FOREIGN KEY ("requested_by_admin_id") REFERENCES "admin_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
