// The monitor pairing code as typed or pasted: digits only, at most six.

export const PAIR_CODE_LENGTH = 6;

export function normalizePairCode(input: string): string {
    return input.replace(/\D/g, '').slice(0, PAIR_CODE_LENGTH);
}
