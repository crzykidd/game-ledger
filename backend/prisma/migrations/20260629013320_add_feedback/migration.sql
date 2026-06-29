-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('BUG', 'ENHANCEMENT', 'QUESTION');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "feedback_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "github_enabled" BOOLEAN NOT NULL DEFAULT false,
    "github_repo_owner" TEXT,
    "github_repo_name" TEXT,
    "github_asset_branch" TEXT NOT NULL DEFAULT 'feedback-assets',
    "github_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" TEXT NOT NULL,
    "reporter_user_id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "module_key" TEXT,
    "module_maturity" TEXT,
    "category" "FeedbackCategory" NOT NULL,
    "text" TEXT NOT NULL,
    "screenshot" BYTEA,
    "screenshot_mime" TEXT,
    "github_issue_url" TEXT,
    "github_issue_number" INTEGER,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedbacks_reporter_user_id_idx" ON "feedbacks"("reporter_user_id");

-- CreateIndex
CREATE INDEX "feedbacks_status_idx" ON "feedbacks"("status");

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
