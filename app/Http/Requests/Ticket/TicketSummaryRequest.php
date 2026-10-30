<?php

// The Ticket overview window: a preset (?days=7|30|90, default 30), this year (?days=year)
// or a custom inclusive ?from=&to= pair of at most 366 days.

namespace App\Http\Requests\Ticket;

use App\Http\Requests\Permission\GatedPermissionRequest;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Validator;

class TicketSummaryRequest extends GatedPermissionRequest
{
    protected function gate(): string
    {
        return 'tickets.view_dashboard';
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        if (! $this->hasCustomRange()) {
            return [];
        }

        return [
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ];
    }

    /** At most 366 days counting both ends, so a whole leap year fits. */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if (! $this->hasCustomRange() || $validator->errors()->isNotEmpty()) {
                    return;
                }
                ['start' => $start, 'end' => $end] = $this->window();
                if (round($start->diffInDays($end)) > 366) {
                    $validator->errors()->add('to', 'range_too_long');
                }
            },
        ];
    }

    /**
     * @return array{start: Carbon, end: Carbon, days: int}
     */
    public function window(): array
    {
        if ($this->hasCustomRange()) {
            $start = Carbon::parse($this->query('from'))->startOfDay();
            $end = Carbon::parse($this->query('to'))->endOfDay();

            return ['start' => $start, 'end' => $end, 'days' => (int) round($start->diffInDays($end))];
        }

        $end = now();
        if ($this->query('days') === 'year') {
            $start = $end->copy()->startOfYear();

            return ['start' => $start, 'end' => $end, 'days' => (int) round($start->diffInDays($end))];
        }

        $days = (int) $this->query('days', 30);
        if (! in_array($days, [7, 30, 90], true)) {
            $days = 30;
        }

        return ['start' => $end->copy()->subDays($days), 'end' => $end, 'days' => $days];
    }

    private function hasCustomRange(): bool
    {
        return $this->filled('from') || $this->filled('to');
    }
}
