<?php

// Figures behind GET /tickets/summary: counts and backlog in SQL, SLA verdicts over lean rows.

namespace App\Services\Ticket;

use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketSlaClock;
use App\Enums\Ticket\TicketStatus;
use App\Enums\Ticket\TicketWorkClass;
use App\Models\Ticket\Ticket;
use App\Support\TicketSla;
use Carbon\CarbonInterface;
use Illuminate\Database\Query\Builder;

class TicketSummaryService
{
    /**
     * Counts, backlog and SLA percentages for the current window [curStart, curEnd] and the one before
     * it [prevStart, curStart]. Stored times are whole seconds, so a window edge with microseconds is
     * rounded inward (up for a start, down for an end) and every comparison matches Carbon's.
     *
     * @return array<string, mixed>
     */
    public function figures(CarbonInterface $curStart, CarbonInterface $curEnd, CarbonInterface $prevStart): array
    {
        $w = [
            'cs' => $this->ceilSecond($curStart), 'ce' => $this->floorSecond($curEnd),
            'ps' => $this->ceilSecond($prevStart), 'csEnd' => $this->floorSecond($curStart),
            'now' => $this->ceilSecond(now()),
            'step' => max(1, intdiv((int) $curStart->diffInSeconds($curEnd), 6)),
        ];

        return [
            ...$this->counts($w),
            'by_category' => $this->byCategory($w),
            ...$this->slaFigures($w),
        ];
    }

    /**
     * Window counts, flow slices, backlog and over-SLA figures, all from one aggregate query.
     *
     * @param  array<string, int>  $w
     * @return array<string, mixed>
     */
    private function counts(array $w): array
    {
        $live = TicketStatus::liveValues();
        $liveMarks = implode(',', array_fill(0, count($live), '?'));
        $repair = TicketWorkClass::repairValues();
        $repairMarks = implode(',', array_fill(0, count($repair), '?'));
        $overDue = "case when status = 'open' and responded_at is null then sla_response_due_at else sla_resolve_due_at end";
        $over = "status in ({$liveMarks}) and {$overDue} is not null and {$overDue} < ?";
        $overBindings = [...$live, $this->at($w['now'])];

        $query = Ticket::query()->toBase()
            ->where(fn (Builder $q) => $q
                ->where('created_at', '>=', $this->at($w['ps']))
                ->orWhere('resolved_at', '>=', $this->at($w['ps']))
                ->orWhere('responded_at', '>=', $this->at($w['ps']))
                ->orWhereIn('status', $live));

        $this->sum($query, 'created_cur', 'created_at >= ? and created_at <= ?', [$this->at($w['cs']), $this->at($w['ce'])]);
        $this->sum($query, 'created_prev', 'created_at >= ? and created_at < ?', [$this->at($w['ps']), $this->at($w['cs'])]);
        $this->sum($query, 'resolved_cur', 'resolved_at >= ? and resolved_at <= ?', [$this->at($w['cs']), $this->at($w['ce'])]);
        $this->sum($query, 'resolved_prev', 'resolved_at >= ? and resolved_at <= ?', [$this->at($w['ps']), $this->at($w['csEnd'])]);
        for ($k = 0; $k < 6; $k++) {
            $lo = $w['cs'] + $k * $w['step'];
            $hiClause = $k === 5 ? '' : ' and %s < ?';
            $hiBinding = $k === 5 ? [] : [$this->at($lo + $w['step'])];
            $this->sum($query, "opened_{$k}", 'created_at >= ? and created_at <= ?'.sprintf($hiClause, 'created_at'), [$this->at($lo), $this->at($w['ce']), ...$hiBinding]);
            $this->sum($query, "closed_{$k}", 'resolved_at >= ? and resolved_at <= ?'.sprintf($hiClause, 'resolved_at'), [$this->at($lo), $this->at($w['ce']), ...$hiBinding]);
        }
        $this->sum($query, 'open', "status = 'open'", []);
        $this->sum($query, 'in_progress', "status = 'in_progress'", []);
        $this->sum($query, 'repair_backlog', "status in ({$liveMarks}) and work_class in ({$repairMarks})", [...$live, ...$repair]);
        $this->sum($query, 'over_sla', $over, $overBindings);
        $query->selectRaw("min(case when {$over} then created_at end) as over_oldest", $overBindings);

        $row = $query->first();
        $flow = [];
        for ($k = 0; $k < 6; $k++) {
            $flow[] = ['opened' => (int) $row->{"opened_{$k}"}, 'closed' => (int) $row->{"closed_{$k}"}];
        }

        return [
            'created_cur' => (int) $row->created_cur, 'created_prev' => (int) $row->created_prev,
            'resolved_cur' => (int) $row->resolved_cur, 'resolved_prev' => (int) $row->resolved_prev,
            'open' => (int) $row->open, 'in_progress' => (int) $row->in_progress,
            'repair_backlog' => (int) $row->repair_backlog,
            'over_sla_count' => (int) $row->over_sla,
            'over_sla_oldest_days' => $row->over_oldest === null ? null : (int) floor(now()->parse($row->over_oldest)->diffInDays(now())),
            'flow' => $flow,
        ];
    }

    /**
     * Tickets opened in the current window per category, zero-filled for every category.
     *
     * @param  array<string, int>  $w
     * @return array<string, int>
     */
    private function byCategory(array $w): array
    {
        $counts = array_fill_keys(array_map(fn (TicketCategory $c) => $c->value, TicketCategory::cases()), 0);
        $rows = Ticket::query()->toBase()
            ->whereBetween('created_at', [$this->at($w['cs']), $this->at($w['ce'])])
            ->whereNotNull('category')
            ->groupBy('category')
            ->selectRaw('category, count(*) as total')
            ->get();

        foreach ($rows as $row) {
            $counts[$row->category] = (int) $row->total;
        }

        return $counts;
    }

