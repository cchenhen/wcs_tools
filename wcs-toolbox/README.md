# 🛠️ WCS Toolbox (多功能文件工具箱)

这是一个基于 [Wails](https://wails.io) (Go + Web) 构建的跨平台桌面应用程序，集合了多种实用的文件处理和网络抓取工具。

## ✨ 功能特性

### 1. 🎬 视频快捷方式生成
*   **功能**: 扫描指定文件夹下的所有视频文件，并在目标目录批量创建快捷方式。
*   **用途**: 整理散落在不同子文件夹中的视频，集中到一个文件夹查看，而不占用额外磁盘空间。
*   **支持**:
    *   Windows: 创建 `.lnk` 快捷方式。
    *   macOS / Linux: 创建符号链接 (Symlink)。
    *   支持多种命名模式（保留文件夹名、仅文件夹名等）。

### 2. 📦 7z 转 ZIP 转换器
*   **功能**: 批量将 `.7z` 压缩包解压并重新打包为 `.zip` 格式。
*   **智能提取**: 在转换过程中，自动识别并提取其中的视频文件到独立目录。
*   **依赖**: 需要系统中安装 `7z` 或 `7za` 命令行工具。

### 3. 🖼️ 图片文件夹打包
*   **功能**: 扫描包含图片的子文件夹，将每个文件夹单独打包成一个 ZIP 文件。
*   **用途**: 快速整理漫画、图集等文件夹。

### 4. 📚 TXT 转 EPUB 电子书
*   **功能**: 将 TXT 文本文件转换为标准的 EPUB 电子书格式。
*   **特性**:
    *   **智能分章**: 自动识别 "第X章"、"Chapter X" 等章节标题。
    *   **编码支持**: 自动尝试识别 GBK (中文常见) 和 UTF-8 编码。
    *   **元数据**: 生成标准的 EPUB 目录结构 (TOC, NCX, OPF)。

### 5. 🌏 图库抓取器
*   **功能**: 在线搜索并抓取图库资源。
*   **特性**:
    *   **搜索**: 支持关键字搜索和自动分页加载。
    *   **并发下载**: 多线程下载图片，速度快。
    *   **自动打包**: 下载完成后自动打包为 ZIP 文件。

## 🚀 安装与使用

### 下载运行
在 `build/bin` 目录下找到生成的可执行文件：
*   **macOS**: `wcs-toolbox.app`
*   **Windows**: `wcs-toolbox.exe`

### ⚠️以此功能的重要依赖
**7z 转 ZIP** 功能依赖系统的 7z 命令行工具：
*   **macOS**: 推荐安装 `p7zip` (`brew install p7zip`)
*   **Windows**: 请安装 [7-Zip](https://www.7-zip.org/) 并确保 `7z.exe` 在系统的 `PATH` 环境变量中。

## 🛠️ 开发与构建

### 环境要求
*   [Go](https://go.dev/) 1.18+
*   [Node.js](https://nodejs.org/) (用于前端构建)
*   [Wails](https://wails.io/) CLI

### 安装 Wails
```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### 运行开发环境
```bash
wails dev
```

### 构建生产版本
```bash
wails build
```

## 📂 项目结构

*   `app.go` & `main.go`: Go 后端主入口。
*   `task_queue.go`: 任务队列管理系统。
*   `task_handlers.go`: 具体的业务逻辑实现（文件操作等）。
*   `epub_converter.go`: EPUB 生成逻辑。
*   `gallery_crawler.go`: 网络爬虫逻辑。
*   `frontend/`: 前端源代码 (HTML/JS/CSS)。

---
*Created by Antigravity*
