<?php

namespace App\Http\Controllers\Api\Email;

use App\Http\Controllers\Controller;
use App\Models\Email\EmailLog;
use App\Services\Email\EmailLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Read-only history of what the system tried to email, including sends that never left (no address). */
class EmailLogController extends Controller
{
    public function __construct(private readonly EmailLogService $log) {}

    /** The module master plus the log's own right: reading who was written to is not changing what gets written. */
    private function gate(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('notifications.module'), 403);
        abort_unless((bool) $request->user()?->hasPermission('notifications.logs'), 403);
    }

    /** One entry with the email rebuilt as received; `preview_html` is null for rows from before bodies were kept. */
    public function show(Request $request, EmailLog $emailLog): JsonResponse
    {
        $this->gate($request);

        return response()->json([
            'data' => [
                'id' => $emailLog->id,
                'template_key' => $emailLog->template_key,
                'to_email' => $emailLog->to_email,
                'recipient_name' => $emailLog->recipient_name,
                'subject' => $emailLog->subject,
                'status' => $emailLog->status,
                'error' => $emailLog->error,
                'created_at' => $emailLog->created_at?->toIso8601String(),
                'preview_html' => $emailLog->body_html === null ? null : $this->log->renderSent($emailLog),
                // Rows from before the button was recorded show none rather than a guessed one
                'action_recorded' => $emailLog->action !== null,
            ],
        ]);
    }

    /** Newest first, paginated server-side; the table grows by one row per email forever. */
    public function index(Request $request): JsonResponse
    {
        $this->gate($request);

        $status = $request->query('status');
        $paginator = $this->log->page(is_string($status) ? $status : null, $request->query('search'), max(10, min(100, (int) $request->query('per_page', 20))));

        return response()->json([
            'data' => collect($paginator->items())->map(fn (EmailLog $log) => [
                'id' => $log->id,
                'template_key' => $log->template_key,
                'to_email' => $log->to_email,
                'recipient_name' => $log->recipient_name,
                'subject' => $log->subject,
                'status' => $log->status,
                'error' => $log->error,
                'created_at' => $log->created_at?->toIso8601String(),
            ]),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'counts' => $this->log->counts(),
            ],
        ]);
    }
}
