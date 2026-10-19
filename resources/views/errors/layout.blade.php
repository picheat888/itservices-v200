{{-- Shared page for HTTP errors 401/403/404/419/429/500/503: inline CSS and script, no Vite and no database.
     $page comes from App\Support\ErrorPage (view composer); the script applies the reader's app theme, language and accent. --}}
<!DOCTYPE html>
<html lang="{{ $page['lang'] }}" data-accent="{{ $page['accent'] }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="color-scheme" content="light dark">
    <title>{{ $page['code'] }} - {{ $page['brand']['name'] }}</title>

    <link rel="icon" href="{{ $page['brand']['logo_url'] }}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">

    <script>
        // The reader's app choices (SPA localStorage entry itservices-ui): theme, language, accent
        (function () {
            var root = document.documentElement;
            var ui = {};
            try {
                ui = JSON.parse(localStorage.getItem('itservices-ui')).state || {};
            } catch (e) {}

            try {
                if (ui.dark === true) root.classList.add('dark');
                if (ui.dark === false) root.classList.add('light');
                if (ui.lang === 'th' || ui.lang === 'en') root.lang = ui.lang;

                var accent = /^#[0-9a-f]{6}$/i.test(ui.accent) ? ui.accent : root.getAttribute('data-accent');
                var darkBrand = resolveDarkBrand(accent);
                root.style.setProperty('--brand-light', accent);
                root.style.setProperty('--brand-light-fg', brandForeground(accent));
                root.style.setProperty('--brand-dark', darkBrand);
                root.style.setProperty('--brand-dark-fg', brandForeground(darkBrand));
            } catch (e) {}

            document.addEventListener('DOMContentLoaded', function () {
                try {
                    var lang = root.lang;
                    if (lang === 'th' || lang === 'en') {
                        document.querySelectorAll('[data-lang]').forEach(function (block) {
                            block.hidden = block.getAttribute('data-lang') !== lang;
                        });
                    }

                    // Copy buttons show only where the clipboard works
                    if (!navigator.clipboard) return;
                    document.querySelectorAll('[data-copy]').forEach(function (button) {
                        button.hidden = false;
                        button.addEventListener('click', function () {
                            navigator.clipboard.writeText(button.getAttribute('data-copy')).then(function () {
                                button.classList.add('is-copied');
                                setTimeout(function () { button.classList.remove('is-copied'); }, 1500);
                            }, function () {});
                        });
                    });
                } catch (e) {}
            });

            // Port of resolveBrand (dark) and brandForeground, shared/lib/brand-color.ts
            function rgb(hex) {
                return [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); });
            }
            function luminance(color) {
                var linear = color.map(function (value) {
                    var channel = value / 255;
                    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
                });
                return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
            }
            function contrast(first, second) {
                var a = luminance(first);
                var b = luminance(second);
                return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            }
            function toHex(color) {
                return '#' + color.map(function (value) { return Math.round(value).toString(16).padStart(2, '0'); }).join('');
            }
            function resolveDarkBrand(hex) {
                var base = rgb(hex);
                for (var step = 0; step <= 20; step++) {
                    var share = step * 0.05;
                    var shade = base.map(function (value) { return 255 * share + value * (1 - share); });
                    if (contrast(shade, [19, 23, 32]) >= 5.6) return toHex(shade);
                }
                return '#ffffff';
            }
            function brandForeground(hex) {
                var color = rgb(hex);
                return contrast(color, [255, 255, 255]) >= contrast(color, [15, 23, 42]) ? '#ffffff' : '#0f172a';
            }
        })();
    </script>

    <style>
        /* App tokens, resources/css/app.css (light) */
        :root {
            color-scheme: light;
            --background: hsl(0, 0%, 100%);
            --foreground: hsl(222, 30%, 12%);
            --muted-foreground: hsl(215, 16%, 45%);
            --accent: hsl(210, 24%, 95%);
            --danger: #dc2626;
            --wait: #d97706;
            --brand: var(--brand-light, {{ $page['accent'] }});
            --brand-fg: var(--brand-light-fg, {{ $page['accentForeground'] }});
        }

        /* Dark: the reader's app switch */
        .dark {
            color-scheme: dark;
            --background: hsl(222, 24%, 10%);
            --foreground: hsl(210, 20%, 96%);
            --muted-foreground: hsl(215, 15%, 65%);
            --accent: hsl(217, 19%, 18%);
            --danger: #f87171;
            --wait: #fbbf24;
            --brand: var(--brand-dark, #6692f1);
            --brand-fg: var(--brand-dark-fg, #0f172a);
        }

        /* Dark: the OS preference when the reader never chose */
        @media (prefers-color-scheme: dark) {
            :root:not(.light) {
                color-scheme: dark;
                --background: hsl(222, 24%, 10%);
                --foreground: hsl(210, 20%, 96%);
                --muted-foreground: hsl(215, 15%, 65%);
                --accent: hsl(217, 19%, 18%);
                --danger: #f87171;
                --wait: #fbbf24;
                --brand: var(--brand-dark, #6692f1);
                --brand-fg: var(--brand-dark-fg, #0f172a);
            }
        }

        [hidden] { display: none !important; }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            min-height: 100dvh;
            display: grid;
            grid-template-rows: 1fr auto 1fr;
            justify-items: center;
            padding: 0 16px;
            background: var(--background);
            color: var(--foreground);
            font-family: 'Noto Sans Thai', system-ui, -apple-system, sans-serif;
            -webkit-font-smoothing: antialiased;
        }

        .brand {
            align-self: start;
            display: flex;
            align-items: center;
            gap: 10px;
            padding-top: 32px;
            font-size: 14px;
            font-weight: 700;
        }

        .brand img {
            width: 28px;
            height: 28px;
            object-fit: contain;
        }

        main {
            width: 100%;
            max-width: 384px;
            padding: 24px;
            text-align: center;
        }

        .code {
            margin-bottom: 16px;
            font-size: 56px;
            font-weight: 700;
            line-height: 1;
            letter-spacing: -0.02em;
        }

        .code[data-tone="danger"] { color: var(--danger); }
        .code[data-tone="wait"] { color: var(--wait); }
        .code[data-tone="info"] { color: var(--brand); }

        h1 {
            margin: 0 0 4px;
            font-size: 16px;
            font-weight: 600;
            line-height: 1.5;
        }

        .body {
            margin: 0 0 20px;
            font-size: 14px;
            line-height: 1.6;
            color: var(--muted-foreground);
        }

        .body.before-reference { margin-bottom: 16px; }

        /* Reference row (500) */
        .reference {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            margin-bottom: 20px;
            font-size: 12px;
            color: var(--muted-foreground);
        }

        .reference-code {
            color: var(--foreground);
            font-weight: 500;
            word-break: break-all;
        }

        .copy {
            width: 28px;
            height: 28px;
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: var(--muted-foreground);
            cursor: pointer;
        }

        .copy:hover { background: var(--accent); color: var(--foreground); }
        .copy .icon-check, .copy.is-copied .icon-copy { display: none; }
        .copy.is-copied .icon-check { display: block; }

        /* Buttons: primary filled, then ghost */
        .actions {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .button {
            min-height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            text-decoration: none;
            transition: background-color 0.15s ease-out, color 0.15s ease-out;
        }

        .button.primary { background: var(--brand); color: var(--brand-fg); }
        .button.primary:hover { background: color-mix(in srgb, var(--brand) 90%, transparent); }
        .button.ghost { color: var(--muted-foreground); }
        .button.ghost:hover { background: var(--accent); color: var(--foreground); }

        .button:focus-visible, .copy:focus-visible {
            outline: 2px solid var(--brand);
            outline-offset: 2px;
        }

        @media (prefers-reduced-motion: reduce) {
            .button { transition: none; }
        }
    </style>
</head>
<body>
    <header class="brand">
        <img src="{{ $page['brand']['logo_url'] }}" alt="" width="28" height="28">
        <span>{{ $page['brand']['name'] }}</span>
    </header>

    <main>
        <div class="code" data-tone="{{ $page['tone'] }}">{{ $page['code'] }}</div>

        {{-- One block per language; the script shows the reader's --}}
        @foreach ($page['texts'] as $lang => $text)
            <div data-lang="{{ $lang }}" lang="{{ $lang }}" {{ $lang === $page['lang'] ? '' : 'hidden' }}>
                <h1>{{ $text['title'] }}</h1>
                <p @class(['body', 'before-reference' => $page['reference'] !== null])>{{ $text['body'] }}</p>

                @if ($page['reference'] !== null)
                    <div class="reference">
                        <span>{{ __('errors.reference', [], $lang) }}</span>
                        <span class="reference-code">{{ $page['reference'] }}</span>
                        <button type="button" class="copy" data-copy="{{ $page['reference'] }}" aria-label="{{ __('errors.copy_reference', [], $lang) }}" hidden>
                            <svg class="icon-copy" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
                            <svg class="icon-check" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
                        </button>
                    </div>
                @endif

                <div class="actions">
                    @foreach ($page['actions'] as $action)
                        <a href="{{ $action['href'] }}" @class(['button', 'primary' => $action['primary'], 'ghost' => ! $action['primary']])>{{ $action['label'][$lang] }}</a>
                    @endforeach
                </div>
            </div>
        @endforeach
    </main>
</body>
</html>
