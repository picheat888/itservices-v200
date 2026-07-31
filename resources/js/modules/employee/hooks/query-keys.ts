/**
 * Shared React Query keys for the Employee module.
 * Kept in one place so every hook file invalidates the same cache entries —
 * e.g. employee mutations must also refresh department member counts.
 */
export const EMP = ['employees'] as const;
export const DEPT = ['departments'] as const;
export const POS = ['positions'] as const;
export const LOC = ['locations'] as const;
