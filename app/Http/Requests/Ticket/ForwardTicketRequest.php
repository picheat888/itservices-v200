<?php

// Forward: the staff member an in-progress case is handed to.

namespace App\Http\Requests\Ticket;

use Illuminate\Auth\Access\Response;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Validation\Rule;

class ForwardTicketRequest extends TicketActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canForward($this->user(), $this->ticket());
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'assignee_id' => ['required', Rule::exists('users', 'id'), Rule::notIn([$this->ticket()->assignee_id])],
        ];
    }

    // Who may receive the case, once the fields are valid
    protected function passedValidation(): void
    {
        $this->guard()->canReceive($this->assignee(), $this->ticket())->authorize();
    }
}
