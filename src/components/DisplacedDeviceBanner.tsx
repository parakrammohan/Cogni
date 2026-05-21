/**
 * Banner that appears on a patient device after a newer device has
 * claimed the primary monitoring slot. The patient can dismiss
 * implicitly (just stop using the app) or tap "Use this device" to
 * reclaim primacy — which will in turn displace the other device.
 *
 * Caregivers never see this; the WS layer never flips `displaced`
 * true for non-patient roles.
 */

import { MonitorSmartphone, RefreshCcw } from "lucide-react";

import { useDisplacedState } from "../ws/useLiveStream";

export function DisplacedDeviceBanner() {
  const { displaced, reclaim } = useDisplacedState();
  if (!displaced) return null;
  return (
    <div className="sticky top-2 z-[1080] mx-auto mb-3 w-fit max-w-full px-2">
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 shadow-(--shadow-soft)"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-200 text-amber-800"
        >
          <MonitorSmartphone size={16} />
        </span>
        <div className="min-w-0 max-w-md">
          <p className="text-sm font-semibold text-amber-900">
            Another device is now the primary monitor
          </p>
          <p className="mt-0.5 text-xs leading-5 text-amber-900/80">
            Live signals are paused on this device so your caregiver only
            sees one feed. Tap to take over from here.
          </p>
        </div>
        <button
          type="button"
          onClick={reclaim}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white shadow-sm transition hover:bg-amber-500"
        >
          <RefreshCcw size={13} aria-hidden />
          Use this device
        </button>
      </div>
    </div>
  );
}
