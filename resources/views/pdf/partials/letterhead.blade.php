{{-- Shared letterhead: company facts from Settings (left), document title and facts (right). Expects $company (CompanyProfile::get()), $title, $lines, $lang (en|th). --}}
@php
    $isThai = ($lang ?? 'th') === 'th';
    $address = trim($company['address'].($company['country'] ? ' '.$company['country'] : ''));
@endphp
<table class="lh">
    <tr>
        @if ($company['logo'])
            <td class="lh-logo"><img src="{{ $company['logo'] }}" alt=""></td>
        @endif
        <td>
            <div class="lh-name">{{ \App\Support\CompanyProfile::issuer($company) }}</div>
            @if ($company['legal_name'] && $company['name'] && $company['name'] !== $company['legal_name'])
                <div class="lh-line">{{ $company['name'] }}</div>
            @endif
            @if ($address !== '')
                <div class="lh-line">{{ $address }}</div>
            @endif
            @if ($company['tax_id'])
                <div class="lh-line">{{ $isThai ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID' }} {{ $company['tax_id'] }}</div>
            @endif
        </td>
        <td class="lh-doc">
            <div class="lh-title">{{ $title }}</div>
            @foreach ($lines as $line)
                <div class="lh-line">{{ $line }}</div>
            @endforeach
        </td>
    </tr>
</table>
