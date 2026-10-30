<?php

// Base for the custody actions on one asset or a picked set of them (hand over, recall, receive, relocate, retire).

namespace App\Http\Requests\Asset;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Services\Asset\AssetActionGuard;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

abstract class AssetActionRequest extends FormRequest
{
    /** @var Collection<int, Asset>|null */
    private ?Collection $picked = null;

    public function asset(): Asset
    {
        return $this->route('asset');
    }

    /**
     * The assets a bulk action was given, loaded once.
     *
     * @return Collection<int, Asset>
     */
    public function assets(): Collection
    {
        return $this->picked ??= Asset::whereIn('id', $this->validated('ids'))->get();
    }

    protected function guard(): AssetActionGuard
    {
        return $this->container->make(AssetActionGuard::class);
    }

    /** @return array<string, list<string>> */
    protected function idsRules(): array
    {
        return [
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'exists:assets,id'],
        ];
    }

    /** @return list<mixed> */
    protected function warehouseRule(): array
    {
        return ['required', 'string', 'max:120', Rule::exists('warehouses', 'name')];
    }

    /**
     * Employee mode names a real employee who has not resigned, even before their last day:
     * their kit is already being recalled. Shared mode names a short free-text label.
     *
     * @return array<string, list<mixed>>
     */
    protected function handOverRules(): array
    {
        return [
            'mode' => ['required', 'in:employee,shared'],
            'owner_employee_id' => ['required_if:mode,employee', 'integer', 'exists:employees,id', function (string $attribute, mixed $value, \Closure $fail): void {
                if (Employee::whereKey($value)->where('status', EmployeeStatus::Resigned)->exists()) {
                    $fail('recipient_resigned');
                }
            }],
            'owner_label' => ['required_if:mode,shared', 'string', 'max:200'],
            // IT records where the asset physically goes
            'location_id' => ['required', 'integer', 'exists:locations,id'],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }
}
