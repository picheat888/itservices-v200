import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooterBar } from '@/shared/ui/dialog';
import { AlertCircle, Crop, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Area, MediaSize, Point } from 'react-easy-crop';
import Cropper from 'react-easy-crop';
import { clipToImage, fallbackType, fitWholeZoom, photoFileName } from '../lib/crop-math';

interface Props {
    /** Object URL to crop, or null when closed. Kept mounted so the close animation can play. */
    imageSrc: string | null;
    onConfirm: (croppedFile: File) => void;
    onCancel: () => void;
    /** Words above the title; the employee module's name when left out. */
    eyebrow?: string;
    /** `avatar`: round, fills the circle, 512px. `product`: square frame that opens on the whole picture, white bands, 800px. */
    variant?: 'avatar' | 'product';
}

/** Product crop frame, square, inside the 288px-tall cropper. */
const PRODUCT_FRAME = 224;

async function getCroppedFile(imageSrc: string, pixelCrop: Area, product: boolean): Promise<File> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const SIZE = product ? 800 : 512;
            const canvas = document.createElement('canvas');
            canvas.width = SIZE;
            canvas.height = SIZE;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('no 2d context'));
                return;
            }
            if (product) {
                // The frame may reach past the picture: paint white, then only the part on the picture
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, SIZE, SIZE);
                const part = clipToImage(pixelCrop, { width: img.naturalWidth, height: img.naturalHeight }, SIZE);
                if (part) ctx.drawImage(img, part.sx, part.sy, part.sw, part.sh, part.dx, part.dy, part.dw, part.dh);
            } else {
                ctx.drawImage(img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, SIZE, SIZE);
            }
            // WebP (q≈0.9) keeps transparency small; iPad Safari cannot write it and hands back PNG
            const encode = (type: string) => new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.9));
            encode('image/webp')
                .then((blob) => {
                    const retry = blob ? fallbackType(product, blob.type) : null;
                    return retry ? encode(retry) : blob;
                })
                .then((blob) => {
                    if (!blob) {
                        reject(new Error('toBlob failed'));
                        return;
                    }
                    resolve(new File([blob], photoFileName(blob.type), { type: blob.type }));
                }, reject);
        };
        img.onerror = reject;
        img.src = imageSrc;
    });
}

/**
 * Compact crop modal rendered via Portal so it always sits above Sheet overlays.
 * Avatar: locked to 1:1 with a circular mask identical to the avatar shown in the form.
 * Product: a square frame that starts on the whole picture so wide items are never cut; zoom in to trim the edges.
 */
export function PhotoCropDialog({ imageSrc, onConfirm, onCancel, eyebrow, variant = 'avatar' }: Props) {
    const t = useT();
    const product = variant === 'product';
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [minZoom, setMinZoom] = useState(1);
    const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
    const [croppedPixels, setCroppedPixels] = useState<Area | null>(null);
    const [applying, setApplying] = useState(false);
    const [failed, setFailed] = useState(false);
    // Keep the last image so the cropper still renders during the close (fade-out) animation.
    const [src, setSrc] = useState<string | null>(imageSrc);
    const cropperRef = useRef<Cropper>(null);

    useEffect(() => {
        if (!imageSrc) return; // closing → retain `src` so content stays visible while it animates out
        setSrc(imageSrc);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setMinZoom(1);
        setNatural(null);
        setCroppedPixels(null);
        setApplying(false);
        setFailed(false);
    }, [imageSrc]);

    const onCropComplete = useCallback((_: Area, pixels: Area) => {
        setCroppedPixels(pixels);
    }, []);

    // Product: the smallest zoom shows the whole picture inside the frame, and the dialog opens there
    const onMediaLoaded = useCallback(
        (media: MediaSize) => {
            if (!product) return;
            setNatural({ width: media.naturalWidth, height: media.naturalHeight });
            const whole = fitWholeZoom(media, PRODUCT_FRAME);
            setMinZoom(whole);
            setZoom(whole);
        },
        [product],
    );

    // Product: measure again once the open animation ends; measured mid-zoom the picture reads 5% small and its edges get cut
    const refit = () => {
        const cropper = cropperRef.current;
        if (!product || !cropper) return;
        cropper.computeSizes();
        if (!cropper.mediaSize.width || !cropper.mediaSize.height) return;
        const whole = fitWholeZoom(cropper.mediaSize, PRODUCT_FRAME);
        setMinZoom(whole);
        setZoom(whole);
    };
    const onOpened = (e: React.AnimationEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) refit();
    };

    // A product frame dragged fully off the picture would save a plain white square
    const offPicture = product && !!croppedPixels && !!natural && clipToImage(croppedPixels, natural, 1) === null;

    const apply = async () => {
        if (!croppedPixels || !src) return;
        setApplying(true);
        setFailed(false);
        try {
            const file = await getCroppedFile(src, croppedPixels, product);
            onConfirm(file);
        } catch {
            setApplying(false);
            setFailed(true);
        }
    };

    return (
        // Nested Radix dialog: portals above the parent and becomes the active layer
        <Dialog open={!!imageSrc} onOpenChange={(o) => !o && onCancel()}>
            <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-sm gap-0 overflow-y-auto p-0 [&>button]:hidden" onAnimationEnd={onOpened}>
                <FocusDialogHeader
                    icon={Crop}
                    eyebrow={eyebrow ?? t('employees')}
                    title={t('photo_crop_title')}
                    srDescription={t('photo_crop_hint')}
                />

                {/* Cropper — fixed square */}
                <div className={cn('relative h-72 w-full border-t', product ? 'bg-white' : 'bg-muted/30')}>
                    <Cropper
                        ref={cropperRef}
                        image={src ?? ''}
                        crop={crop}
                        zoom={zoom}
                        minZoom={minZoom}
                        maxZoom={minZoom * 3}
                        aspect={1}
                        cropShape={product ? 'rect' : 'round'}
                        cropSize={product ? { width: PRODUCT_FRAME, height: PRODUCT_FRAME } : undefined}
                        restrictPosition={!product}
                        showGrid={false}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                        onMediaLoaded={onMediaLoaded}
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
                            min={minZoom}
                            max={minZoom * 3}
                            step={product ? 0.01 : 0.1}
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
                    <Button onClick={apply} disabled={applying || !croppedPixels || offPicture}>
                        {applying && <Loader2 className="h-4 w-4 animate-spin" />}
                        {applying ? t('photo_crop_applying') : t('photo_crop_apply')}
                    </Button>
                </DialogFooterBar>
            </DialogContent>
        </Dialog>
    );
}
