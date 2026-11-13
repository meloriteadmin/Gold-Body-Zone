-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "GenderEligibility" AS ENUM ('ALL', 'MALE_ONLY', 'FEMALE_ONLY');

-- CreateEnum
CREATE TYPE "CategoryGender" AS ENUM ('MALE', 'FEMALE', 'OPEN');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('WEIGHT', 'HEIGHT', 'OPEN');

-- CreateTable
CREATE TABLE "admin_profiles" (
    "id" TEXT NOT NULL,
    "auth_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "avatar_url" TEXT,
    "avatar_storage_path" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "competition_type" TEXT NOT NULL,
    "description" TEXT,
    "poster_url" TEXT,
    "poster_storage_path" TEXT,
    "event_date" TIMESTAMP(3),
    "registration_deadline" TIMESTAMP(3),
    "venue" TEXT,
    "registration_fee" DECIMAL(10,2),
    "max_participants" INTEGER,
    "gender_eligibility" "GenderEligibility" NOT NULL DEFAULT 'ALL',
    "age_eligibility" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_categories" (
    "id" TEXT NOT NULL,
    "competition_id" TEXT NOT NULL,
    "category_type" "CategoryType" NOT NULL DEFAULT 'OPEN',
    "gender" "CategoryGender" NOT NULL DEFAULT 'OPEN',
    "name" TEXT NOT NULL,
    "rule_note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_profiles_auth_user_id_key" ON "admin_profiles"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_profiles_email_key" ON "admin_profiles"("email");

-- CreateIndex
CREATE UNIQUE INDEX "competitions_slug_key" ON "competitions"("slug");

-- CreateIndex
CREATE INDEX "competitions_is_published_event_date_idx" ON "competitions"("is_published", "event_date");

-- CreateIndex
CREATE INDEX "competition_categories_competition_id_sort_order_idx" ON "competition_categories"("competition_id", "sort_order");

-- AddForeignKey
ALTER TABLE "competition_categories" ADD CONSTRAINT "competition_categories_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
