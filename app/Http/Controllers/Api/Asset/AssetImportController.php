<?php

// Asset import endpoints: template download and the row-by-row check of an uploaded file.

namespace App\Http\Controllers\Api\Asset;

use App\Exports\Asset\AssetImportTemplate;
use App\Http\Controllers\Controller;
use App\Http\Requests\Asset\AssetImportPreviewRequest;
use App\Http\Requests\Asset\AssetImportTemplateRequest;
use App\Services\Asset\AssetImportChecker;
use App\Services\Asset\AssetImportReader;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AssetImportController extends Controller
{
    public function template(AssetImportTemplateRequest $request, AssetImportTemplate $template): StreamedResponse
    {
        return $template->download($request->string('kind')->toString());
    }

    public function preview(AssetImportPreviewRequest $request, AssetImportReader $reader, AssetImportChecker $checker): JsonResponse
    {
        $kind = $request->string('kind')->toString();
        $read = $reader->read($request->file('file'), $kind);

        return response()->json(['data' => $checker->check($kind, $read['rows'], $read['ignored'])]);
    }
}
