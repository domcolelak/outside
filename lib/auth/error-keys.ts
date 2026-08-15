import type { MessageKey } from "@/lib/i18n/messages";

/**
 * Server error codes to catalog keys, shared by every authentication screen.
 *
 * The API answers with a stable code and an English string. The code is what
 * gets translated; the string is the fallback, so a code added on the server
 * before its message exists degrades to English rather than to nothing.
 *
 * Shared rather than copied per screen: sign-in and password reset return
 * overlapping codes, and two copies of this map is how one screen quietly stops
 * translating an error the other one handles.
 */
export const AUTH_ERROR_KEYS: Record<string, MessageKey<"auth">> = {
  rate_limited: "errorRateLimited",
  invalid_request: "errorInvalidRequest",
  invalid_credentials: "errorInvalidCredentials",
  invalid_email: "errorInvalidEmail",
  missing_name: "errorMissingName",
  email_taken: "errorEmailTaken",
  sso_required: "errorSsoRequired",
  // Too short and too long are different fixes for the person typing.
  password_too_short: "errorPasswordTooShort",
  password_too_long: "errorPasswordTooLong",
  reset_link_invalid: "errorResetLinkInvalid",
};

/**
 * The message for a server response, in this order: the translated code, the
 * server's own English, then a generic line. Never an empty string — a form
 * that fails silently is worse than one that fails vaguely.
 */
export function authErrorMessage(
  data: { code?: unknown; error?: unknown },
  translate: (key: MessageKey<"auth">) => string,
): string {
  const key = typeof data.code === "string" ? AUTH_ERROR_KEYS[data.code] : undefined;
  if (key) return translate(key);
  return typeof data.error === "string" && data.error.trim() ? data.error : translate("errorGeneric");
}
