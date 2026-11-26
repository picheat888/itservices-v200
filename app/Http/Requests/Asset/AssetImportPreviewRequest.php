<?php

// Validates the import preview upload: who may send it, the file and which kind (rented or purchased).

namespace App\Http\Requests\Asset;

use App\Support\AssetImportColumns;
use App\Support\Refusal;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AssetImportPreviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('assets.register');
    }

    /** @return list<callable> */
    public function after(): array
    {
        return [function (): void {
            $file = $this->file('file');
            if ($file !== null && strtolower($file->getClientOriginalExtension()) !== 'xlsx') {
                Refusal::fail('import_unreadable');
            }
        }];
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'max:5120'],
            'kind' => ['required', Rule::in(AssetImportColumns::KINDS)],
        ];
    }
}
