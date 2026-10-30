<?php

// Close a case: complete or cancel, with the resolution the requester reads.

namespace App\Http\Requests\Ticket;

use Illuminate\Auth\Access\Response;
use Illuminate\Contracts\Validation\ValidationRule;

class ResolveTicketRequest extends TicketActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canWork($this->user(), $this->ticket());
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
}
