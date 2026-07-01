import { AccessBadge } from '@/components/access/access-badge';
import { AvatarStack } from '@/components/access/avatar-stack';
import { MembersDrawer, type MemberTarget } from '@/components/access/members-drawer';
import { ResourceModal } from '@/components/access/resource-modal';
import { TableSkeleton } from '@/shared/components/skeletons';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useEmailGroups, useFileShares, useSocialPlatforms } from '@/hooks/use-access';
import { useAuth } from '@/hooks/use-auth';
import { useT } from '@/lib/i18n';
import type { AccessKind, EmailGroup, FileShare, SocialPlatform } from '@/shared/types';
import { Eye, Folder, Globe, Layers, Plus, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';

type Tab = AccessKind;

/** First two initials of a name, for avatar fallbacks. */
function initials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

/** Compact KPI card (icon tile + big number + label). */
function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) {
    return (
        <Card className="p-5">
            <div className="flex items-start justify-between">
                <div className="text-muted-foreground text-sm">{label}</div>
                <span className="bg-brand/10 text-brand flex h-9 w-9 items-center justify-center rounded-lg">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
        </Card>
    );
}

/** Owner cell: small avatar + name. */
function OwnerCell({ owner }: { owner?: string | null }) {
    if (!owner) return <span className="text-muted-foreground">—</span>;
    return (
        <div className="flex items-center gap-2 whitespace-nowrap">
            <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px] font-semibold">{initials(owner)}</AvatarFallback>
            </Avatar>
            <span className="text-sm">{owner}</span>
        </div>
    );
}

/** Colored icon tile + name/sub used in the registry name columns. */
function NameCell({ icon: Icon, color, name, sub }: { icon: typeof Users; color: string; name: string; sub?: string | null }) {
    return (
        <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md" style={{ background: `${color}18`, color }}>
                <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
                <div className="font-medium">{name}</div>
                {sub && <div className="text-muted-foreground max-w-[240px] truncate font-mono text-[11.5px]">{sub}</div>}
            </div>
        </div>
    );
}

const thClass = 'text-muted-foreground border-border border-b px-4 py-2.5 text-left text-[11.5px] font-semibold tracking-wide uppercase whitespace-nowrap';
const tdClass = 'border-border border-b px-4 py-3 align-middle';

/**
 * Access Control page. A header (title + context-aware "+ New …"), a KPI row
 * (group/share/social counts + total grants), and a single card with a tab row
 * that switches between the email-group / file-share registries (styled tables)
 * and the social platform card grid. Rows open the member manager drawer.
 */
