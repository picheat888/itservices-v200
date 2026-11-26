// Photo of an asset model as a white tile, used wherever a model's photo appears.
// Shows the screen's own icon instead when the model has no photo or the file cannot load.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Maximize2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export type ModelPhotoSize = 20 | 32 | 40 | 56 | 72 | 128;

const BOX: Record<ModelPhotoSize, string> = {
    20: 'h-5 w-5',
    32: 'h-8 w-8',
    40: 'h-10 w-10',
    56: 'h-14 w-14',
    72: 'h-[72px] w-[72px]',
    128: 'h-32 w-32',
};

const RADIUS: Record<ModelPhotoSize, string> = {
    20: 'rounded-full',
    32: 'rounded-md',
    40: 'rounded-lg',
    56: 'rounded-[10px]',
    72: 'rounded-[10px]',
    128: 'rounded-xl',
};

/**
 * A model photo on a white tile in both themes, the whole picture shown (never cropped by the tile).
 * With `onOpen` it becomes a button that opens the large view; the 56 and 72 tiles also carry an expand badge.
 * `alt` names the model for the button label; the image itself is decorative because the name sits beside it.
 */
export function ModelPhoto({
    src,
    size,
    alt,
    fallback,
    onOpen,
    className,
}: {
    src?: string | null;
    size: ModelPhotoSize;
    alt: string;
    fallback: ReactNode;
    onOpen?: () => void;
    className?: string;
}) {
    const t = useT();
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const failed = !!src && failedSrc === src;

    if (!src || failed) return <>{fallback}</>;

    const image = (
        <img
            src={src}
            alt=""
            loading="lazy"
            onError={() => setFailedSrc(src)}
            className={cn('block shrink-0 border border-black/10 bg-white object-contain', BOX[size], RADIUS[size], !onOpen && className)}
        />
    );
    if (!onOpen) return image;

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`${t('model_photo_view')} ${alt}`}
            className={cn(
                'focus-visible:ring-brand/40 relative shrink-0 cursor-zoom-in focus-visible:ring-[3px] focus-visible:outline-hidden',
                RADIUS[size],
                className,
            )}
        >
            {image}
            {(size === 56 || size === 72) && (
                <span
                    className="border-border bg-background text-foreground absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full border shadow-sm"
                    aria-hidden
                >
                    <Maximize2 className="h-2.5 w-2.5" strokeWidth={2.25} />
                </span>
            )}
        </button>
    );
}
