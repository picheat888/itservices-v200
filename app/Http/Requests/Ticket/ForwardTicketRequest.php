<?php

// Forward: the staff member an in-progress case is handed to.

namespace App\Http\Requests\Ticket;

use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Ticket\TicketActionGuard;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ForwardTicketRequest extends FormRequest
{
    public function authorize(TicketActionGuard $guard): bool
    {
        $guard->assertCanForward($this->user(), $this->ticket());

        return true;
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

    public function assignee(): User
    {
        return User::findOrFail($this->validated('assignee_id'));
    }

    public function ticket(): Ticket
    {
        return $this->route('ticket');
    }
}
