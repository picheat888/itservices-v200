<?php

// Validates the template download: who may fetch it and which kind (rented or purchased).

namespace App\Http\Requests\Asset;

use App\Support\AssetImportColumns;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AssetImportTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('assets.register');
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return ['kind' => ['required', Rule::in(AssetImportColumns::KINDS)]];
    }
}
