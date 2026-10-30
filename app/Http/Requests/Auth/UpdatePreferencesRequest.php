<?php

// The signed-in account's own UI preferences (theme, language, density, corners, sidebar, accent).

namespace App\Http\Requests\Auth;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class UpdatePreferencesRequest extends FormRequest
{
    /** Preferences the login screen can set, so they save while a password change is owed. */
    private const WALL_PREFERENCES = ['dark', 'lang', 'sidebar'];

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'dark' => ['sometimes', 'boolean'],
            'lang' => ['sometimes', 'in:en,th'],
            'density' => ['sometimes', 'in:compact,normal,cozy'],
            'radius' => ['sometimes', 'integer', 'min:0', 'max:20'],
            'sidebar' => ['sometimes', 'in:labeled,icons'],
            'accent' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ];
    }

    /** Behind the password wall only what the login screen can change gets through. */
    protected function passedValidation(): void
    {
        $user = $this->user();
        $owesPassword = $user->must_change_password || $user->isPasswordExpired();
        if ($owesPassword && array_diff(array_keys($this->validated()), self::WALL_PREFERENCES) !== []) {
            throw new HttpResponseException(response()->json(['message' => 'password_expired'], 403));
        }
    }
}
