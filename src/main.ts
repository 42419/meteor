import "./style.css";
import { Sky } from "./sky/renderer";

declare global {
  interface Window {
    /** 运行时句柄，方便在控制台调参与观测；不参与页面逻辑 */
    meteorSky?: Sky;
  }
}

function requireCanvas(id: string): HTMLCanvasElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLCanvasElement)) {
    throw new Error(`canvas #${id} not found`);
  }
  return el;
}

const sky = new Sky(requireCanvas("stars"), requireCanvas("fx"));
sky.start();
window.meteorSky = sky;

// 合并 resize：移动端地址栏收缩会连续触发，没必要每次都重建静态层
let resizeScheduled = false;
window.addEventListener(
  "resize",
  () => {
    if (resizeScheduled) return;
    resizeScheduled = true;
    window.requestAnimationFrame(() => {
      resizeScheduled = false;
      sky.resize();
    });
  },
  { passive: true }
);

window.addEventListener(
  "pointerdown",
  (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("a, button")) return;
    sky.burst(event.clientX, event.clientY);
  },
  { passive: true }
);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) sky.stop();
  else sky.start();
});
