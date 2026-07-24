<?php

namespace App\Http\Requests\Access;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAccessMembershipRequest extends FormRequest
{
    /** Member management is covered by the registry's edit key. */
    public function authorize(): bool
    {
        $key = match (true) {
            $this->route('emailGroup') !== null => 'access.email_edit',
            $this->route('fileShare') !== null => 'access.file_edit',
            $this->route('socialPlatform') !== null => 'access.social_edit',
            default => 'access.software_edit',
        };

        return (bool) $this->user()?->hasPermission($key);
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
        // Email-group owner now lives on the group (owner_employee_id / setOwner), so its
        // members carry no level — only file shares still use graded access levels.
        $levels = match ($type) {
            'file_share' => ['Write', 'Read'],
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
