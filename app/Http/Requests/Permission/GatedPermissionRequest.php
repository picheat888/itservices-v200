<?php

// Base for the permission admin endpoints: one permission key gates the request, and a refusal is a bare 403 like abort(403).

namespace App\Http\Requests\Permission;

use Illuminate\Foundation\Http\FormRequest;

abstract class GatedPermissionRequest extends FormRequest
{
    /** The permission key the caller must hold. */
    abstract protected function gate(): string;

    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission($this->gate());
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    protected function failedAuthorization(): never
    {
        abort(403);
    }
}
