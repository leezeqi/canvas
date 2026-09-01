import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AuthLoadingScreen() {
    const { t } = useTranslation();

    return (
        <div className="grid min-h-dvh place-items-center bg-background text-foreground">
            <div className="flex items-center gap-3 text-sm text-stone-500 dark:text-stone-400">
                <LoaderCircle className="size-4 animate-spin" />
                <span>{t("auth.restoring")}</span>
            </div>
        </div>
    );
}
