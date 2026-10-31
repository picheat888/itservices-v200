<?php

namespace App\Http\Controllers\Api\Notification;

use App\Http\Controllers\Controller;
use App\Models\Notification\NotificationTemplate;
use App\Notifications\NotificationTestNotification;
use App\Services\Notification\NotificationTemplateService;
use App\Support\NotificationCatalogue;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The Notification tab of Email & Notifications. Reads need notifications.module, writes the finer right for the
 * change; messages() only needs a signed-in user (every tray renders from it).
 */
class NotificationTemplateController extends Controller
{
    public function __construct(private readonly NotificationTemplateService $bells) {}

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

    /** Every bell, its catalogue description joined to its stored wording. */
    public function index(Request $request): JsonResponse
    {
        $this->gate($request);

        $rows = $this->bells->rows();

        return response()->json(['data' => $rows, 'stats' => $this->bells->stats($rows)]);
    }

    /**
     * The wording every signed-in user needs to render their own notification tray.
     *
     * @return JsonResponse<array{data: array<string, array{en: string, th: string}>}>
     */
    public function messages(): JsonResponse
    {
        return response()->json(['data' => $this->bells->messages()]);
    }

    /** Reword a notification, or switch it on and off; the rights come from what the save changes. */
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
        foreach ($this->bells->requiredRights($bell, $standard, $data) as $right) {
            abort_unless((bool) $request->user()?->hasPermission($right), 403);
        }
        $this->bells->save($bell, $standard, $data);

        return response()->json(['message' => 'success']);
    }

    /** Send yourself a real copy into your own tray; a switched-off notification still tests. */
    public function test(Request $request, string $key): JsonResponse
    {
        $this->allow($request, 'notifications.inapp_test');

        $standard = NotificationCatalogue::find($key);
        abort_if($standard === null, 404, 'No such notification.');

        $request->user()->notify(new NotificationTestNotification($key, $standard['module']));

        return response()->json(['message' => 'success']);
    }

    /** Back to the standard wording and on/off state, so it needs both rights. */
    public function reset(Request $request, string $key): JsonResponse
    {
        $this->allow($request, 'notifications.inapp_edit');
        abort_unless((bool) $request->user()?->hasPermission('notifications.inapp_toggle'), 403);

        $standard = NotificationCatalogue::find($key);
        abort_if($standard === null, 404, 'No such bell.');

        $this->bells->reset($key, $standard);

        return response()->json(['message' => 'success']);
    }
}
