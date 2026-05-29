<?php

namespace App\Http\Requests;

use App\Enums\TicketCategory;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Enum;

class StoreTicketRequest extends FormRequest
{
    /** Anyone with tickets.create may raise a ticket (super bypasses). */
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('tickets.create');
    }

    /**
     * Validation mirrors the create drawer: a meaningful subject and description,
     * a known category, and a callback phone the IT team can reach.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'subject' => ['required', 'string', 'min:5', 'max:200'],
            'subject_th' => ['nullable', 'string', 'max:200'],
            'description' => ['required', 'string', 'min:10', 'max:5000'],
            'category' => ['required', new Enum(TicketCategory::class)],
            'callback_phone' => ['required', 'string', 'max:60'],
            'related_asset_id' => ['nullable', Rule::exists('assets', 'id')],
        ];
    }
}