    /**
     * Resolve and response SLA percentages and the average time to take, over lean rows: completed
     * tickets resolved, and tickets first responded, in either window. Each due date is worked out once.
     *
     * @param  array<string, int>  $w
     * @return array<string, ?int>
     */
    private function slaFigures(array $w): array
    {
        $tally = [];
        foreach (['standard', 'repair'] as $bucket) {
            foreach (['cur', 'prev'] as $window) {
                $tally["{$bucket}_{$window}"] = ['met' => 0, 'total' => 0];
            }
        }
        $resp = ['cur' => ['met' => 0, 'total' => 0, 'sum' => 0], 'prev' => ['met' => 0, 'total' => 0, 'sum' => 0]];
        $responseMinutes = TicketSla::responseMinutes();
        $targets = [];
        $repairClass = [];

        foreach ($this->slaRows($w) as $t) {
            $created = strtotime($t->created_at);
            $responded = $t->responded_at === null ? null : strtotime($t->responded_at);
            $resolved = $t->resolved_at === null ? null : strtotime($t->resolved_at);

            if ($t->status === TicketStatus::Completed->value && $resolved !== null) {
                $window = $this->windowsOf($resolved, $w);
                if ($window !== []) {
                    $key = "{$t->request_type}|{$t->category}|{$t->work_class}|{$t->priority}";
                    $target = $targets[$key] ??= TicketSla::targetForValues($t->request_type, $t->category, $t->work_class, $t->priority);
                    $due = TicketSla::addMinutesToTimestamp($responded ?? $created, $target['hours'] * 60, $target['clock']);
                    $bucket = ($repairClass[$t->work_class] ??= $t->work_class !== null && TicketWorkClass::from($t->work_class)->isRepair()) ? 'repair' : 'standard';
                    foreach ($window as $name) {
                        $tally["{$bucket}_{$name}"]['total']++;
                        $tally["{$bucket}_{$name}"]['met'] += $resolved <= $due ? 1 : 0;
                    }
                }
            }

            if ($responded !== null) {
                $window = $this->windowsOf($responded, $w);
                if ($window !== []) {
                    $due = TicketSla::addMinutesToTimestamp($created, $responseMinutes, TicketSlaClock::Business);
                    foreach ($window as $name) {
                        $resp[$name]['total']++;
                        $resp[$name]['met'] += $responded <= $due ? 1 : 0;
                        $resp[$name]['sum'] += (($responded - $created) * 1_000_000) / 60_000_000;
                    }
                }
            }
        }

        return [
            'standard_cur_pct' => $this->percent($tally['standard_cur']), 'standard_prev_pct' => $this->percent($tally['standard_prev']),
            'repair_cur_pct' => $this->percent($tally['repair_cur']), 'repair_prev_pct' => $this->percent($tally['repair_prev']),
            'response_cur_pct' => $this->percent($resp['cur']), 'response_prev_pct' => $this->percent($resp['prev']),
            'avg_cur' => $resp['cur']['total'] === 0 ? null : (int) round($resp['cur']['sum'] / $resp['cur']['total']),
            'avg_prev' => $resp['prev']['total'] === 0 ? null : (int) round($resp['prev']['sum'] / $resp['prev']['total']),
        ];
    }

    /**
     * @param  array<string, int>  $w
     * @return iterable<int, object>
     */
    private function slaRows(array $w): iterable
    {
        $from = $this->at($w['ps']);
        $to = $this->at($w['ce']);
        $requestType = '(select r.type from service_requests r where r.ticket_id = tickets.id order by r.id limit 1)';

        return Ticket::query()->toBase()
            ->selectRaw("status, created_at, responded_at, resolved_at, category, priority, work_class, {$requestType} as request_type")
            ->where(fn (Builder $q) => $q
                ->where(fn (Builder $r) => $r->where('status', TicketStatus::Completed->value)->whereBetween('resolved_at', [$from, $to]))
                ->orWhereBetween('responded_at', [$from, $to]))
            ->orderBy('id')
            ->cursor();
    }

    /**
     * Which windows an instant falls in: the shared edge belongs to both.
     *
     * @param  array<string, int>  $w
     * @return list<string>
     */
    private function windowsOf(int $at, array $w): array
    {
        $in = [];
        if ($at >= $w['cs'] && $at <= $w['ce']) {
            $in[] = 'cur';
        }
        if ($at >= $w['ps'] && $at <= $w['csEnd']) {
            $in[] = 'prev';
        }

        return $in;
    }

    /** @param  array{met: int, total: int}  $tally */
    private function percent(array $tally): ?int
    {
        return $tally['total'] === 0 ? null : (int) round(($tally['met'] / $tally['total']) * 100);
    }

    /** @param  list<mixed>  $bindings */
    private function sum(Builder $query, string $alias, string $condition, array $bindings): void
    {
        $query->selectRaw("sum(case when {$condition} then 1 else 0 end) as {$alias}", $bindings);
    }

    private function at(int $timestamp): string
    {
        return date('Y-m-d H:i:s', $timestamp);
    }

    private function ceilSecond(CarbonInterface $at): int
    {
        return $at->getTimestamp() + ($at->micro > 0 ? 1 : 0);
    }

    private function floorSecond(CarbonInterface $at): int
    {
        return $at->getTimestamp();
    }
}
