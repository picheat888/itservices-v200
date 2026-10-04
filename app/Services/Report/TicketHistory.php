<?php

namespace App\Services\Report;

use App\Models\AuditLog;
use App\Models\Ticket\Ticket;
use App\Models\Ticket\TicketUpdate;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * What happened on each ticket, in order — the "ประวัติ" sheet of the Ticket & SLA workbook
 * (App\Exports\Report\TicketOverviewHistorySheet).
 *
 * Two sources, neither of which holds the whole story alone:
 * - ticket_updates: progress notes (with their text) and hand-overs (from → to);
 * - audit_logs: opening, taking, assigning, reclassifying, closing, edits and attachments,
 *   each with who did it. Their `target` text starts (or ends) with the ticket number.
 * "Updated ticket progress" and "Forwarded ticket" are left out of the audit side — the same
 * moments come from ticket_updates, with the note itself. A ticket opened without an audit
 * entry (an approved request opens one by itself) still gets its opening row from created_at.
 */
class TicketHistory
{
    /** @var array<string, string> Audit actions kept, with what the sheet calls them. */
    private const AUDIT_EVENTS = [
        'Created ticket' => 'เปิด Ticket',
        'Took ticket' => 'รับเคส',
        'Assigned ticket' => 'มอบหมายงาน',
        'Classified ticket work' => 'เปลี่ยนลักษณะงาน',
        'Resolved ticket' => 'ปิดเคส',
        'Updated ticket' => 'แก้ไขข้อมูล Ticket',
        'Uploaded ticket attachment' => 'แนบไฟล์',
        'Deleted ticket attachment' => 'ลบไฟล์แนบ',
        'Completed request via ticket' => 'ปิดคำขอที่เปิด Ticket นี้',
        'Cancelled request via ticket' => 'ยกเลิกคำขอที่เปิด Ticket นี้',
    ];

    /**
     * @param  Collection<int, Ticket>  $tickets  in the order the workbook lists them
     * @return Collection<int, array{ticket_no: string, at: ?CarbonInterface, event: string, actor: ?string, detail: ?string}>
     */
    public function for(Collection $tickets): Collection
    {
        if ($tickets->isEmpty()) {
            return collect();
        }

        $byNo = $tickets->keyBy('ticket_no');
        $events = $this->fromUpdates($tickets)->concat($this->fromAudit($byNo, $tickets->min('created_at')));

        // The opening row for tickets the audit log never saw open.
        $opened = $events->where('event', 'เปิด Ticket')->pluck('ticket_no')->flip();
        foreach ($tickets as $ticket) {
            if (! $opened->has($ticket->ticket_no)) {
                $events->push([
                    'ticket_no' => $ticket->ticket_no,
                    'at' => $ticket->created_at,
                    'event' => 'เปิด Ticket',
                    'actor' => $ticket->source?->value === 'auto_request' ? 'ระบบ (เปิดจากคำขอที่อนุมัติแล้ว)' : ($ticket->requester?->name_th ?: $ticket->requester?->name),
                    'detail' => $ticket->subject,
                    'seq' => 0,
                ]);
            }
        }

        $order = $tickets->pluck('ticket_no')->flip();

        return $events
            ->sortBy([
                fn (array $a, array $b) => $order[$a['ticket_no']] <=> $order[$b['ticket_no']],
                fn (array $a, array $b) => ($a['at']?->getTimestamp() ?? 0) <=> ($b['at']?->getTimestamp() ?? 0),
                fn (array $a, array $b) => $a['seq'] <=> $b['seq'],
            ])
            ->map(fn (array $e) => array_diff_key($e, ['seq' => true]))
            ->values();
    }

    /**
     * @param  Collection<int, Ticket>  $tickets
     * @return Collection<int, array<string, mixed>>
     */
    private function fromUpdates(Collection $tickets): Collection
    {
        $numbers = $tickets->pluck('ticket_no', 'id');

        return TicketUpdate::query()
            ->whereIn('ticket_id', $tickets->pluck('id'))
            ->orderBy('id')
            ->get()
            ->map(fn (TicketUpdate $u) => [
                'ticket_no' => $numbers[$u->ticket_id],
                'at' => $u->created_at,
                'event' => $u->kind === TicketUpdate::KIND_FORWARDED ? 'ส่งต่องาน' : 'บันทึกความคืบหน้า',
                'actor' => $u->author_name,
                'detail' => $u->kind === TicketUpdate::KIND_FORWARDED
                    ? trim(sprintf('จาก %s ให้ %s', $u->meta['from'] ?? '—', $u->meta['to'] ?? '—').($u->body !== '' ? " - {$u->body}" : ''))
                    : $u->body,
                'seq' => 1000 + $u->id,
            ]);
    }

    /**
     * @param  Collection<string, Ticket>  $byNo
     * @return Collection<int, array<string, mixed>>
     */
    private function fromAudit(Collection $byNo, ?CarbonInterface $since): Collection
    {
        return AuditLog::query()
            ->whereIn('action', array_keys(self::AUDIT_EVENTS))
            ->when($since, fn ($q) => $q->where('created_at', '>=', $since))
            ->orderBy('id')
            ->get()
            ->map(fn (AuditLog $log) => $this->auditRow($log))
            ->filter(fn (?array $row) => $row !== null && $byNo->has($row['ticket_no']))
            ->values();
    }

    /** @return array<string, mixed>|null */
    private function auditRow(AuditLog $log): ?array
    {
        $target = (string) $log->target;
        $event = self::AUDIT_EVENTS[$log->action];

        // "TKT-… → x", "TKT-… - x", "x - TKT-…" (attachments) or a request reference with the
        // ticket number in details (request closed through its ticket).
        [$ticketNo, $rest] = match ($log->action) {
            'Uploaded ticket attachment', 'Deleted ticket attachment' => [
                trim((string) strrchr($target, ' ') ?: $target),
                trim((string) substr($target, 0, (int) strrpos($target, ' - '))),
            ],
            'Completed request via ticket', 'Cancelled request via ticket' => [(string) ($log->details['ticket'] ?? ''), $target],
            default => [strtok($target, ' ') ?: '', trim((string) preg_replace('/^\S+\s+(?:-|→)\s*/u', '', $target))],
        };

        if ($ticketNo === '') {
            return null;
        }

        $detail = match ($log->action) {
            'Took ticket', 'Assigned ticket' => "ผู้รับผิดชอบ: {$rest}",
            'Classified ticket work' => implode(' → ', array_map(fn (string $v) => TicketLabels::workClass(trim($v)), explode('→', $rest))),
            'Resolved ticket' => 'สถานะ: '.TicketLabels::status($rest),
            'Completed request via ticket', 'Cancelled request via ticket' => "คำขอ {$rest}",
            'Updated ticket' => 'แก้ไขเรื่อง รายละเอียด หรือข้อมูลอื่นของ Ticket',
            default => $rest,
        };
        if ($log->action === 'Resolved ticket' && $rest === 'canceled') {
            $event = 'ยกเลิกเคส';
        }

        return ['ticket_no' => $ticketNo, 'at' => $log->created_at, 'event' => $event, 'actor' => $log->user_name, 'detail' => $detail, 'seq' => $log->id];
    }
}
