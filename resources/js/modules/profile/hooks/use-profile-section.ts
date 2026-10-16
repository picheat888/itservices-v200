// The My Profile drawer's active section, kept in the URL as `?section=` beside `?dialog=profile`.
// Switching replaces the entry, so Back closes the drawer in one step.
import { keepDialogState } from '@/shared/hooks/use-dialog-param';
import { PROFILE_SECTION_PARAM } from '@/shared/lib/dialog-search';
import { useSearchParams } from 'react-router-dom';
import { profileSectionFrom } from '../lib/profile-section';
import type { ProfileSection } from '../types';

export function useProfileSection(allowed: readonly ProfileSection[]): [ProfileSection, (next: ProfileSection) => void] {
    const [params, setSearchParams] = useSearchParams();
    const section = profileSectionFrom(params.get(PROFILE_SECTION_PARAM), allowed);

    const setSection = (next: ProfileSection) => {
        if (next === section) return;
        setSearchParams(
            (prev) => {
                const nextParams = new URLSearchParams(prev);
                if (next === 'profile') nextParams.delete(PROFILE_SECTION_PARAM);
                else nextParams.set(PROFILE_SECTION_PARAM, next);
                return nextParams;
            },
            { replace: true, state: keepDialogState() },
        );
    };

    return [section, setSection];
}
