// Large view of a model photo, opened from a photo tile.
// The note under the picture says it is a sample of the model, not the person's own unit.
import { useT } from '@/lang';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { useEffect, useState } from 'react';

export interface LightboxPhoto {
    src: string;
    model: string;
    brand?: string | null;
}

/** Nested dialog showing one model photo; keeps the last photo on screen while it animates closed. */
export function ModelPhotoLightbox({ photo, onClose }: { photo: LightboxPhoto | null; onClose: () => void }) {
    const t = useT();
    const [shown, setShown] = useState(photo);
    useEffect(() => {
        if (photo) setShown(photo);
    }, [photo]);
    const view = photo ?? shown;

    return (
        <Dialog open={!!photo} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] gap-0 p-0">
                <div className="px-5 pt-4 pr-12 pb-3">
                    {view?.brand && <div className="text-muted-foreground text-xs font-semibold">{view.brand}</div>}
                    <DialogTitle className="mt-0.5 text-base font-extrabold">{view?.model}</DialogTitle>
                </div>
                <div className="px-5 pb-5">
                    <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border border-black/10 bg-white">
                        {view && <img src={view.src} alt={view.model} className="h-full w-full object-contain" />}
                    </div>
                    <DialogDescription className="mt-3 text-xs">{t('model_photo_sample_note')}</DialogDescription>
                </div>
            </DialogContent>
        </Dialog>
    );
}
