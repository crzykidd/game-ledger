-- CreateTable
CREATE TABLE "maintenance_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "backup_enabled" BOOLEAN NOT NULL DEFAULT false,
    "backup_cron" TEXT,
    "backup_retention" INTEGER NOT NULL DEFAULT 7,
    "reindex_enabled" BOOLEAN NOT NULL DEFAULT false,
    "reindex_cron" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_settings_pkey" PRIMARY KEY ("id")
);
