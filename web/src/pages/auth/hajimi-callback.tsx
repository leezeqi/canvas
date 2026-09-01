import { useEffect, useState } from "react";
import { Button } from "antd";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { returnToFromSearch } from "@/lib/auth-navigation";
import { useUserStore } from "@/stores/use-user-store";

type CapturedTicket = { callbackUrl: string; ticket: string | null };
let capturedTicket: CapturedTicket | null = null;

function captureTicket() {
    const callbackUrl = `${window.location.pathname}${window.location.search}`;
    if (window.location.hash) {
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        capturedTicket = { callbackUrl, ticket: fragment.get("ticket") };
        window.history.replaceState(window.history.state, "", callbackUrl);
    }
    return capturedTicket?.callbackUrl === callbackUrl ? capturedTicket.ticket : null;
}

export default function HajimiCallbackPage() {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const exchangeHajimi = useUserStore((state) => state.exchangeHajimi);
    const [error, setError] = useState<string | null>(null);
    const returnTo = returnToFromSearch(location.search);
    const [ticket] = useState(captureTicket);

    useEffect(() => {
        if (!ticket) {
            setError(t("auth.hajimiTicketMissing"));
            return;
        }

        void exchangeHajimi(ticket)
            .then(() => {
                capturedTicket = null;
                navigate(returnTo, { replace: true });
            })
            .catch((reason) => {
                capturedTicket = null;
                setError(reason instanceof Error ? reason.message : t("auth.hajimiExchangeFailed"));
            });
    }, [exchangeHajimi, navigate, returnTo, t, ticket]);

    return (
        <main className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
            <section className="w-full max-w-sm text-center">
                {error ? (
                    <>
                        <CircleAlert className="mx-auto size-8 text-red-500" />
                        <h1 className="mt-4 text-lg font-semibold">{t("auth.hajimiLoginFailed")}</h1>
                        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">{error}</p>
                        <Button className="mt-5" onClick={() => navigate(`/login?${new URLSearchParams({ returnTo })}`, { replace: true })}>
                            {t("auth.backToLogin")}
                        </Button>
                    </>
                ) : (
                    <>
                        <LoaderCircle className="mx-auto size-7 animate-spin text-stone-500" />
                        <h1 className="mt-4 text-lg font-semibold">{t("auth.hajimiSigningIn")}</h1>
                        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{t("auth.hajimiSigningInDescription")}</p>
                    </>
                )}
            </section>
        </main>
    );
}
