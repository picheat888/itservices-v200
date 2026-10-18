// Round 96px logo picker shared by the Software and Social / Internet forms: opens the file
// picker itself (the parent runs the crop flow), with a camera badge and a remove button.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Camera, X, type LucideIcon } from 'lucide-react';

// Empty-state tint per registry, matching the dialog header accent.
const TONES = {
    amber: 'border-amber-500/55 bg-amber-500/10 text-amber-500 hover:border-amber-500',
    indigo: 'border-indigo-500/55 bg-indigo-500/10 text-indigo-500 hover:border-indigo-500',
} as const;

export function LogoPicker({
    preview,
    icon: Icon,
    tone,
    onPick,
    onRemove,
}: {
    preview: string | null;
    icon: LucideIcon;
    tone: keyof typeof TONES;
    onPick: (file?: File) => void;
    onRemove: () => void;
}) {
    const t = useT();
    const hint = t('access_logo_note').replace('\n', ' ');
    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative h-24 w-24">
                <label
                    className={cn(
                        'has-focus-visible:ring-brand/40 grid h-24 w-24 cursor-pointer place-items-center rounded-full border-[1.5px] transition-colors has-focus-visible:ring-[3px]',
                        preview ? 'border-border bg-background' : cn('border-dashed', TONES[tone]),
                    )}
                >
                    {preview ? (
                        <img src={preview} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                        <Icon className="h-7 w-7" aria-hidden />
                    )}
                    <span className="border-border bg-background text-foreground absolute right-0.5 bottom-0.5 grid h-7 w-7 place-items-center rounded-full border shadow-sm">
                        <Camera className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <input
                        name="logo"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        aria-label={`${t('access_logo_upload')} (${hint})`}
                        onChange={(e) => {
                            onPick(e.target.files?.[0]);
                            e.target.value = '';
                        }}
                    />
                </label>
                {preview && (
                    <button
                        type="button"
                        onClick={onRemove}
                        aria-label={t('access_logo_remove_logo')}
                        title={t('access_logo_remove_logo')}
                        className="bg-destructive text-destructive-foreground focus-visible:ring-brand/40 absolute top-0.5 right-0.5 grid h-6 w-6 place-items-center rounded-full shadow-sm hover:opacity-90 focus-visible:ring-[3px] focus-visible:outline-hidden"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                )}
            </div>
            <p className="text-muted-foreground text-center text-[11.5px] leading-snug whitespace-pre-line">{t('access_logo_note')}</p>
        </div>
    );
}
