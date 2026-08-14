<?php

namespace App\Http\Controllers\Api\Email;

use App\Http\Controllers\Controller;
use App\Http\Resources\Email\EmailTemplateResource;
use App\Models\AuditLog;
use App\Models\Email\EmailLog;
use App\Models\Email\EmailTemplate;
use App\Models\Settings\AppSetting;
use App\Services\Email\EmailNotificationService;
use App\Services\Ticket\TicketDigestService;
use App\Support\EmailTable;
use App\Support\EmailTemplates;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class EmailTemplateController extends Controller
{
    public function __construct(private readonly EmailNotificationService $service) {}

    /** Gates every action to the notification-config permission. */
    private function gate(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('system.configure_notifications'), 403);
    }

    /** Returns all templates plus the four header stats. */
    public function index(Request $request): JsonResponse
    {
        $this->gate($request);

        $templates = EmailTemplate::orderBy('id')->get();

        $sentTotal = EmailLog::where('status', 'sent')->count();
        $failedTotal = EmailLog::where('status', 'failed')->count();
        $attempts = $sentTotal + $failedTotal;

        return response()->json([
            'data' => EmailTemplateResource::collection($templates),
            'stats' => [
                'templates' => $templates->count(),
                'enabled' => $templates->where('enabled', true)->count(),
                'sent_today' => EmailLog::where('status', 'sent')->whereDate('created_at', today())->count(),
                'delivery_rate' => $attempts > 0 ? round($sentTotal / $attempts * 100, 1) : null,
            ],
        ]);
    }

    /** Creates a new template. */
    /*
     * No store(): a template is only ever sent by code calling sendTemplate() with its key,
     * and every one of those keys is written in App\Support\EmailTemplates. A row created
     * through the API would be editable, switchable and testable, and nothing would ever
     * send it. Templates arrive with the code that sends them (see the migration that copies
     * missing standard templates into installations seeded before they existed).
     */

    /** Updates a template — used for both inline enable toggle and full edit. */
    public function update(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->gate($request);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:150'],
            'subject' => ['sometimes', 'string', 'max:255'],
            'body_html' => ['sometimes', 'string'],
            'enabled' => ['sometimes', 'boolean'],
        ]);

        $before = $emailTemplate->getOriginal();
        $emailTemplate->update($data);
        AuditLog::record('Updated email template', $emailTemplate->name, AuditLog::changes($before, $emailTemplate));

        return (new EmailTemplateResource($emailTemplate))->additional(['message' => 'success'])->response();
    }

    /** Restores one template to its standard definition. 422 if it has no standard. */
    public function reset(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->gate($request);

        $standard = EmailTemplates::find($emailTemplate->key);
        if ($standard === null) {
            return response()->json(['message' => 'This template has no standard to reset to.'], 422);
        }

        $before = $emailTemplate->getOriginal();
        $emailTemplate->update([
            'name' => $standard['name'],
            'subject' => $standard['subject'],
            'body_html' => $standard['body_html'],
            'enabled' => $standard['enabled'],
            'cadence' => $standard['cadence'],
        ]);
        AuditLog::record('Reset email template to standard', $emailTemplate->name, AuditLog::changes($before, $emailTemplate));

        return (new EmailTemplateResource($emailTemplate))->additional(['message' => 'success'])->response();
    }

    /** Restores every standard template to its standard definition in one pass. */
    public function resetAll(Request $request): JsonResponse
    {
        $this->gate($request);

        $count = 0;
        foreach (EmailTemplates::all() as $standard) {
            $template = EmailTemplate::where('key', $standard['key'])->first();
            if ($template === null) {
                continue;
            }

            $template->update([
                'name' => $standard['name'],
                'subject' => $standard['subject'],
                'body_html' => $standard['body_html'],
                'enabled' => $standard['enabled'],
                'cadence' => $standard['cadence'],
            ]);
            $count++;
        }
        AuditLog::record('Reset all email templates to standard', "{$count} template(s)");

        return response()->json(['message' => 'success', 'reset' => $count]);
    }

    /** Sends a test render of one template to the current user (synchronous). */
    public function test(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->gate($request);

        $to = $request->user()->email;
        if (! $to) {
            return response()->json(['message' => 'Your account has no email address.'], 422);
        }

        $vars = $this->sampleVars($request);
        $subject = $this->service->render($emailTemplate->subject, $vars);
        $html = $this->service->render($emailTemplate->body_html, $vars);

        // Every test send carries the time it was sent. Two test sends of one template are
        // otherwise identical down to the character, and a mailbox that groups by subject
        // then files the second one into the first one's conversation and hides the repeated
        // body behind a "show trimmed content" toggle — which reads as an email that arrived
        // empty. The stamp also tells the reader which press of the button they are looking at.
        $subject .= ' (test '.now()->format('H:i').')';

        // Match the real send: branded wrapper + eyebrow + a sample Quick link.
        $ok = $this->service->deliver(
            $to,
            $subject,
            $html,
            $emailTemplate->key,
            rtrim((string) config('app.url'), '/').'/',
            'Open in portal',
            $emailTemplate->name,
        );

        // 200 either way. A rejected address or an unreachable SMTP host is an answer to
        // the question the button asked, not a broken server: a 5xx here trips the client's
        // "Something went wrong" takeover, which hides the very screen holding the settings
        // that need fixing. The caller reads `sent`.
        return response()->json([
            'message' => $ok ? 'success' : 'failed',
            'sent' => $ok,
        ]);
    }

    /**
     * Renders the template inside the real branded email layout (emails.templated)
     * with sample data, so the in-app preview matches exactly what recipients get —
     * wrapper, eyebrow, and a sample Quick link button. Returns raw HTML for an iframe.
     */
    public function preview(Request $request, EmailTemplate $emailTemplate): Response
    {
        $this->gate($request);

        $vars = $this->sampleVars($request);
        $subject = $this->service->render($emailTemplate->subject, $vars);
        $body = $this->service->render($emailTemplate->body_html, $vars);

        $html = view('emails.templated', [
            'subjectLine' => $subject,
            'bodyHtml' => $body,
            'eyebrow' => $emailTemplate->name,
            'actionUrl' => rtrim((string) config('app.url'), '/').'/',
            'actionLabel' => 'Open in portal',
            'brand' => AppSetting::get('brand_name') ?: config('app.name', 'IT Service Desk'),
            'logoData' => $this->service->brandLogoDataUri(),
            'preview' => true,
        ])->render();

        return response($html)->header('Content-Type', 'text/html');
    }

    /**
     * Live preview of UNSAVED edit-drawer content: renders the supplied subject/body
     * through the branded layout with sample data + an inert Quick link, so the Edit
     * screen shows exactly what the Preview / recipient will see as you type.
     */
    public function renderPreview(Request $request): Response
    {
        $this->gate($request);

        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:150'],
            'subject' => ['nullable', 'string', 'max:255'],
            'body_html' => ['nullable', 'string'],
        ]);

        $vars = $this->sampleVars($request);

        $html = view('emails.templated', [
            'subjectLine' => $this->service->render($data['subject'] ?? '', $vars),
            'bodyHtml' => $this->service->render($data['body_html'] ?? '', $vars),
            'eyebrow' => $data['name'] ?? null,
            'actionUrl' => rtrim((string) config('app.url'), '/').'/',
            'actionLabel' => 'Open in portal',
            'brand' => AppSetting::get('brand_name') ?: config('app.name', 'IT Service Desk'),
            'logoData' => $this->service->brandLogoDataUri(),
            'preview' => true,
        ])->render();

        return response($html)->header('Content-Type', 'text/html');
    }

    /**
     * Realistic sample values for previews / test sends, covering the placeholders
     * used across all modules (including stock digest {{items}} / {{count}}).
     *
     * @return array<string, mixed>
     */
    private function sampleVars(Request $request): array
    {
        $name = (string) ($request->user()->name ?? 'Kanya Phakdee');

        return [
            // Same value the send path injects, so the preview names the installation the
            // way a delivered email does.
            'app.name' => AppSetting::get('brand_name') ?: config('app.name', 'IT Service Desk'),
            'user.first_name' => explode(' ', $name)[0] ?: 'there',
            'user.email' => $request->user()->email ?? 'user@example.com',
            'count' => 3,
            'items' => '<ul>'
                .'<li><strong>SKU-1042</strong> - USB-C Docking Station · Below minimum (on hand: 2)</li>'
                .'<li><strong>SKU-0387</strong> - 24-inch Monitor · Out of stock (on hand: 0)</li>'
                .'<li><strong>REQ-2026-0042</strong> - Wireless Mouse ×5 · pending (by Somchai)</li>'
                .'</ul>',
            'stock.sku' => 'SKU-1042',
            'stock.name' => 'USB-C Docking Station',
            'stock.qty' => 2,
            'ticket.id' => 'TKT-2856',
            'ticket.subject' => 'Printer not responding',
            'ticket.category' => 'Hardware',
            'ticket.details' => 'The printer on the 3rd floor shows a paper jam error,<br>but there is no paper stuck inside.',
            'ticket.requester' => 'Somchai Suksawat',
            'from.name' => 'Anong Wattana',
            'contract.vendor' => 'Acme Co.',
            'contract.name' => 'Annual support',
            'contract.code' => 'CT-2026-014',
            'contract.days_remaining' => 30,
            'contract.days_overdue' => 5,
            'contract.end_date' => '31 Dec 2026',
            'reference.id' => 'REF-0001',
            'request.title' => 'Request: Mail group',
            'requester.name' => 'Manee Jaidee',
            'actor.name' => 'Anong Wattana',
            'step.label' => 'Department manager',
            'remark' => 'The licence is not available on the current agreement.',
            'employee.name' => 'Somchai Suksawat',
            'employee.code' => 'EMP-1042',
            'digest.count' => 2,
            'digest.open_count' => 2,
            'digest.working_count' => 1,
            // Every digest builds its rows in PHP, so the preview needs stand-ins. Without
            // them an administrator rewording the mail sees a literal {{digest.table}} and
            // cannot tell what they are writing around. Built through the same renderer the
            // real mail uses, so the preview cannot drift away from what gets sent.
            'digest.table' => EmailTable::render(
                ['Reference', 'Request', 'Requested by', 'Days waiting'],
                [
                    [EmailTable::link('#', 'RQ-2026-0018'), 'Request: Mail group', 'Somchai Suksawat', '14'],
                    [EmailTable::link('#', 'RQ-2026-0021'), 'Request: Computer', 'Manee Jaidee', '9'],
                ],
                [3],
                ['18%', '40%', '26%', '16%'],
            ),
            'digest.open_table' => EmailTable::render(
                TicketDigestService::HEADERS_OPEN,
                [
                    [EmailTable::link('#', 'TKT-2856'), 'Printer not responding', 'Hardware', 'Somchai Suksawat', '4'],
                    [EmailTable::link('#', 'TKT-2861'), 'Cannot open shared drive', 'Network', 'Manee Jaidee', '2'],
                ],
                TicketDigestService::NUMERIC,
                TicketDigestService::WIDTHS,
            ),
            'digest.working_table' => EmailTable::render(
                TicketDigestService::HEADERS_WORKING,
                [
                    [EmailTable::link('#', 'TKT-2840'), 'Email signature missing', 'Software', 'Thanapon', '7'],
                ],
                TicketDigestService::NUMERIC,
                TicketDigestService::WIDTHS,
            ),
        ];
    }
}
