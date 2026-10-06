import { defineConfig } from "vite";

export default defineConfig({
  // 相对路径：仓库部署到 https://<user>.github.io/<repo>/ 时无需改配置
  base: "./",
  build: {
    target: "es2020",
    outDir: "dist",
    assetsInlineLimit: 8192,
    cssMinify: true,
    reportCompressedSize: false,
    sourcemap: false,
  },
});
