<?php

namespace App\Http\Requests\Request;

use App\Enums\Request\RequestType;
use App\Services\Request\RequestAttachmentService;
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
        $user = $this->user();
        if (! $user?->hasPermission('requests.submit')) {
            return false;
        }

        // An unknown or missing type is left to rules(), so it answers 422 rather than 403.
        $type = $this->submittedType();

        return $type === null || $user->hasPermission("requests.submit_{$type->value}");
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        // No title rule: the server composes it (RequestService::canonicalTitle).
        $rules = [
            'type' => ['required', Rule::enum(RequestType::class)],
            'reason' => ['required', 'string', 'min:10', 'max:5000'],
            'fields' => ['array'],
            // Files ride with the submit; a later upload call could skip RequestSchemas::attachmentsRequired
            'files' => ['array', 'max:'.RequestAttachmentService::MAX_FILES],
            'files.*' => ['file', 'mimes:'.RequestAttachmentService::ALLOWED_EXTENSIONS, 'max:'.RequestAttachmentService::MAX_SIZE_KB],
        ];

        $type = $this->submittedType();
        if ($type !== null) {
            $rules += RequestSchemas::rules($type);
            if (RequestSchemas::attachmentsRequired($type)) {
                array_unshift($rules['files'], 'required');
            }
        }

        return $rules;
    }

    /** The submitted type, or null when it is missing, unknown or not text. */
    private function submittedType(): ?RequestType
    {
        $type = $this->input('type');

        return is_string($type) ? RequestType::tryFrom($type) : null;
    }
}
