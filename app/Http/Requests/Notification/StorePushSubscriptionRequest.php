<?php

// Validates the browser's PushSubscription JSON (endpoint + keys) sent by the SPA.

namespace App\Http\Requests\Notification;

use App\Support\PushEndpoint;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

class StorePushSubscriptionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'endpoint' => ['required', 'url', 'starts_with:https://', 'max:500', $this->onPushService(...)],
            'keys.p256dh' => ['required', 'string', 'max:255'],
            'keys.auth' => ['required', 'string', 'max:255'],
            'content_encoding' => ['nullable', 'in:aesgcm,aes128gcm'],
        ];
    }

    private function onPushService(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! PushEndpoint::isAllowed($value)) {
            $fail('The endpoint must be a browser push service address.');
        }
    }
}
