/**
 * 预渲染资源。
 *
 * 每帧新建 CanvasGradient 是这个页面最容易踩的性能坑：一颗流星一帧要建
 * 两个渐变对象。这里把渐变按「长度档位 × 色调」预先建好，绘制时只做
 * translate/rotate —— CanvasGradient 的坐标在绘制时才随当前变换生效，
 * 所以同一个渐变对象可以复用到任意位置与角度。
 */

export interface GlowSprite {
  readonly canvas: HTMLCanvasElement;
  readonly size: number;
}

/** 拖尾长度档位（px），按实际需要的长度就近取档 */
export const TRAIL_LENGTHS = [110, 150, 200, 260, 330, 410] as const;

/** 色调：0 = 近景（亮），1 = 远景（暗且细） */
export const TONE_NEAR = 0;
export const TONE_FAR = 1;
export const TONE_COUNT = 2;

const GLOW_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0.0, "rgba(255, 255, 255, 1)"],
  [0.16, "rgba(240, 246, 255, 0.58)"],
  [0.42, "rgba(178, 206, 255, 0.16)"],
  [1.0, "rgba(140, 180, 255, 0)"],
];

const TRAIL_STOPS: ReadonlyArray<ReadonlyArray<readonly [number, string]>> = [
  // 近景
  [
    [0.0, "rgba(255, 255, 255, 0.98)"],
    [0.08, "rgba(220, 236, 255, 0.66)"],
    [0.3, "rgba(160, 194, 255, 0.26)"],
    [0.62, "rgba(126, 166, 255, 0.08)"],
    [1.0, "rgba(122, 162, 255, 0)"],
  ],
  // 远景
  [
    [0.0, "rgba(232, 242, 255, 0.5)"],
    [0.1, "rgba(190, 214, 255, 0.28)"],
    [0.35, "rgba(146, 182, 255, 0.1)"],
    [1.0, "rgba(120, 160, 255, 0)"],
  ],
];

/** 头部微光贴图，一张复用，靠 drawImage 缩放 */
export function createGlowSprite(size = 64): GlowSprite {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable for glow sprite");

  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  applyStops(grad, GLOW_STOPS);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  return { canvas, size };
}

/**
 * 建立 [色调][长度档位] 的拖尾渐变缓存。
 * 渐变坐标恒定为 (0,0) -> (-len,0)，绘制端负责摆放与旋转。
 */
export function createTrailGradients(ctx: CanvasRenderingContext2D): CanvasGradient[][] {
  return TRAIL_STOPS.map((stops) =>
    TRAIL_LENGTHS.map((len) => {
      const grad = ctx.createLinearGradient(0, 0, -len, 0);
      applyStops(grad, stops);
      return grad;
    })
  );
}

/** 把实际长度吸附到最近的档位，返回索引 */
export function nearestTrailIndex(length: number): number {
  let best = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < TRAIL_LENGTHS.length; i++) {
    const delta = Math.abs(TRAIL_LENGTHS[i] - length);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return best;
}

function applyStops(
  grad: CanvasGradient,
  stops: ReadonlyArray<readonly [number, string]>
): void {
  for (const [offset, color] of stops) {
    grad.addColorStop(offset, color);
  }
}
