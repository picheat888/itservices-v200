<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\ExportTabularReportRequest;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReportExporter;
use App\Support\ReportCatalogue;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

/**
 * Endpoints shared by every tabular report (/api/reports/r/{key}): what to draw, the rows
 * with their headline numbers, and the file export.
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

    public function export(ExportTabularReportRequest $request, TabularReportExporter $exporter): Response
    {
        return $exporter->download($request->report(), $request->user(), $request->filters(), $request->validated('format'));
    }
}
