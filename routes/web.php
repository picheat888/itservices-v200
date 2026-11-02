<?php

use App\Http\Controllers\Api\Report\ReportExportController;
use App\Http\Controllers\Api\Stock\StockCountController;
use App\Http\Controllers\Api\Stock\StockItemController;
use App\Http\Controllers\Api\Stock\StockLotController;
use App\Http\Controllers\Api\Stock\StockMovementController;
use App\Http\Controllers\Api\Stock\StockRequestController;
use App\Http\Controllers\AppIconController;
use App\Http\Controllers\File\FileController;
use App\Http\Controllers\ServiceWorkerController;
use App\Http\Controllers\WebManifestController;
use App\Http\Middleware\BlockResignedEmployees;
use App\Http\Middleware\CheckPasswordExpiry;
use App\Http\Middleware\CheckSessionTimeout;
use App\Http\Middleware\TrackDevice;
use App\Models\Settings\AppSetting;
use App\Services\Settings\AppIconService;
use Illuminate\Support\Facades\Route;

// Same sign-in checks as the API group: timeout, signed-out devices, closed accounts and owed password changes
$signedIn = ['auth:sanctum', CheckSessionTimeout::class, TrackDevice::class, BlockResignedEmployees::class, CheckPasswordExpiry::class];

// Server-rendered PDFs (dompdf), opened in a browser tab; each controller checks its permission
Route::middleware([...$signedIn, 'throttle:pdf'])->prefix('pdf')->group(function () {
    Route::get('stock-items/{stockItem}/history', [StockItemController::class, 'historyPdf'])->name('pdf.stock-items.history');
    Route::get('stock-counts/{stockCount}', [StockCountController::class, 'pdf'])->name('pdf.stock-counts.show');
    Route::get('stock-movements/{movement}/labels', [StockMovementController::class, 'labelsPdf'])->name('pdf.stock-movements.labels');
    Route::get('stock-lots/{lotNo}/labels', [StockLotController::class, 'labelsPdf'])->name('pdf.stock-lots.labels');
    Route::get('stock-requests/{stockRequest}/issue', [StockRequestController::class, 'issuePdf'])->name('pdf.stock-requests.issue');
});

// Private uploads, each gated to the record's viewers (company branding stays public)
Route::middleware([...$signedIn, 'throttle:files'])->prefix('files')->group(function () {
    Route::get('tickets/attachments/{attachment}', [FileController::class, 'ticketAttachment'])->name('files.ticket-attachment');
    Route::get('contracts/attachments/{attachment}', [FileController::class, 'contractAttachment'])->name('files.contract-attachment');
    Route::get('service-requests/attachments/{attachment}', [FileController::class, 'requestAttachment'])->name('files.request-attachment');
    Route::get('report-exports/{export}', [ReportExportController::class, 'downloadFromEmail'])->whereNumber('export')->middleware('signed:relative')->name('files.report-export');
    Route::get('employees/{employee}/photo', [FileController::class, 'employeePhoto'])->name('files.employee-photo');
    Route::get('software/{software}/logo', [FileController::class, 'softwareLogo'])->name('files.software-logo');
    Route::get('social-platforms/{socialPlatform}/logo', [FileController::class, 'socialLogo'])->name('files.social-logo');
});

// Service worker and web app manifest, served from the root (before the SPA catch-all)
Route::get('/sw.js', ServiceWorkerController::class)->name('service-worker');
Route::get('/manifest.webmanifest', WebManifestController::class)->name('web-manifest');
Route::get('/app-icons/{name}.png', AppIconController::class)->whereIn('name', array_keys(AppIconService::ICONS))->name('app-icon');

// SPA entry for every other path; the brand travels with the page (read here, not in the Blade view)
Route::get('/{any?}', function (AppIconService $icons) {
    return view('app', ['brand' => AppSetting::brand(), 'appleTouchIcon' => $icons->url('apple-touch')]);
})->where('any', '^(?!api|sanctum|storage|build|pdf|files|app-icons).*$')->middleware('throttle:page')->name('spa');
