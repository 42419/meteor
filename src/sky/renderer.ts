import { MeteorField } from "./meteors";
import { createGlowSprite, createTrailGradients } from "./sprites";
import type { GlowSprite } from "./sprites";
import { createStaticStars, drawStaticStars, TwinkleStars } from "./starfield";
import type { Star } from "./starfield";

const MAX_DPR = 2;
const MIN_DPR = 1;
const MAX_DT = 0.05;

/** 每 90 帧（约 1.5s）评估一次画质档位 */
const QUALITY_WINDOW = 90;
/** 平均帧耗时超过 20ms（50fps）算掉帧 */
const QUALITY_BUDGET_MS = 20;
/** 连续 3 个窗口都掉帧才降档，避免偶发卡顿被误判 */
const DEGRADE_STREAK = 3;
/** 降档后平均帧耗时回到 17.5ms（57fps）以内，连续 4 个窗口就升回去 */
const RECOVER_AVG_MS = 17.5;
const RECOVER_STREAK = 4;
/** 最多来回切换 2 次，防止在阈值附近反复抖动 */
const MAX_SWITCHES = 2;

export interface SkyStats {
  fps: number;
  meteors: number;
  dpr: number;
  degraded: boolean;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * 渲染调度。
 *
 * 分两层：静态星场画一次就不再管，动态层每帧只清空并重绘流星与少量亮星，
 * 因此每帧绘制量与画面内容无关，只取决于「当前有几颗流星」。
 */
export class Sky {
  private readonly staticCanvas: HTMLCanvasElement;
  private readonly fxCanvas: HTMLCanvasElement;
  private readonly staticCtx: CanvasRenderingContext2D;
  private readonly fxCtx: CanvasRenderingContext2D;
  private readonly glow: GlowSprite;
  private readonly trailGradients: CanvasGradient[][];
  private readonly field = new MeteorField();
  private readonly reduceMotion: boolean;

  private staticStars: Star[];
  private twinkle: TwinkleStars;
  private width: number;
  private height: number;
  private dpr = MAX_DPR;
  private degraded = false;
  private switches = 0;

  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private spawnTimer = 0;
  private nextSpawn = 0.9;
  private burstDelay = 0;

  private frameCost = 0;
  private frameCount = 0;
  private avgFrameMs = 0;
  private qualityMark = 0;
  private badStreak = 0;
  private goodStreak = 0;

  constructor(staticCanvas: HTMLCanvasElement, fxCanvas: HTMLCanvasElement) {
    this.staticCanvas = staticCanvas;
    this.fxCanvas = fxCanvas;

    const staticCtx = staticCanvas.getContext("2d", { alpha: true });
    const fxCtx = fxCanvas.getContext("2d", { alpha: true });
    if (!staticCtx || !fxCtx) throw new Error("2d context unavailable");

    this.staticCtx = staticCtx;
    this.fxCtx = fxCtx;
    this.glow = createGlowSprite(64);
    this.trailGradients = createTrailGradients(fxCtx);
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.staticStars = createStaticStars(this.width, this.height);
    this.twinkle = new TwinkleStars(this.width, this.height);
    this.applySize();
  }

  get stats(): SkyStats {
    return {
      fps: this.avgFrameMs > 0 ? Math.round(1000 / this.avgFrameMs) : 0,
      meteors: this.field.count,
      dpr: this.dpr,
      degraded: this.degraded,
    };
  }

  resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width === this.width && height === this.height) return;

