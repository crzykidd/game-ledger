-- AddColumn: token_hash to sessions (hashed session token stored at rest)
ALTER TABLE "sessions" ADD COLUMN "token_hash" TEXT NOT NULL DEFAULT '';

-- Backfill existing sessions with a unique placeholder (there should be none in dev)
UPDATE "sessions" SET "token_hash" = id WHERE "token_hash" = '';

-- Remove default (column is required going forward)
ALTER TABLE "sessions" ALTER COLUMN "token_hash" DROP DEFAULT;

-- AddUniqueConstraint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_token_hash_key" UNIQUE ("token_hash");
