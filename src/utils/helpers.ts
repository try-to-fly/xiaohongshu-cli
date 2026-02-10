export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getScrollInterval(speed: 'slow' | 'normal' | 'fast'): number {
  switch (speed) {
    case 'slow':
      return randomInt(1200, 1500);
    case 'fast':
      return randomInt(300, 400);
    default:
      return randomInt(600, 800);
  }
}
