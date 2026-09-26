<?php

namespace App\Services\Request;

use App\Models\Request\ServiceRequest;
use Illuminate\Http\UploadedFile;

/**
 * Stores the files filed with a service request, and owns the limits those files
 * are held to (StoreServiceRequestRequest, and the New Request dialog through the
 * options endpoint).
 *
 * Files ride along with the submit and nowhere else: once filed, a request's
 * evidence is fixed — an approver decides on what was in front of them. A requester
 * who needs different files cancels and files again.
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
}
