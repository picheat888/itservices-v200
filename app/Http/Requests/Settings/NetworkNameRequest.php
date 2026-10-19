<?php

// Add or change a network name: an IP or CIDR range (IPv4 or IPv6, not IPv4-mapped) that is not named yet, and its name.

namespace App\Http\Requests\Settings;

use App\Support\Cidr;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class NetworkNameRequest extends FormRequest
{
    private const IPV4_BITS = 32;

    private const IPV6_BITS = 128;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('cidr'))) {
            $this->merge(['cidr' => trim($this->input('cidr'))]);
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'cidr' => [
                'required', 'string', 'max:64',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (! self::isRange((string) $value)) {
                        $fail('validation.invalid_network')->translate();
                    }
                },
                Rule::unique('network_names', 'cidr')->ignore($this->route('networkName')),
            ],
            'name' => ['required', 'string', 'max:100'],
        ];
    }

    /** A single IP, or an IP and a prefix that fits its family; IPv4-mapped IPv6 is refused. */
    private static function isRange(string $text): bool
    {
        $parts = explode('/', $text);
        $ip = $parts[0];
        if (count($parts) > 2 || filter_var($ip, FILTER_VALIDATE_IP) === false || self::isIpv4Mapped($ip)) {
            return false;
        }
        if (count($parts) === 1) {
            return true;
        }

        $maxPrefix = str_contains($ip, ':') ? self::IPV6_BITS : self::IPV4_BITS;

        return ctype_digit($parts[1])
            && (int) $parts[1] <= $maxPrefix
            && Cidr::prefixLength($text) === (int) $parts[1];
    }

    private static function isIpv4Mapped(string $ip): bool
    {
        $bytes = inet_pton($ip);

        return $bytes !== false && strlen($bytes) === 16 && str_starts_with($bytes, str_repeat("\0", 10)."\xFF\xFF");
    }
}
