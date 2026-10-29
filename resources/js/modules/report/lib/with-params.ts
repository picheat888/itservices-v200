// Adds query params to an in-app link that may already carry some (a tile's report filters after its period range).
export function withParams(path: string, params: Record<string, string>): string {
    const query = new URLSearchParams(params).toString();
    if (query === '') return path;
    return `${path}${path.includes('?') ? '&' : '?'}${query}`;
}
