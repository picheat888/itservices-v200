<?php

use Illuminate\Support\Facades\Route;

// SPA entry — every non-API, non-asset path renders the React app,
// which handles client-side routing via react-router.
Route::get('/{any?}', function () {
    return view('app');
})->where('any', '^(?!api|sanctum|storage|build).*$')->name('spa');
