<?php

// Company holidays for the SLA clock: list every year, replace one year at a time.

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\SaveSlaHolidaysRequest;
use App\Http\Resources\Settings\SlaHolidayResource;
use App\Models\AuditLog;
use App\Models\Settings\SlaHoliday;
use App\Services\Settings\SlaHolidayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class SlaHolidayController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return SlaHolidayResource::collection(SlaHoliday::query()->orderBy('date')->get());
    }

    public function update(SaveSlaHolidaysRequest $request, SlaHolidayService $service): JsonResponse
    {
        $year = $request->year();
        $result = $service->replaceYear($year, $request->validated('holidays'));

        AuditLog::record('Updated SLA holidays', (string) $year, [
            'added' => $result['added'],
            'removed' => $result['removed'],
            'renamed' => $result['renamed'],
        ]);

        return $this->index()
            ->additional(['message' => 'success', 'meta' => ['moved' => $result['moved']]])
            ->response();
    }
}
