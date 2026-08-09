-- Additive language preferences.
--
-- Both columns are plain strings validated against the supported-locale
-- registry in code, not a database enum: adding a language should be a code
-- change plus message files, never a migration.
--
-- users.preferredLocale is nullable on purpose. NULL means "this person has not
-- chosen", which is what lets an organization default supply a starting language
-- without ever overriding someone who has.
ALTER TABLE "users" ADD COLUMN "preferredLocale" TEXT;

-- Every existing organization keeps behaving exactly as before: English.
ALTER TABLE "organizations" ADD COLUMN "defaultLocale" TEXT NOT NULL DEFAULT 'en';
