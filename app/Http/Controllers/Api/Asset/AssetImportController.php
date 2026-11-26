<?php

// Asset import endpoints. For now only the template download.

namespace App\Http\Controllers\Api\Asset;

use App\Exports\Asset\AssetImportTemplate;
use App\Http\Controllers\Controller;
use App\Http\Requests\Asset\AssetImportTemplateRequest;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AssetImportController extends Controller
{
    public function template(AssetImportTemplateRequest $request, AssetImportTemplate $template): StreamedResponse
    {
        return $template->download($request->string('kind')->toString());
    }
}
