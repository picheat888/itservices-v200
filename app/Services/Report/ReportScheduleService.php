<?php

namespace App\Services\Report;

use App\Jobs\SendScheduledReport;
use App\Models\Report\ReportExport;
use App\Models\Report\ReportSchedule;
use App\Models\User;
use App\Notifications\ReportExportNotification;
use App\Notifications\ReportScheduleNotification;
use App\Services\Email\EmailNotificationService;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\TabularReportExporter;
use App\Support\DateDisplay;
use App\Support\Refusal;
use App\Support\ReportCatalogue;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Reports emailed on a schedule (Report Center Phase 6).
 *
 * A schedule is set from a report page with that page's filters. reports:send-scheduled
 * (every 5 minutes) hands each due one to SendScheduledReport and moves it to its next slot;
 * the job calls `run()`, which builds the file for the period that slot closes (date filters
 * replaced, every other filter kept), mails it to each recipient as an attachment in the
 * `report.scheduled` template (recipients with an account also get a sign-in download link; the
 * file stays 30 days as the owner's export), and records how it went. The report is built as the owner
 * sees it, and only while they may still open it — a schedule whose owner lost access pauses
 * itself and says so, rather than keep mailing data nobody is entitled to any more.
 */
class ReportScheduleService
{
    /** Larger files are not attached; recipients with an account use the download link (10 MB, under Gmail and Exchange caps). */
    public int $attachmentLimitBytes = 10 * 1024 * 1024;

    public function __construct(
        private TabularReportExporter $tabular,
        private TicketOverviewExporter $ticketOverview,
        private EmailNotificationService $mail,
        private ReportExportService $exports,
    ) {}

    /** @return Collection<int, ReportSchedule> the owner's schedules, newest first */
    public function listFor(User $user): Collection
    {
        return ReportSchedule::query()->where('user_id', $user->id)->latest('id')->get();
    }

    /**
     * @param  array<string, mixed>  $filters  the validated filter input, as the screen sent it
     * @param  list<string>|null  $columns  the column picker's keys (tabular reports only)
     * @param  list<string>  $recipients
     */
    public function create(User $owner, string $reportKey, string $format, array $filters, ?array $columns, string $frequency, int $sendHour, array $recipients): ReportSchedule
    {
        if (ReportSchedule::query()->where('user_id', $owner->id)->count() >= ReportSchedule::MAX_PER_USER) {
            Refusal::fail('schedule_limit', ['limit' => ReportSchedule::MAX_PER_USER]);
        }
        if (ReportSchedule::query()->where('user_id', $owner->id)->where('report_key', $reportKey)->count() >= ReportSchedule::MAX_PER_REPORT) {
            Refusal::fail('report_schedule_limit', ['limit' => ReportSchedule::MAX_PER_REPORT]);
        }

        $schedule = new ReportSchedule([
            'user_id' => $owner->id,
            'report_key' => $reportKey,
            'format' => $format,
            'filters' => $filters,
            'columns' => $columns,
            'frequency' => $frequency,
            'send_hour' => $sendHour,
            'recipients' => $this->cleanRecipients($recipients),
            'active' => true,
        ]);
        $schedule->next_run_at = $schedule->nextRunAfter(CarbonImmutable::now());
        $schedule->save();

        return $schedule;
    }

    /**
     * Change how often, when, in which format or to whom — or pause / resume. The next slot
     * is worked out again whenever the timing changes or the schedule comes back on.
     *
     * @param  array{format?: string, frequency?: string, send_hour?: int, recipients?: list<string>, active?: bool}  $changes
     */
    public function update(ReportSchedule $schedule, array $changes): ReportSchedule
    {
        if (isset($changes['recipients'])) {
            $changes['recipients'] = $this->cleanRecipients($changes['recipients']);
        }

        $resumed = ($changes['active'] ?? $schedule->active) && ! $schedule->active;
        $schedule->fill($changes);

        if ($resumed || $schedule->isDirty(['frequency', 'send_hour'])) {
            $schedule->next_run_at = $schedule->nextRunAfter(CarbonImmutable::now());
        }
        if ($resumed) {
            $schedule->last_error = null;
        }
        $schedule->save();

        return $schedule;
    }

    public function delete(ReportSchedule $schedule): void
    {
        Storage::disk('local')->deleteDirectory("report-schedules/{$schedule->id}");
        $schedule->delete();
    }

    /** Send the latest closed period now, without moving the regular slot. */
    public function sendNow(ReportSchedule $schedule): void
    {
        SendScheduledReport::dispatch($schedule->id, CarbonImmutable::now()->toIso8601String())->afterCommit();
    }

    /**
     * Queue every schedule whose slot has come, and move each to its next slot first so a
     * slow worker or an overlapping sweep never sends the same slot twice. Returns how many.
     */
    public function dispatchDue(CarbonImmutable $now): int
    {
        $due = ReportSchedule::query()->due($now)->get();

        foreach ($due as $schedule) {
            $slot = CarbonImmutable::instance($schedule->next_run_at);
            $schedule->update(['next_run_at' => $schedule->nextRunAfter($now)]);
            // The slot, not "now": a run picked up late still reports on the period it was for.
            SendScheduledReport::dispatch($schedule->id, $slot->toIso8601String());
        }

        return $due->count();
    }

    /** Build and mail one run. Called by SendScheduledReport; never throws. */
    public function run(ReportSchedule $schedule, CarbonImmutable $runAt): void
    {
        $owner = $schedule->user;

        if ($owner === null || ! ReportCatalogue::canSchedule($owner, $schedule->report_key)) {
            $schedule->update(['active' => false]);
            $this->finish($schedule, ReportSchedule::FAILED, 'forbidden');

            return;
        }

        $directory = "report-schedules/{$schedule->id}/".$runAt->format('YmdHis');

        try {
            $period = $schedule->periodFor($runAt);
            $file = $this->write($schedule, $owner, $period, $directory);
            $size = Storage::disk('local')->exists($file['path']) ? Storage::disk('local')->size($file['path']) : 0;
            $tooLarge = $size > $this->attachmentLimitBytes;
            $expires = now()->addDays(ReportExport::KEEP_DAYS);
            $accounts = $this->recipientAccounts($schedule);

            $vars = [
                'report.name' => e(ReportCatalogue::title($schedule->report_key)),
                'report.period' => e($this->periodLabel($schedule, $period, $runAt)),
                'report.rows' => e(number_format($file['rows'])),
                'report.frequency' => e($this->frequencyLabel($schedule)),
                'report.owner' => e($owner->name),
            ];
            $forAccounts = $this->mail->renderTemplate('report.scheduled', $vars + ['report.attachment_note' => e($this->accountNote($tooLarge, $size, $expires))]);
            $forOthers = $this->mail->renderTemplate('report.scheduled', $vars + ['report.attachment_note' => e($this->outsideNote($tooLarge, $size, $owner, $expires))]);

            if ($forAccounts === null || $forOthers === null) {
                $this->finish($schedule, ReportSchedule::FAILED, 'template_disabled');

                return;
            }

            $export = $this->keepRun($schedule, $owner, $file, $size, $expires, array_keys($accounts));
            if ($tooLarge) {
                $owner->notify(new ReportExportNotification($export, ReportExportNotification::READY));
            }
            $link = $this->exports->downloadUrl($export);

            $failures = 0;
            foreach ($schedule->recipients as $recipient) {
                $hasAccount = isset($accounts[mb_strtolower($recipient)]);
                $rendered = $hasAccount ? $forAccounts : $forOthers;
                $sent = $this->mail->deliver(
                    $recipient,
                    $rendered['subject'],
                    $rendered['html'],
                    'report.scheduled',
                    actionUrl: $hasAccount ? $link : null,
                    actionLabel: $hasAccount ? 'Download file' : null,
                    eyebrow: $rendered['eyebrow'],
                    attachmentPath: $tooLarge ? null : $export->file_path,
                    attachmentName: $tooLarge ? null : $export->file_name,
                );
                $failures += $sent ? 0 : 1;
            }

            $failures === 0
                ? $this->finish($schedule, ReportSchedule::SENT, null)
                : $this->finish($schedule, ReportSchedule::FAILED, 'delivery_failed');
        } catch (Throwable $e) {
            Log::error('Scheduled report failed', ['schedule_id' => $schedule->id, 'report' => $schedule->report_key, 'error' => $e->getMessage()]);
            $this->finish($schedule, ReportSchedule::FAILED, 'build_failed');
        } finally {
            Storage::disk('local')->deleteDirectory($directory);
        }
    }

    /** Record a run's outcome; a failed one rings the owner's bell. */
    public function finish(ReportSchedule $schedule, string $status, ?string $error): void
    {
        $schedule->update(['last_run_at' => now(), 'last_status' => $status, 'last_error' => $error]);

        if ($status === ReportSchedule::FAILED) {
            $schedule->user?->notify(new ReportScheduleNotification($schedule));
        }
    }

    /**
     * The screen's filters with every date filter set to the run's period: `from`/`to` take
     * its first and last day, a point-in-time `as_of` its last.
     *
     * @param  array{from: CarbonImmutable, to: CarbonImmutable}  $period
     * @return array<string, mixed>
     */
    public function filtersFor(ReportSchedule $schedule, array $period): array
    {
        $filters = $schedule->filters ?? [];
        $dates = ['from' => $period['from']->toDateString(), 'to' => $period['to']->toDateString(), 'as_of' => $period['to']->toDateString()];

        foreach ($this->dateFilterNames($schedule->report_key) as $name) {
            if (isset($dates[$name])) {
                $filters[$name] = $dates[$name];
            }
        }

        return $filters;
    }

    /** @return list<string> */
    private function dateFilterNames(string $reportKey): array
    {
        if ($reportKey === ReportCatalogue::TICKETS_OVERVIEW) {
            return ['from', 'to'];
        }

        $report = ReportCatalogue::tabular($reportKey);

        return $report === null ? [] : array_values(array_map(
            fn (ReportFilter $f) => $f->name,
            array_filter($report->filters(), fn (ReportFilter $f) => $f->type === 'date'),
        ));
    }

    /**
     * @param  array{from: CarbonImmutable, to: CarbonImmutable}  $period
     * @return array{name: string, path: string, rows: int}
     */
    private function write(ReportSchedule $schedule, User $owner, array $period, string $directory): array
    {
        $input = $this->filtersFor($schedule, $period);
        $documentNo = sprintf('SCH-%s-%04d', now()->format('ymd'), $schedule->id);

        if ($schedule->report_key === ReportCatalogue::TICKETS_OVERVIEW) {
            return $this->ticketOverview->store($owner, TicketOverviewReportService::resolveFilters($input), $schedule->format, $directory, $documentNo);
        }

        $report = ReportCatalogue::tabular($schedule->report_key)?->showOnly($schedule->columns);
        if ($report === null) {
            throw new \RuntimeException("Unknown report [{$schedule->report_key}]");
        }

        return $this->tabular->store($report, $owner, $report->resolveFilters($input), $schedule->format, $directory, $documentNo);
    }

    /**
     * Every run's file stays 30 days as an export of the owner ("ไฟล์ส่งออกของฉัน"); the recipients
     * with an account ($sharedWith) may open it from the emailed link too.
     *
     * @param  array{name: string, path: string, rows: int}  $file
     * @param  list<string>  $sharedWith  lower-cased account emails
     */
    private function keepRun(ReportSchedule $schedule, User $owner, array $file, int $size, CarbonInterface $expires, array $sharedWith): ReportExport
    {
        $export = ReportExport::create([
            'user_id' => $owner->id,
            'report_key' => $schedule->report_key,
            'format' => $schedule->format,
            'filters' => $schedule->filters,
            'columns' => $schedule->columns,
            'shared_with' => $sharedWith,
            'status' => ReportExport::READY,
            'file_name' => $file['name'],
            'rows_count' => $file['rows'],
            'size_bytes' => $size,
            'started_at' => now(),
            'finished_at' => now(),
            'expires_at' => $expires,
        ]);
        $path = "report-exports/{$export->id}/{$file['name']}";
        Storage::disk('local')->move($file['path'], $path);
        $export->update(['file_path' => $path]);

        return $export;
    }

    /**
     * Recipients who have an account that may open the report: they get the download link.
     *
     * @return array<string, User> lower-cased email → account
     */
    private function recipientAccounts(ReportSchedule $schedule): array
    {
        $emails = array_values(array_unique(array_map('mb_strtolower', $schedule->recipients ?? [])));
        if ($emails === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($emails), '?'));

        return User::query()->with('employee')->whereRaw("LOWER(email) IN ({$placeholders})", $emails)->get()
            ->filter(fn (User $user) => ReportCatalogue::allows($user, $schedule->report_key) && ! $user->employee?->hasLeft())
            ->keyBy(fn (User $user) => mb_strtolower((string) $user->email))
            ->all();
    }

    private function accountNote(bool $tooLarge, int $size, CarbonInterface $expires): string
    {
        $until = DateDisplay::date($expires, null, 'en');

        return $tooLarge
            ? 'The file ('.round($size / 1048576, 1)." MB) is too large to attach. Download it with the button below until {$until}; you will be asked to sign in first."
            : "The report file is attached. You can also download it with the button below until {$until}; you will be asked to sign in first.";
    }

    private function outsideNote(bool $tooLarge, int $size, User $owner, CarbonInterface $expires): string
    {
        return $tooLarge
            ? 'The file ('.round($size / 1048576, 1)." MB) is too large to attach. Please ask {$owner->name} for it; they can download it from My exports on the Report Center until ".DateDisplay::date($expires, null, 'en').'.'
            : 'The report file is attached.';
    }

    /** @param  array{from: CarbonImmutable, to: CarbonImmutable}  $period */
    private function periodLabel(ReportSchedule $schedule, array $period, CarbonImmutable $runAt): string
    {
        $names = $this->dateFilterNames($schedule->report_key);
        if ($names === []) {
            return 'As of '.DateDisplay::dateTime($runAt, null, 'en');
        }
        // A point-in-time report (stock valuation's `as_of`) stands at the period's last day.
        if (! in_array('from', $names, true) && ! in_array('to', $names, true)) {
            return 'As of '.DateDisplay::date($period['to'], null, 'en');
        }

        return $period['from']->isSameDay($period['to'])
            ? DateDisplay::date($period['from'], null, 'en')
            : DateDisplay::range($period['from'], $period['to'], null, 'en');
    }

    private function frequencyLabel(ReportSchedule $schedule): string
    {
        $time = sprintf('%02d:00', $schedule->send_hour);

        return match ($schedule->frequency) {
            ReportSchedule::WEEKLY => "Every Monday at {$time}",
            ReportSchedule::MONTHLY => "On the 1st of every month at {$time}",
            default => "Every day at {$time}",
        };
    }

    /**
     * @param  list<string>  $recipients
     * @return list<string>
     */
    private function cleanRecipients(array $recipients): array
    {
        return array_values(array_unique(array_map(fn (string $r) => mb_strtolower(trim($r)), $recipients)));
    }
}
