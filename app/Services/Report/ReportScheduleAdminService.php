<?php

// The admin's view of everyone's scheduled report emails (Report Center "จัดการ" dialog):
// list them all, pause or resume, delete, and take one recipient off. Every change is audit-logged.

namespace App\Services\Report;

use App\Models\AuditLog;
use App\Models\Report\ReportSchedule;
use App\Models\User;
use App\Support\Refusal;
use App\Support\ReportCatalogue;
use Illuminate\Database\Eloquent\Collection;

class ReportScheduleAdminService
{
    public function __construct(private ReportScheduleService $schedules) {}

    /**
     * Every schedule, newest send first, with its owner and which recipients have an account
     * (`recipient_accounts`, lower-cased emails) for the "ในระบบ / อีเมลภายนอก" label.
     *
     * @return Collection<int, ReportSchedule>
     */
    public function listAll(): Collection
    {
        $schedules = ReportSchedule::query()
            ->with(self::OWNER)
            ->orderByRaw('last_run_at IS NULL')
            ->orderByDesc('last_run_at')
            ->orderByDesc('id')
            ->get();

        return $this->withRecipientAccounts($schedules);
    }

    /** The owner and their department, as the list shows them. */
    private const OWNER = ['user:id,name,employee_id', 'user.employee:id,department_id', 'user.employee.department:id,name,name_th'];

    /**
     * Sets `recipient_accounts` on each schedule: its recipients (lower-cased) that belong to an account.
     *
     * @param  Collection<int, ReportSchedule>  $schedules
     * @return Collection<int, ReportSchedule>
     */
    private function withRecipientAccounts(Collection $schedules): Collection
    {
        $accounts = $this->accountEmails($schedules->flatMap(fn (ReportSchedule $s) => $s->recipients ?? [])->all());
        foreach ($schedules as $schedule) {
            $schedule->setAttribute('recipient_accounts', array_values(array_filter(
                array_map('mb_strtolower', $schedule->recipients ?? []),
                fn (string $email) => isset($accounts[$email]),
            )));
        }

        return $schedules;
    }

    /** One schedule as the list shows it, for the answer to an edit. */
    private function asListed(ReportSchedule $schedule): ReportSchedule
    {
        return $this->withRecipientAccounts(new Collection([$schedule->load(self::OWNER)]))->first();
    }

    public function setActive(ReportSchedule $schedule, bool $active): ReportSchedule
    {
        $schedule = $this->schedules->update($schedule, ['active' => $active]);
        AuditLog::record($active ? 'Resumed scheduled report' : 'Paused scheduled report', $this->target($schedule), $this->details($schedule), $schedule);

        return $this->asListed($schedule);
    }

    public function delete(ReportSchedule $schedule): void
    {
        AuditLog::record('Deleted scheduled report', $this->target($schedule), $this->details($schedule), $schedule);
        $this->schedules->delete($schedule);
    }

    /** Take one address off; the last one cannot go (pause or delete the schedule instead). */
    public function removeRecipient(ReportSchedule $schedule, string $email): ReportSchedule
    {
        $recipients = $schedule->recipients ?? [];
        $kept = array_values(array_filter($recipients, fn (string $r) => mb_strtolower($r) !== mb_strtolower($email)));

        if (count($kept) === count($recipients)) {
            Refusal::fail('recipient_missing', status: 404);
        }
        if ($kept === []) {
            Refusal::fail('last_recipient');
        }

        $schedule->update(['recipients' => $kept]);
        AuditLog::record('Removed scheduled report recipient', $this->target($schedule), $this->details($schedule, ['recipient' => $email]), $schedule);

        return $this->asListed($schedule);
    }

    /**
     * @param  list<string>  $emails
     * @return array<string, true> lower-cased emails that belong to an account
     */
    private function accountEmails(array $emails): array
    {
        $emails = array_values(array_unique(array_map('mb_strtolower', $emails)));
        if ($emails === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($emails), '?'));

        return User::query()->whereRaw("LOWER(email) IN ({$placeholders})", $emails)->pluck('email')
            ->mapWithKeys(fn (string $email) => [mb_strtolower($email) => true])
            ->all();
    }

    /** The audit line's target: the report and whose schedule it is. */
    private function target(ReportSchedule $schedule): string
    {
        return ReportCatalogue::title($schedule->report_key).' ('.($schedule->user?->name ?? '-').')';
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function details(ReportSchedule $schedule, array $extra = []): array
    {
        return ['schedule_id' => $schedule->id, 'owner_id' => $schedule->user_id, 'report' => $schedule->report_key, ...$extra];
    }
}
