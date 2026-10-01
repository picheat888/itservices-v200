<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Resources\Report\ReportExportResource;
use App\Models\Report\ReportExport;
use App\Services\Report\ReportExportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * "ไฟล์ส่งออกของฉัน" (/api/reports/exports): the signed-in person's queued report files —
 * list, download, retry a failed one, remove one. Every export belongs to one person; anyone
 * else asking for it gets a 404, not a 403, so ids reveal nothing. Queuing a new file is the
 * report's own export endpoint (TabularReportController / TicketOverviewReportController).
 */
class ReportExportController extends Controller
{
    public function __construct(private ReportExportService $exports) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => ReportExportResource::collection($this->exports->listFor($request->user()))]);
    }

    public function download(Request $request, int $export): StreamedResponse
    {
        $row = $this->owned($request, $export);
        abort_unless(
            $row->status === ReportExport::READY && $row->file_path !== null && Storage::disk('local')->exists($row->file_path),
            404
        );

        return Storage::disk('local')->download($row->file_path, $row->file_name);
    }

    public function retry(Request $request, int $export): JsonResponse
    {
        $row = $this->exports->retry($this->owned($request, $export));

        return response()->json(['data' => new ReportExportResource($row), 'message' => 'success'], 202);
    }

    public function destroy(Request $request, int $export): JsonResponse
    {
        $this->exports->delete($this->owned($request, $export));

        return response()->json(['message' => 'success']);
    }

    private function owned(Request $request, int $export): ReportExport
    {
        return ReportExport::query()->where('user_id', $request->user()->id)->current()->findOrFail($export);
    }
}
