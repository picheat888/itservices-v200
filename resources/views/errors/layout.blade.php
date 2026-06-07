{{--
    Layout กลางสำหรับหน้า HTTP error ทุกหน้า (401/403/404/419/429/500/503)
    ออกแบบให้ self-contained: ใช้ inline CSS ทั้งหมด ไม่พึ่ง Vite build
    เพื่อให้แสดงผลได้แม้ตอนที่ build/CSS/DB ของแอปจะพังก็ตาม
    หน้าลูกแต่ละ code override ผ่าน @section: code, title, heading, message
--}}
<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>@yield('code') · {{ config('app.name', 'IT Services V2.0') }}</title>

    <link rel="icon" href="/logo.svg" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">

    <style>
        :root {
            --brand: #2563eb;
            --brand-strong: #1d4ed8;
            --bg: #f8fafc;
            --bg-glow: rgba(37, 99, 235, 0.08);
            --card: #ffffff;
            --border: #e2e8f0;
            --fg: #0f172a;
            --muted: #64748b;
            --code: #e2e8f0;
            --shadow: 0 20px 50px -12px rgba(15, 23, 42, 0.18);
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --brand: #3b82f6;
                --brand-strong: #60a5fa;
                --bg: #0b1120;
                --bg-glow: rgba(59, 130, 246, 0.12);
                --card: #111a2e;
                --border: #1e293b;
                --fg: #e2e8f0;
                --muted: #94a3b8;
                --code: #1e293b;
                --shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.5);
            }
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background:
                radial-gradient(60rem 60rem at 50% -20%, var(--bg-glow), transparent 60%),
                var(--bg);
            color: var(--fg);
            font-family: 'Noto Sans Thai', 'Manrope', system-ui, -apple-system, sans-serif;
            -webkit-font-smoothing: antialiased;
        }

        .card {
            width: 100%;
            max-width: 560px;
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 20px;
            box-shadow: var(--shadow);
            padding: 48px 48px;
            text-align: center;
        }

        .logo {
            width: 56px;
            height: 56px;
            margin: 0 auto 28px;
            display: block;
        }

        .code {
            font-family: 'Manrope', sans-serif;
            font-size: 88px;
            font-weight: 800;
            line-height: 1;
            letter-spacing: -0.04em;
            background: linear-gradient(135deg, var(--brand), var(--brand-strong));
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            color: var(--brand);
        }

        /* บรรทัด 1: หัวเรื่องภาษาอังกฤษ */
        .heading-en {
            margin-top: 16px;
            font-family: 'Manrope', sans-serif;
            font-size: 22px;
            font-weight: 700;
            letter-spacing: -0.01em;
        }

        /* บรรทัด 2: หัวเรื่องภาษาไทย */
        .heading-th {
            margin-top: 4px;
            font-size: 17px;
            font-weight: 600;
            color: var(--fg);
            opacity: 0.85;
        }

        .message {
            margin-top: 14px;
            font-size: 14px;
            line-height: 1.7;
            color: var(--muted);
        }
        /* บรรทัด 1 EN, บรรทัด 2 TH ของคำอธิบาย */
        .message .en { display: block; }
        .message .th { display: block; margin-top: 4px; }

        .home-link {
            display: inline-block;
            margin-top: 32px;
            font-size: 14px;
            font-weight: 600;
            color: var(--brand);
            text-decoration: none;
            transition: opacity 0.15s ease;
        }
        .home-link:hover { opacity: 0.7; }

        .ref {
            margin-top: 28px;
            font-size: 12px;
            color: var(--muted);
            font-family: 'Manrope', monospace;
        }
    </style>
</head>
<body>
    <main class="card">
        <img src="/logo.svg" alt="{{ config('app.name', 'IT Services') }}" class="logo">

        <div class="code">@yield('code')</div>
        <h1 class="heading-en">@yield('heading_en')</h1>
        <p class="heading-th">@yield('heading_th')</p>
        <p class="message">
            <span class="en">@yield('message_en')</span>
            <span class="th">@yield('message_th')</span>
        </p>

        <a href="/" class="home-link">Back to home · กลับหน้าหลัก</a>

        @hasSection('ref')
            <p class="ref">@yield('ref')</p>
        @endif
    </main>
</body>
</html>
