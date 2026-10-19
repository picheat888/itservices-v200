<?php

// Everyone's scheduled report emails for an admin with reports.schedule_manage: list, pause or
// resume, delete, and take one recipient off.

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\ManageReportScheduleRequest;
use App\Http\Resources\Report\ManagedReportScheduleResource;
use App\Services\Report\ReportScheduleAdminService;
use Illuminate\Http\JsonResponse;

class ReportScheduleAdminController extends Controller
{
    public function __construct(private ReportScheduleAdminService $admin) {}

    public function index(ManageReportScheduleRequest $request): JsonResponse
    {
        return response()->json(['data' => ManagedReportScheduleResource::collection($this->admin->listAll())]);
    }

    public function update(ManageReportScheduleRequest $request): JsonResponse
    {
        $schedule = $this->admin->setActive($request->schedule(), (bool) $request->validated('active'));

        return response()->json(['data' => new ManagedReportScheduleResource($schedule), 'message' => 'success']);
    }

    public function destroy(ManageReportScheduleRequest $request): JsonResponse
    {
        $this->admin->delete($request->schedule());

        return response()->json(['message' => 'success']);
    }

    public function removeRecipient(ManageReportScheduleRequest $request): JsonResponse
    {
        $schedule = $this->admin->removeRecipient($request->schedule(), (string) $request->validated('email'));

        return response()->json(['data' => new ManagedReportScheduleResource($schedule), 'message' => 'success']);
    }
}
