import { Home, LogIn } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
    return (
        <div className="aurora-app flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto px-6 py-10 text-slate-900 dark:text-slate-100">
                <section className="aurora-glass w-full max-w-md rounded-2xl border p-8 text-center">
                    <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-xl bg-violet-500/12 text-2xl font-semibold text-violet-700 dark:text-violet-300">404</div>
                    <h1 className="text-3xl font-semibold tracking-normal">页面不存在</h1>
                    <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">这个地址没有对应的页面，可能已经移动或被合并到其他入口。</p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-medium text-white shadow-[0_8px_22px_rgba(124,58,237,.24)] transition hover:bg-violet-500">
                            <Home className="size-4" />
                            返回首页
                        </Link>
                        <Link
                            href="/login"
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-900/10 bg-white/45 px-4 text-sm font-medium text-slate-900 transition hover:bg-violet-500/10 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                        >
                            <LogIn className="size-4" />
                            去登录
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
