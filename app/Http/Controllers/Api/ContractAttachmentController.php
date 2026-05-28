<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ContractResource;
use App\Models\AuditLog;
use App\Models\Contract;
use App\Models\ContractAttachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Manages the PDF documents attached to a contract. Files are kept on the public
 * disk under contracts/{id}; only PDFs up to 25 MB are accepted and a contract
 * may hold at most self::MAX_FILES of them.
 */
class ContractAttachmentController extends Controller
{
    /** Largest single upload, in kilobytes (25 MB). */
    private const MAX_SIZE_KB = 25600;

    /** Hard cap on the number of attachments a single contract may hold. */
    private const MAX_FILES = 10;

    /**
     * Stores one or more uploaded PDFs against the contract. Creating a contract
     * (contracts.create) or editing one (contracts.edit) both allow uploading,
     * since the add form attaches files immediately after the contract is saved.
     */
    public function store(Request $request, Contract $contract): JsonResponse
    {
        abort_unless($this->canManage($request), 403);

        $request->validate([
            'files' => ['required', 'array', 'min:1'],
            'files.*' => ['file', 'mimes:pdf', 'mimetypes:application/pdf', 'max:'.self::MAX_SIZE_KB],
        ]);

        $files = $request->file('files');

        $remaining = self::MAX_FILES - $contract->attachments()->count();
        if (count($files) > $remaining) {
            return response()->json([
                'message' => 'แนบไฟล์ได้สูงสุด '.self::MAX_FILES." ไฟล์ต่อสัญญา (เหลือ {$remaining} ไฟล์)",
            ], 422);
        }

        foreach ($files as $file) {
            $path = $file->store("contracts/{$contract->id}", 'public');
            $contract->attachments()->create([
                'original_name' => $file->getClientOriginalName(),
                'path' => $path,
                'size' => $file->getSize(),
                'mime' => $file->getMimeType() ?: 'application/pdf',
            ]);
        }

        AuditLog::record('Uploaded contract attachment', count($files)." ไฟล์ — {$contract->name} ({$contract->code})");

        return (new ContractResource($contract->load('attachments')))
            ->additional(['message' => 'success'])->response();
    }

    /** Deletes a single attachment (file + row). Requires contracts.edit. */
    public function destroy(Request $request, Contract $contract, ContractAttachment $attachment): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.edit'), 403);
        abort_unless($attachment->contract_id === $contract->id, 404);

        Storage::disk('public')->delete($attachment->path);
        $attachment->delete();

        AuditLog::record('Deleted contract attachment', "{$attachment->original_name} — {$contract->name} ({$contract->code})");

        return (new ContractResource($contract->load('attachments')))
            ->additional(['message' => 'success'])->response();
    }

    /** Upload is allowed for users who can create or edit contracts (super bypasses). */
    private function canManage(Request $request): bool
    {
        $user = $request->user();

        return (bool) ($user?->hasPermission('contracts.create') || $user?->hasPermission('contracts.edit'));
    }
}
