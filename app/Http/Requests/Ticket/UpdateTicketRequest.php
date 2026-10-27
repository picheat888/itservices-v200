<?php

namespace App\Http\Requests\Ticket;

use App\Enums\Ticket\TicketCategory;
use App\Models\Ticket\Ticket;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Enum;

class UpdateTicketRequest extends FormRequest
{
    /** Only the opener edits, while the case is Open (Ticket::isEditableBy). */
    public function authorize(): bool
    {
        $user = $this->user();
        $ticket = $this->route('ticket');

        return $user !== null && $ticket instanceof Ticket && $ticket->isEditableBy($user);
    }

    /**
     * Only the descriptive fields are editable — workflow fields (priority, status,
     * assignee) change through take / assign / resolve, not here. Mirrors the store rules.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'subject' => ['required', 'string', 'min:5', 'max:200'],
            'description' => ['required', 'string', 'min:10', 'max:5000'],
            'category' => ['required', new Enum(TicketCategory::class)],
            // At least 3 digits — internal extensions can be short (e.g. 123).
            'callback_phone' => ['required', 'string', 'max:60', 'regex:/(\D*\d){3,}/'],
        ];
    }
}
