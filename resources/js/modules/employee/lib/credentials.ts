/**
 * Login-name rules for an employee account, mirrored from EmployeeController::USERNAME_RULES.
 * Laravel stays the authority — this copy powers instant feedback in the credential dialogs.
 *
 * The password half of the policy lives in `@/shared/lib/password-policy` because it is
 * enforced outside this module too (the forced/voluntary change-password screens).
 */

/**
 * English letters only: start with a letter, end with a letter or digit, and use . _ - in
 * between — the separator set accepted by AD / POSIX logins. Two characters is the floor so
 * short shared accounts like "hr" stay valid.
 */
export const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*[A-Za-z0-9]$/;
export const USERNAME_MAX_LENGTH = 30;

/** Whether a login name satisfies the rule above. */
export function isValidUsername(value: string): boolean {
    return value.length <= USERNAME_MAX_LENGTH && USERNAME_PATTERN.test(value);
}
