<?php

namespace App\Enums\Ticket;

/**
 * What a resolution target is keyed on.
 *
 * The two scopes answer different questions and that is why both exist: a priority says how
 * URGENT a case is, judged by whoever picks it up; a request type says how LONG the work takes,
 * which is settled the moment somebody chooses what to ask for. "A new monitor" can be urgent
 * and still take three days to procure, and one number per case could never say both.
 */
enum SlaScope: string
{
    case Priority = 'priority';
    case RequestType = 'request_type';

    /**
     * Which scope wins when a case matches both.
     *
     * Request type first, deliberately: a case opened from a request is always given a priority
     * when somebody takes it, so the other order would leave a request-type target that could
     * never once apply.
     *
     * @return list<self>
     */
    public static function precedence(): array
    {
        return [self::RequestType, self::Priority];
    }
}
