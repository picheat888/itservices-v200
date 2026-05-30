<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TicketResource;
use App\Models\AuditLog;
use App\Models\Ticket;
use App\Models\TicketAttachment;
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
            'files.*' => ['file', 'mimes:pdf,png,jpg,jpeg', 'mimetypes:application/pdf,image/png,image/jpeg', 'max:'.self::MAX_SIZE_KB],
        ]);

        $files = $request->file('files');

        $remaining = self::MAX_FILES - $ticket->attachments()->count();
        if (count($files) > $remaining) {
            return response()->json([
                'message' => 'แนบไฟล์ได้สูงสุด '.self::MAX_FILES." ไฟล์ต่อตั๋ว (เหลือ {$remaining} ไฟล์)",
            ], 422);
        }

        foreach ($files as $file) {
            $path = $file->store("tickets/{$ticket->id}", 'public');
            $ticket->attachments()->create([
                'original_name' => $file->getClientOriginalName(),
                'path' => $path,
                'size' => $file->getSize(),
                'mime' => $file->getMimeType() ?: 'application/octet-stream',
            ]);
        }

        AuditLog::record('Uploaded ticket attachment', count($files)." ไฟล์ — {$ticket->ticket_no}");

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }

    /** Deletes a single attachment (file + row). */
    public function destroy(Request $request, Ticket $ticket, TicketAttachment $attachment): JsonResponse
    {
        abort_unless($this->canManage($request, $ticket), 403);
        abort_unless($attachment->ticket_id === $ticket->id, 404);

        Storage::disk('public')->delete($attachment->path);
        $attachment->delete();

        AuditLog::record('Deleted ticket attachment', "{$attachment->original_name} — {$ticket->ticket_no}");

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
