@php
    $brandName = $brand ?? config('app.name', 'IT Service Desk');
    $initials = collect(explode(' ', trim($brandName)))
        ->filter()
        ->map(fn ($w) => mb_strtoupper(mb_substr($w, 0, 1)))
        ->take(2)
        ->implode('') ?: 'IT';
    // Hidden preheader (inbox preview line). Falls back to the eyebrow/brand.
    $preheader = $eyebrow ? "{$brandName} — {$eyebrow}" : $brandName;
    // In the in-app preview the CTA is illustrative only — render it inert.
    $isPreview = $preview ?? false;
    // Strip default paragraph spacing (inline, so Outlook honours it too) — authors
    // control line breaks with <br> instead of relying on the <p> margin.
    $bodyHtml = preg_replace_callback('/<p(\s[^>]*)?>/i', function ($m) {
        $attrs = $m[1] ?? '';
        if (stripos($attrs, 'style=') !== false) {
            return preg_replace('/style\s*=\s*([\'"])/i', 'style=$1margin:0;', '<p'.$attrs.'>', 1);
        }

        return '<p style="margin:0;"'.$attrs.'>';
    }, (string) ($bodyHtml ?? ''));
@endphp
<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light only">
    <title>{{ $subjectLine ?? $brandName }}</title>
    <!--[if mso]>
    <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
    <![endif]-->
    <style>
        /* Modern clients only — Outlook ignores <style>; the layout below stands on
           inline styles + table attributes so it stays intact there too. */
        body { margin: 0; padding: 0; width: 100% !important; }
        a { text-decoration: none; }
        @media only screen and (max-width: 620px) {
            .container { width: 100% !important; }
            .px { padding-left: 22px !important; padding-right: 22px !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;">
    {{-- Hidden preheader --}}
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#eef2f7;opacity:0;">{{ $preheader }}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef2f7" style="background-color:#eef2f7;">
        <tr>
            <td align="center" style="padding:32px 12px;">

                <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
                <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

                    {{-- Brand header --}}
                    <tr>
                        <td style="padding:2px 8px 16px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td width="36" height="36" bgcolor="#2563eb" align="center" valign="middle" style="width:36px;height:36px;background-color:#2563eb;border-radius:9px;color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:bold;mso-line-height-rule:exactly;line-height:36px;">{{ $initials }}</td>
                                    <td style="padding-left:10px;font-family:'Segoe UI',Arial,sans-serif;">
                                        <div style="font-size:15px;font-weight:bold;color:#0f172a;">{{ $brandName }}</div>
                                        @if (!empty($eyebrow))
                                            <div style="font-size:11px;color:#64748b;">📦 {{ $eyebrow }}</div>
                                        @endif
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    {{-- Content card (border for Outlook; radius/shadow for modern) --}}
                    <tr>
                        <td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:14px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td bgcolor="#2563eb" height="4" style="background-color:#2563eb;height:4px;line-height:4px;font-size:4px;border-radius:14px 14px 0 0;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td class="px" style="padding:26px 34px 6px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:23px;color:#334155;mso-line-height-rule:exactly;">
                                        {!! $bodyHtml !!}
                                    </td>
                                </tr>

                                @if (!empty($actionUrl))
                                    <tr>
                                        <td class="px" style="padding:6px 34px 28px;">
                                            {{-- Bulletproof button: VML for Outlook, styled anchor elsewhere --}}
                                            <!--[if mso]>
                                            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{ $actionUrl }}" style="height:44px;v-text-anchor:middle;width:260px;" arcsize="23%" stroke="f" fillcolor="#2563eb">
                                            <w:anchorlock/>
                                            <center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:bold;">{{ $actionLabel ?? 'Open in portal' }} &rarr;</center>
                                            </v:roundrect>
                                            <![endif]-->
                                            <!--[if !mso]><!-->
                                            <a href="{{ $isPreview ? '#' : $actionUrl }}" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:14.5px;font-weight:bold;line-height:1;padding:14px 26px;border-radius:10px;{{ $isPreview ? 'pointer-events:none;cursor:default;' : '' }}">{{ $actionLabel ?? 'Open in portal' }} &nbsp;&rarr;</a>
                                            <!--<![endif]-->
                                            <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#94a3b8;padding-top:13px;">🔒 @if ($isPreview) Sample only — in a real email this opens the portal (sign in required). @else You'll be asked to <span style="color:#64748b;font-weight:bold;">sign in</span> to view this in the portal. @endif</div>
                                        </td>
                                    </tr>
                                @endif
                            </table>
                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td align="center" style="padding:20px 12px 4px;font-family:'Segoe UI',Arial,sans-serif;">
                            <div style="font-size:11.5px;color:#94a3b8;line-height:18px;">{{ $brandName }} &middot; Automated message — please do not reply.</div>
                        </td>
                    </tr>

                </table>
                <!--[if mso]></td></tr></table><![endif]-->

            </td>
        </tr>
    </table>
</body>
</html>
