<?php

// Settings -> Request data: a new choice, checked as fields, then as a declared list, then as a label unique in that list.

namespace App\Http\Requests\Settings;

use App\Support\RequestSchemas;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;
use Illuminate\Validation\ValidationException;

class StoreRequestOptionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        // Only lists the schema declares as managed may be written to
        $lists = $this->managedLists();

        return [
            'request_type' => ['required', 'string', Rule::in($lists->pluck('request_type')->unique()->all())],
            'field_key' => ['required', 'string', Rule::in($lists->pluck('field_key')->unique()->all())],
            'label_en' => ['required', 'string', 'max:120'],
            'label_th' => ['nullable', 'string', 'max:120'],
            'active' => ['nullable', 'boolean'],
        ];
    }

    /** The pair check, then the label's uniqueness inside that list, each only after the step before passed. */
    protected function passedValidation(): void
    {
        $type = $this->validated('request_type');
        $field = $this->validated('field_key');

        if (! $this->managedLists()->contains(fn (array $list) => $list['request_type'] === $type && $list['field_key'] === $field)) {
            throw ValidationException::withMessages(['field_key' => 'request_option_list_unknown']);
        }

        Validator::make($this->all(), ['label_en' => [self::uniqueLabel($type, $field)]])->validate();
    }

    /** "This choice already exists in this list", scoped to the one list. */
    public static function uniqueLabel(string $type, string $field): Unique
    {
        return Rule::unique('request_options', 'label_en')
            ->where(fn ($q) => $q->where('request_type', $type)->where('field_key', $field));
    }

    /** @return Collection<int, array<string, mixed>> */
    private function managedLists(): Collection
    {
        return collect(RequestSchemas::managedLists());
    }
}
