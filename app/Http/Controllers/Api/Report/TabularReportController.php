<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\ExportTabularReportRequest;
use App\Http\Requests\Report\TabularReportRequest;
use App\Http\Resources\Report\ReportExportResource;
use App\Services\Report\ReportExportService;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\ReportCatalogue;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

/**
 * Endpoints shared by every tabular report (/api/reports/tabular/{key}): what to draw, the rows
 * (with their headline numbers and charts unless only_rows), the numbers and charts alone, and
 * queuing the file export.
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
        $body = [
            'data' => array_map(fn ($model) => $report->row($model), $page->items()),
            'meta' => [
                'total' => $page->total(),
                'per_page' => $page->perPage(),
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
            ],
        ];

        // A page turn needs only the rows; the page fetches the numbers once per filter set (summary()).
        return response()->json($request->boolean('only_rows') ? $body : [...$body, ...$this->headline($report, $query, $filters)]);
    }

    /** The headline numbers and charts for the filters, without any rows. */
    public function summary(TabularReportRequest $request): JsonResponse
    {
        $report = $request->report();
        $filters = $request->filters();

        return response()->json(['data' => $this->headline($report, $report->query($request->user(), $filters), $filters)]);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{summary: list<array<string, mixed>>, charts: list<array<string, mixed>>}
     */
    private function headline(TabularReport $report, Builder $query, array $filters): array
    {
        return [
            'summary' => array_map(fn (ReportSummary $s) => $s->toArray(), $report->summary($query, $filters)),
            'charts' => $report->charts($query, $filters),
        ];
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
