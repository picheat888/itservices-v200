<?php

namespace App\Http\Requests\Ticket;

use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketStatus;
use App\Models\Ticket\Ticket;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Enum;

class UpdateTicketRequest extends FormRequest
{
    /**
     * IT staff (tickets.view_all) may correct any ticket's descriptive fields.
     * The requester may fix their own ticket only while it is still Open — before
     * an IT staff picks it up. Super bypasses via hasPermission.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        if ($user === null) {
            return false;
        }
        if ($user->hasPermission('tickets.view_all')) {
            return true;
        }

        $ticket = $this->route('ticket');

        return $ticket instanceof Ticket
            && $ticket->requester_id === $user->employee_id
            && $ticket->status === TicketStatus::Open;
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
