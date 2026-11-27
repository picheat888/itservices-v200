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
    /** Largest upload; a bigger file is refused as import_too_large. */
    private const MAX_KILOBYTES = 5120;

    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('assets.register');
    }

    /** @return list<callable> */
    public function after(): array
    {
        return [function (): void {
            $file = $this->file('file');
            if ($file !== null && $file->getSize() > self::MAX_KILOBYTES * 1024) {
                Refusal::fail('import_too_large');
            }
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
            'file' => ['required', 'file'],
            'kind' => ['required', Rule::in(AssetImportColumns::KINDS)],
        ];
    }
}
