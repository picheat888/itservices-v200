<?php

namespace App\Services\Request;

use App\Models\Request\RequestAttachment;
use App\Models\Request\ServiceRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Stores and removes the files filed with a service request, and owns the limits
 * those files are held to. Both ways in use it — the ones riding along with the
 * submit (StoreServiceRequestRequest) and the ones added afterwards
 * (RequestAttachmentController) — so a request can never end up holding more, or
 * larger, files than one route alone would have allowed.
 */
class RequestAttachmentService
{
    /** Hard cap on the number of files a single request may hold. */
    public const MAX_FILES = 5;

    /** Largest single upload, in kilobytes (10 MB). */
    public const MAX_SIZE_KB = 10240;

    /**
     * What may be attached. `mimes` is content-based (Laravel reads the bytes and
     * maps them to an extension), so it whitelists by signature as well as by name.
     */
    public const ALLOWED_EXTENSIONS = 'pdf,png,jpg,jpeg,zip,doc,docx,xls,xlsx,ppt,pptx';

    /** Where one request's files live on the private disk. */
    public static function directory(ServiceRequest $request): string
    {
        return "requests/{$request->id}";
    }

    /**
     * Saves each uploaded file against the request.
     *
     * @param  list<UploadedFile>  $files
     */
    public function store(ServiceRequest $request, array $files): void
    {
        foreach ($files as $file) {
            $path = $file->store(self::directory($request), 'local');
            $request->attachments()->create([
                'original_name' => $file->getClientOriginalName(),
                'path' => $path,
                'size' => $file->getSize(),
                'mime' => $file->getMimeType() ?: 'application/octet-stream',
            ]);
        }
    }

    /** Removes one attachment — the row and the binary behind it. */
    public function delete(RequestAttachment $attachment): void
    {
        Storage::disk('local')->delete($attachment->path);
        $attachment->delete();
    }

    /** How many more files this request may still take. */
    public function remaining(ServiceRequest $request): int
    {
        return max(0, self::MAX_FILES - $request->attachments()->count());
    }
}
