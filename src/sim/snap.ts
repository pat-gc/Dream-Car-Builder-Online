export function snapToIncrement(value: number, increment: number): number {
  if (increment === 0) {
    return value
  }
  return Math.round(value / increment) * increment + 0
}
