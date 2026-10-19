<?php

/** English words of the Blade error pages — the same keys as lang/th/errors.php. */
return [

    // Title and one-line description per HTTP code
    '401' => [
        'title' => 'Unauthorized',
        'body' => 'Please sign in to view this page.',
    ],
    '403' => [
        'title' => 'Forbidden',
        'body' => "You don't have permission to access this page.",
    ],
    '404' => [
        'title' => 'Not Found',
        'body' => "The page you are looking for doesn't exist or has been moved.",
    ],
    '419' => [
        'title' => 'Page Expired',
        'body' => 'This page has expired. Please refresh and try again.',
    ],
    '429' => [
        'title' => 'Too Many Requests',
        'body' => 'Please wait a moment and try again.',
    ],
    '500' => [
        'title' => 'Internal Server Error',
        'body' => 'There was an error. Please try again later.',
    ],
    '503' => [
        'title' => 'Service Unavailable',
        'body' => '{1} We are down for maintenance. Please check back in about :minutes minute.|[2,*] We are down for maintenance. Please check back in about :minutes minutes.',
        'body_later' => 'We are down for maintenance. Please check back later.',
    ],

    // Buttons
    'actions' => [
        'sign_in' => 'Sign in',
        'reload' => 'Reload',
        'dashboard' => 'Back to Dashboard',
    ],

    // Reference row (500)
    'reference' => 'Reference',
    'copy_reference' => 'Copy reference code',

];
