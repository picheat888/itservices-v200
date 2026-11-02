<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <title>{{ $brand['name'] }}</title>

        {{-- Uploaded logo (Settings → Branding) as the tab icon from the first byte --}}
        @if ($brand['logo_url'])
            <link rel="icon" href="{{ $brand['logo_url'] }}">
        @else
            <link rel="icon" type="image/svg+xml" href="{{ asset('logo.svg') }}">
        @endif

        {{-- Add to Home Screen (web push on iPad needs the installed app) --}}
        <link rel="manifest" href="/manifest.webmanifest">
        <link rel="apple-touch-icon" href="{{ $appleTouchIcon }}">
        <meta name="mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-capable" content="yes">

        {{-- What the SPA's UI store starts from; JSON_HEX_TAG keeps an admin-typed brand name inside the block --}}
        <script id="brand" type="application/json">@json($brand, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)</script>

        {{-- Noto Sans Thai from this server (licence: public/fonts/noto-sans-thai/OFL.txt) --}}
        <link rel="preload" href="/fonts/noto-sans-thai/noto-sans-thai-thai-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
        <link rel="stylesheet" href="/fonts/noto-sans-thai/noto-sans-thai.css">

        {{-- Saved dark mode (SPA localStorage entry itservices-ui) before the first paint --}}
        <script>
            try {
                if (JSON.parse(localStorage.getItem('itservices-ui')).state.dark === true) document.documentElement.classList.add('dark');
            } catch (e) {}
        </script>

        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app/App.tsx'])
    </head>
    <body class="font-sans antialiased">
        <div id="app"></div>
    </body>
</html>
