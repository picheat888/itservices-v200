<?php

// Base for the desk actions on one ticket (take, assign, forward, resolve, progress note).

namespace App\Http\Requests\Ticket;

use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Ticket\TicketActionGuard;
use Illuminate\Foundation\Http\FormRequest;

abstract class TicketActionRequest extends FormRequest
{
    private ?User $assignee = null;

    public function ticket(): Ticket
    {
        return $this->route('ticket');
    }

    /** The staff member picked in Assign or Forward. */
    public function assignee(): User
    {
        return $this->assignee ??= User::findOrFail($this->validated('assignee_id'));
    }

    protected function guard(): TicketActionGuard
    {
        return $this->container->make(TicketActionGuard::class);
    }

    /** A request-born case carries its own target, so priority and work class are refused on it. */
    protected function unlessFromRequest(string $rule): string
    {
        return $this->ticket()->serviceRequest()->exists() ? 'prohibited' : $rule;
    }
}
