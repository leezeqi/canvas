"use client";

import { type ReactNode, useEffect, useState } from "react";
import { App, Drawer, Dropdown, Input, Tooltip } from "antd";
import { ArrowLeft, Menu, Ellipsis, PanelLeftClose, PanelLeftOpen, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { UserStatusActions } from "@/components/layout/user-status-actions";
import { findNavigationTool, navigationTools } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { useAgentChatStore } from "@/stores/use-agent-chat-store";
import { useUserStore } from "@/stores/use-user-store";

const itemClass = "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm transition";
const idleItemClass = "bg-card/70 text-foreground/65 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-card hover:text-foreground";
const activeItemClass = "bg-foreground font-medium text-background shadow-[0_6px_16px_-6px_rgba(0,0,0,0.35)]";

export function AppSideNav() {
    const pathname = usePathname();
    const router = useRouter();
    const { modal } = App.useApp();
    const user = useUserStore((state) => state.user);
    const { sessions, activeId, setActive, renameSession, removeSession } = useAgentChatStore();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [menuOnAgent, setMenuOnAgent] = useState(false);
    const [query, setQuery] = useState("");
    const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
    const activeTool = findNavigationTool(pathname);

    useEffect(() => setMobileOpen(false), [pathname, activeId]);

    if (/^\/canvas\/[^/]+/.test(pathname)) return null;

    const openSession = (id: string | null) => {
        setActive(id);
        if (pathname !== "/") router.push("/");
    };
    const finishRename = () => {
        if (editing?.title.trim()) renameSession(editing.id, editing.title.trim());
        setEditing(null);
    };
    const renderContent = (compact: boolean) => {
        const showSessions = pathname === "/" && !menuOnAgent && !compact;
        const visibleSessions = sessions.filter((session) => session.title.toLowerCase().includes(query.trim().toLowerCase()));
        const wrap = (label: string, node: ReactNode) => (compact ? <Tooltip key={label} title={label} placement="right">{node}</Tooltip> : node);
        return (
            <div className="flex h-full min-h-0 flex-col gap-4 p-3">
                <div className={cn("flex items-center gap-2 px-1 pt-1", compact ? "flex-col" : "justify-between")}>
                    <Link href="/" className="flex min-w-0 items-center gap-2 text-foreground">
                        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-foreground text-background">
                            <svg className="size-4" viewBox="0 0 32 32" fill="none">
                                <path d="M10.5 11C7.46243 11 5 13.2386 5 16C5 18.7614 7.46243 21 10.5 21C13.0116 21 15.148 19.3404 15.8601 17.0278C15.922 16.8267 16.078 16.8267 16.1399 17.0278C16.852 19.3404 18.9884 21 21.5 21C24.5376 21 27 18.7614 27 16C27 13.2386 24.5376 11 21.5 11C18.9884 11 16.852 12.6596 16.1399 14.9722C16.078 15.1733 15.922 15.1733 15.8601 14.9722C15.148 12.6596 13.0116 11 10.5 11Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                        {!compact ? <span className="truncate text-base font-semibold tracking-tight">无限画布</span> : null}
                    </Link>
                    <button type="button" className="hidden size-8 items-center justify-center rounded-lg text-foreground/50 transition hover:bg-foreground/5 hover:text-foreground md:inline-flex" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}>
                        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
                    </button>
                </div>

                {showSessions ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-2">
                        <button type="button" className={cn(itemClass, activeItemClass)} onClick={() => openSession(null)}>
                            <Plus className="size-4" />
                            新建对话
                        </button>
                        <Input allowClear size="small" prefix={<Search className="size-3.5 opacity-50" />} placeholder="搜索历史会话" value={query} onChange={(event) => setQuery(event.target.value)} className="!rounded-xl !py-1.5" />
                        <div className="thin-scrollbar -mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
                            {visibleSessions.length ? visibleSessions.map((session) => (
                                <div key={session.id} className={cn("group flex h-9 items-center gap-1 rounded-xl pl-3 pr-1 text-sm transition", session.id === activeId ? "bg-card font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)]" : "text-foreground/60 hover:bg-card/70 hover:text-foreground")}>
                                    {editing?.id === session.id ? (
                                        <Input autoFocus size="small" variant="borderless" value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} onPressEnter={finishRename} onBlur={finishRename} className="!px-0" />
                                    ) : (
                                        <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => openSession(session.id)}>{session.title}</button>
                                    )}
                                    <Dropdown trigger={["click"]} menu={{ items: [{ key: "rename", label: "重命名" }, { key: "delete", danger: true, label: "删除" }], onClick: ({ key }) => (key === "rename" ? setEditing({ id: session.id, title: session.title }) : modal.confirm({ title: "删除会话", content: `确定删除「${session.title}」吗？`, okText: "删除", okButtonProps: { danger: true }, cancelText: "取消", onOk: () => removeSession(session.id) })) }}>
                                        <button type="button" className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg opacity-0 transition hover:bg-foreground/5 group-hover:opacity-100" aria-label="会话操作">
                                            <Ellipsis className="size-4" />
                                        </button>
                                    </Dropdown>
                                </div>
                            )) : <p className="px-3 py-6 text-center text-xs text-foreground/40">{query ? "没有匹配的会话" : "暂无历史会话"}</p>}
                        </div>
                        <button type="button" className={cn(itemClass, idleItemClass)} onClick={() => setMenuOnAgent(true)}>
                            <ArrowLeft className="size-4" />
                            返回主菜单
                        </button>
                    </div>
                ) : (
                    <nav className="flex flex-1 flex-col gap-1.5">
                        {navigationTools.map((tool) => {
                            const Icon = tool.icon;
                            return wrap(tool.label,
                                <Link key={tool.slug} href={tool.href} onClick={() => setMenuOnAgent(false)} className={cn(itemClass, compact && "justify-center px-0", tool.slug === activeTool?.slug ? activeItemClass : idleItemClass)}>
                                    <Icon className="size-4 shrink-0" />
                                    {!compact ? tool.label : null}
                                </Link>,
                            );
                        })}
                    </nav>
                )}

                <div className={cn("flex items-center gap-2 rounded-2xl bg-card/80 p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]", compact && "flex-col")}>
                    <UserStatusActions showConfig={false} className={cn(compact && "flex-col")} />
                    {!compact && user ? <span className="min-w-0 truncate text-xs text-foreground/60">{user.displayName || user.username}</span> : null}
                </div>
            </div>
        );
    };

    return (
        <>
            <aside className={cn("relative z-10 hidden shrink-0 border-r border-border/40 bg-background/40 backdrop-blur-xl transition-[width] duration-200 md:block", collapsed ? "w-[72px]" : "w-[248px]")}>
                {renderContent(collapsed)}
            </aside>
            <div className="relative z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border/40 px-3 md:hidden">
                <button type="button" className="inline-flex size-8 items-center justify-center rounded-lg text-foreground/70 transition hover:bg-foreground/5" onClick={() => setMobileOpen(true)} aria-label="打开导航菜单">
                    <Menu className="size-4" />
                </button>
                <span className="text-sm font-semibold">{activeTool?.label || "无限画布"}</span>
            </div>
            <Drawer placement="left" size={280} open={mobileOpen} onClose={() => setMobileOpen(false)} closable={false} className="md:hidden" styles={{ body: { padding: 0 } }}>
                {renderContent(false)}
            </Drawer>
        </>
    );
}
