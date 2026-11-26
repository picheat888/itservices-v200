// Multipart body for a resource saved with a logo file (pure, node tests).

/** True when a payload carries a File (e.g. a software logo) and must go multipart. */
export function hasFile(payload: Record<string, unknown>): boolean {
    return Object.values(payload).some((v) => typeof File !== 'undefined' && v instanceof File);
}

/** A flat payload as FormData; a cleared field goes as '' (the server reads it as null) so it is not left out. */
export function toFormData(payload: Record<string, unknown>): FormData {
    const fd = new FormData();
    Object.entries(payload).forEach(([k, v]) => {
        if (v === undefined) return;
        if (v === null) {
            fd.append(k, '');
        } else if (typeof v === 'boolean') {
            fd.append(k, v ? '1' : '0');
        } else {
            fd.append(k, v as string | Blob);
        }
    });
    return fd;
}
