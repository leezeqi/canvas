import { useEffect, useState } from "react";
import { App, Button, Form, Input, Segmented } from "antd";
import { ArrowRight, ExternalLink, Mail } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AuthLoadingScreen } from "@/components/auth/auth-loading-screen";
import { HAJIMI_LOGIN_URL } from "@/constant/runtime-config";
import { returnToFromSearch } from "@/lib/auth-navigation";
import { useUserStore } from "@/stores/use-user-store";

type AuthMode = "login" | "register";
type AuthFormValues = {
    email: string;
    password: string;
    name?: string;
};

export default function LoginPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const [form] = Form.useForm<AuthFormValues>();
    const [mode, setMode] = useState<AuthMode>("login");
    const [submitting, setSubmitting] = useState(false);
    const status = useUserStore((state) => state.status);
    const restoreSession = useUserStore((state) => state.restoreSession);
    const login = useUserStore((state) => state.login);
    const register = useUserStore((state) => state.register);
    const returnTo = returnToFromSearch(location.search);

    useEffect(() => {
        if (status === "idle") void restoreSession().catch(() => undefined);
    }, [restoreSession, status]);

    if (status === "authenticated") return <Navigate to={returnTo} replace />;
    if (status === "idle" || status === "loading") return <AuthLoadingScreen />;

    const submit = async (values: AuthFormValues) => {
        setSubmitting(true);
        try {
            if (mode === "login") await login({ email: values.email.trim(), password: values.password });
            else await register({ email: values.email.trim(), password: values.password, name: values.name?.trim() || undefined });
            message.success(t(mode === "login" ? "auth.loginSuccess" : "auth.registerSuccess"));
            navigate(returnTo, { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("auth.requestFailed"));
        } finally {
            setSubmitting(false);
        }
    };

    const openHajimiLogin = () => {
        if (!HAJIMI_LOGIN_URL) {
            message.error(t("auth.hajimiUnavailable"));
            return;
        }
        try {
            const callbackUrl = new URL("/auth/hajimi/callback", window.location.origin);
            callbackUrl.searchParams.set("returnTo", returnTo);
            const loginUrl = new URL(HAJIMI_LOGIN_URL, window.location.origin);
            if (loginUrl.protocol !== "http:" && loginUrl.protocol !== "https:") throw new Error();
            loginUrl.searchParams.set("return_to", callbackUrl.toString());
            window.location.assign(loginUrl.toString());
        } catch {
            message.error(t("auth.hajimiInvalidUrl"));
        }
    };

    return (
        <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-5 py-10 text-foreground">
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.035] dark:opacity-[0.07]"
                style={{ backgroundImage: "linear-gradient(to right,currentColor 1px,transparent 1px),linear-gradient(to bottom,currentColor 1px,transparent 1px)", backgroundSize: "32px 32px" }}
            />
            <section className="relative w-full max-w-[400px]">
                <div className="mb-8 flex items-center justify-center gap-2.5">
                    <span className="size-7 bg-current" style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }} />
                    <span className="text-xl font-semibold">{t("meta.title")}</span>
                </div>

                <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-[0_18px_60px_rgba(28,25,23,0.08)] dark:border-stone-800 dark:bg-stone-950 dark:shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:p-8">
                    <div className="mb-6">
                        <h1 className="text-xl font-semibold">{t(mode === "login" ? "auth.loginTitle" : "auth.registerTitle")}</h1>
                        <p className="mt-1.5 text-sm leading-6 text-stone-500 dark:text-stone-400">{t(mode === "login" ? "auth.loginDescription" : "auth.registerDescription")}</p>
                    </div>

                    <Segmented<AuthMode>
                        block
                        value={mode}
                        options={[
                            { label: t("auth.login"), value: "login" },
                            { label: t("auth.register"), value: "register" },
                        ]}
                        onChange={(value) => setMode(value)}
                    />

                    <Form form={form} layout="vertical" className="mt-6" requiredMark={false} onFinish={(values) => void submit(values)}>
                        {mode === "register" ? (
                            <Form.Item name="name" label={t("auth.name")}>
                                <Input autoComplete="name" placeholder={t("auth.namePlaceholder")} />
                            </Form.Item>
                        ) : null}
                        <Form.Item
                            name="email"
                            label={t("auth.email")}
                            rules={[
                                { required: true, message: t("auth.emailRequired") },
                                { type: "email", message: t("auth.emailInvalid") },
                            ]}
                        >
                            <Input autoComplete="email" inputMode="email" prefix={<Mail className="size-4 text-stone-400" />} placeholder="name@example.com" />
                        </Form.Item>
                        <Form.Item name="password" label={t("auth.password")} rules={[{ required: true, message: t("auth.passwordRequired") }]}>
                            <Input.Password autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={t("auth.passwordPlaceholder")} />
                        </Form.Item>
                        <Button type="primary" htmlType="submit" block loading={submitting} icon={<ArrowRight className="size-4" />} iconPosition="end">
                            {t(mode === "login" ? "auth.submitLogin" : "auth.submitRegister")}
                        </Button>
                    </Form>

                    <div className="my-6 flex items-center gap-3 text-xs text-stone-400 before:h-px before:flex-1 before:bg-stone-200 after:h-px after:flex-1 after:bg-stone-200 dark:before:bg-stone-800 dark:after:bg-stone-800">{t("auth.or")}</div>

                    <Button block icon={<ExternalLink className="size-4" />} onClick={openHajimiLogin}>
                        {t("auth.continueWithHajimi")}
                    </Button>
                    <p className="mt-4 text-center text-xs leading-5 text-stone-400 dark:text-stone-500">{t("auth.hajimiDescription")}</p>
                </div>
            </section>
        </main>
    );
}
