const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');
const sevenZip = require('7zip-min');
const archiver = require('archiver');

// ============ 任务队列管理器 ============
class TaskQueue {
  constructor() {
    this.tasks = new Map(); // taskId -> task对象
    this.taskIdCounter = 1;
    this.runningTasks = new Set(); // 当前正在执行的任务ID
    this.maxConcurrent = 2; // 最大并发任务数
  }

  // 添加任务到队列
  addTask(taskType, taskData, taskName) {
    const taskId = this.taskIdCounter++;
    const task = {
      id: taskId,
      type: taskType,
      name: taskName,
      data: taskData,
      status: 'pending', // pending, running, completed, failed, cancelled
      progress: 0,
      result: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null
    };
    
    this.tasks.set(taskId, task);
    this.notifyTaskUpdate(task);
    
    // 尝试执行任务
    this.processQueue();
    
    return taskId;
  }

  // 处理队列，执行待处理的任务
  async processQueue() {
    // 检查是否可以执行更多任务
    while (this.runningTasks.size < this.maxConcurrent) {
      // 找到第一个待处理的任务
      const pendingTask = Array.from(this.tasks.values()).find(
        task => task.status === 'pending'
      );
      
      if (!pendingTask) break;
      
      // 执行任务
      this.executeTask(pendingTask);
    }
  }

  // 执行单个任务
  async executeTask(task) {
    task.status = 'running';
    task.startedAt = Date.now();
    this.runningTasks.add(task.id);
    this.notifyTaskUpdate(task);

    try {
      let result;
      
      switch (task.type) {
        case 'create-shortcuts':
          result = await this.executeCreateShortcuts(task);
          break;
        case 'convert-7z-to-zip':
          result = await this.executeConvert7zToZip(task);
          break;
        case 'pack-images':
          result = await this.executePackImages(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }
      
      task.status = 'completed';
      task.result = result;
      task.progress = 100;
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
    } finally {
      task.completedAt = Date.now();
      this.runningTasks.delete(task.id);
      this.notifyTaskUpdate(task);
      
      // 继续处理队列
      this.processQueue();
    }
  }

  // 执行创建快捷方式任务
  async executeCreateShortcuts(task) {
    const { videos, targetPath, namingMode } = task.data;
    const results = { success: 0, failed: 0, errors: [] };
    
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
    
    const totalVideos = videos.length;
    const concurrencyLimit = 10;
    
    for (let i = 0; i < totalVideos; i += concurrencyLimit) {
      const batch = videos.slice(i, Math.min(i + concurrencyLimit, totalVideos));
      const batchPromises = batch.map(async (video) => {
        let shortcutName;
        switch (namingMode) {
          case 'folder':
            shortcutName = `${video.parentFolder}_${path.parse(video.name).name}`;
            break;
          case 'folderOnly':
            shortcutName = video.parentFolder;
            break;
          case 'original':
          default:
            shortcutName = path.parse(video.name).name;
            break;
        }
        
        const result = await createShortcut(video.path, targetPath, shortcutName);
        
        if (result.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push({ video: video.name, error: result.error });
        }
      });
      
      await Promise.all(batchPromises);
      
      task.progress = Math.round(((i + batch.length) / totalVideos) * 100);
      this.notifyTaskUpdate(task);
    }
    
    return results;
  }

  // 执行7z转ZIP任务
  async executeConvert7zToZip(task) {
    const { files, videoOutputPath, keepOriginal, compressionLevel = 1 } = task.data;
    const results = { success: 0, failed: 0, videosExtracted: 0, errors: [] };
    
    if (!fs.existsSync(videoOutputPath)) {
      fs.mkdirSync(videoOutputPath, { recursive: true });
    }
    
    const totalFiles = files.length;
    
    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];
      const tempDir = path.join(os.tmpdir(), `7z_extract_${Date.now()}_${i}`);
      
      try {
        fs.mkdirSync(tempDir, { recursive: true });
        await extract7z(file.path, tempDir);
        
        const allFiles = getAllFiles(tempDir);
        const videoFiles = allFiles.filter(f => f.type === 'video');
        const nonVideoFiles = allFiles.filter(f => f.type !== 'video');
        
        // 复制视频文件
        for (const video of videoFiles) {
          const baseName = path.basename(file.name, '.7z');
          const videoDestName = `${baseName}_${video.name}`;
          const videoDest = path.join(videoOutputPath, videoDestName);
          
          let finalDest = videoDest;
          let counter = 1;
          while (fs.existsSync(finalDest)) {
            const ext = path.extname(videoDestName);
            const nameWithoutExt = path.basename(videoDestName, ext);
            finalDest = path.join(videoOutputPath, `${nameWithoutExt}_${counter}${ext}`);
            counter++;
          }
          
          fs.copyFileSync(video.absolutePath, finalDest);
          results.videosExtracted++;
        }
        
        // 创建zip文件（非视频文件）
        if (nonVideoFiles.length > 0) {
          const zipName = path.basename(file.name, '.7z') + '.zip';
          const zipPath = path.join(path.dirname(file.path), zipName);
          await createZip(nonVideoFiles, zipPath, compressionLevel);
        }
        
        // 删除原7z文件
        if (!keepOriginal) {
          fs.unlinkSync(file.path);
        }
        
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({ file: file.name, error: error.message });
      } finally {
        try {
          deleteFolderRecursive(tempDir);
        } catch (err) {
          console.error('清理临时目录失败:', err.message);
        }
      }
      
      task.progress = Math.round(((i + 1) / totalFiles) * 100);
      this.notifyTaskUpdate(task);
    }
    
