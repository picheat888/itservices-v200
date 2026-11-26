// The 128px photo slot of the asset model form: a dashed "add" tile when empty,
// the photo with a quiet remove button once attached. The parent runs the crop flow.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { ImagePlus, X } from 'lucide-react';

/** Square photo picker; tapping the tile opens the file picker, the caption keeps one height in both states. */
export function ModelPhotoPicker({
    preview,
    inputId,
    invalid,
    onPick,
    onRemove,
}: {
    preview: string | null;
    /** Id for the hidden file input, so the field label points at it. */
    inputId?: string;
    invalid?: boolean;
    onPick: (file?: File) => void;
    onRemove: () => void;
}) {
    const t = useT();
    return (
        <div className="w-32">
            <div className="relative h-32 w-32">
                <label
                    className={cn(
                        'has-focus-visible:ring-brand/40 grid h-32 w-32 cursor-pointer place-items-center overflow-hidden rounded-xl transition-colors has-focus-visible:ring-[3px]',
                        preview
                            ? 'border border-black/10 bg-white'
                            : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:border-brand/60 border-[1.5px] border-dashed',
                        !preview && (invalid ? 'border-destructive' : 'border-input'),
                    )}
                >
                    {preview ? (
                        <img src={preview} alt="" className="h-full w-full object-contain" />
                    ) : (
                        <span className="flex flex-col items-center gap-1.5 text-xs font-semibold">
                            <ImagePlus className="h-7 w-7" strokeWidth={1.75} aria-hidden />
                            {t('md_photo_add')}
                        </span>
                    )}
                    <input
                        id={inputId}
                        name="photo"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        aria-invalid={invalid || undefined}
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
                        aria-label={t('md_photo_remove')}
                        title={t('md_photo_remove')}
                        className="focus-visible:ring-brand/40 absolute top-1.5 right-1.5 grid h-[22px] w-[22px] place-items-center rounded-full border border-zinc-200 bg-white/90 text-zinc-500 hover:text-zinc-800 focus-visible:ring-[3px] focus-visible:outline-hidden"
                    >
                        <X className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                    </button>
                )}
            </div>
            <p className="text-muted-foreground mt-2 min-h-8 text-center text-[11.5px] leading-4 whitespace-pre-line">
                {preview ? t('photo_tap_to_change') : t('md_photo_note')}
            </p>
        </div>
    );
}
