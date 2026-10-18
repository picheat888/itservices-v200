<?php

namespace App\Services\Report;

use App\Jobs\GenerateReportExport;
use App\Models\AuditLog;
use App\Models\Report\ReportExport;
use App\Models\User;
use App\Notifications\ReportExportNotification;
use App\Services\Email\EmailNotificationService;
use App\Services\Report\Tabular\TabularReportExporter;
use App\Support\DateDisplay;
use App\Support\Refusal;
use App\Support\ReportCatalogue;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Throwable;

/**
 * Report exports built on the queue ("ไฟล์ส่งออกของฉัน" on the Report Center).
 *
 * `queue()` records what was asked for and hands it to GenerateReportExport; the job calls
 * `build()`, which writes the file to the private disk and rings the requester's bell either
 * way. A finished file stays downloadable for ReportExport::KEEP_DAYS, then `prune()`
 * (reports:prune-exports) removes it. Access is asked of ReportCatalogue again when the file
 * is built, so a report taken away between the request and the build is not delivered.
 */
class ReportExportService
{
    /** Files one person may have waiting or being built at once. */
    public const MAX_IN_FLIGHT = 5;

    /** A row still queued/running after this long lost its worker — prune clears it. */
    private const STALLED_HOURS = 24;

    public function __construct(
        private TabularReportExporter $tabular,
        private TicketOverviewExporter $ticketOverview,
        private EmailNotificationService $mail,
    ) {}

    /**
     * @param  array<string, mixed>  $filters  the validated filter input, as the screen sent it
     * @param  list<string>|null  $columns  the column picker's keys (tabular reports only)
     */
    public function queue(User $user, string $reportKey, string $format, array $filters, ?array $columns = null): ReportExport
    {
        $inFlight = ReportExport::query()
            ->where('user_id', $user->id)
            ->whereIn('status', [ReportExport::QUEUED, ReportExport::RUNNING])
            ->count();
        if ($inFlight >= self::MAX_IN_FLIGHT) {
            Refusal::fail('export_queue_full', ['limit' => self::MAX_IN_FLIGHT]);
        }

        $export = ReportExport::create([
            'user_id' => $user->id,
            'report_key' => $reportKey,
            'format' => $format,
            'filters' => $filters,
            'columns' => $columns,
            'status' => ReportExport::QUEUED,
        ]);

        GenerateReportExport::dispatch($export->id)->afterCommit();

        return $export->refresh();
    }

    /**
     * Build the file for a queued export. Called by GenerateReportExport; never throws — a
     * failure is recorded on the row and told to the requester.
     */
    public function build(ReportExport $export): void
    {
        if ($export->status !== ReportExport::QUEUED) {
            return;
        }

        $export->update(['status' => ReportExport::RUNNING, 'started_at' => now()]);
        $user = $export->user;

        if ($user === null || ! ReportCatalogue::canExport($user, $export->report_key)) {
            $this->fail($export, 'forbidden');

            return;
        }

        try {
            $file = $this->write($export, $user);
        } catch (Throwable $e) {
            Log::error('Report export failed', ['export_id' => $export->id, 'report' => $export->report_key, 'error' => $e->getMessage()]);
            $this->fail($export, 'build_failed');

            return;
        }

        $export->update([
            'status' => ReportExport::READY,
            'file_name' => $file['name'],
            'file_path' => $file['path'],
            'rows_count' => $file['rows'],
            'size_bytes' => Storage::disk('local')->exists($file['path']) ? Storage::disk('local')->size($file['path']) : null,
            'finished_at' => now(),
            'expires_at' => now()->addDays(ReportExport::KEEP_DAYS),
            'error' => null,
        ]);

        $user->notify(new ReportExportNotification($export, ReportExportNotification::READY));
        $this->emailReady($export, $user);
    }

    /** The requester's mail: what was built and a sign-in-protected link that works until the file expires. */
    private function emailReady(ReportExport $export, User $user): void
    {
        $this->mail->sendTemplate('report.export_ready', $user->email, [
            'user.first_name' => e(strtok((string) $user->name, ' ') ?: 'there'),
            'report.name' => e(ReportCatalogue::title($export->report_key)),
            'report.format' => $export->format === 'xlsx' ? 'Excel' : 'PDF',
            'report.file' => e((string) $export->file_name),
            'report.rows' => number_format((int) $export->rows_count),
            'report.expires' => DateDisplay::date($export->expires_at, null, 'en'),
        ], $this->downloadUrl($export), 'Download file', $user->name);
    }

