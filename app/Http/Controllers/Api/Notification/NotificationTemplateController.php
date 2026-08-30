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
 * Reads need notifications.module, the same master the email templates use — they are two
 * halves of one decision about what the system says to people. Writes need the finer right
 * for the change being made. `messages()` is the exception: every signed-in user needs the
 * wording to render their own tray, so it is gated by nothing beyond being signed in and
 * returns only the strings.
 */
class NotificationTemplateController extends Controller
{
    /** Opening the page at all. */
    private function gate(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('notifications.module'), 403);
    }

    /** One of the module's finer rights, master included. */
    private function allow(Request $request, string $key): void
    {
        $this->gate($request);
        abort_unless((bool) $request->user()?->hasPermission($key), 403);
    }

    /**
     * Every bell, its catalogue description joined to its stored wording.
     *
     * `has_email` marks the notifications whose event ALSO sends a mail. The ones without it are the
     * only channel their event has: switching one of those off means nobody hears about that
     * event at all, which the row says out loud rather than leaving to be discovered. It is not
     * totalled into the stats — a count of them was only ever going to read 0 once every module
     * had mail, and the useful form of this is the warning beside the bell it applies to.
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
                // The counterpart, and the first thing to check when somebody reports that an
                // alert never arrived: a switched-off bell looks exactly like a broken one.
                'disabled' => $rows->where('enabled', false)->count(),
                'edited' => $rows->where('is_standard', false)->count(),
            ],
        ]);
    }

    /**
     * The email-template prefix that covers the same module, or null when no mail does.
     *
     * Spelled out rather than derived from the module name. The first attempt trimmed a
     * trailing "s" and turned `access` into `acce`, which happened to give the right answer
     * — there was no access mail then — for entirely the wrong reason.
     *
     * A hand-written map goes stale the moment a module gains its first template, and this
     * one did: `access` stayed null after access.offboarding shipped, so the one bell that
     * had just STOPPED being its event's only channel was the only one still flagged as it.
     * NotificationEmailPairingTest fails if an email prefix appears that nothing here claims.
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
            'access' => 'access',
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
        // Decided from what the save CHANGES, not from what was sent: the edit dialog posts
        // every field every time, so trusting the payload would let anyone who may reword
        // also flip the switch by resubmitting the row unchanged.
        $this->requireRightsFor($request, $bell, $standard, $data);
        $before = $bell->exists ? $bell->getOriginal() : [];
        $bell->fill($data)->save();
        NotificationCatalogue::forgetSwitches();

        AuditLog::record('Updated bell', $standard['name'], AuditLog::changes($before, $bell));

        return response()->json(['message' => 'success']);
    }

    /**
     * Demand a right per kind of change the save actually makes.
     *
     * `enabled` moving needs the toggle right; either message moving needs the edit right; a
     * save that changes nothing needs neither. A notification with no row yet is compared
     * against its catalogue standard, which is what the reader is seeing on screen.
     *
     * @param  array{name: string, message_en: string, message_th: string, enabled: bool}  $standard
     * @param  array<string, mixed>  $data
     */
    private function requireRightsFor(Request $request, NotificationTemplate $bell, array $standard, array $data): void
    {
        $currentEnabled = $bell->exists ? (bool) $bell->enabled : (bool) $standard['enabled'];
        $currentEn = $bell->exists ? $bell->message_en : $standard['message_en'];
        $currentTh = $bell->exists ? $bell->message_th : $standard['message_th'];

        if ((bool) $data['enabled'] !== $currentEnabled) {
            abort_unless((bool) $request->user()?->hasPermission('notifications.inapp_toggle'), 403);
        }
        if ($data['message_en'] !== $currentEn || $data['message_th'] !== $currentTh) {
            abort_unless((bool) $request->user()?->hasPermission('notifications.inapp_edit'), 403);
        }
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
        $this->allow($request, 'notifications.inapp_test');

        $standard = NotificationCatalogue::find($key);
        abort_if($standard === null, 404, 'No such notification.');

        $request->user()->notify(new NotificationTestNotification($key, $standard['module']));

        return response()->json(['message' => 'success']);
    }

    /** Put one notification back to its standard wording and its standard on/off state. */
    public function reset(Request $request, string $key): JsonResponse
    {
        // Reset rewrites the wording AND restores the standard on/off state, so it needs both.
        $this->allow($request, 'notifications.inapp_edit');
        abort_unless((bool) $request->user()?->hasPermission('notifications.inapp_toggle'), 403);

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
