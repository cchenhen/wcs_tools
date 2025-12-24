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
