<?php

namespace App\Http\Controllers\Api\Email;

use App\Http\Controllers\Controller;
use App\Models\Email\EmailLog;
use App\Models\Email\EmailTemplate;
use App\Models\Settings\AppSetting;
use App\Services\Email\EmailNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Read-only history of what the system tried to email.
 *
 * The header cards on the Email Templates screen have always counted these rows, but there
 * was nowhere to look at them: a success rate of 94% named neither the six per cent nor the
 * people behind it. Rows now also include sends that never left, because the recipient had
 * no address — the case that used to disappear inside each service.
 */
class EmailLogController extends Controller
{
    /** Same gate as the templates themselves — this is the other half of that screen. */
    private function gate(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('system.configure_notifications'), 403);
    }

    /**
     * One log entry with the email rebuilt as it was received: the stored message put back
     * inside the branded layout, which is the same on every send and therefore not stored.
     *
     * `preview_html` is null for rows written before bodies were kept — the screen says the
     * content was not recorded rather than showing an empty frame.
     */
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
                'preview_html' => $emailLog->body_html === null ? null : $this->renderSentEmail($emailLog),
            ],
        ]);
    }

    /** Wraps a stored message in the same layout the mailer sends it in. */
    private function renderSentEmail(EmailLog $log): string
    {
        $service = app(EmailNotificationService::class);

        // The eyebrow under the brand is the template's NAME in a real send, not its key —
        // "Request awaiting your approval", not request.approval_needed. Resolved live like
        // the rest of the frame; a template that has since been deleted falls back to the key.
        $eyebrow = EmailTemplate::where('key', $log->template_key)->value('name') ?? $log->template_key;

        return view('emails.templated', [
            'subjectLine' => $log->subject,
            'bodyHtml' => $log->body_html,
            'eyebrow' => $eyebrow,
            'actionUrl' => rtrim((string) config('app.url'), '/').'/',
            'actionLabel' => 'Open in portal',
            'brand' => AppSetting::get('brand_name') ?: config('app.name', 'IT Service Desk'),
            'logoData' => $service->brandLogoDataUri(),
            // NOT preview mode. This is a record of a real send, and the preview flag swaps
            // the footnote for "Sample only - in a real email this opens the portal", which
            // is a sentence the recipient never saw. The screen shows it inside a sandboxed
            // frame instead, so the link is inert without the wording having to lie.
            'preview' => false,
        ])->render();
    }

    /**
     * Newest first, filtered by status and a search across recipient, address, subject and
     * template key. Paginated server-side: the table grows by one row per email forever.
     */
    public function index(Request $request): JsonResponse
    {
        $this->gate($request);

        $query = EmailLog::query()->latest('created_at')->latest('id');

        if (in_array($status = (string) $request->query('status'), ['sent', 'failed', 'skipped'], true)) {
            $query->where('status', $status);
        }

        if ($search = trim((string) $request->query('search'))) {
            $query->where(function ($q) use ($search) {
                foreach (['recipient_name', 'to_email', 'subject', 'template_key'] as $column) {
                    $q->orWhere($column, 'like', "%{$search}%");
                }
            });
        }

        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));
        $paginator = $query->paginate($perPage);

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
                // Counts for the whole log, not the page — the tab's own filter chips read
                // these, and a count that changed with the page would be a lie.
                'counts' => [
                    'sent' => EmailLog::where('status', 'sent')->count(),
                    'failed' => EmailLog::where('status', 'failed')->count(),
                    'skipped' => EmailLog::where('status', 'skipped')->count(),
                ],
            ],
        ]);
    }
}
