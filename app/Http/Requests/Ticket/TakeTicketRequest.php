<?php

// Take Case: the taker's priority, opening note and linked asset.

namespace App\Http\Requests\Ticket;

use App\Enums\Ticket\TicketPriority;
use App\Models\Ticket\Ticket;
use App\Services\Ticket\TicketActionGuard;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Enum;

class TakeTicketRequest extends FormRequest
{
    public function authorize(TicketActionGuard $guard): bool
    {
        $guard->assertCanTake($this->user(), $this->ticket());

        return true;
    }

    /**
     * A case opened from an approved request carries its own target, so priority is refused there.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'priority' => [$this->ticket()->serviceRequest()->exists() ? 'prohibited' : 'required', new Enum(TicketPriority::class)],
            'note' => ['nullable', 'string', 'max:2000'],
            'related_asset_id' => ['nullable', Rule::exists('assets', 'id')],
        ];
    }

    public function priority(): ?TicketPriority
    {
        return $this->validated('priority') !== null ? TicketPriority::from($this->validated('priority')) : null;
    }

    /** Leaving related_asset_id out keeps the asset the requester linked; null clears it. */
    public function keepsLinkedAsset(): bool
    {
        return ! array_key_exists('related_asset_id', $this->validated());
    }

    public function ticket(): Ticket
    {
        return $this->route('ticket');
    }
}