    return results;
  }

  // 执行图片打包任务
  async executePackImages(task) {
    const { folders, targetPath, compressionLevel = 1 } = task.data;
    const results = { success: 0, failed: 0, totalImages: 0, errors: [] };
    
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
    
    const totalFolders = folders.length;
    
    for (let i = 0; i < totalFolders; i++) {
      const folder = folders[i];
      
      try {
        const filesToZip = folder.images.map(img => ({
          absolutePath: img.absolutePath,
          relativePath: img.relativePath
        }));
        
        let zipName = `${folder.name}.zip`;
        let zipPath = path.join(targetPath, zipName);
        let counter = 1;
        
        while (fs.existsSync(zipPath)) {
          zipName = `${folder.name}_${counter}.zip`;
          zipPath = path.join(targetPath, zipName);
          counter++;
        }
        
        await createZip(filesToZip, zipPath, compressionLevel);
        
        results.success++;
        results.totalImages += folder.images.length;
      } catch (error) {
        results.failed++;
        results.errors.push({ folder: folder.name, error: error.message });
      }
      
      task.progress = Math.round(((i + 1) / totalFolders) * 100);
      this.notifyTaskUpdate(task);
    }
    
    return results;
  }

  // 取消任务
  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    
    if (task.status === 'pending') {
      task.status = 'cancelled';
      task.completedAt = Date.now();
      this.notifyTaskUpdate(task);
      return true;
    }
    
    return false;
  }

  // 清除已完成的任务
  clearCompletedTasks() {
    const completedIds = Array.from(this.tasks.values())
      .filter(task => task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled')
      .map(task => task.id);
    
    completedIds.forEach(id => this.tasks.delete(id));
    this.notifyTaskListUpdate();
  }

  // 获取所有任务
  getAllTasks() {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  // 获取任务详情
  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  // 通知任务更新
  notifyTaskUpdate(task) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('task-update', task);
    }
  }

  // 通知任务列表更新
  notifyTaskListUpdate() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('task-list-update', this.getAllTasks());
    }
  }
}

// 创建全局任务队列实例
const taskQueue = new TaskQueue();

// 获取7z可执行文件路径 (7zip-min内置的7za)
function get7zPath() {
  // 尝试从 7zip-bin 获取可执行文件
  try {
    const zbin = require('7zip-bin');
    if (zbin && typeof zbin.path7za === 'string' && fs.existsSync(zbin.path7za)) return zbin.path7za;
    if (zbin && typeof zbin.path === 'string' && fs.existsSync(zbin.path)) return zbin.path;

    const zbinResolve = require.resolve('7zip-bin');
    const zbinDir = path.dirname(zbinResolve);
    const candidates = [];
    if (process.platform === 'win32') {
      candidates.push(path.join(zbinDir, 'win', process.arch, '7za.exe'));
      candidates.push(path.join(zbinDir, 'bin', '7za.exe'));
      candidates.push(path.join(zbinDir, '7za.exe'));
    } else if (process.platform === 'darwin') {
      candidates.push(path.join(zbinDir, 'mac', process.arch, '7za'));
      candidates.push(path.join(zbinDir, 'bin', '7za'));
      candidates.push(path.join(zbinDir, '7za'));
    } else {
      candidates.push(path.join(zbinDir, 'linux', process.arch, '7za'));
      candidates.push(path.join(zbinDir, 'bin', '7za'));
      candidates.push(path.join(zbinDir, '7za'));
    }
    for (const c of candidates) if (fs.existsSync(c)) return c;
  } catch (e) {}

  // 回退到 7zip-min 的查找方式（保留原有逻辑，但更健壮）
  try {
    const sevenZipPath = require.resolve('7zip-min');
    const sevenZipDir = path.dirname(sevenZipPath);
    const candidates = [];
    if (process.platform === 'win32') {
      candidates.push(path.join(sevenZipDir, '7zip-bin', 'win', process.arch, '7za.exe'));
      candidates.push(path.join(sevenZipDir, 'bin', '7za.exe'));
      candidates.push(path.join(sevenZipDir, '7za.exe'));
    } else if (process.platform === 'darwin') {
      candidates.push(path.join(sevenZipDir, '7zip-bin', 'mac', process.arch, '7za'));
      candidates.push(path.join(sevenZipDir, 'bin', '7za'));
      candidates.push(path.join(sevenZipDir, '7za'));
    } else {
      candidates.push(path.join(sevenZipDir, '7zip-bin', 'linux', process.arch, '7za'));
      candidates.push(path.join(sevenZipDir, 'bin', '7za'));
      candidates.push(path.join(sevenZipDir, '7za'));
    }
    for (const c of candidates) if (fs.existsSync(c)) return c;
  } catch (e) {}

  // 最后尝试系统 PATH 中的 7za/7z
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const out = require('child_process').execSync(`${which} 7za || ${which} 7z`, { encoding: 'utf8' }).split(/\r?\n/)[0];
    if (out && fs.existsSync(out)) return out;
  } catch (e) {}

  // 未找到时返回空字符串，调用处会回退到 7zip-min 的 JS 解压
  return '';
}

