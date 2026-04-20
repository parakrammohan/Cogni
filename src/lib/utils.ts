export function cx(...values) {
  return values.filter(Boolean).join(" ");
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function variance(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  return average(values.map((value) => (value - mean) ** 2));
}

export function stdDev(values) {
  return Math.sqrt(variance(values));
}

export function formatMeters(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${Math.round(value)} m`;
}

export function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours}h ${remainder}m`;
  }
  return `${minutes}m`;
}

export function relativeTime(timestamp) {
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60000) return "just now";
  if (delta < 3600000) return `${Math.round(delta / 60000)} min ago`;
  return `${Math.round(delta / 3600000)} hr ago`;
}
