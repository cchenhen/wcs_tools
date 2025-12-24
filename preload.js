const { contextBridge, ipcRenderer } = require('electron');

// 安全地暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 选择源文件夹
  selectSourceFolder: () => ipcRenderer.invoke('select-source-folder'),
  
  // 选择目标文件夹
  selectTargetFolder: () => ipcRenderer.invoke('select-target-folder'),
  
  // 扫描视频文件
  scanVideos: (sourcePath) => ipcRenderer.invoke('scan-videos', sourcePath),
  
  // 创建快捷方式
  createShortcuts: (options) => ipcRenderer.invoke('create-shortcuts', options),
  
  // 打开文件夹
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  
  // 获取平台信息
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  // 监听进度更新
  onProgressUpdate: (callback) => {
    ipcRenderer.on('progress-update', (event, data) => callback(data));
  },
  
  // 移除进度监听
  removeProgressListener: () => {
    ipcRenderer.removeAllListeners('progress-update');
  },
  
  // ============ 7z转ZIP工具 API ============
  
  // 扫描7z文件
  scan7zFiles: (sourcePath) => ipcRenderer.invoke('scan-7z-files', sourcePath),
  
  // 转换7z到zip
  convert7zToZip: (options) => ipcRenderer.invoke('convert-7z-to-zip', options),
  
  // 监听转换进度
  onConvertProgress: (callback) => {
    ipcRenderer.on('convert-progress', (event, data) => callback(data));
  },
  
  // 移除转换进度监听
  removeConvertProgressListener: () => {
    ipcRenderer.removeAllListeners('convert-progress');
  },
  
  // ============ 图片打包ZIP工具 API ============
  
  // 扫描包含图片的子文件夹
  scanImageFolders: (sourcePath) => ipcRenderer.invoke('scan-image-folders', sourcePath),
  
  // 打包图片为ZIP
  packImagesToZip: (options) => ipcRenderer.invoke('pack-images-to-zip', options),
  
  // 监听打包进度
  onImageZipProgress: (callback) => {
    ipcRenderer.on('imagezip-progress', (event, data) => callback(data));
  },
  
  // 移除打包进度监听
  removeImageZipProgressListener: () => {
    ipcRenderer.removeAllListeners('imagezip-progress');
  }
});
