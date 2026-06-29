-- CreateTable
CREATE TABLE "schema_version" (
    "id" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schema_version_pkey" PRIMARY KEY ("id")
);