    this.width = width;
    this.height = height;
    this.staticStars = createStaticStars(width, height);
    this.twinkle = new TwinkleStars(width, height);
    this.applySize();
  }

  start(): void {
    if (this.rafId) return;

    if (this.reduceMotion) {
      // 静态降级：只留一帧完整的夜空，不做任何动画
      this.elapsed = 2.4;
      this.renderOnce(0);
      return;
    }

    this.field.spawnRandom(this.width, this.height);
    this.lastTime = 0;
    this.rafId = window.requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.rafId) return;
    window.cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  /** 交互触发：从指定位置唤下一颗流星 */
  burst(x: number, y: number): void {
    if (this.reduceMotion) return;
    this.field.spawnAt(x, y);
  }

  /**
   * 只负责按当前画质档位重建画布并重绘静态层。
   * 星点位置由调用方决定是否重建，这样档位切换不会让星空「跳」一下。
   */
  private applySize(): void {
    const dpr = this.degraded ? MIN_DPR : Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.dpr = dpr;

    this.setupCanvas(this.staticCanvas, this.staticCtx, dpr);
    this.setupCanvas(this.fxCanvas, this.fxCtx, dpr);
    drawStaticStars(this.staticCtx, this.staticStars, this.width, this.height);
  }

  private setupCanvas(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    dpr: number
  ): void {
    canvas.width = Math.max(1, Math.floor(this.width * dpr));
    canvas.height = Math.max(1, Math.floor(this.height * dpr));
    canvas.style.width = `${this.width}px`;
    canvas.style.height = `${this.height}px`;
    // 改 width/height 会重置上下文状态，变换必须在这之后设置
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private readonly frame = (now: number): void => {
    this.rafId = window.requestAnimationFrame(this.frame);

    if (!this.lastTime) this.lastTime = now;
    const dt = Math.min((now - this.lastTime) / 1000, MAX_DT);
    this.lastTime = now;

    this.updateSpawn(dt);
    this.renderOnce(dt);
    this.trackQuality(now);
  };

  private updateSpawn(dt: number): void {
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.nextSpawn) {
      this.spawnTimer = 0;
      this.nextSpawn = rand(0.9, 2.8);
      this.field.spawnRandom(this.width, this.height);
      // 偶尔连出两颗，制造「雨」的错觉，但不频繁
      if (Math.random() < 0.16) this.burstDelay = rand(0.14, 0.42);
    }

    if (this.burstDelay > 0) {
      this.burstDelay -= dt;
      if (this.burstDelay <= 0) {
        this.burstDelay = 0;
        this.field.spawnRandom(this.width, this.height);
      }
    }
  }

  private renderOnce(dt: number): void {
    this.elapsed += dt;
    const ctx = this.fxCtx;

    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, this.width, this.height);
    this.twinkle.draw(ctx, this.elapsed);

    this.field.update(dt, this.height);

    if (this.field.count > 0) {
      ctx.globalCompositeOperation = "lighter";
      this.field.draw(ctx, this.trailGradients, this.glow);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  /** 自适应画质：掉帧降分辨率，恢复后升回来，切换次数封顶 */
  private trackQuality(now: number): void {
    if (this.frameCount > 0) {
      this.frameCost += now - this.qualityMark;
    }
    this.qualityMark = now;
    this.frameCount++;

    if (this.frameCount < QUALITY_WINDOW) return;

    this.avgFrameMs = this.frameCost / (this.frameCount - 1);
    this.frameCost = 0;
    this.frameCount = 1;

    if (this.avgFrameMs > QUALITY_BUDGET_MS) {
      this.badStreak++;
      this.goodStreak = 0;
    } else if (this.avgFrameMs < RECOVER_AVG_MS) {
      this.goodStreak++;
      this.badStreak = 0;
    } else {
      this.badStreak = 0;
      this.goodStreak = 0;
    }

    if (
      !this.degraded &&
      this.switches < MAX_SWITCHES &&
      this.badStreak >= DEGRADE_STREAK
    ) {
      this.degraded = true;
      this.switches++;
      this.badStreak = 0;
      this.goodStreak = 0;
      this.applySize();
    } else if (
      this.degraded &&
      this.switches < MAX_SWITCHES &&
      this.goodStreak >= RECOVER_STREAK
    ) {
      this.degraded = false;
      this.switches++;
      this.badStreak = 0;
      this.goodStreak = 0;
      this.applySize();
    }
  }
}
