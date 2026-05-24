<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\EmailTemplateResource;
use App\Models\AuditLog;
use App\Models\EmailLog;
use App\Models\EmailTemplate;
use App\Services\EmailNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

        $sentTotal   = EmailLog::where('status', 'sent')->count();
        $failedTotal = EmailLog::where('status', 'failed')->count();
        $attempts    = $sentTotal + $failedTotal;

        return response()->json([
            'data'  => EmailTemplateResource::collection($templates),
            'stats' => [
                'templates'     => $templates->count(),
                'enabled'       => $templates->where('enabled', true)->count(),
                'sent_today'    => EmailLog::where('status', 'sent')->whereDate('created_at', today())->count(),
                'delivery_rate' => $attempts > 0 ? round($sentTotal / $attempts * 100, 1) : null,
            ],
        ]);
    }

    /** Creates a new template. */
    public function store(Request $request): JsonResponse
    {
        $this->gate($request);

        $data = $request->validate([
            'key'       => ['required', 'string', 'max:100', 'unique:email_templates,key'],
            'name'      => ['required', 'string', 'max:150'],
            'subject'   => ['required', 'string', 'max:255'],
            'body_html' => ['required', 'string'],
            'enabled'   => ['sometimes', 'boolean'],
        ]);

        $template = EmailTemplate::create($data);
        AuditLog::record('Created email template', $template->name);

        return (new EmailTemplateResource($template))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Updates a template — used for both inline enable toggle and full edit. */
    public function update(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->gate($request);

        $data = $request->validate([
            'name'      => ['sometimes', 'string', 'max:150'],
            'subject'   => ['sometimes', 'string', 'max:255'],
            'body_html' => ['sometimes', 'string'],
            'enabled'   => ['sometimes', 'boolean'],
        ]);

        $emailTemplate->update($data);
        AuditLog::record('Updated email template', $emailTemplate->name);

        return (new EmailTemplateResource($emailTemplate))->additional(['message' => 'success'])->response();
    }

    /** Sends a test render of one template to the current user (synchronous). */
    public function test(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->gate($request);

        $to = $request->user()->email;
        if (! $to) {
            return response()->json(['message' => 'Your account has no email address.'], 422);
        }

        $vars = [
            'user.first_name' => explode(' ', (string) $request->user()->name)[0] ?? 'there',
            'user.email'      => $to,
            'ticket.id'       => 'TKT-0001',
            'ticket.subject'  => 'Sample ticket',
            'contract.vendor' => 'Sample Vendor',
            'reference.id'    => 'REF-0001',
            'employee.name'   => 'Sample Employee',
            'employee.code'   => 'EMP-0001',
        ];

        $subject = $this->service->render($emailTemplate->subject, $vars);
        $html    = $this->service->render($emailTemplate->body_html, $vars);
        $ok      = $this->service->deliver($to, $subject, $html, $emailTemplate->key);

        return response()->json(['message' => $ok ? 'success' : 'failed', 'sent' => $ok], $ok ? 200 : 502);
    }
}
