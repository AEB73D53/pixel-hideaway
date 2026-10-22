# 混淆图生成器 · 像素迷藏

**[在线使用 →](https://aeb73d53.github.io/pixel-hideaway/)**

像素迷藏（Pixel Hideaway）是一个纯前端的图片混淆与反混淆工具。默认使用免口令的分享模式，上传图片就能一键混淆或还原，方便互相分享混淆图。

图片和口令只在浏览器中处理，不上传服务器。

## 功能

- 支持 PNG、JPG、WebP 图片上传与拖拽。
- 默认分享模式无需口令，可还原相同 Gilbert 算法的混淆图。
- 保留 PH1 口令模式，支持旧版口令图和像素完整性校验。
- 保留透明度，提供原图与结果预览。
- 支持随机口令、取消处理，以及电脑和手机布局。

## 快速开始

需要 Node.js 22 或更新版本，无需安装第三方依赖。

```sh
git clone https://github.com/AEB73D53/pixel-hideaway.git
cd pixel-hideaway
npm start
```

在浏览器中打开 [http://localhost:5173](http://localhost:5173)。

## 使用方法

1. 选择「图片混淆」，上传图片，保持默认的「分享模式」，点击「开始混淆」。
2. 下载生成的 PNG，将原文件分享给朋友，无需交换口令。
3. 需要反混淆时，选择「图片还原」，上传相同算法生成的混淆图。
4. 点击「开始还原」，查看画面并下载结果。

混淆完成后直接切换到「图片还原」，会自动载入刚生成的图片。

需要使用旧版口令图时，选择「口令模式 · PH1」。上传含 PH1 参数的 PNG 会自动切换到口令模式，还原时需要原口令。

## 支持范围

单张图片最大 **50 MiB、1200 万像素**。

分享模式采用 Gilbert 曲线与固定黄金比例位移，无需种子、口令或 PNG 私有参数。已使用一组用户提供的微信小程序「混淆图pixel」样本验证还原效果；这不代表所有小程序、版本或其他算法都通用。口令模式仅支持本站 PH1 格式。

请保留下载的原始 PNG，尤其不要缩放、裁剪或旋转。分享模式可以处理尺寸未变的 JPEG 混淆图，但压缩损失无法恢复，结果只能近似还原；PH1 图经过重新编码可能无法还原。

无损还原指恢复混淆前由浏览器解码得到的 RGBA 像素；还原结果统一为 PNG，不保留原文件的 EXIF 和压缩格式。含动画的图片只处理浏览器解码的静态帧。

本工具用于视觉混淆，不提供安全加密。免口令的分享图可以被任何使用相同算法的人还原。

## 部署

### GitHub Pages

仓库提供自动部署工作流：

1. 在仓库的 **Settings → Pages → Build and deployment** 中，将 **Source** 设为 **GitHub Actions**。
2. 打开 **Actions → Deploy website to GitHub Pages**，点击 **Run workflow** 启动首次部署。
3. 工作流通过后，在 **Settings → Pages** 中查看在线网址。

之后提交到 `main` 分支的网站文件变更会自动触发测试和重新部署。

### 其他静态托管

将 `dist/` 目录作为静态网站发布即可，无需构建步骤或后端服务。部署后通过 HTTPS 访问；本地运行使用 localhost，不能直接双击 HTML 使用。

## 开发与测试

```sh
npm test
```

核心测试覆盖两种算法的像素置换、参考曲线映射、透明图片无损往返、PNG 编解码和损坏文件检查。

浏览器测试需要 Python、Playwright、Pillow 和 Chromium。保持本地服务运行，再执行：

```sh
python tests/browser_check.py
```

## 项目结构

```text
pixel-hideaway/
├── dist/                 网站文件，可直接部署
│   ├── index.html
│   ├── style.css
│   ├── app.js            上传、预览与下载
│   ├── core.js           像素置换与 PNG 编解码
│   ├── gilbert.js        免口令分享算法
│   ├── worker.js         后台图片处理
│   └── favicon.svg
├── tests/                核心测试与浏览器测试
├── server.mjs            本地预览服务
├── package.json
└── README.md
```

## 算法来源

Gilbert 曲线实现改编自 [Jakub Červený 的 gilbert](https://github.com/jakubcerveny/gilbert)，遵循 BSD-2-Clause，许可见 [dist/gilbert-LICENSE.txt](dist/gilbert-LICENSE.txt)。固定黄金比例位移与 [pic-scramble](https://github.com/iris10086/pic-scramble) 的公开映射一致。
