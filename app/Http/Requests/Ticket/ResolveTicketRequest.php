<?php

// Close a case: complete or cancel, with the resolution the requester reads.

namespace App\Http\Requests\Ticket;

use App\Models\Ticket\Ticket;
use App\Services\Ticket\TicketActionGuard;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class ResolveTicketRequest extends FormRequest
{
    public function authorize(TicketActionGuard $guard): bool
    {
        $guard->assertWorksTheCase($this->user(), $this->ticket());

        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'mode' => ['required', 'in:complete,cancel'],
            'resolution' => ['required', 'string', 'min:10', 'max:5000'],
        ];
    }

    public function completes(): bool
    {
        return $this->validated('mode') === 'complete';
    }

    public function ticket(): Ticket
    {
        return $this->route('ticket');
    }
}
