<?php

// Settings -> Ticket & SLA: priority, request-type and repair targets, first response, goal and working hours (route permission settings.sla).

namespace App\Http\Requests\Settings;

use App\Enums\Request\RequestType;
use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketSlaClock;
use App\Enums\Ticket\TicketWorkClass;
use App\Support\TicketSla;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Enum;
use Illuminate\Validation\Validator;

class UpdateSlaSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Resolution per priority; first response is one system-wide target
            'ticket_sla' => ['required', 'array'],
            'ticket_sla.*.resolve' => ['required', 'integer', 'min:1', 'max:8760'],
            'ticket_sla.*.clock' => ['sometimes', new Enum(TicketSlaClock::class)],
            // Absent key = leave the saved request-type rules alone
            'ticket_sla_request' => ['sometimes', 'array'],
            'ticket_sla_request.*.type' => ['required', 'distinct', new Enum(RequestType::class)],
            'ticket_sla_request.*.resolve' => ['required', 'integer', 'min:1', 'max:8760'],
            'ticket_sla_request.*.clock' => ['sometimes', new Enum(TicketSlaClock::class)],
            // Absent key = leave the saved repair rules alone; no 'standard' (priority already answers it)
            'ticket_sla_work_class' => ['sometimes', 'array'],
            'ticket_sla_work_class.*.category' => ['required', new Enum(TicketCategory::class)],
            'ticket_sla_work_class.*.work_class' => ['required', Rule::in(TicketWorkClass::repairValues())],
            'ticket_sla_work_class.*.resolve' => ['required', 'integer', 'min:1', 'max:8760'],
            'ticket_sla_work_class.*.clock' => ['sometimes', new Enum(TicketSlaClock::class)],
            'ticket_sla_work_class.*.enabled' => ['sometimes', 'boolean'],
            'ticket_sla_response' => ['sometimes', 'required', 'integer', 'min:1', 'max:10080'],
            // The share of cases that should close within target
            'ticket_sla_goal' => ['sometimes', 'required', 'integer', 'min:1', 'max:100'],
            // Working window the clocks count against (ISO weekdays 1-7)
            'ticket_sla_hours' => ['sometimes', 'required', 'array'],
            'ticket_sla_hours.days' => ['required_with:ticket_sla_hours', 'array', 'min:1'],
            'ticket_sla_hours.days.*' => ['integer', 'between:1,7', 'distinct'],
            'ticket_sla_hours.start' => ['required_with:ticket_sla_hours', 'date_format:H:i'],
            'ticket_sla_hours.end' => ['required_with:ticket_sla_hours', 'date_format:H:i', 'after:ticket_sla_hours.start'],
            // Optional break the clocks skip; null on both = no break
            'ticket_sla_hours.break_start' => [
                'nullable', 'required_with:ticket_sla_hours.break_end', 'date_format:H:i',
                'after_or_equal:ticket_sla_hours.start', 'before:ticket_sla_hours.end',
            ],
            'ticket_sla_hours.break_end' => [
                'nullable', 'required_with:ticket_sla_hours.break_start', 'date_format:H:i',
                'after:ticket_sla_hours.break_start', 'before_or_equal:ticket_sla_hours.end',
            ],
        ];
    }

    /** @return list<callable(Validator): void> */
    public function after(): array
    {
        return [
            // One target per category:work_class pair ('distinct' only guards one column)
            function (Validator $v) {
                $seen = [];
                foreach ((array) $this->input('ticket_sla_work_class', []) as $i => $row) {
                    if (! is_array($row)) {
                        continue;
                    }
                    $pair = ($row['category'] ?? '').':'.($row['work_class'] ?? '');
                    if (isset($seen[$pair])) {
                        $v->errors()->add("ticket_sla_work_class.{$i}.work_class", 'This kind of work already has a target for that ticket type.');
                    }
                    $seen[$pair] = true;
                }
            },
            // Every resolution target (hours), on every list, at least the first-response target (minutes)
            function (Validator $v) {
                $response = (int) $this->input('ticket_sla_response', TicketSla::responseMinutes());
                if ($response <= 0) {
                    return;
                }

                foreach (['ticket_sla', 'ticket_sla_request', 'ticket_sla_work_class'] as $listKey) {
                    foreach ((array) $this->input($listKey, []) as $key => $row) {
                        $resolve = (int) (is_array($row) ? ($row['resolve'] ?? 0) : 0);
                        if ($resolve > 0 && $resolve * 60 < $response) {
                            $v->errors()->add("{$listKey}.{$key}.resolve", 'Resolution must be at least the first-response target.');
                        }
                    }
                }
            },
        ];
    }
}