    /**
     * The ready file of an export, for its owner (or a scheduled run's recipient account) while they
     * may still open the report; null otherwise. Every download is written to the audit log.
     *
     * @return array{path: string, name: string}|null
     */
    public function fileFor(ReportExport $export, User $user, string $via): ?array
    {
        $ready = ($export->user_id === $user->id || $export->isSharedWith($user))
            && ReportCatalogue::allows($user, $export->report_key)
            && $export->status === ReportExport::READY
            && $export->file_path !== null
            && Storage::disk('local')->exists($export->file_path);
        if (! $ready) {
            return null;
        }

        AuditLog::record('Downloaded report export', ReportCatalogue::title($export->report_key).' ('.$export->file_name.')', [
            'export_id' => $export->id,
            'document_no' => $export->documentNo(),
            'format' => $export->format,
            'rows' => $export->rows_count,
            'via' => $via,
        ]);

        return ['path' => $export->file_path, 'name' => (string) $export->file_name];
    }

    /** A signed link to the file for its owner, valid until the file expires. */
    public function downloadUrl(ReportExport $export): string
    {
        // Signed on the path alone, so the link holds whichever host or scheme the app is reached by.
        return url(URL::temporarySignedRoute('files.report-export', $export->expires_at, ['export' => $export->id], absolute: false));
    }

    /**
     * Mark an export failed and tell its requester. Public for the job's failed() hook — a
     * worker that times out or dies never returns to build()'s own catch.
     */
    public function fail(ReportExport $export, string $error): void
    {
        $export->update([
            'status' => ReportExport::FAILED,
            'error' => $error,
            'finished_at' => now(),
            'expires_at' => now()->addDays(ReportExport::KEEP_DAYS),
        ]);

        $export->user?->notify(new ReportExportNotification($export, ReportExportNotification::FAILED));
    }

    /** @return Collection<int, ReportExport> the requester's current files of reports they may still open, newest first */
    public function listFor(User $user): Collection
    {
        return ReportExport::query()
            ->where('user_id', $user->id)
            ->current()
            ->latest('id')
            ->get()
            ->filter(fn (ReportExport $export) => ReportCatalogue::allows($user, $export->report_key))
            ->values();
    }

    /** Queue a failed export again with the same filters and columns. */
    public function retry(ReportExport $export): ReportExport
    {
        if ($export->status !== ReportExport::FAILED) {
            Refusal::fail('export_not_failed');
        }

        $this->removeFile($export);
        $export->update([
            'status' => ReportExport::QUEUED,
            'error' => null,
            'file_name' => null,
            'file_path' => null,
            'rows_count' => null,
            'size_bytes' => null,
            'started_at' => null,
            'finished_at' => null,
            'expires_at' => null,
        ]);

        GenerateReportExport::dispatch($export->id)->afterCommit();

        return $export->refresh();
    }

    public function delete(ReportExport $export): void
    {
        $this->removeFile($export);
        $export->delete();
    }

    /**
     * "ลบทั้งหมด" on the panel: remove every finished file of this person — ready or failed, with its
     * file. One still queued or being built is left to finish, so no worker writes into a deleted
     * export. Returns how many went.
     */
    public function deleteAllFor(User $user): int
    {
        $finished = ReportExport::query()
            ->where('user_id', $user->id)
            ->current()
            ->whereIn('status', [ReportExport::READY, ReportExport::FAILED])
            ->get();

        $finished->each(fn (ReportExport $export) => $this->delete($export));

        return $finished->count();
    }

    /**
     * Remove every export past its expiry, and any left queued/running long after its worker
     * should have finished. Returns how many rows went.
     */
    public function prune(): int
    {
        $stale = ReportExport::query()
            ->where('expires_at', '<=', now())
            ->orWhere(fn ($q) => $q
                ->whereIn('status', [ReportExport::QUEUED, ReportExport::RUNNING])
                ->where('created_at', '<=', now()->subHours(self::STALLED_HOURS)))
            ->get();

        $stale->each(fn (ReportExport $export) => $this->delete($export));

        return $stale->count();
    }

    /** @return array{name: string, path: string, rows: int} */
    private function write(ReportExport $export, User $user): array
    {
        $directory = "report-exports/{$export->id}";
        $input = $export->filters ?? [];

        if ($export->report_key === ReportCatalogue::TICKETS_OVERVIEW) {
            return $this->ticketOverview->store($user, TicketOverviewReportService::resolveFilters($input), $export->format, $directory, $export->documentNo());
        }

        $report = ReportCatalogue::tabular($export->report_key)?->showOnly($export->columns);
        if ($report === null) {
            throw new \RuntimeException("Unknown report [{$export->report_key}]");
        }

        return $this->tabular->store($report, $user, $report->resolveFilters($input), $export->format, $directory, $export->documentNo());
    }

    private function removeFile(ReportExport $export): void
    {
        Storage::disk('local')->deleteDirectory("report-exports/{$export->id}");
    }
}
