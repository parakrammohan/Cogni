/**
 * Banner that appears when the WebSocket live channel has been down
 * for more than a transient blip while the user is signed in.
 *
 * The common cause is a strict-third-party-cookie browser (Chrome
 * incognito with new defaults, Safari ITP, Brave with shields up)
 * refusing to send the session cookie on the cross-origin WS upgrade
 * to `cogni-team-cogni.hf.space`. The REST flows still work because
 * Vercel proxies `/api/*` first-party. Before this banner the user
 * just saw stale data with no indication the live feed was offline.
 */

import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useLiveStreamHealth } from "../ws/useLiveStream";

export function LiveStreamOfflineBanner({ role }: { role: "caregiver" | "patient" }) {
  const { t } = useTranslation();
  const { unhealthy, status } = useLiveStreamHealth();
  if (!unhealthy) return null;
  const title =
    role === "caregiver" ? t("live.offlineCaregiverTitle") : t("live.offlinePatientTitle");
  const body = role === "caregiver" ? t("live.offlineCaregiverBody") : t("live.offlinePatientBody");
  return (
    <div className="sticky top-2 z-[1075] mx-auto mb-3 w-fit max-w-full px-2">
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 shadow-(--shadow-soft)"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-200 text-amber-800"
        >
          <WifiOff size={16} />
        </span>
        <div className="min-w-0 max-w-md">
          <p className="text-sm font-semibold text-amber-900">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-amber-900/80">{body}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-amber-900/60">
            {t("live.status")}: {status}
          </p>
        </div>
      </div>
    </div>
  );
}
