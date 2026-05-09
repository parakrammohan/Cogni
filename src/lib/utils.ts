export function cx(...values: Array<string | number | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function average(values: readonly number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  return average(values.map((value) => (value - mean) ** 2));
}

export function stdDev(values: readonly number[]): number {
  return Math.sqrt(variance(values));
}

export function formatMeters(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${Math.round(value)} m`;
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours}h ${remainder}m`;
  }
  return `${minutes}m`;
}

export function relativeTime(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60000) return "just now";
  if (delta < 3600000) return `${Math.round(delta / 60000)} min ago`;
  return `${Math.round(delta / 3600000)} hr ago`;
}
