import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";

import { AuthGuard } from "@/components/auth/auth-guard";
import { AuthLoadingScreen } from "@/components/auth/auth-loading-screen";
import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@/layouts/user-layout";
import AssetsPage from "@/pages/assets";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ConfigPage from "@/pages/config";
import HomePage from "@/pages/home";
import ImagePage from "@/pages/image";
import NotFound from "@/pages/not-found";
import PromptsPage from "@/pages/prompts";
import VideoPage from "@/pages/video";

const LoginPage = lazy(() => import("@/pages/auth/login"));
const HajimiCallbackPage = lazy(() => import("@/pages/auth/hajimi-callback"));

function LazyRoute({ children }: { children: ReactNode }) {
    return <Suspense fallback={<AuthLoadingScreen />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
    {
        element: <AuthGuard />,
        children: [
            {
                element: (
                    <UserLayout>
                        <AnalyticsTracker />
                        <Outlet />
                    </UserLayout>
                ),
                children: [
                    { path: "/", element: <HomePage /> },
                    { path: "/image", element: <ImagePage /> },
                    { path: "/video", element: <VideoPage /> },
                    { path: "/assets", element: <AssetsPage /> },
                    { path: "/prompts", element: <PromptsPage /> },
                    { path: "/canvas", element: <CanvasPage /> },
                    { path: "/canvas/:id", element: <CanvasProjectPage /> },
                    { path: "/config", element: <ConfigPage /> },
                ],
            },
        ],
    },
    {
        path: "/login",
        element: (
            <LazyRoute>
                <LoginPage />
            </LazyRoute>
        ),
    },
    {
        path: "/auth/hajimi/callback",
        element: (
            <LazyRoute>
                <HajimiCallbackPage />
            </LazyRoute>
        ),
    },
    { path: "*", element: <NotFound /> },
]);
