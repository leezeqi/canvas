"use client";

import { Check, Download, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, Input } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useCanvasStore, type CanvasProject } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";
import { exportCanvasProjects } from "../utils/canvas-export";

export function CanvasProjectCard({ project }: { project: CanvasProject }) {
    const router = useRouter();
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const renameProject = useCanvasStore((state) => state.renameProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const toggleSelected = useCanvasUiStore((state) => state.toggleSelectedProjectId);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const editing = editingId === project.id;
    const selected = selectedIds.includes(project.id);
    const open = () => router.push(`/canvas/${project.id}`);
    const saveTitle = () => {
        renameProject(project.id, editingTitle);
        stopEditing();
    };

    return (
        <article
            className="group relative flex min-h-44 cursor-pointer flex-col justify-between overflow-hidden rounded-lg border p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5"
            style={{
                background: theme.node.panel,
                borderColor: selected ? theme.node.activeStroke : theme.node.stroke,
                boxShadow: selected
                    ? `0 0 0 1px ${theme.node.activeStroke}, 0 16px 36px rgba(124,58,237,.12)`
                    : colorTheme === "dark"
                      ? "0 12px 30px rgba(0,0,0,.18), inset 0 1px rgba(255,255,255,.05)"
                      : "0 12px 30px rgba(52,65,94,.08), inset 0 1px rgba(255,255,255,.72)",
                color: theme.node.text,
            }}
            onClick={() => !editing && open()}
        >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="flex items-start gap-3">
                <input
                    type="checkbox"
                    checked={selected}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => toggleSelected(project.id, event.target.checked)}
                    className="mt-1 size-4 accent-violet-600"
                    aria-label={`选择 ${project.title}`}
                />
                {editing ? (
                    <Input className="min-w-0" value={editingTitle} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveTitle()} autoFocus />
                ) : (
                    <button
                        type="button"
                        className="min-w-0 cursor-pointer text-left"
                        onClick={(event) => {
                            event.stopPropagation();
                            open();
                        }}
                    >
                        <h2 className="truncate text-xl font-semibold">{project.title}</h2>
                        <p className="mt-3 text-sm leading-6" style={{ color: theme.node.muted }}>
                            {project.nodes.length} 个节点 · {project.connections.length} 条连线
                        </p>
                    </button>
                )}
            </div>
            <div className="mt-8 flex items-end justify-between gap-3">
                <p className="text-xs" style={{ color: theme.node.faint }}>更新于 {new Date(project.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                    {editing ? (
                        <>
                            <Button type="text" size="small" shape="circle" icon={<Check className="size-4" />} onClick={saveTitle} aria-label="保存名称" />
                            <Button type="text" size="small" shape="circle" icon={<X className="size-4" />} onClick={stopEditing} aria-label="取消重命名" />
                        </>
                    ) : (
                        <>
                            <Button type="text" size="small" shape="circle" icon={<Download className="size-4" />} onClick={() => void exportCanvasProjects([project], project.title || "无限画布")} aria-label="导出" />
                            <Button type="text" size="small" shape="circle" icon={<Pencil className="size-4" />} onClick={() => startEditing(project.id, project.title)} aria-label="重命名" />
                            <Button type="text" size="small" shape="circle" icon={<Trash2 className="size-4" />} onClick={() => setDeleteIds([project.id])} aria-label="删除" />
                        </>
                    )}
                </div>
            </div>
        </article>
    );
}
