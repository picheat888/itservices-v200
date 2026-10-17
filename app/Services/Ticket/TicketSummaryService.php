<?php

// Figures behind GET /tickets/summary, counted in one pass over the tickets the two windows need.

namespace App\Services\Ticket;

use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketStatus;
use App\Models\Ticket\Ticket;
use App\Support\TicketSla;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

class TicketSummaryService
{
    /**
     * Counts, backlog and SLA inputs for the current window [curStart, curEnd] and the one before it
     * [prevStart, curStart]. Instants are compared as whole microseconds so every edge matches Carbon.
     *
     * @param  Collection<int, Ticket>  $tickets
     * @return array<string, mixed>
     */
    public function figures(Collection $tickets, CarbonInterface $curStart, CarbonInterface $curEnd, CarbonInterface $prevStart): array
    {
        $cs = $this->micros($curStart);
        $ce = $this->micros($curEnd);
        $ps = $this->micros($prevStart);
        $nowUs = $this->micros(now());
        $live = TicketStatus::live();
        $step = max(1, intdiv((int) $curStart->diffInSeconds($curEnd), 6));

        $f = [
            'created_cur' => 0, 'created_prev' => 0, 'resolved_cur' => 0, 'resolved_prev' => 0,
            'open' => 0, 'in_progress' => 0, 'repair_backlog' => 0,
            'over_sla' => [], 'by_category' => array_fill_keys(array_map(fn (TicketCategory $c) => $c->value, TicketCategory::cases()), 0),
            'flow' => array_fill(0, 6, ['opened' => 0, 'closed' => 0]),
            'standard_cur' => [], 'standard_prev' => [], 'repair_cur' => [], 'repair_prev' => [],
            'responded_cur' => [], 'responded_prev' => [],
        ];

        foreach ($tickets as $t) {
            $isLive = in_array($t->status, $live, true);
            $isRepair = $t->work_class?->isRepair() ?? false;
            $createdUs = $this->micros($t->created_at);

            if ($createdUs >= $cs && $createdUs <= $ce) {
                $f['created_cur']++;
                $f['flow'][min(5, intdiv(intdiv($createdUs - $cs, 1_000_000), $step))]['opened']++;
                if ($t->category !== null) {
                    $f['by_category'][$t->category->value]++;
                }
            } elseif ($createdUs >= $ps && $createdUs < $cs) {
                $f['created_prev']++;
            }

            if ($t->resolved_at !== null) {
                $resolvedUs = $this->micros($t->resolved_at);
                $bucket = $isRepair ? 'repair' : 'standard';
                if ($resolvedUs >= $cs && $resolvedUs <= $ce) {
                    $f['resolved_cur']++;
                    $f['flow'][min(5, intdiv(intdiv($resolvedUs - $cs, 1_000_000), $step))]['closed']++;
                    $f["{$bucket}_cur"][] = $t;
                }
                if ($resolvedUs >= $ps && $resolvedUs <= $cs) {
                    $f['resolved_prev']++;
                    $f["{$bucket}_prev"][] = $t;
                }
            }

            if ($t->responded_at !== null) {
                $respondedUs = $this->micros($t->responded_at);
                if ($respondedUs >= $cs && $respondedUs <= $ce) {
                    $f['responded_cur'][] = $t;
                }
                if ($respondedUs >= $ps && $respondedUs <= $cs) {
                    $f['responded_prev'][] = $t;
                }
            }

            if ($t->status === TicketStatus::Open) {
                $f['open']++;
            } elseif ($t->status === TicketStatus::InProgress) {
                $f['in_progress']++;
            }

            if ($isLive) {
                $f['repair_backlog'] += $isRepair ? 1 : 0;
                // The deadline the case runs against now: response while open and untaken, resolution after
                $due = ($t->status === TicketStatus::Open && $t->responded_at === null) ? $t->sla_response_due_at : $t->sla_resolve_due_at;
                if ($due !== null && $this->micros($due) < $nowUs) {
                    $f['over_sla'][] = $t;
                }
            }
        }

        return $f;
    }

    /**
     * Percentage of completed tickets closed within their resolution target (business or calendar
     * clock per rule). Null when none of them is completed.
     *
     * @param  array<int, Ticket>  $tickets
     */
    public function resolveMetPct(array $tickets): ?int
    {
        $completed = array_filter($tickets, fn (Ticket $t) => $t->status === TicketStatus::Completed && $t->resolved_at !== null);
        if ($completed === []) {
            return null;
        }

        $met = 0;
        foreach ($completed as $t) {
            $met += $t->resolved_at->lessThanOrEqualTo(TicketSla::resolveDueAt($t)) ? 1 : 0;
        }

        return (int) round(($met / count($completed)) * 100);
    }

    /**
     * Percentage of first responses given within the response target (business time).
     * Null when no ticket was responded to.
     *
     * @param  array<int, Ticket>  $responded
     */
    public function responseMetPct(array $responded): ?int
    {
        if ($responded === []) {
            return null;
        }

        $met = 0;
        foreach ($responded as $t) {
            $met += $t->responded_at->lessThanOrEqualTo(TicketSla::responseDueAt($t)) ? 1 : 0;
        }

        return (int) round(($met / count($responded)) * 100);
    }

    /**
     * Average minutes from opening to first response, rounded; null when nothing was responded to.
     *
     * @param  array<int, Ticket>  $responded
     */
    public function averageResponseMinutes(array $responded): ?int
    {
        if ($responded === []) {
            return null;
        }

        $sum = 0;
        foreach ($responded as $t) {
            $sum += ($this->micros($t->responded_at) - $this->micros($t->created_at)) / 60_000_000;
        }

        return (int) round($sum / count($responded));
    }

    private function micros(CarbonInterface $at): int
    {
        return $at->getTimestamp() * 1_000_000 + $at->micro;
    }
}
