import { useT } from '@/lang';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Area, Point } from 'react-easy-crop';
import Cropper from 'react-easy-crop';

interface Props {
    /** Object URL to crop, or null when closed. Kept mounted so the close animation can play. */
    imageSrc: string | null;
    onConfirm: (croppedFile: File) => void;
    onCancel: () => void;
}

async function getCroppedFile(imageSrc: string, pixelCrop: Area): Promise<File> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const SIZE = 512;
            const canvas = document.createElement('canvas');
            canvas.width = SIZE;
            canvas.height = SIZE;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, SIZE, SIZE);
            // Encode as WebP (q≈0.9): far smaller than a canvas PNG while keeping transparency,
            // so the stored file isn't heavier than the original the user picked.
            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        reject(new Error('toBlob failed'));
                        return;
                    }
                    resolve(new File([blob], 'photo.webp', { type: 'image/webp' }));
                },
                'image/webp',
                0.9,
            );
        };
        img.onerror = reject;
        img.src = imageSrc;
    });
}

/**
 * Compact crop modal rendered via Portal so it always sits above Sheet overlays.
 * Locked to 1:1; displays a circular preview mask identical to the avatar shown in the form.
 */
export function PhotoCropDialog({ imageSrc, onConfirm, onCancel }: Props) {
    const t = useT();
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedPixels, setCroppedPixels] = useState<Area | null>(null);
    const [applying, setApplying] = useState(false);
    // Keep the last image so the cropper still renders during the close (fade-out) animation.
    const [src, setSrc] = useState<string | null>(imageSrc);

    useEffect(() => {
        if (!imageSrc) return; // closing → retain `src` so content stays visible while it animates out
        setSrc(imageSrc);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedPixels(null);
        setApplying(false);
    }, [imageSrc]);

    const onCropComplete = useCallback((_: Area, pixels: Area) => {
        setCroppedPixels(pixels);
    }, []);

    const apply = async () => {
        if (!croppedPixels || !src) return;
        setApplying(true);
        try {
            const file = await getCroppedFile(src, croppedPixels);
            onConfirm(file);
        } catch {
            setApplying(false);
        }
    };

    return (
        // Nested Radix dialog: portals itself above the parent dialog, owns its own
        // overlay, and becomes the active (non-inerted) layer — so its controls are clickable.
        // Kept mounted (open toggles) so the exit animation plays instead of snapping shut.
        <Dialog open={!!imageSrc} onOpenChange={(o) => !o && onCancel()}>
            <DialogContent className="max-w-sm gap-0 overflow-hidden p-0 [&>button]:hidden">
                {/* Header */}
                <div className="border-border flex items-center justify-between border-b px-4 py-3">
                    <DialogTitle className="text-sm font-semibold">{t('photo_crop_title')}</DialogTitle>
                    <span className="text-muted-foreground text-xs">{t('photo_crop_hint')}</span>
                </div>

                {/* Cropper — fixed square */}
                <div className="bg-muted/30 relative h-72 w-full">
                    <Cropper
                        image={src ?? ''}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        cropShape="round"
                        showGrid={false}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                        style={{
                            containerStyle: { borderRadius: 0 },
                            cropAreaStyle: {
                                border: '2px solid white',
                                boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                            },
                        }}
                    />
                </div>

                {/* Zoom row */}
                <div className="border-border flex items-center gap-2 border-t px-4 py-3">
                    <ZoomOut className="text-muted-foreground h-4 w-4 shrink-0" />
                    <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.01}
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="accent-brand flex-1"
                    />
                    <ZoomIn className="text-muted-foreground h-4 w-4 shrink-0" />
                </div>

                {/* Actions */}
                <div className="border-border flex justify-end gap-2 border-t px-4 py-3">
                    <Button variant="outline" size="sm" onClick={onCancel} disabled={applying}>
                        {t('cancel')}
                    </Button>
                    <Button size="sm" onClick={apply} disabled={applying || !croppedPixels}>
                        {applying ? t('photo_crop_applying') : t('photo_crop_apply')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
