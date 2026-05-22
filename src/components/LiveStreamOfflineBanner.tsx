/**
 * Thin one-line strip that sits flush against the bottom of the TopBar
 * when the live WebSocket has been offline for >15 s while signed in.
 *
 * Designed to be informative without being alarming — the live link is
 * a nice-to-have, not a critical alert. Caregivers and patients both
 * see this in their respective views.
 *
 * The auth context decides what copy to show (caregiver vs patient).
 * Mounted by `AppShell` directly under the TopBar so it slots into the
 * layout rather than sticking over the viewport top.
 */

import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { useLiveStreamHealth } from "../ws/useLiveStream";

export function LiveStreamOfflineBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { unhealthy } = useLiveStreamHealth();
  if (!unhealthy) return null;
  const role = user?.role === "patient" ? "patient" : "caregiver";
  const text =
    role === "caregiver" ? t("live.offlineCaregiverShort") : t("live.offlinePatientShort");
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 sm:px-6"
    >
      <WifiOff size={12} aria-hidden className="shrink-0 text-amber-600" />
      <span className="truncate">{text}</span>
    </div>
  );
}
