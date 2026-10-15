<?php

use App\Exports\SafeValueBinder;

// Laravel Excel overrides; the package's other defaults merge in (mergeConfigFrom).
return [
    'value_binder' => [
        'default' => SafeValueBinder::class,
    ],
];
