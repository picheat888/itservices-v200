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

/** Files attached to a ticket, kept on the local disk under tickets/{id}; at most self::MAX_FILES per ticket. */
class TicketAttachmentController extends Controller
{
    /** Largest single upload, in kilobytes (20 MB). */
    private const MAX_SIZE_KB = 20480;

    /** Hard cap on the number of attachments a single ticket may hold. */
    private const MAX_FILES = 10;

    /** Stores uploaded files on the ticket; only its opener, while it is Open. */
    public function store(Request $request, Ticket $ticket): JsonResponse
    {
        abort_unless($ticket->acceptsFilesFrom($request->user()), 403);

        $request->validate([
            'files' => ['required', 'array', 'min:1'],
            // `mimes` checks the bytes, not just the extension (no `mimetypes`: Office files read as zip)
            'files.*' => ['file', 'mimes:pdf,png,jpg,jpeg,zip,doc,docx,xls,xlsx,ppt,pptx', 'max:'.self::MAX_SIZE_KB],
        ]);

        $files = $request->file('files');

        // Files mirrored from a service request do not count toward the cap
        $remaining = self::MAX_FILES - $ticket->attachments()->whereNull('request_attachment_id')->count();
        if (count($files) > $remaining) {
            // A reason and its figures; the SPA words it in the reader's language.
            return response()->json(['message' => 'too_many_files', 'max' => self::MAX_FILES, 'remaining' => $remaining], 422);
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

        AuditLog::record('Uploaded ticket attachment', count($files)." ไฟล์ - {$ticket->ticket_no}", subject: $ticket);

        return (new TicketResource($ticket->load(['requester', 'assignee.employee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }

    /** Deletes one attachment (file and row); only the opener, while the case is Open. */
    public function destroy(Request $request, Ticket $ticket, TicketAttachment $attachment): JsonResponse
    {
        abort_unless($ticket->isEditableBy($request->user()), 403);
        abort_unless($attachment->ticket_id === $ticket->id, 404);

        if ($attachment->isMirrored()) {
            return response()->json(['message' => 'file_from_request', 'reference' => $ticket->serviceRequest?->reference ?? ''], 422);
        }

        Storage::disk('local')->delete($attachment->path);
        $attachment->delete();

        AuditLog::recordDeleted('Deleted ticket attachment', "{$attachment->original_name} - {$ticket->ticket_no}", $attachment);

        return (new TicketResource($ticket->load(['requester', 'assignee.employee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }
}
