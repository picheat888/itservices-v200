<?php

// Assign: the staff member a dispatcher routes an open case to, and its priority.

namespace App\Http\Requests\Ticket;

use App\Enums\Ticket\TicketPriority;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Ticket\TicketActionGuard;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Enum;

class AssignTicketRequest extends FormRequest
{
    public function authorize(TicketActionGuard $guard): bool
    {
        $guard->assertCanAssign($this->user(), $this->ticket());

        return true;
    }

    /**
     * Same rule as Take Case: a request-born case is never given a priority.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'assignee_id' => ['required', Rule::exists('users', 'id')],
            'priority' => [$this->ticket()->serviceRequest()->exists() ? 'prohibited' : 'required', new Enum(TicketPriority::class)],
        ];
    }

    public function assignee(): User
    {
        return User::findOrFail($this->validated('assignee_id'));
    }

    public function priority(): ?TicketPriority
    {
        return $this->validated('priority') !== null ? TicketPriority::from($this->validated('priority')) : null;
    }

    public function ticket(): Ticket
    {
        return $this->route('ticket');
    }
}
