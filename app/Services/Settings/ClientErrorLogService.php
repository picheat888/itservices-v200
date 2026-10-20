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
        Log::channel(LogSource::FRONTEND)->error(self::oneLine($report['message']), [
            'kind' => self::oneLine($report['kind']),
            'source' => self::oneLine($report['source'] ?? null),
            'url' => self::oneLine($report['url'] ?? null),
            'server_request_id' => $report['request_id'] ?? null,
            'user_id' => $userId,
            'user_agent' => $userAgent !== null ? mb_substr($userAgent, 0, 300) : null,
            'stack' => $report['stack'] ?? null,
        ]);
    }

    /** Browser text on one line, so a report can never start a log entry of its own. */
    private static function oneLine(?string $text): ?string
    {
        if ($text === null) {
            return null;
        }

        return preg_replace('/\R+/u', ' ', $text) ?? str_replace(["\r", "\n"], ' ', $text);
    }
}
