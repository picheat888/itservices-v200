<?php

namespace App\Http\Controllers\Api\Notification;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Notification\NotificationTemplate;
use App\Notifications\NotificationTestNotification;
use App\Support\EmailTemplates;
use App\Support\NotificationCatalogue;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The Notification tab of Email & Notifications: what each in-app alert says, and whether it fires.
 *
 * Reads and writes are gated by system.configure_notifications — the same permission the
 * email templates use, because they are two halves of one decision about what the system
 * says to people. `messages()` is the exception: every signed-in user needs the wording to
 * render their own tray, so it is gated by nothing beyond being signed in and returns only
 * the strings.
 */
class NotificationTemplateController extends Controller
{
    private function gate(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('system.configure_notifications'), 403);
    }

    /**
     * Every bell, its catalogue description joined to its stored wording.
     *
     * `has_email` marks the notifications whose event ALSO sends a mail. The ones without it are the
     * only channel their event has: switching one of those off means nobody hears about that
     * event at all, which the page says out loud rather than leaving to be discovered.
     */
    public function index(Request $request): JsonResponse
    {
        $this->gate($request);

        $stored = NotificationTemplate::get()->keyBy('key');
        $emailModules = collect(EmailTemplates::all())
            ->map(fn (array $template) => explode('.', $template['key'])[0])
            ->unique()
            ->all();

        $rows = collect(NotificationCatalogue::all())->map(function (array $bell) use ($stored, $emailModules) {
            $row = $stored->get($bell['key']);

            return [
                'key' => $bell['key'],
                'module' => $bell['module'],
                // name / trigger / audience are deliberately NOT sent: they are UI text, and
                // the SPA holds them per language (notification_name_* / _when_ / _who_).
                // The catalogue keeps its English copy for the audit log, which is written
                // server-side and has no reader's language to write in.
                'message_en' => $row?->message_en ?? $bell['message_en'],
                'message_th' => $row?->message_th ?? $bell['message_th'],
                'enabled' => $row ? $row->enabled : $bell['enabled'],
                'last_sent_at' => $row?->last_sent_at?->toIso8601String(),
                'is_standard' => $row === null
                    || ($row->message_en === $bell['message_en'] && $row->message_th === $bell['message_th']),
                'has_email' => in_array($this->emailPrefixFor($bell['module']), $emailModules, true),
            ];
        })->values();

        return response()->json([
            'data' => $rows,
            'stats' => [
                'total' => $rows->count(),
                'enabled' => $rows->where('enabled', true)->count(),
                'edited' => $rows->where('is_standard', false)->count(),
                'only_channel' => $rows->where('has_email', false)->count(),
            ],
        ]);
    }

    /**
     * The email-template prefix that covers the same module, or null when no mail does.
     *
     * Spelled out rather than derived from the module name. The first attempt trimmed a
     * trailing "s" and turned `access` into `acce`, which happened to give the right answer
     * — there is no access mail — for entirely the wrong reason, and would have gone on
     * being wrong the moment one was added.
     */
    private function emailPrefixFor(string $module): ?string
    {
        return [
            'employees' => 'employee',
            'contracts' => 'contract',
            'requests' => 'request',
            'assets' => 'asset',
            'tickets' => 'ticket',
            'stock' => 'stock',
            // Access has no mail of its own: a leaver's access is announced by the notification alone.
            'access' => null,
        ][$module] ?? null;
    }

    /**
     * The wording every signed-in user needs to render their own notification tray.
     *
     * Only enabled-or-not and the two strings — no catalogue description, no stats — so this
     * carries nothing an ordinary user has no business seeing. The SPA falls back to its own
     * bundled text when a key is missing, so a failure here degrades to the standard wording
     * rather than to an empty tray.
     *
     * @return JsonResponse<array{data: array<string, array{en: string, th: string}>}>
     */
    public function messages(): JsonResponse
    {
        $overrides = NotificationTemplate::get()
            ->mapWithKeys(fn (NotificationTemplate $bell) => [$bell->key => ['en' => $bell->message_en, 'th' => $bell->message_th]])
            ->all();

        return response()->json(['data' => $overrides]);
    }

    /** Reword a notification, or switch it on and off. */
    public function update(Request $request, string $key): JsonResponse
    {
        $this->gate($request);

        $standard = NotificationCatalogue::find($key);
        abort_if($standard === null, 404, 'No such bell.');

        $data = $request->validate([
            'message_en' => ['required', 'string', 'max:300'],
            'message_th' => ['required', 'string', 'max:300'],
            'enabled' => ['required', 'boolean'],
        ]);

        $bell = NotificationTemplate::firstOrNew(['key' => $key]);
        $before = $bell->exists ? $bell->getOriginal() : [];
        $bell->fill($data)->save();
        NotificationCatalogue::forgetSwitches();

        AuditLog::record('Updated bell', $standard['name'], AuditLog::changes($before, $bell));

        return response()->json(['message' => 'success']);
    }

    /**
     * Send yourself a copy, so the wording can be read where it will actually be read.
     *
     * It lands in your own tray as a real row — the same trip an ordinary notification makes —
     * rather than a rendering of one. A switched-off notification still tests: that is the
     * moment you most want to see what you are about to turn back on.
     */
    public function test(Request $request, string $key): JsonResponse
    {
        $this->gate($request);

        $standard = NotificationCatalogue::find($key);
        abort_if($standard === null, 404, 'No such notification.');

        $request->user()->notify(new NotificationTestNotification($key, $standard['module']));

        return response()->json(['message' => 'success']);
    }

    /** Put one notification back to its standard wording and its standard on/off state. */
    public function reset(Request $request, string $key): JsonResponse
    {
        $this->gate($request);

        $standard = NotificationCatalogue::find($key);
        abort_if($standard === null, 404, 'No such bell.');

        NotificationTemplate::updateOrCreate(['key' => $key], [
            'message_en' => $standard['message_en'],
            'message_th' => $standard['message_th'],
            'enabled' => $standard['enabled'],
        ]);
        NotificationCatalogue::forgetSwitches();

        AuditLog::record('Reset bell to standard', $standard['name']);

        return response()->json(['message' => 'success']);
    }
}
