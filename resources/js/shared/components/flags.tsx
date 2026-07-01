// Minimal flag glyphs for the language toggle (UK = English, Thailand = Thai).

export function FlagEN({ className = 'h-4 w-6 rounded-sm' }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 60 30" aria-hidden>
            <clipPath id="flag-en-clip">
                <rect width="60" height="30" rx="3" />
            </clipPath>
            <g clipPath="url(#flag-en-clip)">
                <rect width="60" height="30" fill="#012169" />
                <path d="M0 0L60 30M60 0L0 30" stroke="#fff" strokeWidth="6" />
                <path d="M0 0L60 30M60 0L0 30" stroke="#C8102E" strokeWidth="4" />
                <path d="M30 0V30M0 15H60" stroke="#fff" strokeWidth="10" />
                <path d="M30 0V30M0 15H60" stroke="#C8102E" strokeWidth="6" />
            </g>
        </svg>
    );
}

export function FlagTH({ className = 'h-4 w-6 rounded-sm' }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 60 30" aria-hidden>
            <clipPath id="flag-th-clip">
                <rect width="60" height="30" rx="3" />
            </clipPath>
            <g clipPath="url(#flag-th-clip)">
                <rect width="60" height="30" fill="#A51931" />
                <rect y="5" width="60" height="20" fill="#F4F5F8" />
                <rect y="11" width="60" height="8" fill="#2D2A4A" />
            </g>
        </svg>
    );
}
