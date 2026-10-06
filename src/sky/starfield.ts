/**
 * 星场。
 *
 * 静态星场只在尺寸变化时重建一次，不参与每帧渲染；
 * 只有少量「亮星」放在动态层做轻微闪烁，用来维持夜空不死板。
 */

const MAX_STATIC_STARS = 260;
const STATIC_DENSITY = 9500;
const MAX_TWINKLE_STARS = 22;
const TWINKLE_DENSITY = 78000;

export interface Star {
  x: number;
  y: number;
  r: number;
  color: string;
}

interface TwinkleStar {
  x: number;
  y: number;
  r: number;
  base: number;
  phase: number;
  speed: number;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** 绝大多数偏冷白，极少数带一点暖调，避免整片天空过于均匀 */
function starColor(alpha: number): string {
  return Math.random() < 0.86
    ? `rgba(232, 240, 255, ${alpha.toFixed(3)})`
    : `rgba(255, 238, 220, ${alpha.toFixed(3)})`;
}

export function createStaticStars(width: number, height: number): Star[] {
  const count = Math.min(
    MAX_STATIC_STARS,
    Math.max(40, Math.round((width * height) / STATIC_DENSITY))
  );
  const stars: Star[] = [];

  for (let i = 0; i < count; i++) {
    const big = Math.random() < 0.16;
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: big ? rand(0.75, 1.35) : rand(0.3, 0.7),
      color: starColor(big ? rand(0.5, 0.9) : rand(0.14, 0.55)),
    });
  }

  return stars;
}

export function drawStaticStars(
  ctx: CanvasRenderingContext2D,
  stars: Star[],
  width: number,
  height: number
): void {
  ctx.clearRect(0, 0, width, height);
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export class TwinkleStars {
  private readonly stars: TwinkleStar[] = [];

  constructor(width: number, height: number) {
    const count = Math.min(
      MAX_TWINKLE_STARS,
      Math.max(8, Math.round((width * height) / TWINKLE_DENSITY))
    );
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: rand(0.6, 1.5),
        base: rand(0.55, 1.0),
        phase: Math.random() * Math.PI * 2,
        speed: rand(0.3, 1.1),
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, elapsed: number): void {
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const alpha = s.base * (0.55 + 0.45 * Math.sin(elapsed * s.speed + s.phase));
      if (alpha <= 0.02) continue;
      ctx.fillStyle = `rgba(236, 243, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
