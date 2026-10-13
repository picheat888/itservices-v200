<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Models\Settings\AppSetting;
use App\Services\Report\Access\AccessResourceMembersReport;
use App\Support\DateDisplay;
use App\Support\DocumentName;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * GET /api/reports/access/resource-members/breakdown and /sheet — the "ตรวจสอบสมาชิกและเจ้าของ" page's
 * cards, and one resource's member review sheet as a PDF for its owner. The routes pin {key} to
 * access.resource_members, so TabularReportRequest gates and validates both as it does the rows.
 */
class AccessResourceMembersController extends Controller
{
    public function breakdown(TabularReportRequest $request): JsonResponse
    {
        /** @var AccessResourceMembersReport $report */
        $report = $request->report();

        return response()->json(['data' => $report->breakdown($request->user(), $request->filters())]);
    }

    public function sheet(TabularReportRequest $request): StreamedResponse
    {
        /** @var AccessResourceMembersReport $report */
        $report = $request->report();
        $sheet = $report->sheet($request->filters()) ?? abort(404);

        $logo = null;
        $logoPath = AppSetting::get('logo_path');
        if ($logoPath && Storage::disk('public')->exists($logoPath)) {
            $logo = 'data:'.Storage::disk('public')->mimeType($logoPath).';base64,'.base64_encode(Storage::disk('public')->get($logoPath));
        }

        $bytes = Pdf::loadView('pdf.reports.access-review-sheet', [
            'sheet' => $sheet,
            'logo' => $logo,
            'company' => AppSetting::get('company_name', 'ABCD Electric Company'),
            'printedBy' => $request->user()?->name ?? '',
            'printedAt' => DateDisplay::dateTime(now()),
        ])->setPaper('a4', 'portrait')->output();
        $filename = DocumentName::make('AccessReview', [(string) $sheet['code']]);

        return new StreamedResponse(function () use ($bytes) {
            echo $bytes;
        }, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => HeaderUtils::makeDisposition('inline', $filename, 'access-review.pdf'),
        ]);
    }
}
