<?php

// Progress note on a case in flight, optionally moving it to another kind of work.

namespace App\Http\Requests\Ticket;

use App\Enums\Ticket\TicketWorkClass;
use App\Models\Ticket\Ticket;
use App\Services\Ticket\TicketActionGuard;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Enum;

class StoreTicketUpdateRequest extends FormRequest
{
    public function authorize(TicketActionGuard $guard): bool
    {
        $guard->assertWorksTheCase($this->user(), $this->ticket());

        return true;
    }

    /**
     * A request-born case already has a target decided by what was asked for, so its kind of
     * work is refused rather than merely hidden, the same as priority.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'body' => ['required', 'string', 'min:5', 'max:5000'],
            'work_class' => [$this->ticket()->serviceRequest()->exists() ? 'prohibited' : 'sometimes', new Enum(TicketWorkClass::class)],
        ];
    }

    public function workClass(): ?TicketWorkClass
    {
        return $this->validated('work_class') !== null ? TicketWorkClass::from($this->validated('work_class')) : null;
    }

    public function ticket(): Ticket
    {
        return $this->route('ticket');
    }
}
