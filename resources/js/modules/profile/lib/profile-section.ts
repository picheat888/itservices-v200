// Resolves the drawer's `?section=` value to a section the user may see (pure, loaded by node tests).
import type { ProfileSection } from '../types';

export function profileSectionFrom(value: string | null, allowed: readonly ProfileSection[]): ProfileSection {
    return value !== null && (allowed as readonly string[]).includes(value) ? (value as ProfileSection) : 'profile';
}
