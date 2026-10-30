<?php

// Take Case: the taker's priority, opening note and linked asset.

namespace App\Http\Requests\Ticket;

use App\Enums\Ticket\TicketPriority;
use Illuminate\Auth\Access\Response;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Enum;

class TakeTicketRequest extends TicketActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canTake($this->user(), $this->ticket());
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'priority' => [$this->unlessFromRequest('required'), new Enum(TicketPriority::class)],
            'note' => ['nullable', 'string', 'max:2000'],
            'related_asset_id' => ['nullable', Rule::exists('assets', 'id')],
        ];
    }

    public function priority(): ?TicketPriority
    {
        return $this->enum('priority', TicketPriority::class);
    }

    /** Leaving related_asset_id out keeps the asset the requester linked; null clears it. */
    public function keepsLinkedAsset(): bool
    {
        return ! array_key_exists('related_asset_id', $this->validated());
    }
}
