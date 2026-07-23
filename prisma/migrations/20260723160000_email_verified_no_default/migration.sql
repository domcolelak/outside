-- Email verification must be an explicit, safe-by-default state: a new user is
-- unverified (NULL) unless a code path deliberately verifies them. Drop the
-- legacy now() default so no alternate insert path can silently create a
-- verified account. All application user-creation paths already set the value
-- explicitly, so existing rows are unaffected.
ALTER TABLE "users" ALTER COLUMN "emailVerifiedAt" DROP DEFAULT;
