<?php

namespace Database\Seeders\Demo;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\WorkflowStepKind;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Models\User;
use App\Services\Employee\EmployeeOnboardingService;
use App\Services\Request\RequestService;
use App\Services\Ticket\TicketService;
use Illuminate\Http\UploadedFile;
use RuntimeException;

/**
 * ~40 service requests: every one of the 13 types, every status, walked through the
 * real RequestService so each approval lands on whoever the workflow resolves to
 * (sup.demo → mgr.demo → vp.demo for staff.demo; qc.demo / se.demo on the CCTV
 * department steps; the resource owner on File Share / Email Group).
 *
 * Outcomes: waiting at step N (some for more than 3 days — the stalled reminder),
 * approved with its auto-ticket still open or in progress, completed through the
 * ticket or by hand (the route that opens no case), not delivered, rejected, cancelled.
 * Plus one onboarding set filed by hr.demo for the new hire.
 *
 * Each event happens after the one before it: approvals from the afternoon of the
 * submit day, one working day apart, and IT's work only after the last signature.
 */
final class DemoRequests implements DemoStep
{
    /** A one-page PDF, small enough to keep in code, for the CCTV attachment. */
    private const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 120]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

    /**
     * [type, requester user key, days ago, outcome, reason]
     * outcome: wait:N (N signatures, then stop) | approved | in_progress | completed | manual | not_delivered | rejected:N | cancelled
     */
    private const PLAN = [
        ['computer', 'staff', 150, 'completed', 'My laptop is six years old and too slow for the new ERP.'],
        ['computer', 'staff', 2, 'wait:0', 'A second desktop for the line 2 terminal.'],
        ['computer', 'sup', 20, 'in_progress', 'Replacement laptop for the supervisor desk.'],
        ['hardware', 'staff', 120, 'completed', 'A second monitor for reviewing production plans.'],
        ['hardware', 'staff', 6, 'wait:1', 'A label printer for the packing station.'],
        ['hardware', 'staff', 45, 'rejected:1', 'A docking station for home use.'],
        ['mobile', 'staff', 100, 'completed', 'A company phone for on-call duty.'],
        ['mobile', 'staff', 8, 'wait:2', 'A pocket Wi-Fi for site visits.'],
        ['email', 'staff', 90, 'completed', 'A shared mailbox for the production planning team.'],
        ['email', 'staff', 1, 'wait:0', 'A mailbox for the new line leader.'],
        ['social', 'staff', 80, 'completed', 'Posting product updates on the LINE Official account.'],
        ['social', 'staff', 5, 'wait:2', 'Access to Facebook to answer customer messages.'],
        ['fileshare', 'staff', 70, 'completed', 'Write access to the QC documents share for audits.'],
        ['fileshare', 'staff', 4, 'wait:0', 'Read access to the production share for the new report.'],
        ['software', 'staff', 110, 'completed', 'AutoCAD LT to review machine layouts.'],
        ['software', 'staff', 3, 'wait:1', 'Adobe Acrobat Pro to sign supplier documents.'],
        ['software', 'staff', 30, 'cancelled', 'Visio for process diagrams - no longer needed.'],
        ['recovery', 'staff', 60, 'completed', 'Recover a deleted production plan from last Friday.'],
        ['recovery', 'staff', 1, 'wait:0', 'Recover files from a failed USB drive.'],
        ['mailgroup', 'staff', 65, 'completed', 'Join the QC Team mail group for release notices.'],
        ['mailgroup', 'staff', 7, 'wait:0', 'Join the Production Team mail group.'],
        ['telephone', 'staff', 75, 'completed', 'An IP phone for the new QC lab desk.'],
        ['telephone', 'staff', 9, 'approved', 'An analog phone for the warehouse gate.'],
        ['network', 'staff', 85, 'completed', 'A network point for the new packing machine.'],
        ['network', 'staff', 10, 'wait:1', 'Guest Wi-Fi for the supplier meeting room.'],
        ['network', 'staff', 50, 'rejected:1', 'A separate internet line for the canteen TV.'],
        ['cctv', 'staff', 55, 'completed', 'CCTV footage of the loading bay on the 12th.'],
        ['cctv', 'staff', 6, 'wait:1', 'A new camera covering the chemical store.'],
        ['cctv', 'staff', 12, 'wait:2', 'Footage review for the packing line incident.'],
        ['other', 'staff', 95, 'manual', 'Set up the meeting room display for the monthly review.'],
        ['other', 'staff', 3, 'wait:2', 'Move the training room equipment to building B.'],
        ['hardware', 'staff', 40, 'not_delivered', 'A TV for the canteen.'],
        ['hardware', 'qc', 35, 'completed', 'A barcode scanner for the QC lab.'],
        ['software', 'qc', 4, 'wait:0', 'A Minitab licence for SPC analysis.'],
        ['computer', 'sup', 11, 'approved', 'A desktop for the new shift leader.'],
        ['mobile', 'sup', 25, 'rejected:1', 'A second phone for personal use.'],
        ['hardware', 'staff', 15, 'cancelled', 'A webcam - I borrowed one instead.'],
    ];

    public function __construct(
        private readonly RequestService $requests,
        private readonly TicketService $tickets,
        private readonly EmployeeOnboardingService $onboarding,
    ) {}

    public function run(DemoContext $ctx, DemoClock $clock): void
    {
        foreach (self::PLAN as $i => [$type, $userKey, $daysAgo, $outcome, $reason]) {
            $this->one($ctx, $clock, $i, $type, $ctx->user($userKey), $daysAgo, $outcome, $reason);
        }

        // Onboarding for the new hire, filed by HR a week before their first day.
        $hr = $ctx->user('hr');
        $clock->at($clock->daysAgo(2, 10));
        $ctx->actAs($hr);
        $result = $this->onboarding->fileRequests($ctx->employee('newhire'), $hr, [
            'computer' => ['device_id' => $this->option('computer', 'device_id', 0)],
            'email' => ['address' => 'tanapat.s@example.com'],
        ], 'Please prepare before Monday.');

        if ($result['failed'] !== []) {
            throw new RuntimeException('Demo onboarding failed: '.json_encode($result['failed']));
        }
    }

    private function one(DemoContext $ctx, DemoClock $clock, int $i, string $type, User $requester, int $daysAgo, string $outcome, string $reason): void
    {
        $clock->at($clock->daysAgo($daysAgo, 9 + $i % 5));
        $ctx->actAs($requester);
        $request = $this->requests->submit($requester, [
            'type' => $type,
            'reason' => $reason,
            'fields' => $this->fields($ctx, $type, $i),
            'files' => $type === 'cctv' ? [$this->pdf("cctv-site-{$i}.pdf")] : [],
        ]);

        [$kind, $steps] = array_pad(explode(':', $outcome, 2), 2, null);

        if ($kind === 'cancelled') {
            $clock->at($clock->daysAgo($daysAgo, 15));
            $this->requests->cancel($request->fresh(), $requester);

            return;
        }

        // Sign step by step, one working day apart, starting the afternoon of the submit.
        $limit = in_array($kind, ['wait', 'rejected'], true) ? (int) $steps : PHP_INT_MAX;
        $day = $daysAgo;
        for ($signed = 0; $signed < $limit; $signed++) {
            $row = $this->currentApproval($request);
            if ($row === null) {
                break;
            }
            $day = max(0, $daysAgo - $signed);
            $clock->at($clock->daysAgo($day, min(16, 14 + $signed)));
            $this->requests->approve($request->fresh(), $this->signer($ctx, $row), 'Approved');
        }

        if ($kind === 'rejected') {
            $clock->at($clock->daysAgo(max(0, $day - 1), 16));
            $this->requests->reject($request->fresh(), $this->signer($ctx, $this->currentApproval($request)), 'Not a business need at this time.');

            return;
        }

        $request->refresh();
        if ($kind === 'wait' || $request->status !== RequestStatus::Approved) {
            return;
        }

        $lead = $ctx->user('it.lead');
        $ctx->actAs($lead);

        if ($kind === 'manual') { // "other" opens no case: IT closes it by hand
            $clock->at($clock->daysAgo(max(0, $day - 2), 14));
            $this->requests->complete($request, $lead);

            return;
        }

        $ticket = $request->ticket;
        if ($ticket === null || $kind === 'approved') {
            return; // approved, its case still waiting in the IT queue
        }

        $clock->at($clock->daysAgo(max(0, $day - 1), 10));
        $ticket = $this->tickets->take($ticket, $lead, null, 'Preparing the equipment', null);

        if ($kind === 'in_progress') {
            return;
        }

        $delivered = $kind === 'completed';
        $resolution = $delivered ? 'Delivered and set up with the requester.' : 'Not delivered - facilities will provide the canteen TV.';
        $clock->at($clock->daysAgo(max(0, $day - 3), 15));
        $ticket = $this->tickets->resolve($ticket->fresh(), $delivered, $resolution);
        $this->requests->settleFromTicket($ticket, $lead, $delivered, $resolution);
    }

    private function currentApproval(ServiceRequest $request): ?RequestApproval
    {
        return $request->approvals()
            ->where('status', ApprovalStatus::Current->value)
            ->where('kind', WorkflowStepKind::Approval->value)
            ->first();
    }

    /** The demo account allowed to sign this row: the named approver, or a member of the department step. */
    private function signer(DemoContext $ctx, ?RequestApproval $row): User
    {
        if ($row !== null) {
            foreach ($ctx->users as $user) {
                $named = $row->approver_employee_id !== null && (int) $user->employee_id === (int) $row->approver_employee_id;
                if ($named || ($row->approver_employee_id === null && $row->acceptsEmployee($user->employee))) {
                    return $user;
                }
            }
        }

        throw new RuntimeException("No demo account can sign '{$row?->label}' on request #{$row?->service_request_id}.");
    }

    /** @return array<string, mixed> */
    private function fields(DemoContext $ctx, string $type, int $i): array
    {
        return match ($type) {
            'computer', 'hardware' => ['device_id' => $this->option($type, 'device_id', $i)],
            'mobile' => ['device_id' => $this->option('mobile', 'device_id', $i), 'sim' => $i % 2 === 1 ? 'yes' : 'no'],
            'email' => ['address' => "team{$i}@example.com"],
            'social' => ['social_platform_id' => $ctx->resources[$i % 2 === 1 ? 'facebook' : 'line']->id],
            'fileshare' => [
                'file_share_id' => $ctx->resources[$i % 2 === 1 ? 'fs-production' : 'fs-qc']->id,
                'access_level' => $i % 2 === 1 ? 'read' : 'write',
            ],
            'mailgroup' => ['email_group_id' => $ctx->resources[$i % 2 === 1 ? 'grp-production' : 'grp-qc']->id],
            'software' => ['software_id' => $ctx->resources[['autocad', 'acrobat', 'm365'][$i % 3]]->id],
            'telephone' => ['device_type_id' => $this->option('telephone', 'device_type_id', $i), 'location_id' => $ctx->locations['qc-lab']->id],
            default => [],
        };
    }

    private function option(string $type, string $field, int $i): int
    {
        $ids = RequestOption::where('request_type', $type)->where('field_key', $field)->orderBy('sort_order')->pluck('id')->all();

        return $ids[$i % max(1, count($ids))] ?? throw new RuntimeException("No request option for {$type}.{$field} - run RequestOptionSeeder.");
    }

    private function pdf(string $name): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'demo');
        file_put_contents($path, self::PDF);

        return new UploadedFile($path, $name, 'application/pdf', null, true);
    }
}
