// Crop arithmetic for the product (model photo) crop: open on the whole picture, then draw only the part inside the image (pure, node tests).

export interface CropArea {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** The type to write a cropped photo again in when the browser wrote something other than WebP (iPad Safari writes PNG): JPEG for product photos, none for avatars. */
export function fallbackType(product: boolean, producedType: string): 'image/jpeg' | null {
    return product && producedType !== 'image/webp' ? 'image/jpeg' : null;
}

/** File name matching the image type the browser actually produced. */
export function photoFileName(type: string): string {
    if (type === 'image/jpeg') return 'photo.jpg';
    if (type === 'image/png') return 'photo.png';
    return 'photo.webp';
}

/** Zoom at which the whole picture, shown at `media` size, fits inside a square frame of `frame` pixels. */
export function fitWholeZoom(media: { width: number; height: number }, frame: number): number {
    return Math.min(frame / media.width, frame / media.height);
}

/**
 * The part of `crop` (image pixels, may reach past the edges) that lies on the image, and where it lands
 * on an `out`×`out` canvas; null when the crop misses the image entirely.
 */
export function clipToImage(
    crop: CropArea,
    image: { width: number; height: number },
    out: number,
): { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number } | null {
    const sx = Math.max(0, crop.x);
    const sy = Math.max(0, crop.y);
    const ex = Math.min(image.width, crop.x + crop.width);
    const ey = Math.min(image.height, crop.y + crop.height);
    if (ex <= sx || ey <= sy) return null;

    return {
        sx,
        sy,
        sw: ex - sx,
        sh: ey - sy,
        dx: ((sx - crop.x) * out) / crop.width,
        dy: ((sy - crop.y) * out) / crop.height,
        dw: ((ex - sx) * out) / crop.width,
        dh: ((ey - sy) * out) / crop.height,
    };
}
