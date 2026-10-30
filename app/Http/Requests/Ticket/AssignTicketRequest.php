<?php

// Assign: the staff member a dispatcher routes an open case to, and its priority.

namespace App\Http\Requests\Ticket;

use App\Enums\Ticket\TicketPriority;
use Illuminate\Auth\Access\Response;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Enum;

class AssignTicketRequest extends TicketActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canAssign($this->user(), $this->ticket());
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'assignee_id' => ['required', Rule::exists('users', 'id')],
            'priority' => [$this->unlessFromRequest('required'), new Enum(TicketPriority::class)],
        ];
    }

    // Who may receive the case, once the fields are valid
    protected function passedValidation(): void
    {
        $this->guard()->canAssignTo($this->user(), $this->assignee(), $this->ticket())->authorize();
    }

    public function priority(): ?TicketPriority
    {
        return $this->enum('priority', TicketPriority::class);
    }
}