export default function AccessControlPage() {
    const t = useT();
    const { can } = useAuth();
    const canManage = can('access.manage');
    const [tab, setTab] = useState<Tab>('email-groups');
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<{ kind: AccessKind; row: null } | null>(null);
    const [members, setMembers] = useState<MemberTarget | null>(null);

    const emailGroups = useEmailGroups();
    const fileShares = useFileShares();
    const social = useSocialPlatforms();

    const egRows = useMemo(() => emailGroups.data ?? [], [emailGroups.data]);
    const fsRows = useMemo(() => fileShares.data ?? [], [fileShares.data]);
    const spRows = useMemo(() => social.data ?? [], [social.data]);

    const totalGrants = useMemo(
        () => [...egRows, ...fsRows, ...spRows].reduce((sum, r) => sum + (r.members_count ?? 0), 0),
        [egRows, fsRows, spRows],
    );

    const tabs: { id: Tab; label: string; count: number }[] = [
        { id: 'email-groups', label: t('access_email_groups'), count: egRows.length },
        { id: 'file-shares', label: t('access_file_shares'), count: fsRows.length },
        { id: 'social-platforms', label: t('access_social'), count: spRows.length },
    ];

    const newLabel: Record<Tab, string> = {
        'email-groups': t('access_new_group'),
        'file-shares': t('access_new_share'),
        'social-platforms': t('access_new_platform'),
    };

    // Filter the active tab's rows by the search box.
    const filteredEg = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? egRows.filter((g) => `${g.name} ${g.email} ${g.department ?? ''}`.toLowerCase().includes(q)) : egRows;
    }, [egRows, search]);
    const filteredFs = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? fsRows.filter((s) => `${s.name} ${s.path} ${s.department ?? ''}`.toLowerCase().includes(q)) : fsRows;
    }, [fsRows, search]);

    const openEmailGroup = (g: EmailGroup) =>
        setMembers({ kind: 'email-groups', id: g.id, name: g.name, detail: g.email, owner: g.owner, metaLabel: t('access_department'), metaValue: g.department });
    const openFileShare = (s: FileShare) =>
        setMembers({ kind: 'file-shares', id: s.id, name: s.name, detail: s.path, owner: s.owner, metaLabel: t('access_size'), metaValue: s.size_label });
    const openSocial = (p: SocialPlatform) =>
        setMembers({ kind: 'social-platforms', id: p.id, name: p.name, detail: p.url, color: p.color, metaLabel: t('access_policy'), metaValue: p.policy });

    return (
        <div className="space-y-5">
            {/* Page header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold">{t('access_title')}</h1>
                    <p className="text-muted-foreground mt-0.5 text-sm">{t('access_sub')}</p>
                </div>
                {canManage && (
                    <Button onClick={() => setEditing({ kind: tab, row: null })}>
                        <Plus className="h-4 w-4" /> {newLabel[tab]}
                    </Button>
                )}
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label={t('access_email_groups')} value={egRows.length} icon={Users} />
                <StatCard label={t('access_file_shares')} value={fsRows.length} icon={Folder} />
                <StatCard label={t('access_social')} value={spRows.length} icon={Globe} />
                <StatCard label={t('access_total_grants')} value={totalGrants} icon={Layers} />
            </div>

            {/* Tab card */}
            <Card className="overflow-hidden p-0">
                <div className="border-border flex items-center gap-1 border-b px-2">
                    {tabs.map((tb) => (
                        <button
                            key={tb.id}
                            onClick={() => {
                                setTab(tb.id);
                                setSearch('');
                            }}
                            className={`relative px-3 py-3 text-sm font-medium ${tab === tb.id ? 'text-brand' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {tb.label}
                            <span className="ml-1.5 font-mono text-xs opacity-60">{tb.count}</span>
                            {tab === tb.id && <span className="bg-brand absolute inset-x-3 -bottom-px h-0.5 rounded" />}
                        </button>
                    ))}
                </div>

                {/* Toolbar (tables only) */}
                {tab !== 'social-platforms' && (
                    <div className="border-border flex flex-wrap items-center gap-3 border-b px-4 py-3">
                        <div className="border-input bg-background focus-within:ring-ring flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-md border px-3 focus-within:ring-1 sm:max-w-xs">
                            <Search className="text-muted-foreground h-4 w-4 shrink-0" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={tab === 'email-groups' ? t('access_search_groups') : t('access_search_shares')}
                                className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
                            />
                        </div>
                        <div className="text-muted-foreground ml-auto font-mono text-xs">
                            {(tab === 'email-groups' ? filteredEg.length : filteredFs.length)} {t('access_of')} {tab === 'email-groups' ? egRows.length : fsRows.length}
                        </div>
                    </div>
                )}

                {/* Email groups table */}
                {tab === 'email-groups' &&
                    (emailGroups.isLoading ? (
                        <div className="p-4">
                            <TableSkeleton />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr>
                                        <th className={thClass}>{t('access_name')}</th>
                                        <th className={thClass}>{t('access_owner')}</th>
                                        <th className={thClass}>{t('access_members')}</th>
                                        <th className={thClass}>{t('access_department')}</th>
                                        <th className={`${thClass} text-right`}>{t('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredEg.map((g) => (
                                        <tr key={g.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => openEmailGroup(g)}>
                                            <td className={tdClass}>
                                                <NameCell icon={Users} color="#7c3aed" name={g.name} sub={g.email} />
                                            </td>
                                            <td className={tdClass}>
                                                <OwnerCell owner={g.owner} />
                                            </td>
                                            <td className={tdClass}>
                                                <AvatarStack members={g.members ?? []} />
                                            </td>
                                            <td className={tdClass}>{g.department ?? '—'}</td>
                                            <td className={`${tdClass} text-right`}>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openEmailGroup(g);
                                                    }}
                                                >
                                                    <Users className="h-3.5 w-3.5" /> {t('access_manage_members')}
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}

                {/* File shares table */}
                {tab === 'file-shares' &&
                    (fileShares.isLoading ? (
                        <div className="p-4">
                            <TableSkeleton />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr>
                                        <th className={thClass}>{t('access_name')}</th>
                                        <th className={thClass}>{t('access_owner')}</th>
                                        <th className={thClass}>{t('access_members')}</th>
                                        <th className={thClass}>{t('access_access_level')}</th>
                                        <th className={thClass}>{t('access_size')}</th>
                                        <th className={`${thClass} text-right`}>{t('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredFs.map((s) => {
                                        const levels = ['Full', 'Write', 'Read'].filter((l) => (s.members ?? []).some((m) => m.access_level === l));
                                        return (
                                            <tr key={s.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => openFileShare(s)}>
                                                <td className={tdClass}>
                                                    <NameCell icon={Folder} color="#0d9488" name={s.name} sub={s.path} />
                                                </td>
                                                <td className={tdClass}>
                                                    <OwnerCell owner={s.owner} />
                                                </td>
                                                <td className={tdClass}>
                                                    <AvatarStack members={s.members ?? []} />
                                                </td>
                                                <td className={tdClass}>
                                                    <div className="flex flex-wrap gap-1">
                                                        {levels.length ? levels.map((l) => <AccessBadge key={l} level={l} />) : <span className="text-muted-foreground">—</span>}
                                                    </div>
                                                </td>
                                                <td className={`${tdClass} font-mono text-[12.5px]`}>{s.size_label ?? '—'}</td>
                                                <td className={`${tdClass} text-right`}>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openFileShare(s);
                                                        }}
                                                    >
                                                        <Users className="h-3.5 w-3.5" /> {t('access_manage_members')}
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ))}

                {/* Social platform card grid */}
                {tab === 'social-platforms' &&
                    (social.isLoading ? (
                        <div className="p-4">
                            <TableSkeleton />
                        </div>
                    ) : (
                        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                            {spRows.map((p) => {
                                const color = p.color ?? 'var(--brand)';
                                const mCount = p.members_count ?? p.members?.length ?? 0;
                                return (
                                    <div key={p.id} className="border-border flex flex-col rounded-lg border p-4">
                                        <div className="mb-3 flex items-center gap-3">
                                            <span
                                                className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-lg text-lg font-extrabold text-white shadow-sm"
                                                style={{ background: color }}
                                            >
                                                {p.name[0]?.toUpperCase()}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[15px] font-bold">{p.name}</div>
                                                {p.url && <div className="text-muted-foreground truncate font-mono text-[11px]">{p.url}</div>}
                                            </div>
                                            {mCount === 0 && (
                                                <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-semibold">{t('access_no_members')}</span>
                                            )}
                                        </div>
                                        <div className="text-muted-foreground mb-3 min-h-[32px] text-xs">
                                            <span className="mb-0.5 block text-[11px] font-semibold tracking-wider uppercase">{t('access_policy')}</span>
                                            {p.policy ?? '—'}
                                        </div>
                                        <div className="border-border my-1 border-t" />
                                        <div className="mt-3 flex items-center justify-between">
                                            <div className="flex items-center gap-2.5">
                                                <AvatarStack members={p.members ?? []} />
                                                <span className="text-muted-foreground font-mono text-xs">
                                                    {mCount} {t('access_members').toLowerCase()}
                                                </span>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={() => openSocial(p)}>
                                                <Eye className="h-3.5 w-3.5" /> {t('access_check_members')}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
            </Card>

            <ResourceModal open={!!editing} kind={editing?.kind ?? 'email-groups'} row={null} onClose={() => setEditing(null)} />
            <MembersDrawer target={members} canManage={canManage} onClose={() => setMembers(null)} />
        </div>
    );
}
