// Pulsing stand-in for a count in a members dialog header while the list loads.
export function CountPlaceholder({ label }: { label: string }) {
    return (
        <span className="bg-muted inline-block h-3.5 w-6 animate-pulse rounded align-middle">
            <span className="sr-only">{label}</span>
        </span>
    );
}
