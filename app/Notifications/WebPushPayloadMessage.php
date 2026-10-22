<?php

// A Web Push message whose wire JSON is exactly the given payload (the package's WebPushMessage nests it under "data").

namespace App\Notifications;

use NotificationChannels\WebPush\WebPushMessageInterface;

final class WebPushPayloadMessage implements WebPushMessageInterface
{
    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, mixed>  $options
     */
    public function __construct(private readonly array $payload, private readonly array $options = []) {}

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->payload;
    }

    /** @return array<string, mixed> */
    public function getOptions(): array
    {
        return $this->options;
    }
}
