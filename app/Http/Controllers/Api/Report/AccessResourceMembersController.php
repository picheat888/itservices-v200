<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Http\Requests\Report\TabularReportRequest;
use App\Services\Report\Access\AccessResourceMembersReport;
use App\Support\CompanyProfile;
use App\Support\DateDisplay;
use App\Support\DocumentName;
use App\Support\PdfFooter;
use App\Support\ReportCatalogue;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
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
        abort_unless((bool) $request->user()->hasPermission(ReportCatalogue::EXPORT), 403);

        /** @var AccessResourceMembersReport $report */
        $report = $request->report();
        $sheet = $report->sheet($request->filters()) ?? abort(404);

        $company = CompanyProfile::get();
        $printedBy = $request->user()?->name ?? '';
        $printedAt = DateDisplay::dateTime(now());
        $pdf = Pdf::loadView('pdf.reports.access-review-sheet', [
            'sheet' => $sheet,
            'logo' => $company['logo'],
            'company' => CompanyProfile::issuer($company),
            'printedBy' => $printedBy,
            'printedAt' => $printedAt,
            'dateConfig' => DateDisplay::config(),
        ])->setPaper('a4', 'portrait');
        PdfFooter::stamp($pdf, $company['app_name'], "พิมพ์โดย {$printedBy} เมื่อ {$printedAt}", 'หน้า {PAGE_NUM} / {PAGE_COUNT}');
        $bytes = $pdf->output();
        $filename = DocumentName::make('AccessReview', [(string) $sheet['code']]);

        return new StreamedResponse(function () use ($bytes) {
            echo $bytes;
        }, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => HeaderUtils::makeDisposition('inline', $filename, 'access-review.pdf'),
        ]);
    }
}
