-- CreateTable competition_photos
CREATE TABLE IF NOT EXISTS "competition_photos" (
    "id" TEXT NOT NULL,
    "competition_id" TEXT NOT NULL,
    "photo_url" TEXT NOT NULL,
    "photo_storage_path" TEXT NOT NULL,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_photos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "competition_photos_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "competition_photos_competition_id_sort_order_idx" ON "competition_photos"("competition_id", "sort_order");
