<?php

namespace App\Http\Controllers\Api\Email;

use App\Http\Controllers\Controller;
use App\Http\Resources\Email\EmailTemplateResource;
use App\Models\AuditLog;
use App\Models\Email\EmailLog;
use App\Models\Email\EmailTemplate;
use App\Models\Settings\AppSetting;
use App\Models\Settings\MailSetting;
use App\Services\Access\AccessService;
use App\Services\Contract\ContractDigestService;
use App\Services\Email\EmailNotificationService;
use App\Services\Request\RequestNotificationService;
use App\Services\Stock\StockNotificationService;
use App\Services\Ticket\TicketDigestService;
use App\Support\EmailTable;
use App\Support\EmailTemplates;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class EmailTemplateController extends Controller
{
    public function __construct(private readonly EmailNotificationService $service) {}

    /** Opening the page at all. Every read below needs this and nothing more. */
    private function gate(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('notifications.module'), 403);
    }

    /**
     * One of the module's finer rights, master included.
     *
     * Rewording a template and switching it off are separate permissions: turning one off
     * stops it reaching anybody, which is a decision about who hears what, while rewording
     * is a decision about how it reads.
     */
    private function allow(Request $request, string $key): void
    {
        $this->gate($request);
        abort_unless((bool) $request->user()?->hasPermission($key), 403);
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
            'mail' => $this->fromIdentity(),
        ]);
    }

    /**
     * The address recipients will actually see this mail come from.
     *
     * The preview drew its own `no-reply@brandname` instead, which is a plausible address
     * and not the configured one — the one line of a preview that promises accuracy was
     * the one line making something up. Resolved exactly as MailConfigService does at send
     * time, so an unconfigured install shows the .env fallback rather than a guess.
     *
     * @return array{from_address: ?string, from_name: ?string}
     */
    private function fromIdentity(): array
    {
        $settings = MailSetting::current();
        $configured = $settings->isConfigured();

        return [
            'from_address' => $configured ? $settings->from_address : (string) config('mail.from.address'),
            'from_name' => ($configured ? $settings->from_name : null) ?: (string) config('mail.from.name'),
        ];
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

        // Decided from what the save CHANGES, not from what the form sent: the edit drawer
        // posts every field every time, so trusting the payload's shape would let anyone who
        // may reword also flip the switch by resubmitting the row unchanged.
        $this->requireRightsFor($request, $emailTemplate, $data);

        $before = $emailTemplate->getOriginal();
        $emailTemplate->update($data);
        AuditLog::record('Updated email template', $emailTemplate->name, AuditLog::changes($before, $emailTemplate));

        return (new EmailTemplateResource($emailTemplate))->additional(['message' => 'success'])->response();
    }

    /**
     * Demand a right per kind of change the save actually makes.
     *
     * `enabled` moving needs the toggle right; any wording field moving needs the edit right;
     * a save that changes nothing needs neither. Compared against what is stored, so the same
     * endpoint serves the inline switch and the full editor without either being able to do
     * the other's job by sending extra fields.
     *
     * @param  array<string, mixed>  $data
     */
    private function requireRightsFor(Request $request, EmailTemplate $template, array $data): void
    {
        $togglesIt = array_key_exists('enabled', $data) && (bool) $data['enabled'] !== (bool) $template->enabled;
        $rewordsIt = collect(['name', 'subject', 'body_html'])
            ->contains(fn (string $field) => array_key_exists($field, $data) && $data[$field] !== $template->{$field});

        if ($togglesIt) {
            abort_unless((bool) $request->user()?->hasPermission('notifications.email_toggle'), 403);
        }
        if ($rewordsIt) {
            abort_unless((bool) $request->user()?->hasPermission('notifications.email_edit'), 403);
        }
    }

    /** Restores one template to its standard definition. 422 if it has no standard. */
    public function reset(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        // Reset rewrites the wording, so it is an edit — the fact that the new text comes
        // from the catalogue rather than a form does not make it a lesser change.
        $this->allow($request, 'notifications.email_edit');

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
        $this->allow($request, 'notifications.email_edit');

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

    /**
     * Sends a test render of one template to the current user (synchronous).
     *
     * Takes the editor's UNSAVED wording when it is posted, and falls back to the stored
     * row otherwise. Sending the saved copy while the editor showed the new one made the
     * button answer a question nobody asked: the reader compared the mail in their inbox
     * against the words on screen and found them different, with nothing saying why.
     */
    public function test(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        // Sending real mail, even to yourself, is its own right.
        $this->allow($request, 'notifications.email_test');

        $draft = $request->validate([
            'name' => ['sometimes', 'string', 'max:150'],
            'subject' => ['sometimes', 'string', 'max:255'],
            'body_html' => ['sometimes', 'string'],
        ]);

        $to = $request->user()->email;
        if (! $to) {
            return response()->json(['message' => 'Your account has no email address.'], 422);
        }

        $vars = $this->sampleVars($request);
        $subject = $this->service->render($draft['subject'] ?? $emailTemplate->subject, $vars);
        $html = $this->service->render($draft['body_html'] ?? $emailTemplate->body_html, $vars);

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
            $draft['name'] ?? $emailTemplate->name,
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
            'width' => EmailTemplates::widthFor($emailTemplate->key),
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
            // The key is not edited here — it is sent so the live preview is drawn at the
            // same width the saved template and the real mail are.
            'key' => ['nullable', 'string', 'max:100'],
            'name' => ['nullable', 'string', 'max:150'],
            'subject' => ['nullable', 'string', 'max:255'],
            'body_html' => ['nullable', 'string'],
        ]);

        $vars = $this->sampleVars($request);

        $html = view('emails.templated', [
            'subjectLine' => $this->service->render($data['subject'] ?? '', $vars),
            'bodyHtml' => $this->service->render($data['body_html'] ?? '', $vars),
            'eyebrow' => $data['name'] ?? null,
            'width' => EmailTemplates::widthFor($data['key'] ?? null),
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
            'stock.sku' => 'SKU-1042',
            'stock.name' => 'USB-C Docking Station',
            'stock.qty' => 2,
            'stock.min' => 5,
            'stock.max' => 40,
            'stock.request_no' => 'REQ-2026-0001',
            'stock.request_by' => 'Piches Srisuk',
            'stock.request_reason' => 'Replacing the dock on the 3rd floor meeting room.',
            'stock.request_date' => '18-08-2026',
            'stock.approver' => 'Anong Wattana',
            'stock.fulfilled_by' => 'Kankanok P',
            'stock.fulfilled_date' => '20-08-2026',
            'stock.request_summary_table' => EmailTable::render(
                StockNotificationService::REQUEST_SUMMARY_HEADERS,
                [['Pending Approval', '2'], ['Awaiting Fulfilment', '1']],
                [1],
                StockNotificationService::REQUEST_SUMMARY_WIDTHS,
            ),
            'stock.requests_table' => EmailTable::render(
                StockNotificationService::REQUEST_HEADERS,
                [
                    ['REQ-2026-0001', 'Piches Srisuk', '18-08-2026', 'USB-C Docking Station ×2', 'Pending Approval'],
                    ['REQ-2026-0004', 'Manee Jaidee', '24-08-2026', 'Wireless mouse ×1', 'Awaiting Fulfilment'],
                ],
                [],
                StockNotificationService::REQUEST_WIDTHS,
                [3],
            ),
            'stock.summary_table' => EmailTable::render(
                StockNotificationService::SUMMARY_HEADERS,
                [['Out of Stock', '1'], ['Low Stock', '2'], ['Overstock', '0']],
                [1],
                StockNotificationService::SUMMARY_WIDTHS,
            ),
            'stock.items_table' => EmailTable::render(
                StockNotificationService::ITEM_HEADERS,
                [
                    ['SKU-1088', 'HDMI cable 2 m', '0', '10', '80', 'Out of Stock'],
                    ['SKU-1042', 'USB-C Docking Station', '2', '5', '40', 'Low Stock'],
                    ['SKU-1103', 'Wireless mouse', '4', '6', '60', 'Low Stock'],
                ],
                StockNotificationService::ITEM_NUMERIC,
                StockNotificationService::ITEM_WIDTHS,
                [1],
            ),
            'asset.code' => 'INK-IT-26-0042',
            'asset.model' => 'ThinkCentre Neo 55a 24 G6',
            'asset.tag' => 'PC042',
            'asset.type' => 'Computer',
            'asset.from' => 'Store IT',
            'asset.holder' => 'Somchai Suksawat',
            'asset.count' => 3,
            'employee.last_working' => '31-12-2026',
            // Built in PHP by AssetService, so the preview needs a stand-in — same reason
            // the digests below carry one.
            'asset.table' => EmailTable::render(
                ['Device', 'Type', 'Serial', 'Tag'],
                [
                    ['ThinkCentre Neo 55a 24 G6', 'Computer', 'DN2312123', 'PC042'],
                    ['ThinkPad E14 Gen 5', 'Notebook', 'PF3X9K21', 'NB018'],
                    ['Dell P2422H 24"', 'Monitor', 'CN0J7T44', 'MN107'],
                ],
                [],
                ['38%', '20%', '24%', '18%'],
            ),
            'access.count' => 4,
            'access.table' => EmailTable::render(
                AccessService::ACCESS_HEADERS,
                [
                    ['MG-0007', 'Email group', 'Sales TH', 'sales-th@inaba-foods.co.th', 'Member'],
                    ['FS-0012', 'File share', 'Sales reports', '\\server\sales\reports', 'Read/Write'],
                    ['SM-0003', 'Social platform', 'Company LINE OA', 'https://line.me/R/ti/p/@inaba', 'Member'],
                    ['SW-0021', 'Software', 'Microsoft 365 E3', '-', 'Member'],
                ],
                [],
                AccessService::ACCESS_WIDTHS,
                AccessService::ACCESS_WRAP,
            ),
            'ticket.id' => 'TKT-2856',
            'ticket.subject' => 'Printer not responding',
            'ticket.category' => 'Hardware',
            'ticket.details' => 'The printer on the 3rd floor shows a paper jam error,<br>but there is no paper stuck inside.',
            'ticket.resolution' => 'Replaced the fuser roller and cleared the jam sensor.',
            'ticket.update' => 'The replacement fuser roller is on order,<br>expected within three working days.',
            'ticket.requester' => 'Somchai Suksawat',
            'ticket.assignee' => 'Piches Srisuk',
            'from.name' => 'Anong Wattana',
            'contract.vendor' => 'Acme Co.',
            'contract.name' => 'Annual support',
            'contract.code' => 'CT-2026-014',
            'contract.days_remaining' => 30,
            'contract.days_overdue' => 5,
            'contract.end_date' => '31-12-2026',
            'contract.details' => 'Microsoft 365 E3 License Agreement, 320 seats',
            'reference.id' => 'REF-0001',
            'request.title' => 'Request: Mail group',
            'request.type' => 'Email group',
            'request.date' => '18-08-2026',
            'request.approved_date' => '20-08-2026',
            'request.rejected_date' => '20-08-2026',
            'request.cancelled_date' => '22-08-2026',
            'request.ticket_no' => 'TKT-2856',
            'request.fulfilled_date' => '22-08-2026',
            'request.fulfilled_by' => 'Kankanok P',
            'request.reason' => 'Onboarding request with the new employee,<br />
first day 01-09-2026.',
            'request.details' => 'Device type: Desktop PC<br>Mailbox address: somchai@inaba-foods.co.th',
            'request.approval_history' => EmailTable::render(
                RequestNotificationService::HISTORY_HEADERS,
                [
                    ['Supervisor', '⏭️ Skipped - the requester has no manager', '-', '-'],
                    ['Department Manager', '✅ Approved', 'Anong Wattana', '19-08-2026'],
                ],
                [],
                RequestNotificationService::HISTORY_WIDTHS,
                [1],
            ),
            'approver.name' => 'Anong Wattana',
            'approver.position' => 'Manager',
            'approver.department' => 'Information Technology',
            'requester.name' => 'Manee Jaidee',
            'actor.name' => 'Anong Wattana',
            'step.label' => 'Department manager',
            'remark' => 'The licence is not available on the current agreement.',
            'employee.name' => 'Somchai Suksawat',
            'employee.code' => 'EMP-1042',
            'employee.position' => 'Asst. Manager',
            'employee.section' => 'System analyst',
            'employee.department' => 'Information Technology',
            'employee.working' => '01-09-2026',
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
            'digest.expiring_count' => 2,
            'digest.overdue_count' => 1,
            'digest.expiring_table' => EmailTable::render(
                ContractDigestService::HEADERS,
                [
                    [EmailTable::link('#', 'CT-2026-014'), 'Acme Co.', 'Annual support', '฿120,000.00', '29-09-2026', '90, 30, 7 days'],
                    [EmailTable::link('#', 'CT-2026-021'), 'Lenovo (Thailand)', 'Notebook rental', '฿1,450,000.00', '31-10-2026', '150, 60, 30 days'],
                ],
                ContractDigestService::NUMERIC,
                ContractDigestService::WIDTHS,
            ),
            'digest.overdue_table' => EmailTable::render(
                ContractDigestService::HEADERS,
                [
                    [EmailTable::link('#', 'CT-2025-008'), 'Microsoft', 'Microsoft 365 E3', '฿980,000.00', '25-08-2026', '30, 7 days'],
                ],
                ContractDigestService::NUMERIC,
                ContractDigestService::WIDTHS,
            ),            'digest.open_table' => EmailTable::render(
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
