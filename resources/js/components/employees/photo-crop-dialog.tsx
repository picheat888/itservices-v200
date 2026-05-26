import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { ZoomIn, ZoomOut } from 'lucide-react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { useCallback, useState } from 'react';

interface Props {
    imageSrc: string;
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
            canvas.toBlob((blob) => {
                if (!blob) { reject(new Error('toBlob failed')); return; }
                resolve(new File([blob], 'photo.png', { type: 'image/png' }));
            }, 'image/png');
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

    const onCropComplete = useCallback((_: Area, pixels: Area) => {
        setCroppedPixels(pixels);
    }, []);

    const apply = async () => {
        if (!croppedPixels) return;
        setApplying(true);
        try {
            const file = await getCroppedFile(imageSrc, croppedPixels);
            onConfirm(file);
        } catch {
            setApplying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-border">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <span className="text-sm font-semibold">{t('photo_crop_title')}</span>
                    <span className="text-xs text-muted-foreground">{t('photo_crop_hint')}</span>
                </div>

                {/* Cropper — fixed square */}
                <div className="relative h-72 w-full bg-muted/30">
                    <Cropper
                        image={imageSrc}
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
                <div className="flex items-center gap-2 border-t border-border px-4 py-3">
                    <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.01}
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="flex-1 accent-brand"
                    />
                    <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
                    <Button variant="outline" size="sm" onClick={onCancel} disabled={applying}>
                        {t('cancel')}
                    </Button>
                    <Button size="sm" onClick={apply} disabled={applying || !croppedPixels}>
                        {applying ? t('photo_crop_applying') : t('photo_crop_apply')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
