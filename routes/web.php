<?php

use App\Http\Controllers\Api\Report\ReportExportController;
use App\Http\Controllers\Api\Stock\StockItemController;
use App\Http\Controllers\Api\Stock\StockMovementController;
use App\Http\Controllers\File\FileController;
use App\Http\Middleware\BlockResignedEmployees;
use App\Http\Middleware\CheckPasswordExpiry;
use App\Http\Middleware\CheckSessionTimeout;
use App\Http\Middleware\TrackDevice;
use App\Models\Settings\AppSetting;
use Illuminate\Support\Facades\Route;

// Same sign-in checks as the API group: timeout, signed-out devices, closed accounts and owed password changes
$signedIn = ['auth:sanctum', CheckSessionTimeout::class, TrackDevice::class, BlockResignedEmployees::class, CheckPasswordExpiry::class];

// Server-rendered PDFs (dompdf), opened in a browser tab; each controller checks its permission
Route::middleware($signedIn)->prefix('pdf')->group(function () {
    Route::get('stock-items/{stockItem}/history', [StockItemController::class, 'historyPdf'])->name('pdf.stock-items.history');
    Route::get('stock-movements/{movement}/labels', [StockMovementController::class, 'labelsPdf'])->name('pdf.stock-movements.labels');
});

// Private uploads, each gated to the record's viewers (company branding stays public)
Route::middleware($signedIn)->prefix('files')->group(function () {
    Route::get('tickets/attachments/{attachment}', [FileController::class, 'ticketAttachment'])->name('files.ticket-attachment');
    Route::get('contracts/attachments/{attachment}', [FileController::class, 'contractAttachment'])->name('files.contract-attachment');
    Route::get('service-requests/attachments/{attachment}', [FileController::class, 'requestAttachment'])->name('files.request-attachment');
    Route::get('report-exports/{export}', [ReportExportController::class, 'downloadFromEmail'])->whereNumber('export')->middleware('signed:relative')->name('files.report-export');
    Route::get('employees/{employee}/photo', [FileController::class, 'employeePhoto'])->name('files.employee-photo');
    Route::get('software/{software}/logo', [FileController::class, 'softwareLogo'])->name('files.software-logo');
    Route::get('social-platforms/{socialPlatform}/logo', [FileController::class, 'socialLogo'])->name('files.social-logo');
});

// SPA entry for every other path; the brand travels with the page (read here, not in the Blade view)
Route::get('/{any?}', function () {
    return view('app', ['brand' => AppSetting::brand()]);
})->where('any', '^(?!api|sanctum|storage|build|pdf|files).*$')->name('spa');
