<?php

use App\Http\Controllers\Api\Stock\StockItemController;
use App\Http\Controllers\Api\Stock\StockMovementController;
use App\Http\Middleware\CheckSessionTimeout;
use Illuminate\Support\Facades\Route;

// Server-rendered documents (dompdf). These return binary PDFs and are opened
// in a browser tab, so they ride the web/session stack rather than the JSON API.
// Auth + per-action permission are enforced exactly as the API routes were
// (auth:sanctum + session timeout here; the stock.view gate lives in the controller).
Route::middleware(['auth:sanctum', CheckSessionTimeout::class])->prefix('pdf')->group(function () {
    Route::get('stock-items/{stockItem}/history', [StockItemController::class, 'historyPdf'])->name('pdf.stock-items.history');
    Route::get('stock-movements/{movement}/labels', [StockMovementController::class, 'labelsPdf'])->name('pdf.stock-movements.labels');
});

// SPA entry — every non-API, non-asset, non-pdf path renders the React app,
// which handles client-side routing via react-router.
Route::get('/{any?}', function () {
    return view('app');
})->where('any', '^(?!api|sanctum|storage|build|pdf).*$')->name('spa');
