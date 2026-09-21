<?php

use App\Http\Controllers\Api\Stock\StockItemController;
use App\Http\Controllers\Api\Stock\StockMovementController;
use App\Http\Controllers\File\FileController;
use App\Http\Middleware\CheckSessionTimeout;
use App\Models\Settings\AppSetting;
use Illuminate\Support\Facades\Route;

// Server-rendered documents (dompdf). These return binary PDFs and are opened
// in a browser tab, so they ride the web/session stack rather than the JSON API.
// Auth + per-action permission are enforced exactly as the API routes were
// (auth:sanctum + session timeout here; the stock.view gate lives in the controller).
Route::middleware(['auth:sanctum', CheckSessionTimeout::class])->prefix('pdf')->group(function () {
    Route::get('stock-items/{stockItem}/history', [StockItemController::class, 'historyPdf'])->name('pdf.stock-items.history');
    Route::get('stock-movements/{movement}/labels', [StockMovementController::class, 'labelsPdf'])->name('pdf.stock-movements.labels');
});

// Private uploads (ticket/contract attachments, employee photos, access logos).
// Stored off the public disk; each route is gated to the record's viewers.
// Company branding is NOT here — it stays public for the login page & emails.
Route::middleware(['auth:sanctum', CheckSessionTimeout::class])->prefix('files')->group(function () {
    Route::get('tickets/attachments/{attachment}', [FileController::class, 'ticketAttachment'])->name('files.ticket-attachment');
    Route::get('contracts/attachments/{attachment}', [FileController::class, 'contractAttachment'])->name('files.contract-attachment');
    Route::get('service-requests/attachments/{attachment}', [FileController::class, 'requestAttachment'])->name('files.request-attachment');
    Route::get('employees/{employee}/photo', [FileController::class, 'employeePhoto'])->name('files.employee-photo');
    Route::get('software/{software}/logo', [FileController::class, 'softwareLogo'])->name('files.software-logo');
    Route::get('social-platforms/{socialPlatform}/logo', [FileController::class, 'socialLogo'])->name('files.social-logo');
});

// SPA entry — every non-API, non-asset, non-pdf path renders the React app,
// which handles client-side routing via react-router.
//
// The brand travels with the page rather than being fetched after it. The SPA used to
// start from VITE_APP_NAME — baked into the JS bundle at build time — and correct
// itself once /api/settings answered, so every reload showed a build-time name for the
// length of a round-trip. Read here, not inside the view, because a Blade template is
// not where this app queries anything.
Route::get('/{any?}', function () {
    return view('app', ['brand' => AppSetting::brand()]);
})->where('any', '^(?!api|sanctum|storage|build|pdf|files).*$')->name('spa');
