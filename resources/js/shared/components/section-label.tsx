/** Small uppercase section heading with a short brand-accent underline, used across
 *  the app's focus dialogs (contract / asset detail, access manage). */
export function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="mb-2">
            <div className="dark:text-foreground flex items-center gap-2 text-sm font-bold tracking-wide text-[#2f2f2f] uppercase">{children}</div>
            <div className="bg-brand/70 mt-1.5 h-0.5 w-8 rounded-full" />
        </div>
    );
}