// 支持的视频格式
const VIDEO_EXTENSIONS = [
  '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm',
  '.m4v', '.mpeg', '.mpg', '.3gp', '.3g2', '.ts', '.mts',
  '.m2ts', '.vob', '.ogv', '.rm', '.rmvb', '.asf', '.divx'
];

// 支持的图片格式
const IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff',
  '.tif', '.ico', '.svg', '.heic', '.heif', '.raw', '.psd'
];

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: 'default',
    show: false
  });

  // 开发模式下加载 dist 目录，打包后加载当前目录
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 处理窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 开发时打开开发者工具
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // 在所有平台上关闭所有窗口时退出应用
  app.quit();
});

app.on('before-quit', () => {
  // 确保应用退出时，任何正在运行的子进程都被终止
  // Electron 会自动清理大多数进程，但这确保了彻底的清理
  process.exit(0);
});

// ============ 任务队列 IPC Handlers ============

// 添加任务到队列
ipcMain.handle('task-queue-add', async (event, { taskType, taskData, taskName }) => {
  const taskId = taskQueue.addTask(taskType, taskData, taskName);
  return taskId;
});

// 获取所有任务
ipcMain.handle('task-queue-get-all', async () => {
  return taskQueue.getAllTasks();
});

// 获取单个任务详情
ipcMain.handle('task-queue-get', async (event, taskId) => {
  return taskQueue.getTask(taskId);
});

// 取消任务
ipcMain.handle('task-queue-cancel', async (event, taskId) => {
  return taskQueue.cancelTask(taskId);
});

// 清除已完成的任务
ipcMain.handle('task-queue-clear-completed', async () => {
  taskQueue.clearCompletedTasks();
  return true;
});

// ============ Original IPC Handlers ============

// 选择源文件夹
ipcMain.handle('select-source-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择源文件夹'
  });
  
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});

// 选择目标文件夹
ipcMain.handle('select-target-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: '选择目标文件夹'
  });
  
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});

// 递归扫描视频文件
function scanVideoFiles(dir, baseDir = dir) {
  const videos = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      
      try {
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // 递归扫描子目录
          videos.push(...scanVideoFiles(fullPath, baseDir));
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (VIDEO_EXTENSIONS.includes(ext)) {
            // 获取相对于基础目录的父文件夹名称
            const relativePath = path.relative(baseDir, dir);
            const parentFolder = relativePath || path.basename(baseDir);
            
            videos.push({
              name: item,
              path: fullPath,
              parentFolder: parentFolder,
              size: stat.size
            });
          }
        }
      } catch (err) {
        console.error(`无法访问 ${fullPath}:`, err.message);
      }
    }
  } catch (err) {
    console.error(`无法读取目录 ${dir}:`, err.message);
  }
  
  return videos;
}

// 扫描视频文件
ipcMain.handle('scan-videos', async (event, sourcePath) => {
  return scanVideoFiles(sourcePath);
});

