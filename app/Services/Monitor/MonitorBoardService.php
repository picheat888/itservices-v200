<?php

// Everything the IT-room monitor TV shows in one payload: KPI counts, the "must see now" rows and the team's load.

namespace App\Services\Monitor;

use App\Enums\Ticket\TicketStatus;
use App\Models\Employee\Employee;
use App\Models\Settings\AppSetting;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Support\NotificationSounds;
use App\Support\TicketSla;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

class MonitorBoardService
{
    public const CACHE_KEY = 'monitor.board';

    private const CACHE_SECONDS = 5;

    private const GROUP_ORDER = ['overdue' => 0, 'near' => 1, 'waiting' => 2];

    /**
     * @return array{
     *     generated_at: string,
     *     sound: array{key: string, enabled: bool},
     *     kpis: array<string, int|string|null>,
     *     rows: list<array<string, mixed>>,
     *     team: list<array{id: int, name: string, initials: string, count: int}>
     * }
     */
    public function board(): array
    {
        return Cache::remember(self::CACHE_KEY, self::CACHE_SECONDS, fn () => $this->build());
    }

    private function build(): array
    {
        $live = Ticket::query()
            ->with(['requester.department', 'assignee.employee', 'serviceRequest'])
            ->whereIn('status', TicketStatus::liveValues())
            ->get();

        $entries = $live->map(fn (Ticket $ticket) => $this->entry($ticket))->filter()->values();

        return [
            'generated_at' => now()->toIso8601String(),
            'sound' => [
                'key' => AppSetting::get('notification_sound', NotificationSounds::DEFAULT) ?? NotificationSounds::DEFAULT,
                'enabled' => AppSetting::get('notification_sound_enabled', '1') === '1',
            ],
            'kpis' => $this->kpis($live, $entries),
            'rows' => $this->rows($entries),
            'team' => $this->team($live),
        ];
    }

    /**
     * The running clock of one live ticket and the group it belongs to (null = not on the list).
     *
     * @return array{ticket: Ticket, waiting: bool, clock: string, due: Carbon, state: string, group: ?string}|null
     */
    private function entry(Ticket $ticket): ?array
    {
        $sla = TicketSla::forTicket($ticket);
        if ($sla === null) {
            return null;
        }

        $waiting = $ticket->status === TicketStatus::Open && $ticket->responded_at === null;
        $clock = $waiting ? 'response' : 'resolve';
        $state = $sla['state'];

        $group = match (true) {
            $state === 'over_sla' => 'overdue',
            $waiting => 'waiting',
            $state === 'near_due' && $ticket->status === TicketStatus::InProgress => 'near',
            default => null,
        };

        return [
            'ticket' => $ticket,
            'waiting' => $waiting,
            'clock' => $clock,
            'due' => Carbon::parse($sla[$clock.'_due_at']),
            'state' => $state,
            'group' => $group,
        ];
    }

