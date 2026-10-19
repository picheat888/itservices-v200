<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <title>{{ $brand['name'] }}</title>

        {{-- The uploaded logo (Settings → Branding) when there is one, so the tab icon
             is right in the first byte instead of being swapped by JS a moment later. --}}
        @if ($brand['logo_url'])
            <link rel="icon" href="{{ $brand['logo_url'] }}">
        @else
            <link rel="icon" type="image/svg+xml" href="{{ asset('logo.svg') }}">
        @endif

        {{-- What the SPA's UI store starts from. JSON_HEX_TAG matters: a brand name is
             typed by an administrator, and inside a <script> block the usual HTML
             escaping does not apply — without it, a name containing </script> ends the
             block early. --}}
        <script id="brand" type="application/json">@json($brand, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)</script>

        {{-- Noto Sans Thai from this server (licence: public/fonts/noto-sans-thai/OFL.txt) --}}
        <link rel="preload" href="/fonts/noto-sans-thai/noto-sans-thai-thai-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
        <link rel="stylesheet" href="/fonts/noto-sans-thai/noto-sans-thai.css">

        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app/App.tsx'])
    </head>
    <body class="font-sans antialiased">
        <div id="app"></div>
    </body>
</html>
