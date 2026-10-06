# 流星

一片安静的夜空，偶尔有流星划过。画面中心留空，文字压在左下角与右下角。

纯 Canvas 渲染，Vite + TypeScript 构建，产物 12 kB（gzip 后约 5 kB），无运行时依赖。

## 开发

```bash
npm install --ignore-scripts
npm run dev        # 本地开发，默认 http://localhost:5173
npm run build      # 类型检查 + 构建到 dist/
npm run preview    # 预览构建产物
```

`--ignore-scripts` 不是必须的，只是依赖本身没有需要执行的安装脚本（esbuild / rollup 的二进制来自 `optionalDependencies` 里的平台包），跳过能少执行一段第三方代码。workflow 里也是这么装的。

## 部署到 GitHub Pages

仓库已包含 `.github/workflows/deploy.yml`，推送到 `main`/`master` 即自动构建并发布：

1. 推送代码：
   ```bash
   git init
   git add -A
   git commit -m "feat: 流星页面"
   git branch -M main
   git remote add origin git@github.com:<用户名>/<仓库名>.git
   git push -u origin main
   ```
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
3. 发布地址：`https://<用户名>.github.io/<仓库名>/`

`vite.config.ts` 里 `base: "./"` 生成相对路径，所以用户主页仓库（`<用户名>.github.io`）和项目仓库都能直接用，无需改配置。

想手动发布的话，本地 `npm run build` 后把 `dist/` 里的内容推到 Pages 分支根目录即可（`dist/` 默认不纳入版本控制）。

## 文件

| 路径 | 说明 |
| --- | --- |
| `index.html` | 页面骨架：两层 canvas + 文字 |
| `src/main.ts` | 装配、事件、resize、后台暂停 |
| `src/style.css` | 排版与背景辉光 |
| `src/sky/renderer.ts` | 渲染调度、分层、自适应画质 |
| `src/sky/starfield.ts` | 静态星场与闪烁亮星 |
| `src/sky/meteors.ts` | 流星系统（对象池） |
| `src/sky/sprites.ts` | 头部微光贴图、拖尾渐变缓存 |

## 性能设计

页面只有两个 canvas：

- `#stars` **静态层**：星场渲染一次就再也不动，每帧成本为零。
- `#fx` **动态层**：只画流星和十几颗闪烁亮星，是唯一每帧刷新的图层。

几个关键点：

- **渐变缓存**：`CanvasGradient` 的坐标在绘制时才随当前变换生效，所以拖尾渐变按「长度档位 × 色调」预建一次，绘制时只做 `translate`/`rotate`。每帧新建渐变对象是这类页面最常见的性能陷阱。
- **头部微光贴图**：一张 64px 径向渐变贴图缩放复用，不每帧建 `createRadialGradient`。
- **对象池**：流星用完归还池子，运行时零分配、零 GC 抖动。
- **自适应画质**：每 1.5s 评估一次平均帧耗时，连续 3 个窗口超过 20ms 就把渲染分辨率从 2x 降到 1x；恢复后连续 4 个窗口达标再升回来，来回切换最多 2 次，避免在阈值附近抖动。
- **后台暂停**：`visibilitychange` 时停掉 rAF；`prefers-reduced-motion` 时只渲染一帧静态夜空。

## 调参

大多集中在 `src/sky/` 下：

| 想改什么 | 去哪改 |
| --- | --- |
| 流星出现频率 | `renderer.ts` 的 `rand(0.9, 2.8)`，数值越大越稀疏 |
| 流星亮度 / 粗细 | `meteors.ts` 的 `m.width`、`m.alpha` |
| 拖尾长度 | `sprites.ts` 的 `TRAIL_LENGTHS` |
| 星点密度 | `starfield.ts` 的 `STATIC_DENSITY`、`MAX_STATIC_STARS` |
| 画面暗角 | `style.css` 的 `.vignette` |
| 文案与排版 | `index.html` 与 `style.css` 的 `.stage` 区 |

控制台里有 `meteorSky` 句柄可以看实时状态：

```js
meteorSky.stats   // { fps, meteors, dpr, degraded }
meteorSky.burst(400, 300)   // 手动唤一颗流星
```

## 交互

- 点击 / 触摸任意处，从那个位置唤下一颗流星。
- 页面中心不承载任何内容，给天空留白。
