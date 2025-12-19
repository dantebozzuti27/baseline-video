-- Supabase Auth migration (schema: baseline)
-- This project uses Supabase Auth (auth.users) instead of NextAuth.
-- Apply this once to your baseline schema.

CREATE SCHEMA IF NOT EXISTS "baseline";
SET search_path = "baseline";

-- Drop FK from Coach -> User (NextAuth) if present
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Coach_userId_fkey'
      AND conrelid = '"baseline"."Coach"'::regclass
  ) THEN
    ALTER TABLE "Coach" DROP CONSTRAINT "Coach_userId_fkey";
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

-- Rename Coach.userId -> authUserId (Supabase auth.users.id)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='baseline' AND table_name='Coach' AND column_name='userId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='baseline' AND table_name='Coach' AND column_name='authUserId'
  ) THEN
    ALTER TABLE "Coach" RENAME COLUMN "userId" TO "authUserId";
  END IF;
END $$;

-- Ensure uniqueness index exists for Coach.authUserId
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='baseline' AND indexname='Coach_authUserId_key'
  ) THEN
    CREATE UNIQUE INDEX "Coach_authUserId_key" ON "Coach"("authUserId");
  END IF;
END $$;

-- Add Player.authUserId (nullable, unique) for account-based players
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='baseline' AND table_name='Player' AND column_name='authUserId'
  ) THEN
    ALTER TABLE "Player" ADD COLUMN "authUserId" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='baseline' AND indexname='Player_authUserId_key'
  ) THEN
    CREATE UNIQUE INDEX "Player_authUserId_key" ON "Player"("authUserId");
  END IF;
END $$;

-- Remove NextAuth tables if they exist (we are using Supabase Auth instead)
DROP TABLE IF EXISTS "Account" CASCADE;
DROP TABLE IF EXISTS "Session" CASCADE;
DROP TABLE IF EXISTS "VerificationToken" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;


