<?php

// Keys of the built-in notification sounds; the first four are mp3 files in public/sounds, the rest are synthesised in the browser.

namespace App\Support;

final class NotificationSounds
{
    public const KEYS = [
        'pluck', 'ping', 'double', 'knock', 'chime', 'ding', 'bell', 'pop', 'two_note', 'glass',
        'marimba', 'bubble', 'blip', 'tri_tone', 'rise', 'fall', 'soft', 'click', 'harp',
    ];

    /** Sounds shipped as public/sounds/<key>.mp3. */
    public const FILES = ['pluck', 'ping', 'double', 'knock'];

    public const DEFAULT = 'pluck';
}
