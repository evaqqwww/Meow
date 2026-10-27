# 喵有回音

在线体验：[喵有回音 · Meow](https://evaqqwww.github.io/Meow/)

场景采用统一米色背景的极简布局，不显示标题、品牌、步骤或页脚。寺庙水平居中、位于中部偏上，放大的小猫略靠左；肉垫按钮位于猫咪身体上、靠近抬起的手掌，并与抬起的掌心保持同高。按钮只显示持续轻抖的粉色肉垫，没有白色圆底和常驻边框；放大的外圈进度条仅在按住时显示，露在手指外侧，并位于猫和肉垫按钮之上的最上层，保持完整可见。

一个适合手机打开的小小猫庙。使用原素材中的猫与场景，输入一句话，再按住肉垫 1.8 秒；猫咪会用对话气泡随机送上一句温柔的祝福。

## 体验流程

1. 点击默认姿态的小猫，在弹出的输入框写下一句话并确认，最多 **120 个 UTF-16 代码单元**（多数常见汉字占一个，部分 emoji 占两个或更多）。
2. 小猫旁出现粉色肉垫。按住肉垫，连续保持 **1800 ms（1.8 秒）**，也可用键盘连续按住空格或回车。前 **1000 ms（1 秒）** 小猫保持首帧；随后用 **800 ms（0.8 秒）** 正放五张原始序列帧，每 **200 ms** 切到下一帧：按住第 1200、1400、1600、1800 ms 分别显示第 2、3、4、5 帧。
3. 连续按满 1.8 秒时，小猫到达末帧，头顶气泡从预设祝福语中随机选出一句，排除与本次输入完全相同的句子；祝福显示 **1000 ms**，一次回应期间保持不变。只要继续按住肉垫，小猫就保持末帧，气泡结束后也不会自动倒放。
4. 松开肉垫时，从当前帧按每 **200 ms** 一帧倒放到首帧；从末帧完整倒放需要 **800 ms**，提前松开则按已到达的帧数缩短。未满 1.8 秒就松开、移开、取消触摸或离开页面，不会触发祝福；倒放完成后保留已输入文字，可以重新从零计时。成功互动则在松开、倒放结束且祝福显示完毕后恢复默认场景，可以重新点击小猫输入。若倒放先结束，小猫会先停在首帧，等祝福显示满 1 秒再重置。

输入只保存在当前页面的内存中，刷新或关闭页面即消失。应用没有 AI 回复、后端接口、账户或数据库，也不上传输入内容。

五张猫咪序列帧位于 `site/assets/cat-frames/`，从用户提供的 `cat-inbetweens-v2` 原样复制并核对 SHA-256。四张旧 PNG 素材继续保留。

## 本地运行

需要 Node.js 22 或更新版本。项目没有第三方运行依赖，无需安装依赖。

```sh
npm test
npm run dev
```

打开 [本地页面](http://127.0.0.1:4173/)；[Pages 子路径预览](http://127.0.0.1:4173/Meow/)可用于检查仓库站点的路径。服务只监听 `127.0.0.1`。

```sh
# 指定其他端口
npm run dev -- --port 4180

# 构建并预览发布产物
npm run build
npm run preview
```

构建脚本将 `site/` 的静态文件输出到 `dist/`，为入口脚本、样式和本地模块依赖追加基于内容的版本号，避免发布后浏览器继续使用旧脚本缓存。不会发布测试、文档或项目配置，也不会改动源文件或图片。每次构建会清理固定的 `dist/` 输出目录；源码与输出目录内的符号链接不会被跟随。

## GitHub Pages

1. 将仓库的默认发布分支设为 `main`，并推送代码。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 工作流会在 `main` 有推送时运行，也可以在 **Actions → Deploy to GitHub Pages → Run workflow** 手动触发。
4. 测试与构建成功后，工作流仅上传 `dist/`，通过官方 GitHub Pages Actions 发布。最终地址可在工作流的 `github-pages` 环境或 Pages 设置中查看。

名为 `Meow` 的项目仓库通常使用 `https://<用户名>.github.io/Meow/`。站点资源使用相对路径，也可部署到域名根路径；GitHub Pages 会提供 HTTPS，适合在手机浏览器中访问。

官方配置参考：[自定义 GitHub Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。工作流中的版本依据官方发布页核实：[checkout](https://github.com/actions/checkout/releases/tag/v7.0.1)、[setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0)、[configure-pages](https://github.com/actions/configure-pages/releases/tag/v6.0.0)、[upload-pages-artifact](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0)、[deploy-pages](https://github.com/actions/deploy-pages/releases/tag/v5.0.1)。

## 文件位置

- `site/`：页面、交互逻辑、样式与原素材。
- `scripts/`：基于 Node.js 内置模块的构建与本地服务。
- `tests/`：按住计时、取消与文字恢复等交互测试。
- `.github/workflows/pages.yml`：测试、构建、发布流程。
