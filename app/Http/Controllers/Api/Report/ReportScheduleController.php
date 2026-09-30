<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\ScheduleTabularReportRequest;
use App\Http\Requests\Report\ScheduleTicketOverviewRequest;
use App\Http\Requests\Report\UpdateReportScheduleRequest;
use App\Http\Resources\Report\ReportScheduleResource;
use App\Models\Report\ReportSchedule;
use App\Services\Report\ReportScheduleService;
use App\Support\ReportCatalogue;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Scheduled report emails (Report Center Phase 6): set one from a report page (tabular or
 * the ticket overview), list / edit / pause / delete your own on the hub, and send the
 * latest period now. Each schedule is its owner's only — anyone else's id is a 404.
 */
class ReportScheduleController extends Controller
{
    public function __construct(private ReportScheduleService $schedules) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => ReportScheduleResource::collection($this->schedules->listFor($request->user()))]);
    }

    public function storeTabular(ScheduleTabularReportRequest $request): JsonResponse
    {
        $schedule = $this->schedules->create(
            $request->user(),
            $request->report()->key(),
            $request->validated('format'),
            $request->filterInput(),
            $request->shownColumns(),
            $request->validated('frequency'),
            (int) $request->validated('send_hour'),
            $request->validated('recipients'),
        );

        return response()->json(['data' => new ReportScheduleResource($schedule), 'message' => 'success'], 201);
    }

    public function storeTicketOverview(ScheduleTicketOverviewRequest $request): JsonResponse
    {
        $schedule = $this->schedules->create(
            $request->user(),
            ReportCatalogue::TICKETS_OVERVIEW,
            $request->validated('format'),
            $request->filterInput(),
            null,
            $request->validated('frequency'),
            (int) $request->validated('send_hour'),
            $request->validated('recipients'),
        );

        return response()->json(['data' => new ReportScheduleResource($schedule), 'message' => 'success'], 201);
    }

    public function update(UpdateReportScheduleRequest $request): JsonResponse
    {
        $schedule = $this->schedules->update($request->schedule(), $request->validated());

        return response()->json(['data' => new ReportScheduleResource($schedule), 'message' => 'success']);
    }

    public function destroy(Request $request, int $schedule): JsonResponse
    {
        $this->schedules->delete($this->owned($request, $schedule));

        return response()->json(['message' => 'success']);
    }

    /** Send the latest closed period now (202) — the regular slot stays where it is. */
    public function sendNow(Request $request, int $schedule): JsonResponse
    {
        $row = $this->owned($request, $schedule);
        abort_unless(ReportCatalogue::allows($request->user(), $row->report_key), 403);
        $this->schedules->sendNow($row);

        return response()->json(['message' => 'success'], 202);
    }

    private function owned(Request $request, int $schedule): ReportSchedule
    {
        return ReportSchedule::query()->where('user_id', $request->user()->id)->findOrFail($schedule);
    }
}
