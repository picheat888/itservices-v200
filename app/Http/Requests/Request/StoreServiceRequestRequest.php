<?php

namespace App\Http\Requests\Request;

use App\Enums\Request\RequestPriority;
use App\Enums\Request\RequestType;
use App\Support\RequestSchemas;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validation for submitting a new service request: the base fields every type
 * shares, plus the per-type `fields.*` rules derived from RequestSchemas — the
 * same catalog the New Request dialog renders from.
 */
class StoreServiceRequestRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('requests.submit');
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $rules = [
            'type' => ['required', Rule::enum(RequestType::class)],
            'title' => ['required', 'string', 'min:5', 'max:200'],
            'reason' => ['required', 'string', 'min:10', 'max:5000'],
            // The form no longer asks for these two; they stay accepted so an API
            // caller can still set them, and default on the service when absent.
            'priority' => ['sometimes', Rule::enum(RequestPriority::class)],
            'estimated_value' => ['nullable', 'string', 'max:120'],
            'fields' => ['array'],
        ];

        $type = RequestType::tryFrom((string) $this->input('type'));
        if ($type !== null) {
            $rules += RequestSchemas::rules($type);
        }

        return $rules;
    }
}
