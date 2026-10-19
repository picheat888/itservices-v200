// When a profile tab swaps its content for the "load failed" panel; pure, so node tests load it as is.

/** Only when the fetch failed and there is nothing from an earlier fetch to keep showing. */
export function showLoadFailed({ isError, hasData }: { isError: boolean; hasData: boolean }): boolean {
    return isError && !hasData;
}
