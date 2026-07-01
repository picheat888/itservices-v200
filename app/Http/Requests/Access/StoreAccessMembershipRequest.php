<?php

namespace App\Http\Requests\Access;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAccessMembershipRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('access.manage');
    }

    protected function prepareForValidation(): void
    {
        // resource type derived from the route name prefix (email-groups|file-shares|social-platforms)
        $path = $this->path();
        $type = str_contains($path, 'email-groups') ? 'email_group'
            : (str_contains($path, 'file-shares') ? 'file_share' : 'social_platform');
        $this->merge(['_resource_type' => $type]);
    }

    public function rules(): array
    {
        // The controller sets $this->resourceType before validation (see Task 6).
        $type = $this->input('_resource_type');
        $levels = match ($type) {
            'email_group' => ['Owner', 'Member'],
            'file_share' => ['Full', 'Write', 'Read'],
            default => [],
        };

        return [
            'employee_id' => ['required', 'exists:employees,id'],
            'access_level' => $levels ? ['required', Rule::in($levels)] : ['nullable'],
            'purpose' => ['nullable', 'string', 'max:255'],
            'granted_at' => ['nullable', 'date'],
        ];
    }
}
