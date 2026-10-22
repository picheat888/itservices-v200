// Pure rules for Settings → Sound: the saved choice as the settings payload holds it, and whether the draft differs from it.

export interface SoundChoice {
    sound: string;
    enabled: boolean;
}

/** The stored key and switch ('0' = off) as the section edits them. */
export function soundChoiceOf(settings: { notification_sound: string; notification_sound_enabled: string }): SoundChoice {
    return { sound: settings.notification_sound, enabled: settings.notification_sound_enabled !== '0' };
}

/** True when the sound or the switch differs from what was saved. */
export function soundChoiceChanged(draft: SoundChoice, saved: SoundChoice): boolean {
    return draft.sound !== saved.sound || draft.enabled !== saved.enabled;
}
