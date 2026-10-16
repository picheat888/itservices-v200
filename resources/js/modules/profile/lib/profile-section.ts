// The drawer's `?section=` param and Assets link, and resolving the value to a section the user may see (pure, loaded by node tests).
import type { ProfileSection } from '../types';

export const PROFILE_SECTION_PARAM = 'section';
export const PROFILE_ASSETS_SEARCH = '?dialog=profile&section=assets';

export function profileSectionFrom(value: string | null, allowed: readonly ProfileSection[]): ProfileSection {
    return value !== null && (allowed as readonly string[]).includes(value) ? (value as ProfileSection) : 'profile';
}
