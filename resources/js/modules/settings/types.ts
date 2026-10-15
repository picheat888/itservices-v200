// Settings module types: how a section inside a tab reports its edits and saves under the tab's one Save button.
import type { Ref } from 'react';

/** dirty = something to save; guard = edits lost on a section switch; blocked = Save must wait (e.g. a required field is empty). */
export interface SectionStatus {
    dirty: boolean;
    guard: boolean;
    blocked?: boolean;
}

/** Saves the section's edits; resolves false when the server refused them. */
export interface SectionSaver {
    save: () => Promise<boolean>;
}

export interface SavedSectionProps {
    onStatusChange: (status: SectionStatus) => void;
    saverRef: Ref<SectionSaver>;
}

export const IDLE_SECTION: SectionStatus = { dirty: false, guard: false };