    /**
     * @param  Collection<int, Ticket>  $live
     * @param  Collection<int, array<string, mixed>>  $entries
     * @return array<string, int|string|null>
     */
    private function kpis(Collection $live, Collection $entries): array
    {
        $open = $live->filter(fn (Ticket $t) => $t->status === TicketStatus::Open);
        $working = $live->filter(fn (Ticket $t) => $t->status === TicketStatus::InProgress);
        $overdue = $entries->where('state', 'over_sla');
        $closedToday = Ticket::query()
            ->with('serviceRequest')
            ->where('status', TicketStatus::Completed->value)
            ->whereBetween('resolved_at', [today(), today()->endOfDay()])
            ->get();

        return [
            'waiting' => $open->count(),
            'waiting_oldest_at' => $open->min('created_at')?->toIso8601String(),
            'in_progress' => $working->count(),
            'busy_staff' => $working->pluck('assignee_id')->filter()->unique()->count(),
            'overdue' => $overdue->count(),
            'overdue_response' => $overdue->where('clock', 'response')->count(),
            'overdue_resolve' => $overdue->where('clock', 'resolve')->count(),
            'near_due' => $entries->where('group', 'near')->count(),
            'closed_today' => $closedToday->count(),
            'closed_today_met' => $closedToday->filter(fn (Ticket $t) => TicketSla::forTicket($t)['state'] === 'met')->count(),
        ];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $entries
     * @return list<array<string, mixed>>
     */
    private function rows(Collection $entries): array
    {
        return $entries
            ->filter(fn (array $e) => $e['group'] !== null)
            ->sortBy([
                fn (array $a, array $b) => self::GROUP_ORDER[$a['group']] <=> self::GROUP_ORDER[$b['group']],
                fn (array $a, array $b) => $a['due']->getTimestamp() <=> $b['due']->getTimestamp(),
            ])
            ->map(function (array $e) {
                /** @var Ticket $ticket */
                $ticket = $e['ticket'];
                $department = $ticket->requester?->department;
                $requester = $this->nameParts($ticket->requester);

                return [
                    'id' => $ticket->id,
                    'ticket_no' => $ticket->ticket_no,
                    'subject' => $ticket->subject,
                    'priority' => $ticket->priority?->value,
                    'department' => $department ? ($department->name_th ?: $department->name) : null,
                    'requester' => $requester !== null ? $this->shortName(...$requester) : null,
                    'group' => $e['group'],
                    'clock' => $e['clock'],
                    'due_at' => $e['due']->toIso8601String(),
                    'created_at' => $ticket->created_at->toIso8601String(),
                    'assignee' => $ticket->assignee ? $this->person($ticket->assignee) : null,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * Every working resolver and anyone holding an in-progress case, with that count, most first.
     *
     * @param  Collection<int, Ticket>  $live
     * @return list<array{id: int, name: string, initials: string, count: int}>
     */
    private function team(Collection $live): array
    {
        $held = $live
            ->filter(fn (Ticket $t) => $t->status === TicketStatus::InProgress && $t->assignee_id !== null)
            ->countBy('assignee_id');

        // Working resolvers, plus anyone still holding a case, so the team matches the in-progress count
        return User::query()
            ->where(fn ($q) => $q->holdingPermission('tickets.resolve')->stillWorking())
            ->orWhereIn('id', $held->keys()->all())
            ->with('employee')
            ->get()
            ->map(fn (User $user) => [...$this->person($user), 'count' => (int) ($held[$user->id] ?? 0)])
            ->sortBy([['count', 'desc'], ['name', 'asc']])
            ->values()
            ->all();
    }

    /**
     * Short display name ("สมชาย ก.") and two-letter initials, Thai name first.
     *
     * @return array{id: int, name: string, initials: string}
     */
    private function person(User $user): array
    {
        [$first, $last] = $this->nameParts($user->employee) ?? array_pad(explode(' ', trim((string) $user->name), 2), 2, '');

        return [
            'id' => $user->id,
            'name' => $this->shortName($first, $last),
            'initials' => mb_strtoupper($this->initial($first).$this->initial($last)),
        ];
    }

    /** @return array{0: string, 1: string}|null */
    private function nameParts(?Employee $employee): ?array
    {
        return match (true) {
            $employee !== null && filled($employee->first_name_th) => [$employee->first_name_th, (string) $employee->last_name_th],
            $employee !== null && filled($employee->first_name) => [$employee->first_name, (string) $employee->last_name],
            default => null,
        };
    }

    private function shortName(string $first, string $last): string
    {
        return trim($first.($last !== '' ? ' '.$this->initial($last).'.' : ''));
    }

    private function initial(string $word): string
    {
        // Thai leading vowels (เ แ โ ใ ไ) are written before the consonant they follow
        return mb_substr((string) preg_replace('/^[เแโใไ]/u', '', trim($word)), 0, 1);
    }
}
