<?php

namespace App\Http\Controllers\Api\Contract;

use App\Http\Controllers\Controller;
use App\Http\Resources\Contract\ContractResource;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\Contract\ContractAttachment;
use App\Services\Contract\ContractAttachmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The PDF documents attached to a contract: PDFs up to 25 MB, stored and capped by ContractAttachmentService. */
class ContractAttachmentController extends Controller
{
    /** Largest single upload, in kilobytes (25 MB). */
    private const MAX_SIZE_KB = 25600;

    public function __construct(private readonly ContractAttachmentService $attachments) {}

    /** Upload PDFs: contracts.edit for any contract, contracts.create only for one the uploader created. */
    public function store(Request $request, Contract $contract): JsonResponse
    {
        abort_unless($this->canUpload($request, $contract), 403);
        $this->attachments->assertOpen($contract);

        $request->validate([
            'files' => ['required', 'array', 'min:1'],
            'files.*' => ['file', 'mimes:pdf', 'mimetypes:application/pdf', 'max:'.self::MAX_SIZE_KB],
        ]);

        $files = $request->file('files');
        $this->attachments->store($contract, $files);

        AuditLog::record('Uploaded contract attachment', count($files)." ไฟล์ - {$contract->name} ({$contract->code})", subject: $contract);

        return (new ContractResource($contract->load('attachments')))
            ->additional(['message' => 'success'])->response();
    }

    /** Deletes a single attachment (file + row). Requires contracts.edit. */
    public function destroy(Request $request, Contract $contract, ContractAttachment $attachment): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.edit'), 403);
        abort_unless($attachment->contract_id === $contract->id, 404);

        $this->attachments->delete($contract, $attachment);

        AuditLog::recordDeleted('Deleted contract attachment', "{$attachment->original_name} - {$contract->name} ({$contract->code})", $attachment);

        return (new ContractResource($contract->load('attachments')))
            ->additional(['message' => 'success'])->response();
    }

    private function canUpload(Request $request, Contract $contract): bool
    {
        $user = $request->user();
        if ($user === null) {
            return false;
        }

        return $user->hasPermission('contracts.edit')
            || ($user->hasPermission('contracts.create') && $contract->created_by === $user->id);
    }
}
