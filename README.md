# 多功能文件工具

一个基于 Electron 的跨平台桌面应用，包含两个实用工具：
1. **视频快捷方式提取器** - 提取指定目录下的视频文件并创建快捷方式
2. **7z转ZIP转换器** - 将7z文件转换为zip文件，自动提取视频文件

## 功能特点

### 🎬 视频快捷方式提取器

- 🔍 **递归扫描** - 扫描选定文件夹及所有子文件夹中的视频文件
- 🎬 **多格式支持** - 支持 MP4、AVI、MKV、MOV、WMV、FLV、WebM 等常见视频格式
- 📁 **灵活命名** - 支持多种命名方式：
  - 文件夹名_文件名（推荐）
  - 仅文件夹名
  - 保持原文件名
- 🖥️ **跨平台** - 支持 Windows、macOS 和 Linux
- ✅ **批量处理** - 支持批量创建快捷方式，显示进度

### 📦 7z转ZIP转换器

- 🔄 **格式转换** - 将7z压缩包转换为zip格式
- 📹 **视频提取** - 自动将视频文件从压缩包中提取到指定文件夹
- 🖼️ **图片保留** - 图片和其他非视频文件保留在zip中
- ⚡ **批量处理** - 支持同时处理多个7z文件
- 🔧 **灵活选项** - 可选择是否保留原始7z文件

## 安装

### 前置要求

- [Node.js](https://nodejs.org/) (v16 或更高版本)
- npm 或 yarn

### 安装依赖

```bash
cd getVedioLnk
npm install
```

## 运行

### 开发模式

```bash
npm start
```

### 打包应用

打包为当前平台：
```bash
npm run build
```

打包为指定平台：
```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

打包后的应用会生成在 `dist` 目录中。

## 使用方法

### 视频快捷方式提取器

1. **选择源文件夹** - 点击"浏览..."选择包含视频文件的文件夹
2. **扫描视频** - 点击"扫描视频文件"按钮，应用会递归扫描所有视频文件
3. **选择视频** - 在列表中勾选需要创建快捷方式的视频文件
4. **选择目标文件夹** - 点击"浏览..."选择保存快捷方式的位置
5. **选择命名方式** - 选择快捷方式的命名规则
6. **创建快捷方式** - 点击"创建快捷方式"按钮完成操作

### 7z转ZIP转换器

1. **切换到7z转ZIP选项卡** - 点击顶部的"📦 7z转ZIP"标签
2. **选择7z文件所在文件夹** - 点击"浏览..."选择包含7z文件的文件夹
3. **扫描7z文件** - 点击"扫描7z文件"按钮
4. **选择要转换的文件** - 在列表中勾选需要转换的7z文件
5. **设置视频提取目录** - 选择视频文件的存放位置
6. **开始转换** - 点击"开始转换"按钮

转换完成后：
- 📦 每个7z文件会被转换为同名的zip文件（保存在原位置）
- 🖼️ 图片和其他非视频文件保留在zip中
- 📹 视频文件会被提取到指定的视频目录

## 快捷方式类型

- **Windows**: 创建 `.lnk` 快捷方式文件
- **macOS**: 创建符号链接（symlink）
- **Linux**: 创建符号链接（symlink）

## 支持的视频格式

- MP4, AVI, MKV, MOV, WMV, FLV, WebM
- M4V, MPEG, MPG, 3GP, 3G2, TS, MTS
- M2TS, VOB, OGV, RM, RMVB, ASF, DIVX

## 支持的图片格式（7z转ZIP工具）

- JPG, JPEG, PNG, GIF, BMP, WebP
- TIFF, TIF, ICO, SVG, HEIC, HEIF
- RAW, PSD

## 项目结构

```
getVedioLnk/
├── main.js          # Electron 主进程
├── preload.js       # 预加载脚本
├── index.html       # 用户界面
├── renderer.js      # 渲染进程脚本
├── styles.css       # 样式文件
├── package.json     # 项目配置
└── README.md        # 说明文档
```

## 开发

### 技术栈

- Electron 28
- HTML5 / CSS3 / JavaScript (ES6+)
- Node.js
- 7zip-min（7z文件解压）
- archiver（zip文件创建）
- 7zip-min (7z文件处理)
- archiver (zip文件创建)

### 启用开发者工具

在 `main.js` 中取消注释以下行：

```javascript
mainWindow.webContents.openDevTools();
```

## 注意事项

- 在 macOS 和 Linux 上，快捷方式实际上是符号链接
- Windows 上需要管理员权限才能创建符号链接，因此使用 `.lnk` 快捷方式
- 如果源视频文件被移动或删除，快捷方式将失效

## 许可证

MIT License