// 创建快捷方式
async function createShortcut(videoPath, targetDir, shortcutName) {
  const platform = process.platform;
  
  try {
    if (platform === 'win32') {
      // Windows: 创建 .lnk 快捷方式
      const shortcutPath = path.join(targetDir, `${shortcutName}.lnk`);
      
      // 转义 PowerShell 字符串中的特殊字符
      const escapePowerShellString = (str) => {
        return str.replace(/'/g, "''");
      };
      
      const escapedShortcutPath = escapePowerShellString(shortcutPath);
      const escapedVideoPath = escapePowerShellString(videoPath);
      
      // 使用 PowerShell 创建快捷方式：通过 -EncodedCommand 传递 Base64(UTF-16LE) 的命令，避免脚本编码导致的路径问题
      const { execFile } = require('child_process');

      const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('${escapedShortcutPath}')
$Shortcut.TargetPath = '${escapedVideoPath}'
$Shortcut.Save()
`;

      // PowerShell 的 -EncodedCommand 使用的是 UTF-16LE 的 Base64 编码
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

      // 使用异步 execFile 替代 execFileSync，避免阻塞主线程
      return new Promise((resolve) => {
        execFile('powershell', ['-NoProfile', '-EncodedCommand', encoded], {
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024
        }, (err) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true, path: shortcutPath });
          }
        });
      });
      
    } else if (platform === 'darwin') {
      // macOS: 创建符号链接
      const shortcutPath = path.join(targetDir, `${shortcutName}${path.extname(videoPath)}`);
      
      // 如果已存在，先删除
      if (fs.existsSync(shortcutPath)) {
        fs.unlinkSync(shortcutPath);
      }
      
      fs.symlinkSync(videoPath, shortcutPath);
      
      return { success: true, path: shortcutPath };
      
    } else {
      // Linux: 创建符号链接
      const shortcutPath = path.join(targetDir, `${shortcutName}${path.extname(videoPath)}`);
      
      // 如果已存在，先删除
      if (fs.existsSync(shortcutPath)) {
        fs.unlinkSync(shortcutPath);
      }
      
      fs.symlinkSync(videoPath, shortcutPath);
      
      return { success: true, path: shortcutPath };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 处理创建快捷方式请求 - 使用并发控制避免过多进程阻塞
ipcMain.handle('create-shortcuts', async (event, { videos, targetPath, namingMode }) => {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  // 确保目标目录存在
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
  
  // 用于跟踪重名情况
  const nameCount = {};
  
  // 并发控制：最多同时执行5个快捷方式创建
  const maxConcurrency = 5;
  const queue = [];
  let executing = 0;
  
  // 准备所有快捷方式创建任务
  const tasks = videos.map((video, i) => ({
    index: i,
    video: video,
    shortcutName: null
  }));
  
  // 计算每个视频的快捷方式名称
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const video = task.video;
    
    if (namingMode === 'folder') {
      // 使用父文件夹名称 + 原文件名
      const baseName = path.basename(video.name, path.extname(video.name));
      const folderPrefix = video.parentFolder.replace(/[/\\]/g, '_');
      task.shortcutName = `${folderPrefix}_${baseName}`;
    } else if (namingMode === 'folderOnly') {
      // 仅使用父文件夹名称
      const folderName = video.parentFolder.replace(/[/\\]/g, '_');
      
      // 处理同名情况
      if (nameCount[folderName] === undefined) {
        nameCount[folderName] = 0;
      }
      nameCount[folderName]++;
      
      if (nameCount[folderName] === 1) {
        task.shortcutName = folderName;
      } else {
        task.shortcutName = `${folderName}_${nameCount[folderName]}`;
      }
    } else {
      // 使用原文件名
      task.shortcutName = path.basename(video.name, path.extname(video.name));
    }
    
    // 清理文件名中的非法字符
    task.shortcutName = task.shortcutName.replace(/[<>:"/\\|?*]/g, '_');
  }
  
  // 执行并发任务
  return new Promise(async (resolve) => {
    let completed = 0;
    
    const processNext = async () => {
      if (queue.length === 0) {
        if (executing === 0 && completed === tasks.length) {
          resolve(results);
        }
        return;
      }
      
      if (executing < maxConcurrency) {
        executing++;
        const task = queue.shift();
        
        try {
          const result = await createShortcut(task.video.path, targetPath, task.shortcutName);
          
          if (result.success) {
            results.success++;
          } else {
            results.failed++;
            results.errors.push({
              video: task.video.name,
              error: result.error
            });
          }
        } catch (err) {
          results.failed++;
          results.errors.push({
            video: task.video.name,
            error: err.message
          });
        }
        
        // 发送进度更新
        completed++;
        mainWindow.webContents.send('progress-update', {
          current: completed,
          total: tasks.length,
          currentFile: task.video.name
        });
        
        executing--;
        processNext();
      }
    };
    
    // 初始化队列
    queue.push(...tasks);
    
    // 启动并发处理
    for (let i = 0; i < maxConcurrency; i++) {
      processNext();
    }
  });
});

// 打开文件夹
ipcMain.handle('open-folder', async (event, folderPath) => {
  shell.openPath(folderPath);
});

// 获取平台信息
ipcMain.handle('get-platform', () => {
  return process.platform;
});

// ============ 7z转ZIP工具相关功能 ============

// 扫描7z文件
function scan7zFiles(dir) {
  const files = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      
      try {
        const stat = fs.statSync(fullPath);
        
        if (stat.isFile() && path.extname(item).toLowerCase() === '.7z') {
          files.push({
            name: item,
            path: fullPath,
            size: stat.size
          });
        }
      } catch (err) {
        console.error(`无法访问 ${fullPath}:`, err.message);
      }
    }
  } catch (err) {
    console.error(`无法读取目录 ${dir}:`, err.message);
  }
  
  return files;
}

// 扫描7z文件
ipcMain.handle('scan-7z-files', async (event, sourcePath) => {
  return scan7zFiles(sourcePath);
});

// 判断文件类型
function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (VIDEO_EXTENSIONS.includes(ext)) {
    return 'video';
  }
  if (IMAGE_EXTENSIONS.includes(ext)) {
    return 'image';
  }
  return 'other';
}

// 解压7z文件并获取文件列表
function list7zContents(archivePath) {
  return new Promise((resolve, reject) => {
    sevenZip.list(archivePath, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

// 解压7z文件到临时目录 - 使用原生7z命令行，支持多线程
function extract7z(archivePath, destPath) {
  return new Promise((resolve, reject) => {
    const sevenZipBin = get7zPath();
    
    // 检查是否存在原生7z
    if (fs.existsSync(sevenZipBin)) {
      // 使用原生7z命令行，启用多线程解压
      // -mmt=on 启用多线程
      // -y 自动确认所有询问
      // -o 指定输出目录
      const args = ['x', archivePath, `-o${destPath}`, '-y', '-mmt=on'];
      
      execFile(sevenZipBin, args, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          // 如果原生命令失败，回退到7zip-min
          console.warn('原生7z解压失败，使用备用方法:', err.message);
          sevenZip.unpack(archivePath, destPath, (err2) => {
            if (err2) reject(err2);
            else resolve();
          });
        } else {
          resolve();
        }
      });
    } else {
      // 使用7zip-min作为备用
      sevenZip.unpack(archivePath, destPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }
  });
}

// 递归获取目录下所有文件
function getAllFiles(dir, baseDir = dir) {
  const files = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      
      try {
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          files.push(...getAllFiles(fullPath, baseDir));
        } else if (stat.isFile()) {
          const relativePath = path.relative(baseDir, fullPath);
          files.push({
            absolutePath: fullPath,
            relativePath: relativePath,
            name: item,
            type: getFileType(item),
            size: stat.size
          });
        }
      } catch (err) {
        console.error(`无法访问 ${fullPath}:`, err.message);
      }
    }
  } catch (err) {
    console.error(`无法读取目录 ${dir}:`, err.message);
  }
  
  return files;
}

// 创建zip文件
// compressionLevel: 0=store(不压缩,最快), 1=最快压缩, 9=最高压缩(最慢)
function createZip(files, outputPath, compressionLevel = 1) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: compressionLevel },
      // 使用更大的缓冲区提升IO性能
      highWaterMark: 1024 * 1024 // 1MB buffer
    });
    
    output.on('close', () => {
      resolve(archive.pointer());
    });
    
    archive.on('error', (err) => {
      reject(err);
    });
    
    archive.pipe(output);
    
    for (const file of files) {
      archive.file(file.absolutePath, { name: file.relativePath });
    }
    
    archive.finalize();
  });
}

// 递归删除目录
function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
  }
}

// 处理7z文件转换
ipcMain.handle('convert-7z-to-zip', async (event, { files, videoOutputPath, keepOriginal, compressionLevel = 1 }) => {
  const results = {
    success: 0,
    failed: 0,
    videosExtracted: 0,
    errors: []
  };
  
  // 确保视频输出目录存在
  if (!fs.existsSync(videoOutputPath)) {
    fs.mkdirSync(videoOutputPath, { recursive: true });
  }
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const tempDir = path.join(os.tmpdir(), `7z_extract_${Date.now()}_${i}`);
    
    try {
      // 发送进度
      mainWindow.webContents.send('convert-progress', {
        current: i + 1,
        total: files.length,
        currentFile: file.name,
        stage: 'extracting'
      });
      
      // 创建临时目录
      fs.mkdirSync(tempDir, { recursive: true });
      
      // 解压7z文件
      await extract7z(file.path, tempDir);
      
      // 获取所有文件
      const allFiles = getAllFiles(tempDir);
      
      // 分离视频和其他文件
      const videoFiles = allFiles.filter(f => f.type === 'video');
      const nonVideoFiles = allFiles.filter(f => f.type !== 'video');
      
      // 发送进度
      mainWindow.webContents.send('convert-progress', {
        current: i + 1,
        total: files.length,
        currentFile: file.name,
        stage: 'processing'
      });
      
      // 复制视频文件到指定目录
      for (const video of videoFiles) {
        const baseName = path.basename(file.name, '.7z');
        // 使用原7z文件名作为前缀，避免重名
        const videoDestName = `${baseName}_${video.name}`;
        const videoDest = path.join(videoOutputPath, videoDestName);
        
        // 处理重名
        let finalDest = videoDest;
        let counter = 1;
        while (fs.existsSync(finalDest)) {
          const ext = path.extname(videoDestName);
          const nameWithoutExt = path.basename(videoDestName, ext);
          finalDest = path.join(videoOutputPath, `${nameWithoutExt}_${counter}${ext}`);
          counter++;
        }
        
        fs.copyFileSync(video.absolutePath, finalDest);
        results.videosExtracted++;
      }
      
      // 创建zip文件（只包含非视频文件）
      if (nonVideoFiles.length > 0) {
        mainWindow.webContents.send('convert-progress', {
          current: i + 1,
          total: files.length,
          currentFile: file.name,
          stage: 'zipping'
        });
        
        const zipName = path.basename(file.name, '.7z') + '.zip';
        const zipPath = path.join(path.dirname(file.path), zipName);
        
        await createZip(nonVideoFiles, zipPath, compressionLevel);
      }
      
      // 删除原7z文件（如果选择了不保留）
      if (!keepOriginal) {
        fs.unlinkSync(file.path);
      }
      
      results.success++;
      
    } catch (err) {
      results.failed++;
      results.errors.push({
        file: file.name,
        error: err.message
      });
    } finally {
      // 清理临时目录
      try {
        deleteFolderRecursive(tempDir);
      } catch (err) {
        console.error('清理临时目录失败:', err.message);
      }
    }
  }
  
  return results;
});

// ============ 图片打包ZIP工具相关功能 ============

// 扫描包含图片的子文件夹
function scanImageFolders(dir) {
  const folders = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      
      try {
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // 扫描该子文件夹中的图片
          const images = scanImagesInFolder(fullPath);
          
          if (images.length > 0) {
            // 计算总大小
            const totalSize = images.reduce((sum, img) => sum + img.size, 0);
            
            folders.push({
              name: item,
              path: fullPath,
              imageCount: images.length,
              totalSize: totalSize,
              images: images
            });
          }
        }
      } catch (err) {
        console.error(`无法访问 ${fullPath}:`, err.message);
      }
    }
  } catch (err) {
    console.error(`无法读取目录 ${dir}:`, err.message);
  }
  
  return folders;
}

// 扫描文件夹中的图片（递归）
function scanImagesInFolder(dir, baseDir = dir) {
  const images = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      
      try {
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // 递归扫描子目录
          images.push(...scanImagesInFolder(fullPath, baseDir));
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (IMAGE_EXTENSIONS.includes(ext)) {
            const relativePath = path.relative(baseDir, fullPath);
            images.push({
              name: item,
              absolutePath: fullPath,
              relativePath: relativePath,
              size: stat.size
            });
          }
        }
      } catch (err) {
        console.error(`无法访问 ${fullPath}:`, err.message);
      }
    }
  } catch (err) {
    console.error(`无法读取目录 ${dir}:`, err.message);
  }
  
  return images;
}

// 扫描图片文件夹
ipcMain.handle('scan-image-folders', async (event, sourcePath) => {
  return scanImageFolders(sourcePath);
});

// 打包图片为ZIP
ipcMain.handle('pack-images-to-zip', async (event, { folders, targetPath, compressionLevel = 1 }) => {
  const results = {
    success: 0,
    failed: 0,
    totalImages: 0,
    errors: []
  };
  
  // 确保输出目录存在
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
  
  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i];
    
    try {
      // 发送进度
      mainWindow.webContents.send('imagezip-progress', {
        current: i + 1,
        total: folders.length,
        currentFolder: folder.name,
        stage: 'zipping'
      });
      
      // 准备文件列表
      const filesToZip = folder.images.map(img => ({
        absolutePath: img.absolutePath,
        relativePath: img.relativePath
      }));
      
      // 生成ZIP文件名（处理重名）
      let zipName = `${folder.name}.zip`;
      let zipPath = path.join(targetPath, zipName);
      let counter = 1;
      
      while (fs.existsSync(zipPath)) {
        zipName = `${folder.name}_${counter}.zip`;
        zipPath = path.join(targetPath, zipName);
        counter++;
      }
      
      // 创建ZIP
      await createZip(filesToZip, zipPath, compressionLevel);
      
      results.success++;
      results.totalImages += folder.images.length;
      
    } catch (err) {
      results.failed++;
      results.errors.push({
        folder: folder.name,
        error: err.message
      });
    }
  }
  
  return results;
});

// ============ TXT转EPUB工具相关功能 ============

// 常见的章节标题正则表达式模式
const CHAPTER_PATTERNS = [
  // 中文章节模式
  /^第[一二三四五六七八九十百千万零\d]+[章节卷部篇回集话]/,
  /^[第]?[\d一二三四五六七八九十百千万零]+[、.．:：\s]+/,
  /^【.+?】$/,
  /^卷[一二三四五六七八九十\d]+/,
  /^Chapter\s*\d+/i,
  /^CHAPTER\s*\d+/i,
  /^序[章言幕]?$/,
  /^楔子$/,
  /^引子$/,
  /^尾声$/,
  /^番外/,
  /^正文$/,
];

// 检测文件编码
function detectEncoding(buffer) {
  // 检查BOM
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf-8';
  }
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return 'utf-16le';
  }
  if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return 'utf-16be';
  }
  
  // 简单的GBK/UTF-8检测
  let utf8Score = 0;
  let gbkScore = 0;
  
  for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
    if (buffer[i] >= 0x80) {
      // 检查UTF-8多字节序列
      if ((buffer[i] & 0xE0) === 0xC0 && i + 1 < buffer.length && (buffer[i + 1] & 0xC0) === 0x80) {
        utf8Score++;
        i++;
      } else if ((buffer[i] & 0xF0) === 0xE0 && i + 2 < buffer.length && (buffer[i + 1] & 0xC0) === 0x80 && (buffer[i + 2] & 0xC0) === 0x80) {
        utf8Score += 2;
        i += 2;
      } else {
        gbkScore++;
      }
    }
  }
  
  return utf8Score > gbkScore ? 'utf-8' : 'gbk';
}

// 读取TXT文件内容
function readTxtFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const encoding = detectEncoding(buffer);
  
  let content;
  if (encoding === 'utf-8') {
    // 移除BOM
    content = buffer.toString('utf-8').replace(/^\uFEFF/, '');
  } else if (encoding === 'utf-16le') {
    content = buffer.toString('utf-16le').replace(/^\uFEFF/, '');
  } else if (encoding === 'utf-16be') {
    // Node.js不直接支持utf-16be，需要手动转换
    const utf16le = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i < buffer.length; i += 2) {
      utf16le[i - 2] = buffer[i + 1];
      utf16le[i - 1] = buffer[i];
    }
    content = utf16le.toString('utf-16le');
  } else {
    // GBK编码
    const iconv = require('iconv-lite');
    content = iconv.decode(buffer, 'gbk');
  }
  
  return content;
}

// 判断是否为章节标题
function isChapterTitle(line, customPattern = null) {
  const trimmedLine = line.trim();
  
  // 空行不是章节
  if (!trimmedLine) return false;
  
  // 太长的行不太可能是章节标题
  if (trimmedLine.length > 50) return false;
  
  // 自定义模式
  if (customPattern) {
    try {
      const regex = new RegExp(customPattern);
      if (regex.test(trimmedLine)) return true;
    } catch (e) {
      // 正则表达式无效，忽略
    }
  }
  
  // 使用预定义模式
  for (const pattern of CHAPTER_PATTERNS) {
    if (pattern.test(trimmedLine)) {
      return true;
    }
  }
  
  return false;
}

// 解析TXT内容为章节
function parseChapters(content, customPattern = null) {
  const lines = content.split(/\r?\n/);
  const chapters = [];
  let currentChapter = null;
  let currentContent = [];
  
  for (const line of lines) {
    if (isChapterTitle(line, customPattern)) {
      // 保存之前的章节
      if (currentChapter !== null) {
        chapters.push({
          title: currentChapter,
          content: currentContent.join('\n').trim()
        });
      }
      // 开始新章节
      currentChapter = line.trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  
  // 处理最后一章
  if (currentChapter !== null) {
    chapters.push({
      title: currentChapter,
      content: currentContent.join('\n').trim()
    });
  } else if (currentContent.length > 0) {
    // 没有检测到任何章节，将整个内容作为一个章节
    chapters.push({
      title: '正文',
      content: currentContent.join('\n').trim()
    });
  }
  
  return chapters;
}

// 将文本内容转换为HTML
function contentToHtml(content) {
  // 分割段落并转换为HTML
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
  
  const htmlParagraphs = paragraphs.map(p => {
    // 处理段落内的换行
    const lines = p.split('\n').filter(l => l.trim());
    return lines.map(line => `<p>${escapeHtml(line.trim())}</p>`).join('\n');
  });
  
  return htmlParagraphs.join('\n');
}

// HTML转义
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 扫描TXT文件
function scanTxtFiles(dir) {
  const files = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      
      try {
        const stat = fs.statSync(fullPath);
        
        if (stat.isFile() && path.extname(item).toLowerCase() === '.txt') {
          files.push({
            name: item,
            path: fullPath,
            size: stat.size
          });
        }
      } catch (err) {
        console.error(`无法访问 ${fullPath}:`, err.message);
      }
    }
  } catch (err) {
    console.error(`无法读取目录 ${dir}:`, err.message);
  }
  
  return files;
}

// 预览章节解析结果
function previewChapters(filePath, customPattern = null) {
  try {
    const content = readTxtFile(filePath);
    const chapters = parseChapters(content, customPattern);
    
    // 返回章节概要
    return {
      success: true,
      totalChapters: chapters.length,
      chapters: chapters.map((ch, index) => ({
        index: index + 1,
        title: ch.title,
        contentLength: ch.content.length,
        preview: ch.content.substring(0, 100) + (ch.content.length > 100 ? '...' : '')
      }))
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

// 转换TXT到EPUB
async function convertTxtToEpub(txtFile, outputPath, options = {}) {
  const {
    bookTitle = path.basename(txtFile.name, '.txt'),
    author = '未知作者',
    customPattern = null
  } = options;
  
  try {
    const content = readTxtFile(txtFile.path);
    const chapters = parseChapters(content, customPattern);
    
    if (chapters.length === 0) {
      throw new Error('未能解析出任何章节');
    }
    
    // 准备EPUB内容
    const epubContent = chapters.map((ch, index) => ({
      title: ch.title,
      data: `
        <html>
          <head>
            <title>${escapeHtml(ch.title)}</title>
            <style>
              body { font-family: serif; line-height: 1.8; padding: 20px; }
              h1 { text-align: center; margin-bottom: 30px; }
              p { text-indent: 2em; margin: 0.8em 0; }
            </style>
          </head>
          <body>
            <h1>${escapeHtml(ch.title)}</h1>
            ${contentToHtml(ch.content)}
          </body>
        </html>
      `
    }));
    
    // 使用epub-gen-memory生成EPUB
    const epub = require('epub-gen-memory').default;
    
    const epubBuffer = await epub({
      title: bookTitle,
      author: author,
      content: epubContent,
      css: `
        body { font-family: serif; line-height: 1.8; }
        h1 { text-align: center; margin-bottom: 30px; font-size: 1.5em; }
        p { text-indent: 2em; margin: 0.8em 0; }
      `
    });
    
    // 生成输出文件名
    let epubName = `${bookTitle}.epub`;
    let epubPath = path.join(outputPath, epubName);
    let counter = 1;
    
    while (fs.existsSync(epubPath)) {
      epubName = `${bookTitle}_${counter}.epub`;
      epubPath = path.join(outputPath, epubName);
      counter++;
    }
    
    // 写入文件
    fs.writeFileSync(epubPath, epubBuffer);
    
    return {
      success: true,
      outputPath: epubPath,
      chaptersCount: chapters.length
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

// 扫描TXT文件
ipcMain.handle('scan-txt-files', async (event, sourcePath) => {
  return scanTxtFiles(sourcePath);
});

// 预览章节
ipcMain.handle('preview-txt-chapters', async (event, { filePath, customPattern }) => {
  return previewChapters(filePath, customPattern);
});

// 选择TXT文件
ipcMain.handle('select-txt-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'TXT文件', extensions: ['txt'] }],
    title: '选择TXT文件'
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  
  const filePath = result.filePaths[0];
  const stat = fs.statSync(filePath);
  
  return {
    name: path.basename(filePath),
    path: filePath,
    size: stat.size
  };
});

// 转换TXT到EPUB
ipcMain.handle('convert-txt-to-epub', async (event, { files, outputPath, options }) => {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  // 确保输出目录存在
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    try {
      // 发送进度
      mainWindow.webContents.send('txt2epub-progress', {
        current: i + 1,
        total: files.length,
        currentFile: file.name,
        stage: 'converting'
      });
      
      const result = await convertTxtToEpub(file, outputPath, {
        ...options,
        bookTitle: options.bookTitle || path.basename(file.name, '.txt')
      });
      
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push({
          file: file.name,
          error: result.error
        });
      }
    } catch (err) {
      results.failed++;
      results.errors.push({
        file: file.name,
        error: err.message
      });
    }
  }
  
  return results;
});
