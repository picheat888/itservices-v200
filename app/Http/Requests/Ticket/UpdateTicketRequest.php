<?php

namespace App\Http\Requests\Ticket;

use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketStatus;
use App\Models\Ticket\Ticket;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Enum;

class UpdateTicketRequest extends FormRequest
{
    /**
     * Only the ticket's requester (open-by) may edit it — gated by tickets.edit_own —
     * and only while it is still Open, before an IT staff picks it up. There is NO
     * admin/super requester-override: a case's content belongs to its opener, and
     * once taken any correction happens through the workflow (take note / resolution).
     *
     * A case a service request opened is nobody's to edit, its own requester included.
     * Its subject carries the reference and its body carries the typed fields somebody
     * approved; rewriting either would leave the approval standing behind words that
     * were never agreed. The same reasoning already keeps such a case out of work-class
     * classification (see TicketResource) — it is the request that is authoritative,
     * and a request that needs changing is cancelled and filed again.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        $ticket = $this->route('ticket');

        return $user !== null
            && $user->hasPermission('tickets.edit_own')
            && $ticket instanceof Ticket
            && $ticket->requester_id === $user->employee_id
            && $ticket->status === TicketStatus::Open
            && $ticket->serviceRequest === null;
    }

    /**
     * Only the descriptive fields are editable — workflow fields (priority, status,
     * assignee) change through take / assign / resolve, not here. Mirrors the store rules.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'subject' => ['required', 'string', 'min:5', 'max:200'],
            'description' => ['required', 'string', 'min:10', 'max:5000'],
            'category' => ['required', new Enum(TicketCategory::class)],
            // At least 3 digits — internal extensions can be short (e.g. 123).
            'callback_phone' => ['required', 'string', 'max:60', 'regex:/(\D*\d){3,}/'],
        ];
    }
}
