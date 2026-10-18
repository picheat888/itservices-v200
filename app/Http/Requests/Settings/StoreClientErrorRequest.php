<?php

namespace App\Http\Requests\Settings;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

// A browser error reported by the SPA; open to guests so a broken login page still reports.
class StoreClientErrorRequest extends FormRequest
{
    public const KINDS = ['error', 'rejection', 'render', 'chunk'];

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'kind' => ['required', 'string', 'in:'.implode(',', self::KINDS)],
            'message' => ['required', 'string', 'max:1000'],
            'stack' => ['nullable', 'string', 'max:5000'],
            'source' => ['nullable', 'string', 'max:300'],
            'url' => ['nullable', 'string', 'max:500'],
            'request_id' => ['nullable', 'string', 'max:64'],
        ];
    }
}
