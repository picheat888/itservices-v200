/**
 * Password policy for admin-set credentials, mirrored from EmployeeController::passwordRule()
 * (Laravel is the authority; this copy drives the live checklist in the forms).
 *
 * The classes match the "password complexity" set Active Directory and most corporate
 * policies use: length, upper case, lower case, a digit, and a symbol.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** One requirement in the live checklist — `labelKey` resolves through the i18n dictionary. */
export interface PasswordRule {
    key: string;
    labelKey: string;
    test: (value: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
    { key: 'length', labelKey: 'cred_rule_length', test: (v) => v.length >= PASSWORD_MIN_LENGTH },
    { key: 'upper', labelKey: 'cred_rule_upper', test: (v) => /[A-Z]/.test(v) },
    { key: 'lower', labelKey: 'cred_rule_lower', test: (v) => /[a-z]/.test(v) },
    { key: 'digit', labelKey: 'cred_rule_digit', test: (v) => /\d/.test(v) },
    { key: 'symbol', labelKey: 'cred_rule_symbol', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/** Whether a password satisfies every requirement above. */
export function isValidPassword(value: string): boolean {
    return PASSWORD_RULES.every((rule) => rule.test(value));
}

// 0/O and 1/l/I are left out so a generated password survives being read aloud,
// written on a note, or retyped by the employee without confusion.
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?';

/** Uniformly random index below `max`, drawn from the crypto source. */
function randomIndex(max: number): number {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] % max;
}

function pick(pool: string): string {
    return pool[randomIndex(pool.length)];
}

/**
 * Random temporary password that always satisfies the policy: one character is taken from
 * each required class first, the remainder from the combined pool, then the whole thing is
 * shuffled so the classes don't sit in predictable positions.
 */
export function randomPassword(length = 14): string {
    const pools = [LOWER, UPPER, DIGITS, SYMBOLS];
    const combined = pools.join('');
    const chars = pools.map(pick);
    while (chars.length < length) {
        chars.push(pick(combined));
    }
    for (let i = chars.length - 1; i > 0; i--) {
        const j = randomIndex(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}
