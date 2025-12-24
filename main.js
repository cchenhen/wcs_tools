const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');
const sevenZip = require('7zip-min');
const archiver = require('archiver');

// 获取7z可执行文件路径 (7zip-min内置的7za)
function get7zPath() {
  const sevenZipPath = require.resolve('7zip-min');
  const sevenZipDir = path.dirname(sevenZipPath);
  
  if (process.platform === 'win32') {
    return path.join(sevenZipDir, '7zip-bin', 'win', process.arch, '7za.exe');
  } else if (process.platform === 'darwin') {
    return path.join(sevenZipDir, '7zip-bin', 'mac', process.arch, '7za');
  } else {
    return path.join(sevenZipDir, '7zip-bin', 'linux', process.arch, '7za');
  }
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

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
      
      // 使用 PowerShell 创建快捷方式（比 VBS 更好地支持 Unicode）
      const { execSync } = require('child_process');
      
      // 转义 PowerShell 字符串中的特殊字符
      const escapePowerShellString = (str) => {
        return str.replace(/'/g, "''");
      };
      
      const escapedShortcutPath = escapePowerShellString(shortcutPath);
      const escapedVideoPath = escapePowerShellString(videoPath);
      
      // 使用 PowerShell 创建快捷方式
      const psCommand = `
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut('${escapedShortcutPath}')
        $Shortcut.TargetPath = '${escapedVideoPath}'
        $Shortcut.Save()
      `.replace(/\n/g, ' ');
      
      // 使用 UTF-8 编码执行 PowerShell 命令
      execSync(`powershell -NoProfile -Command "${psCommand.replace(/"/g, '\\"')}"`, { 
        windowsHide: true,
        encoding: 'utf8'
      });
      
      return { success: true, path: shortcutPath };
      
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

// 处理创建快捷方式请求
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
  
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    
    let shortcutName;
    
    if (namingMode === 'folder') {
      // 使用父文件夹名称 + 原文件名
      const baseName = path.basename(video.name, path.extname(video.name));
      const folderPrefix = video.parentFolder.replace(/[/\\]/g, '_');
      shortcutName = `${folderPrefix}_${baseName}`;
    } else if (namingMode === 'folderOnly') {
      // 仅使用父文件夹名称
      const folderName = video.parentFolder.replace(/[/\\]/g, '_');
      
      // 处理同名情况
      if (nameCount[folderName] === undefined) {
        nameCount[folderName] = 0;
      }
      nameCount[folderName]++;
      
      if (nameCount[folderName] === 1) {
        shortcutName = folderName;
      } else {
        shortcutName = `${folderName}_${nameCount[folderName]}`;
      }
    } else {
      // 使用原文件名
      shortcutName = path.basename(video.name, path.extname(video.name));
    }
    
    // 清理文件名中的非法字符
    shortcutName = shortcutName.replace(/[<>:"/\\|?*]/g, '_');
    
    const result = await createShortcut(video.path, targetPath, shortcutName);
    
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push({
        video: video.name,
        error: result.error
      });
    }
    
    // 发送进度更新
    mainWindow.webContents.send('progress-update', {
      current: i + 1,
      total: videos.length,
      currentFile: video.name
    });
  }
  
  return results;
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
