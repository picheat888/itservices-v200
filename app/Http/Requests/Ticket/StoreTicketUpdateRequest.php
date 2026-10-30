<?php

// Progress note on a case in flight, optionally moving it to another kind of work.

namespace App\Http\Requests\Ticket;

use App\Enums\Ticket\TicketWorkClass;
use Illuminate\Auth\Access\Response;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Validation\Rules\Enum;

class StoreTicketUpdateRequest extends TicketActionRequest
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
            'body' => ['required', 'string', 'min:5', 'max:5000'],
            'work_class' => [$this->unlessFromRequest('sometimes'), new Enum(TicketWorkClass::class)],
        ];
    }

    // Moving the case to another kind of work, once the fields are valid
    protected function passedValidation(): void
    {
        if ($this->reclassifies()) {
            $this->guard()->canReclassify($this->user(), $this->ticket(), $this->workClass())->authorize();
        }
    }

    public function workClass(): ?TicketWorkClass
    {
        return $this->enum('work_class', TicketWorkClass::class);
    }

    public function reclassifies(): bool
    {
        $class = $this->workClass();

        return $class !== null && $class !== $this->ticket()->work_class;
    }
}
