// Settings → Sound: the one bell sound the whole system plays and its on/off switch, saved together.
// ▶ previews a sound on this device without saving it.
import { useT } from '@/lang';
import { DEFAULT_SOUND, SOUND_KEYS, playNotificationSound, soundName, unlockSoundOnFirstGesture } from '@/modules/notification';
import { SaveButton } from '@/shared/components/save-button';
import { useFormRebase } from '@/shared/hooks/use-form-rebase';
import { useSeedOnce } from '@/shared/hooks/use-seed-once';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Switch } from '@/shared/ui/switch';
import { Info, Play } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useSettings, useUpdateSound } from '../hooks/use-settings';
import { soundChoiceChanged, soundChoiceOf, type SoundChoice } from '../lib/sound-choice';

const ROW = 'border-border/60 flex items-center gap-1 border-b pr-1 pl-3 last:border-b-0';

export function SoundSection({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const t = useT();
    const titleId = useId();
    const { data, isLoading } = useSettings();
    const update = useUpdateSound();
    const [draft, setDraft] = useState<SoundChoice>({ sound: DEFAULT_SOUND, enabled: true });
    // What the section opened with, moved along by refreshes of the stored settings
    const [base, setBase] = useState<SoundChoice | null>(null);
    const [saved, setSaved] = useState(false);
    const stored = data ? soundChoiceOf(data) : null;

    useSeedOnce(stored ? 'sound' : null, () => {
        if (!stored) return;
        setDraft(stored);
        setBase(stored);
    });
    useFormRebase({ fresh: stored && base ? stored : null, base: base ?? draft, setBase, setForm: setDraft });

    const dirty = !!base && soundChoiceChanged(draft, base);
    // Report unsaved edits up so the page asks before switching section.
    useEffect(() => {
        onDirtyChange(dirty);
        return () => onDirtyChange(false);
    }, [dirty, onDirtyChange]);

    // ▶ is a gesture itself, so the player is armed before its click lands
    useEffect(() => {
        unlockSoundOnFirstGesture();
    }, []);

    const change = (next: Partial<SoundChoice>) => {
        setDraft((d) => ({ ...d, ...next }));
        setSaved(false);
    };
    const save = () => update.mutate(draft, { onSuccess: () => setSaved(true) });

    return (
        <section aria-labelledby={titleId} className="max-w-[42.5rem]">
            <div className="mb-5">
                <h2 id={titleId} className="text-lg font-semibold">
                    {t('set_sound_title')}
                </h2>
                <p className="text-muted-foreground text-sm">{t('set_sound_desc')}</p>
            </div>

            <fieldset className="m-0 min-w-0 border-0 p-0">
                <legend className="sr-only">{t('set_sound_title')}</legend>
                <div className="border-border overflow-clip rounded-lg border">
                    {/* Switch row stays outside the scroll */}
                    <div className="border-border bg-muted/40 flex min-h-11 items-center justify-between gap-4 border-b px-3">
                        <span className="text-sm font-semibold">{t('set_sound_switch')}</span>
                        <Switch
                            checked={draft.enabled}
                            onChange={(enabled) => change({ enabled })}
                            disabled={isLoading}
                            aria-label={t('set_sound_switch')}
                        />
                    </div>

                    {/* Five rows show; the rest scroll inside the box */}
                    <div
                        role="group"
                        tabIndex={0}
                        aria-label={t('set_sound_list')}
                        className="focus-visible:outline-brand touch:max-h-[225px] max-h-[195px] overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2"
                    >
                        {isLoading ? (
                            <SoundRowsSkeleton />
                        ) : (
                            SOUND_KEYS.map((key) => (
                                <SoundRow
                                    key={key}
                                    soundKey={key}
                                    selected={draft.sound === key}
                                    enabled={draft.enabled}
                                    playLabel={t('set_sound_play').replace('{name}', soundName(key))}
                                    onPick={() => change({ sound: key })}
                                />
                            ))
                        )}
                    </div>
                </div>
            </fieldset>

            <p className="text-muted-foreground mt-4 flex gap-2 text-xs leading-relaxed">
                <Info className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t('set_sound_note')}</span>
            </p>

            <div className="flex items-center justify-end gap-3 pt-5">
                <SaveButton onClick={save} loading={update.isPending} success={saved} disabled={!dirty}>
                    {t('save')}
                </SaveButton>
            </div>
        </section>
    );
}

/** One sound: radio + untranslated name, and a ▶ that stays usable while the switch is off. */
function SoundRow({
    soundKey,
    selected,
    enabled,
    playLabel,
    onPick,
}: {
    soundKey: string;
    selected: boolean;
    enabled: boolean;
    playLabel: string;
    onPick: () => void;
}) {
    return (
        <div className={cn(ROW, selected && enabled && 'bg-brand/5')}>
            <label
                className={cn('touch:min-h-11 flex min-h-[38px] min-w-0 flex-1 items-center gap-2.5', enabled ? 'cursor-pointer' : 'cursor-default')}
            >
                <input
                    type="radio"
                    name="notification_sound"
                    value={soundKey}
                    checked={selected}
                    disabled={!enabled}
                    onChange={onPick}
                    className="accent-brand m-0 h-4 w-4 shrink-0"
                />
                <span translate="no" className="min-w-0 truncate text-sm font-medium">
                    {soundName(soundKey)}
                </span>
            </label>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={playLabel}
                onClick={() => playNotificationSound(soundKey)}
                className="touch:h-11 touch:w-11 h-8 w-8 shrink-0"
            >
                <Play className="fill-current" aria-hidden="true" />
            </Button>
        </div>
    );
}

/** Shimmer stand-in for the sound rows while the saved choice loads. */
function SoundRowsSkeleton() {
    return (
        <div aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={cn(ROW, 'touch:min-h-11 min-h-[38px]')}>
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="ml-1.5 h-3.5 w-24" />
                </div>
            ))}
        </div>
    );
}
