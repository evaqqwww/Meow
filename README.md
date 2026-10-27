# 喵有回音

一个适合手机打开的小小猫庙。使用原素材中的猫与场景，输入一句话，再给猫咪三秒钟；猫咪会用对话气泡把你的话原样说回来。

## 体验流程

1. 点击默认姿态的小猫，在弹出的输入框写下一句话并确认，最多 **120 个 UTF-16 代码单元**（多数常见汉字占一个，部分 emoji 占两个或更多）。
2. 小猫旁出现粉色肉垫。按住肉垫，连续保持 **3000 ms**；未到三秒就松手、移开、取消触摸或离开页面，进度都会清零，下一次从头开始。也可用键盘连续按住空格或回车。
3. 满三秒后，小猫切换为抬爪姿态，头顶气泡重复本次输入的文字；显示 **1000 ms** 后恢复默认小猫并结束本次交互，可以重新点击输入。气泡把换行和连续空白按普通段落显示。

输入只保存在当前页面的内存中，刷新或关闭页面即消失。应用没有 AI 回复、后端接口、账户或数据库，也不上传输入内容。

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

构建脚本只把 `site/` 的静态文件复制到 `dist/`，不会发布测试、文档或项目配置。每次构建会清理固定的 `dist/` 输出目录；源码与输出目录内的符号链接不会被跟随。

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
