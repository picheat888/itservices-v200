<?php

namespace App\Http\Controllers\Api\Request;

use App\Http\Controllers\Controller;
use App\Http\Resources\Request\ServiceRequestResource;
use App\Models\AuditLog;
use App\Models\Request\RequestAttachment;
use App\Models\Request\ServiceRequest;
use App\Services\Request\RequestAttachmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Adds and removes the files on an already-filed request. Only the requester's
 * side may use it, and only while nobody has signed — see
 * ServiceRequest::canManageAttachments. The files a request is SUBMITTED with
 * travel with the submit itself (StoreServiceRequestRequest), not through here.
 */
class RequestAttachmentController extends Controller
{
    public function __construct(private readonly RequestAttachmentService $attachments) {}

    /** Stores one or more uploaded files against the request. */
    public function store(Request $request, ServiceRequest $serviceRequest): JsonResponse
    {
        abort_unless($serviceRequest->canManageAttachments($request->user()), 403);

        $request->validate([
            'files' => ['required', 'array', 'min:1'],
            'files.*' => [
                'file',
                'mimes:'.RequestAttachmentService::ALLOWED_EXTENSIONS,
                'max:'.RequestAttachmentService::MAX_SIZE_KB,
            ],
        ]);

        $files = $request->file('files');
        $remaining = $this->attachments->remaining($serviceRequest);
        if (count($files) > $remaining) {
            return response()->json([
                'message' => 'แนบไฟล์ได้สูงสุด '.RequestAttachmentService::MAX_FILES." ไฟล์ต่อคำขอ (เหลือ {$remaining} ไฟล์)",
            ], 422);
        }

        $this->attachments->store($serviceRequest, $files);

        AuditLog::record('Uploaded request attachment', count($files)." ไฟล์ - {$serviceRequest->reference}");

        return $this->fresh($serviceRequest);
    }

    /** Deletes a single attachment (file + row). */
    public function destroy(Request $request, ServiceRequest $serviceRequest, RequestAttachment $attachment): JsonResponse
    {
        abort_unless($serviceRequest->canManageAttachments($request->user()), 403);
        abort_unless($attachment->service_request_id === $serviceRequest->id, 404);

        $this->attachments->delete($attachment);

        AuditLog::record('Deleted request attachment', "{$attachment->original_name} - {$serviceRequest->reference}");

        return $this->fresh($serviceRequest);
    }

    /** The whole request back, so the dialog re-renders from one answer. */
    private function fresh(ServiceRequest $serviceRequest): JsonResponse
    {
        return (new ServiceRequestResource($serviceRequest->load(RequestController::DETAIL_RELATIONS)))
            ->additional(['message' => 'success'])->response();
    }
}
