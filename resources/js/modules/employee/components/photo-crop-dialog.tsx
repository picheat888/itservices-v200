import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooterBar } from '@/shared/ui/dialog';
import { AlertCircle, Crop, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
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
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('no 2d context'));
                return;
            }
            ctx.drawImage(img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, SIZE, SIZE);
            // WebP (q≈0.9) keeps transparency at a fraction of a canvas PNG's size
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
    const [failed, setFailed] = useState(false);
    // Keep the last image so the cropper still renders during the close (fade-out) animation.
    const [src, setSrc] = useState<string | null>(imageSrc);

    useEffect(() => {
        if (!imageSrc) return; // closing → retain `src` so content stays visible while it animates out
        setSrc(imageSrc);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedPixels(null);
        setApplying(false);
        setFailed(false);
    }, [imageSrc]);

    const onCropComplete = useCallback((_: Area, pixels: Area) => {
        setCroppedPixels(pixels);
    }, []);

    const apply = async () => {
        if (!croppedPixels || !src) return;
        setApplying(true);
        setFailed(false);
        try {
            const file = await getCroppedFile(src, croppedPixels);
            onConfirm(file);
        } catch {
            setApplying(false);
            setFailed(true);
        }
    };

    return (
        // Nested Radix dialog: portals above the parent and becomes the active layer
        <Dialog open={!!imageSrc} onOpenChange={(o) => !o && onCancel()}>
            <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-sm gap-0 overflow-y-auto p-0 [&>button]:hidden">
                <FocusDialogHeader icon={Crop} eyebrow={t('employees')} title={t('photo_crop_title')} srDescription={t('photo_crop_hint')} />

                {/* Cropper — fixed square */}
                <div className="bg-muted/30 relative h-72 w-full border-t">
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
                        classes={{ cropAreaClassName: '!border-2 !border-white !text-black/55' }}
                    />
                </div>

                {/* Zoom row and hint */}
                <div className="border-border space-y-2 border-t px-6 py-3.5">
                    <div className="flex items-center gap-2">
                        <ZoomOut className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
                        <input
                            name="zoom"
                            type="range"
                            min={1}
                            max={3}
                            step={0.1}
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            aria-label={t('photo_crop_zoom')}
                            className="accent-brand flex-1"
                        />
                        <ZoomIn className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
                    </div>
                    <p className="text-muted-foreground text-xs">{t('photo_crop_hint')}</p>
                </div>

                {failed && (
                    <p role="alert" className="text-destructive flex items-center gap-1.5 border-t px-6 py-2 text-xs">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {t('photo_crop_failed')}
                    </p>
                )}

                <DialogFooterBar>
                    <Button variant="outline" onClick={onCancel} disabled={applying}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={apply} disabled={applying || !croppedPixels}>
                        {applying && <Loader2 className="h-4 w-4 animate-spin" />}
                        {applying ? t('photo_crop_applying') : t('photo_crop_apply')}
                    </Button>
                </DialogFooterBar>
            </DialogContent>
        </Dialog>
    );
}
