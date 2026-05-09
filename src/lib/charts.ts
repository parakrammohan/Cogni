/**
 * Builds an SVG path string from a list of values mapped onto a chart area.
 * Returns an empty string if there are fewer than 2 values.
 */
export function toSvgPath(
  values: readonly number[],
  width: number,
  height: number,
  padding = 18,
): string {
  if (values.length < 2) return "";
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  return values
    .map((value, index) => {
      const x = padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
