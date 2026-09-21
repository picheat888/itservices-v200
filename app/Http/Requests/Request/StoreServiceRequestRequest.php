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
        return (bool) $this->user()?->hasPermission('requests.submit');
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        // No `title` rule on purpose: it is derived from the type, so the server composes
        // it (RequestService::canonicalTitle) and anything a client sends is dropped by
        // validated(). It used to be required, and the wizard filled it with its own
        // rendering — which is how the stored title ended up in the requester's language.
        $rules = [
            'type' => ['required', Rule::enum(RequestType::class)],
            'reason' => ['required', 'string', 'min:10', 'max:5000'],
            'fields' => ['array'],
            // Files ride along with the submit rather than following it, because a
            // service that requires one (see RequestSchemas::attachmentsRequired)
            // cannot be held to that rule by a second call that may never arrive.
            'files' => ['array', 'max:'.RequestAttachmentService::MAX_FILES],
            'files.*' => ['file', 'mimes:'.RequestAttachmentService::ALLOWED_EXTENSIONS, 'max:'.RequestAttachmentService::MAX_SIZE_KB],
        ];

        $type = RequestType::tryFrom((string) $this->input('type'));
        if ($type !== null) {
            $rules += RequestSchemas::rules($type);
            if (RequestSchemas::attachmentsRequired($type)) {
                array_unshift($rules['files'], 'required');
            }
        }

        return $rules;
    }
}
