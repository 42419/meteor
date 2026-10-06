import { nearestTrailIndex, TONE_FAR, TONE_NEAR, TRAIL_LENGTHS } from "./sprites";
import type { GlowSprite } from "./sprites";

export interface Meteor {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  /** 绘制用旋转角（已含拖尾朝向） */
  rotation: number;
  speed: number;
  lenIdx: number;
  width: number;
  alpha: number;
  age: number;
  tone: number;
}

/** 稀疏到不需要精细调参的容量；池子避免运行时分配 */
const POOL_CAPACITY = 32;
const FADE_IN_SECONDS = 0.12;

/** 24°~41°，越接近水平越慢，观感更自然 */
const ANGLE_MIN = 0.42;
const ANGLE_MAX = 0.72;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class MeteorField {
  private readonly pool: Meteor[] = [];
  private readonly live: Meteor[] = [];

  constructor(capacity = POOL_CAPACITY) {
    for (let i = 0; i < capacity; i++) {
      this.pool.push({
        x: 0,
        y: 0,
        dirX: 0,
        dirY: 0,
        rotation: 0,
        speed: 0,
        lenIdx: 0,
        width: 1,
        alpha: 1,
        age: 0,
        tone: TONE_NEAR,
      });
    }
  }

  get count(): number {
    return this.live.length;
  }

  /** 从画面外随机入场 */
  spawnRandom(width: number, height: number): void {
    const m = this.pool.pop();
    if (!m) return;

    const distant = Math.random() < 0.35;
    this.configure(
      m,
      rand(width * 0.15, width * 1.12),
      rand(-height * 0.25, height * 0.55),
      distant
    );
    this.live.push(m);
  }

  /** 由交互点触发：从指向上方偏右的位置起飞 */
  spawnAt(x: number, y: number): void {
    const m = this.pool.pop();
    if (!m) return;
    this.configure(m, x + rand(-30, 60), y + rand(-70, -30), false);
    this.live.push(m);
  }

  update(dt: number, height: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const m = this.live[i];
      m.age += dt;
      m.x += m.dirX * m.speed * dt;
      m.y += m.dirY * m.speed * dt;

      const tail = TRAIL_LENGTHS[m.lenIdx];
      if (m.y > height + tail || m.x < -tail * 1.6) {
        this.pool.push(m);
        // swap-remove：不触发数组搬移
        const last = this.live.pop();
        if (last && i < this.live.length) {
          this.live[i] = last;
        }
      }
    }
  }

  /** 需在 globalCompositeOperation = "lighter" 下调用 */
  draw(
    ctx: CanvasRenderingContext2D,
    gradients: CanvasGradient[][],
    glow: GlowSprite
  ): void {
    for (let i = 0; i < this.live.length; i++) {
      const m = this.live[i];
      const alpha = m.alpha * Math.min(1, m.age / FADE_IN_SECONDS);
      if (alpha <= 0.01) continue;

      ctx.globalAlpha = alpha;

      // 拖尾：渐变坐标固定为 (0,0)->(-len,0)，靠变换摆放
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.rotation);
      ctx.strokeStyle = gradients[m.tone][m.lenIdx];
      ctx.lineWidth = m.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-TRAIL_LENGTHS[m.lenIdx], 0);
      ctx.stroke();
      ctx.restore();

      // 头部微光：一张贴图缩放复用
      const r = m.width * 5.2;
      ctx.drawImage(glow.canvas, m.x - r, m.y - r, r * 2, r * 2);
    }

    ctx.globalAlpha = 1;
  }

  private configure(m: Meteor, x: number, y: number, distant: boolean): void {
    const angle = rand(ANGLE_MIN, ANGLE_MAX);
    const speed = distant ? rand(540, 780) : rand(310, 500);
    const length = speed * rand(0.26, 0.5);

    m.x = x;
    m.y = y;
    m.dirX = -Math.cos(angle);
    m.dirY = Math.sin(angle);
    // 精灵朝向：把水平向左的拖尾旋到「身后」
    m.rotation = Math.PI - angle;
    m.speed = speed;
    m.lenIdx = nearestTrailIndex(length);
    m.width = distant ? rand(0.7, 1.05) : rand(1.2, 2.2);
    m.alpha = distant ? rand(0.5, 0.72) : rand(0.78, 1.0);
    m.age = 0;
    m.tone = distant ? TONE_FAR : TONE_NEAR;
  }
}
