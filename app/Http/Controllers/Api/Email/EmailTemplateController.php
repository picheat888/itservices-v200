<?php

namespace App\Http\Controllers\Api\Email;

use App\Http\Controllers\Controller;
use App\Http\Resources\Email\EmailTemplateResource;
use App\Models\Email\EmailTemplate;
use App\Services\Email\EmailTemplateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** The email template page. No store(): templates arrive with the code that sends them (App\Support\EmailTemplates). */
class EmailTemplateController extends Controller
{
    public function __construct(private readonly EmailTemplateService $templates) {}

    /** Opening the page at all. Every read below needs this and nothing more. */
    private function gate(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('notifications.module'), 403);
    }

    /** One of the module's finer rights, master included (rewording and switching off are separate rights). */
    private function allow(Request $request, string $key): void
    {
        $this->gate($request);
        abort_unless((bool) $request->user()?->hasPermission($key), 403);
    }

    /** Returns all templates plus the header stats. */
    public function index(Request $request): JsonResponse
    {
        $this->gate($request);

        $templates = $this->templates->templates();

        return response()->json([
            'data' => EmailTemplateResource::collection($templates),
            'stats' => $this->templates->stats($templates),
            'mail' => $this->templates->fromIdentity(),
        ]);
    }

    /** Inline switch and full edit; the rights come from what the save changes, not from what the form sent. */
    public function update(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->gate($request);

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:150'],
            'subject' => ['sometimes', 'required', 'string', 'max:255'],
            'body_html' => ['sometimes', 'required', 'string', fn ($attribute, $value, $fail) => strlen((string) $value) > 65535 ? $fail('body_too_long') : null],
            'enabled' => ['sometimes', 'boolean'],
        ]);

        foreach ($this->templates->requiredRights($emailTemplate, $data) as $right) {
            abort_unless((bool) $request->user()?->hasPermission($right), 403);
        }

        $this->templates->update($emailTemplate, $data);

        return (new EmailTemplateResource($emailTemplate))->additional(['message' => 'success'])->response();
    }

    /** Restores one template to its standard; 422 when it has none. Rewrites wording and switch, so it needs both rights. */
    public function reset(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->allow($request, 'notifications.email_edit');
        abort_unless((bool) $request->user()?->hasPermission('notifications.email_toggle'), 403);

        if (! $this->templates->reset($emailTemplate)) {
            return response()->json(['message' => 'This template has no standard to reset to.'], 422);
        }

        return (new EmailTemplateResource($emailTemplate))->additional(['message' => 'success'])->response();
    }

    /** Restores every standard template in one pass. */
    public function resetAll(Request $request): JsonResponse
    {
        $this->allow($request, 'notifications.email_edit');
        abort_unless((bool) $request->user()?->hasPermission('notifications.email_toggle'), 403);

        return response()->json(['message' => 'success', 'reset' => $this->templates->resetAll()]);
    }

    /** Sends a test render to the current user, from the editor's unsaved wording when posted (synchronous). */
    public function test(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->allow($request, 'notifications.email_test');

        $draft = $request->validate([
            'name' => ['sometimes', 'nullable', 'string', 'max:150'],
            'subject' => ['sometimes', 'nullable', 'string', 'max:255'],
            'body_html' => ['sometimes', 'nullable', 'string'],
        ]);
        // A cleared field in the editor falls back to the saved wording
        $draft = array_filter($draft, 'filled');

        $to = $request->user()->email;
        if (! $to) {
            return response()->json(['message' => 'Your account has no email address.'], 422);
        }

        $ok = $this->templates->sendTest($emailTemplate, $draft, $request->user(), $to);

        // 200 either way: a failed delivery is the answer, not a server fault; the caller reads `sent`
        return response()->json([
            'message' => $ok ? 'success' : 'failed',
            'sent' => $ok,
        ]);
    }

    /** Live preview of unsaved editor content, drawn at the saved template's width. */
    public function renderPreview(Request $request): Response
    {
        $this->gate($request);

        $data = $request->validate([
            'key' => ['nullable', 'string', 'max:100'],
            'name' => ['nullable', 'string', 'max:150'],
            'subject' => ['nullable', 'string', 'max:255'],
            'body_html' => ['nullable', 'string'],
        ]);

        return response($this->templates->preview($data, $request->user()))->header('Content-Type', 'text/html');
    }
}
