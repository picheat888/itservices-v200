<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\ExportTabularReportRequest;
use App\Http\Requests\Report\TabularReportRequest;
use App\Http\Resources\Report\ReportExportResource;
use App\Services\Report\ReportExportService;
use App\Services\Report\Tabular\ReportSummary;
use App\Support\ReportCatalogue;
use Illuminate\Http\JsonResponse;

/**
 * Endpoints shared by every tabular report (/api/reports/r/{key}): what to draw, the rows
 * with their headline numbers, and queuing the file export.
 */
class TabularReportController extends Controller
{
    public function definition(TabularReportRequest $request): JsonResponse
    {
        $report = $request->report();
        $formats = ReportCatalogue::definitions()[$report->key()]['formats'];

        return response()->json(['data' => [...$report->definition(), 'formats' => $formats]]);
    }

    public function rows(TabularReportRequest $request): JsonResponse
    {
        $report = $request->report();
        $filters = $request->filters();
        $query = $report->query($request->user(), $filters);
        $page = (clone $query)->paginate((int) ($request->validated('per_page') ?? 20));
        $report->hydrateRows($page->getCollection(), $request->user(), $filters);

        return response()->json([
            'data' => array_map(fn ($model) => $report->row($model), $page->items()),
            'meta' => [
                'total' => $page->total(),
                'per_page' => $page->perPage(),
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
            ],
            'summary' => array_map(fn (ReportSummary $s) => $s->toArray(), $report->summary($query, $filters)),
        ]);
    }

    /** Queue the file (202) — it is built by GenerateReportExport and lands in "ไฟล์ส่งออกของฉัน". */
    public function export(ExportTabularReportRequest $request, ReportExportService $exports): JsonResponse
    {
        $export = $exports->queue(
            $request->user(),
            $request->report()->key(),
            $request->validated('format'),
            $request->filterInput(),
            $request->shownColumns(),
        );

        return response()->json(['data' => new ReportExportResource($export), 'message' => 'success'], 202);
    }
}
