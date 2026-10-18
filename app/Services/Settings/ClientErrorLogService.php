<?php

namespace App\Services\Settings;

use App\Support\LogSource;
use Illuminate\Support\Facades\Log;

// Writes a browser error reported by the SPA into logs/frontend.
class ClientErrorLogService
{
    /**
     * @param  array{kind: string, message: string, stack?: ?string, source?: ?string, url?: ?string, request_id?: ?string}  $report
     */
    public function record(array $report, ?int $userId, ?string $userAgent): void
    {
        Log::channel(LogSource::FRONTEND)->error($report['message'], [
            'kind' => $report['kind'],
            'source' => $report['source'] ?? null,
            'url' => $report['url'] ?? null,
            'server_request_id' => $report['request_id'] ?? null,
            'user_id' => $userId,
            'user_agent' => $userAgent !== null ? mb_substr($userAgent, 0, 300) : null,
            'stack' => $report['stack'] ?? null,
        ]);
    }
}
