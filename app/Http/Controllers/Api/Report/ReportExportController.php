<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Resources\Report\ReportExportResource;
use App\Models\Report\ReportExport;
use App\Services\Report\ReportExportService;
use App\Support\ReportCatalogue;
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
        $this->mayReadExports($request);

        return response()->json(['data' => ReportExportResource::collection($this->exports->listFor($request->user()))]);
    }

    public function download(Request $request, int $export): StreamedResponse
    {
        $this->mayReadExports($request);
        $file = $this->exports->fileFor($this->owned($request, $export), $request->user(), 'app');
        abort_if($file === null, 404);

        return Storage::disk('local')->download($file['path'], $file['name']);
    }

    /** The link in the "file ready" email: signed, and only for the signed-in owner. */
    public function downloadFromEmail(Request $request, int $export): StreamedResponse
    {
        $this->mayReadExports($request);
        $file = $this->exports->fileFor($this->owned($request, $export), $request->user(), 'email');
        abort_if($file === null, 404);

        return Storage::disk('local')->download($file['path'], $file['name']);
    }

    public function retry(Request $request, int $export): JsonResponse
    {
        abort_unless((bool) $request->user()->hasPermission(ReportCatalogue::EXPORT), 403);
        $row = $this->exports->retry($this->owned($request, $export));

        return response()->json(['data' => new ReportExportResource($row), 'message' => 'success'], 202);
    }

    public function destroy(Request $request, int $export): JsonResponse
    {
        $this->exports->delete($this->owned($request, $export));

        return response()->json(['message' => 'success']);
    }

    /** "ลบทั้งหมด": every finished file of the reader's own; ones still being built stay. */
    public function destroyAll(Request $request): JsonResponse
    {
        $deleted = $this->exports->deleteAllFor($request->user());

        return response()->json(['data' => ['deleted' => $deleted], 'message' => 'success']);
    }

    /** Scheduled files too large to mail land here too, so the schedule right reads them as well. */
    private function mayReadExports(Request $request): void
    {
        $user = $request->user();
        abort_unless($user->hasPermission(ReportCatalogue::EXPORT) || $user->hasPermission(ReportCatalogue::SCHEDULE), 403);
    }

    private function owned(Request $request, int $export): ReportExport
    {
        return ReportExport::query()->where('user_id', $request->user()->id)->current()->findOrFail($export);
    }
}
