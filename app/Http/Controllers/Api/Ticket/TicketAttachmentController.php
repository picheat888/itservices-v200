<?php

namespace App\Http\Controllers\Api\Ticket;

use App\Http\Controllers\Controller;
use App\Http\Resources\Ticket\TicketResource;
use App\Models\AuditLog;
use App\Models\Ticket\Ticket;
use App\Models\Ticket\TicketAttachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Manages the images/PDFs attached to a ticket. Files are kept on the public disk
 * under tickets/{id}; only PNG/JPG/PDF up to self::MAX_SIZE_KB are accepted and a
 * ticket may hold at most self::MAX_FILES of them.
 */
class TicketAttachmentController extends Controller
{
    /** Largest single upload, in kilobytes (20 MB). */
    private const MAX_SIZE_KB = 20480;

    /** Hard cap on the number of attachments a single ticket may hold. */
    private const MAX_FILES = 10;

    /**
     * Stores one or more uploaded files against the ticket. The requester may attach
     * files to their own ticket, and IT staff (tickets.view_all) to any ticket.
     */
    public function store(Request $request, Ticket $ticket): JsonResponse
    {
        abort_unless($this->canManage($request, $ticket), 403);

        $request->validate([
            'files' => ['required', 'array', 'min:1'],
            // `mimes` is content-based (Laravel reads the bytes and maps to an extension),
            // so it whitelists both by extension AND signature. We drop the explicit
            // `mimetypes` rule on purpose: docx/xlsx/pptx are ZIP containers that finfo
            // reports as application/zip, which would fight a rigid mimetypes list.
            'files.*' => ['file', 'mimes:pdf,png,jpg,jpeg,zip,doc,docx,xls,xlsx,ppt,pptx', 'max:'.self::MAX_SIZE_KB],
        ]);

        $files = $request->file('files');

        // Files mirrored from the service request are not counted: the cap is on what a
        // technician uploads here, and a case that arrived carrying five of them would
        // otherwise have half the room left for the photos taken while working it.
        $remaining = self::MAX_FILES - $ticket->attachments()->whereNull('request_attachment_id')->count();
        if (count($files) > $remaining) {
            return response()->json([
                'message' => 'แนบไฟล์ได้สูงสุด '.self::MAX_FILES." ไฟล์ต่อตั๋ว (เหลือ {$remaining} ไฟล์)",
            ], 422);
        }

        foreach ($files as $file) {
            $path = $file->store("tickets/{$ticket->id}", 'local');
            $ticket->attachments()->create([
                'original_name' => $file->getClientOriginalName(),
                'path' => $path,
                'size' => $file->getSize(),
                'mime' => $file->getMimeType() ?: 'application/octet-stream',
            ]);
        }

        AuditLog::record('Uploaded ticket attachment', count($files)." ไฟล์ - {$ticket->ticket_no}");

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }

    /**
     * Deletes a single attachment (file + row).
     *
     * A file mirrored from the service request is refused: the row shares its `path`
     * with the request's own record, so deleting it here would take the evidence an
     * approved request was decided on off the disk with it.
     */
    public function destroy(Request $request, Ticket $ticket, TicketAttachment $attachment): JsonResponse
    {
        abort_unless($this->canManage($request, $ticket), 403);
        abort_unless($attachment->ticket_id === $ticket->id, 404);

        if ($attachment->isMirrored()) {
            return response()->json([
                'message' => 'ไฟล์นี้มาจากคำขอ '.($ticket->serviceRequest?->reference ?? '').' ลบออกจากตั๋วไม่ได้',
            ], 422);
        }

        Storage::disk('local')->delete($attachment->path);
        $attachment->delete();

        AuditLog::record('Deleted ticket attachment', "{$attachment->original_name} - {$ticket->ticket_no}");

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }

    /**
     * Upload/delete is allowed for the ticket's requester (their own ticket) or for
     * IT staff who can view all tickets (super bypasses both checks).
     */
    private function canManage(Request $request, Ticket $ticket): bool
    {
        $user = $request->user();
        if ($user === null) {
            return false;
        }

        return $user->hasPermission('tickets.view_all') || $ticket->requester_id === $user->employee_id;
    }
}
