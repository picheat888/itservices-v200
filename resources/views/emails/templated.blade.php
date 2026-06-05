@php
    $brandName = $brand ?? config('app.name', 'IT Service Desk');
    $initials = collect(explode(' ', trim($brandName)))
        ->filter()
        ->map(fn ($w) => mb_strtoupper(mb_substr($w, 0, 1)))
        ->take(2)
        ->implode('') ?: 'IT';
@endphp
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>{{ $subjectLine ?? $brandName }}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;">
        <tr>
            <td align="center" style="padding:32px 16px;">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2a44;">

                    {{-- Brand header --}}
                    <tr>
                        <td style="padding:4px 8px 18px;">
                            <table role="presentation" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="width:34px;height:34px;background:#2563eb;border-radius:9px;color:#ffffff;font-weight:800;font-size:16px;text-align:center;line-height:34px;">{{ $initials }}</td>
                                    <td style="padding-left:10px;">
                                        <div style="font-size:15px;font-weight:700;color:#0f172a;">{{ $brandName }}</div>
                                        @if (!empty($eyebrow))
                                            <div style="font-size:11px;color:#64748b;margin-top:1px;">{{ $eyebrow }}</div>
                                        @endif
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    {{-- Content card --}}
                    <tr>
                        <td style="background:#ffffff;border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 12px 30px -16px rgba(15,23,42,.18);">
                            <div style="height:4px;background:#2563eb;border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</div>
                            <div style="padding:28px 34px 6px;font-size:15px;line-height:1.62;color:#334155;">
                                {!! $bodyHtml !!}
                            </div>

                            @if (!empty($actionUrl))
                                <div style="padding:8px 34px 30px;">
                                    <a href="{{ $actionUrl }}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14.5px;font-weight:600;padding:13px 26px;border-radius:10px;">{{ $actionLabel ?? 'Open in portal' }} &nbsp;&rarr;</a>
                                    <div style="font-size:12px;color:#94a3b8;margin-top:12px;">&#128274; You'll be asked to <span style="color:#64748b;font-weight:600;">sign in</span> to view this in the portal.</div>
                                </div>
                            @endif
                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td style="padding:22px 12px 4px;text-align:center;">
                            <div style="font-size:11.5px;color:#94a3b8;line-height:1.6;">{{ $brandName }} &middot; This is an automated message — please do not reply.</div>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
