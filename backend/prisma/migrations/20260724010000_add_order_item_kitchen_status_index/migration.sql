-- Index untuk mempercepat query/agregasi status masak (KDS & dasbor).
-- CreateIndex
CREATE INDEX "order_items_kitchen_status_idx" ON "order_items"("kitchen_status");
