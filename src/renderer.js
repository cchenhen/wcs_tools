// 引入样式
import './styles.css';

// ============ 选项卡切换 ============
const tabBtns = document.querySelectorAll('.tab-btn');
const toolContents = document.querySelectorAll('.tool-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    
    // 更新按钮状态
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // 更新内容显示
    toolContents.forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabId}-tool`).classList.add('active');
  });
});

// ============ 视频快捷方式工具 ============

// 获取DOM元素
const selectSourceBtn = document.getElementById('selectSourceBtn');
const selectTargetBtn = document.getElementById('selectTargetBtn');
const sourcePath = document.getElementById('sourcePath');
const targetPath = document.getElementById('targetPath');
const scanBtn = document.getElementById('scanBtn');
const createBtn = document.getElementById('createBtn');
const videoList = document.getElementById('videoList');
const videoCount = document.getElementById('videoCount');
const videoListSection = document.getElementById('videoListSection');
const targetSection = document.getElementById('targetSection');
const progressSection = document.getElementById('progressSection');
const resultSection = document.getElementById('resultSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const currentFile = document.getElementById('currentFile');
const successCount = document.getElementById('successCount');
const failedCount = document.getElementById('failedCount');
const failedResult = document.getElementById('failedResult');
const errorList = document.getElementById('errorList');
const errorListContent = document.getElementById('errorListContent');
const openFolderBtn = document.getElementById('openFolderBtn');
const resetBtn = document.getElementById('resetBtn');
const selectAllBtn = document.getElementById('selectAllBtn');
const deselectAllBtn = document.getElementById('deselectAllBtn');
const platformInfo = document.getElementById('platformInfo');

// 存储扫描到的视频
let scannedVideos = [];

// 初始化
async function init() {
  const platform = await window.electronAPI.getPlatform();
  let platformName = '';
  switch (platform) {
    case 'darwin':
      platformName = 'macOS (创建符号链接)';
      break;
    case 'win32':
      platformName = 'Windows (创建 .lnk 快捷方式)';
      break;
    case 'linux':
      platformName = 'Linux (创建符号链接)';
      break;
    default:
      platformName = platform;
  }
  platformInfo.textContent = `当前平台: ${platformName}`;
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 选择源文件夹
selectSourceBtn.addEventListener('click', async () => {
  const path = await window.electronAPI.selectSourceFolder();
  if (path) {
    sourcePath.value = path;
    scanBtn.disabled = false;
    // 隐藏之前的结果
    videoListSection.style.display = 'none';
    targetSection.style.display = 'none';
    resultSection.style.display = 'none';
  }
});

// 选择目标文件夹
selectTargetBtn.addEventListener('click', async () => {
  const path = await window.electronAPI.selectTargetFolder();
  if (path) {
    targetPath.value = path;
    updateCreateButtonState();
  }
});

// 扫描视频文件
scanBtn.addEventListener('click', async () => {
  scanBtn.disabled = true;
  scanBtn.textContent = '扫描中...';
  
  try {
    scannedVideos = await window.electronAPI.scanVideos(sourcePath.value);
    
    // 显示结果
    videoListSection.style.display = 'block';
    targetSection.style.display = 'block';
    
    // 默认将目标文件夹设置为源文件夹下的"视频快捷方式"子文件夹
    if (!targetPath.value) {
      const separator = sourcePath.value.includes('\\') ? '\\' : '/';
      targetPath.value = sourcePath.value + separator + '视频快捷方式';
    }
    
    videoCount.textContent = `共找到 ${scannedVideos.length} 个视频文件`;
    
    // 渲染视频列表
    renderVideoList();
    
  } catch (error) {
    alert('扫描出错: ' + error.message);
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = '扫描视频文件';
  }
});

// 渲染视频列表
function renderVideoList() {
  videoList.innerHTML = '';
  
  if (scannedVideos.length === 0) {
    videoList.innerHTML = '<div class="no-videos">未找到视频文件</div>';
    return;
  }
  
  scannedVideos.forEach((video, index) => {
    const item = document.createElement('div');
    item.className = 'video-item';
    item.innerHTML = `
      <label class="checkbox-label">
        <input type="checkbox" class="video-checkbox" data-index="${index}" checked>
        <div class="video-info">
          <span class="video-name" title="${video.path}">${video.name}</span>
          <span class="video-meta">
            <span class="video-folder">📁 ${video.parentFolder}</span>
            <span class="video-size">${formatFileSize(video.size)}</span>
          </span>
        </div>
      </label>
    `;
    videoList.appendChild(item);
  });
  
  updateCreateButtonState();
}

// 全选
selectAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.video-checkbox').forEach(cb => cb.checked = true);
  updateCreateButtonState();
});

// 取消全选
deselectAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.video-checkbox').forEach(cb => cb.checked = false);
  updateCreateButtonState();
});

// 监听复选框变化
videoList.addEventListener('change', (e) => {
  if (e.target.classList.contains('video-checkbox')) {
    updateCreateButtonState();
  }
});

// 更新创建按钮状态
function updateCreateButtonState() {
  const checkedCount = document.querySelectorAll('.video-checkbox:checked').length;
  const hasTarget = targetPath.value.trim() !== '';
  createBtn.disabled = checkedCount === 0 || !hasTarget;
  
  if (checkedCount > 0) {
    createBtn.textContent = `🚀 创建 ${checkedCount} 个快捷方式`;
  } else {
    createBtn.textContent = '🚀 创建快捷方式';
  }
}

// 创建快捷方式
createBtn.addEventListener('click', async () => {
  // 获取选中的视频
  const selectedVideos = [];
  document.querySelectorAll('.video-checkbox:checked').forEach(cb => {
    const index = parseInt(cb.dataset.index);
    selectedVideos.push(scannedVideos[index]);
  });
  
  if (selectedVideos.length === 0) {
    alert('请至少选择一个视频文件');
    return;
  }
  
  // 获取命名方式
  const namingMode = document.querySelector('input[name="namingMode"]:checked').value;
  
  try {
    // 添加任务到队列
    const taskId = await window.electronAPI.taskQueueAdd(
      'create-shortcuts',
      {
        videos: selectedVideos,
        targetPath: targetPath.value,
        namingMode: namingMode
      },
      `创建 ${selectedVideos.length} 个视频快捷方式`
    );
    
    // 显示成功提示
    alert(`任务已添加到队列！\n任务ID: ${taskId}\n请查看任务队列面板了解进度。`);
    
    // 可以选择重置界面或保持当前状态
    // resetBtn.click();
    
  } catch (error) {
    alert('添加任务失败: ' + error.message);
  }
});

// 打开目标文件夹
openFolderBtn.addEventListener('click', () => {
  window.electronAPI.openFolder(targetPath.value);
});

// 重新开始
resetBtn.addEventListener('click', () => {
  sourcePath.value = '';
  targetPath.value = '';
  scannedVideos = [];
  scanBtn.disabled = true;
  createBtn.disabled = true;
  videoListSection.style.display = 'none';
  targetSection.style.display = 'none';
  progressSection.style.display = 'none';
  resultSection.style.display = 'none';
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
  currentFile.textContent = '';
});

// 初始化应用
init();

// ============ 7z转ZIP工具 ============

// 获取DOM元素
const convertSelectSourceBtn = document.getElementById('convert-selectSourceBtn');
const convertSourcePath = document.getElementById('convert-sourcePath');
const convertScanBtn = document.getElementById('convert-scanBtn');
const convertFileListSection = document.getElementById('convert-fileListSection');
const convertFileList = document.getElementById('convert-fileList');
const convertFileCount = document.getElementById('convert-fileCount');
const convertSelectAllBtn = document.getElementById('convert-selectAllBtn');
const convertDeselectAllBtn = document.getElementById('convert-deselectAllBtn');
const convertTargetSection = document.getElementById('convert-targetSection');
const convertVideoPath = document.getElementById('convert-videoPath');
const convertSelectVideoBtn = document.getElementById('convert-selectVideoBtn');
const convertKeepOriginal = document.getElementById('convert-keepOriginal');
const convertStartBtn = document.getElementById('convert-startBtn');
const convertProgressSection = document.getElementById('convert-progressSection');
const convertProgressFill = document.getElementById('convert-progressFill');
const convertProgressText = document.getElementById('convert-progressText');
const convertCurrentFile = document.getElementById('convert-currentFile');
const convertStage = document.getElementById('convert-stage');
const convertResultSection = document.getElementById('convert-resultSection');
const convertSuccessCount = document.getElementById('convert-successCount');
const convertVideoCount = document.getElementById('convert-videoCount');
const convertFailedResult = document.getElementById('convert-failedResult');
const convertFailedCount = document.getElementById('convert-failedCount');
const convertOpenVideoBtn = document.getElementById('convert-openVideoBtn');
const convertResetBtn = document.getElementById('convert-resetBtn');
const convertErrorList = document.getElementById('convert-errorList');
const convertErrorListContent = document.getElementById('convert-errorListContent');

// 存储扫描到的7z文件
let scanned7zFiles = [];

// 选择7z源文件夹
convertSelectSourceBtn.addEventListener('click', async () => {
  const path = await window.electronAPI.selectSourceFolder();
  if (path) {
    convertSourcePath.value = path;
    convertScanBtn.disabled = false;
    // 隐藏之前的结果
    convertFileListSection.style.display = 'none';
    convertTargetSection.style.display = 'none';
    convertResultSection.style.display = 'none';
  }
});

// 选择视频输出文件夹
convertSelectVideoBtn.addEventListener('click', async () => {
  const path = await window.electronAPI.selectTargetFolder();
  if (path) {
    convertVideoPath.value = path;
    updateConvertButtonState();
  }
});

// 扫描7z文件
convertScanBtn.addEventListener('click', async () => {
  convertScanBtn.disabled = true;
  convertScanBtn.textContent = '扫描中...';
  
  try {
    scanned7zFiles = await window.electronAPI.scan7zFiles(convertSourcePath.value);
    
    // 显示结果
    convertFileListSection.style.display = 'block';
    convertTargetSection.style.display = 'block';
    
    // 默认将视频输出文件夹设置为源文件夹下的"提取的视频"子文件夹
    if (!convertVideoPath.value) {
      const separator = convertSourcePath.value.includes('\\') ? '\\' : '/';
      convertVideoPath.value = convertSourcePath.value + separator + '提取的视频';
    }
    
    convertFileCount.textContent = `共找到 ${scanned7zFiles.length} 个7z文件`;
    
    // 渲染7z文件列表
    render7zFileList();
    
  } catch (error) {
    alert('扫描出错: ' + error.message);
  } finally {
    convertScanBtn.disabled = false;
    convertScanBtn.textContent = '扫描7z文件';
  }
});

// 渲染7z文件列表
function render7zFileList() {
  convertFileList.innerHTML = '';
  
  if (scanned7zFiles.length === 0) {
    convertFileList.innerHTML = '<div class="no-videos">未找到7z文件</div>';
    return;
  }
  
  scanned7zFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'video-item';
    item.innerHTML = `
      <label class="checkbox-label">
        <input type="checkbox" class="file-checkbox" data-index="${index}" checked>
        <div class="video-info">
          <span class="video-name" title="${file.path}">📦 ${file.name}</span>
          <span class="video-meta">
            <span class="video-size">${formatFileSize(file.size)}</span>
          </span>
        </div>
      </label>
    `;
    convertFileList.appendChild(item);
  });
  
  updateConvertButtonState();
}

// 全选7z文件
convertSelectAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = true);
  updateConvertButtonState();
});

// 取消全选7z文件
convertDeselectAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = false);
  updateConvertButtonState();
});

// 监听复选框变化
convertFileList.addEventListener('change', (e) => {
  if (e.target.classList.contains('file-checkbox')) {
    updateConvertButtonState();
  }
});

// 更新转换按钮状态
function updateConvertButtonState() {
  const checkedCount = document.querySelectorAll('.file-checkbox:checked').length;
  const hasVideoPath = convertVideoPath.value.trim() !== '';
  convertStartBtn.disabled = checkedCount === 0 || !hasVideoPath;
  
  if (checkedCount > 0) {
    convertStartBtn.textContent = `🔄 转换 ${checkedCount} 个文件`;
  } else {
    convertStartBtn.textContent = '🔄 开始转换';
  }
}

// 获取阶段描述
function getStageDescription(stage) {
  switch (stage) {
    case 'extracting':
      return '📂 正在解压...';
    case 'processing':
      return '🔄 正在处理文件...';
    case 'zipping':
      return '📦 正在创建ZIP...';
    default:
      return '';
  }
}

// 开始转换
convertStartBtn.addEventListener('click', async () => {
  // 获取选中的文件
  const selectedFiles = [];
  document.querySelectorAll('.file-checkbox:checked').forEach(cb => {
    const index = parseInt(cb.dataset.index);
    selectedFiles.push(scanned7zFiles[index]);
  });
  
  if (selectedFiles.length === 0) {
    alert('请至少选择一个7z文件');
    return;
  }
  
  try {
    // 获取压缩级别设置
    const compressionLevel = parseInt(document.getElementById('convert-compressionLevel').value, 10);
    
    // 添加任务到队列
    const taskId = await window.electronAPI.taskQueueAdd(
      'convert-7z-to-zip',
      {
        files: selectedFiles,
        videoOutputPath: convertVideoPath.value,
        keepOriginal: convertKeepOriginal.checked,
        compressionLevel: compressionLevel
      },
      `转换 ${selectedFiles.length} 个7z文件`
    );
    
    // 显示成功提示
    alert(`任务已添加到队列！\n任务ID: ${taskId}\n请查看任务队列面板了解进度。`);
    
  } catch (error) {
    alert('添加任务失败: ' + error.message);
  }
});

// 打开视频文件夹
convertOpenVideoBtn.addEventListener('click', () => {
  window.electronAPI.openFolder(convertVideoPath.value);
});

// 重新开始（7z转换工具）
convertResetBtn.addEventListener('click', () => {
  convertSourcePath.value = '';
  convertVideoPath.value = '';
  scanned7zFiles = [];
  convertScanBtn.disabled = true;
  convertStartBtn.disabled = true;
  convertFileListSection.style.display = 'none';
  convertTargetSection.style.display = 'none';
  convertProgressSection.style.display = 'none';
  convertResultSection.style.display = 'none';
  convertProgressFill.style.width = '0%';
  convertProgressText.textContent = '0%';
  convertCurrentFile.textContent = '';
  convertStage.textContent = '';
  convertKeepOriginal.checked = false;
});

// ============ 图片打包ZIP工具 ============

// 获取DOM元素
const imagezipSelectSourceBtn = document.getElementById('imagezip-selectSourceBtn');
const imagezipSourcePath = document.getElementById('imagezip-sourcePath');
const imagezipScanBtn = document.getElementById('imagezip-scanBtn');
const imagezipFolderListSection = document.getElementById('imagezip-folderListSection');
const imagezipFolderList = document.getElementById('imagezip-folderList');
const imagezipFolderCount = document.getElementById('imagezip-folderCount');
const imagezipSelectAllBtn = document.getElementById('imagezip-selectAllBtn');
const imagezipDeselectAllBtn = document.getElementById('imagezip-deselectAllBtn');
const imagezipTargetSection = document.getElementById('imagezip-targetSection');
const imagezipTargetPath = document.getElementById('imagezip-targetPath');
const imagezipSelectTargetBtn = document.getElementById('imagezip-selectTargetBtn');
const imagezipCompressionLevel = document.getElementById('imagezip-compressionLevel');
const imagezipStartBtn = document.getElementById('imagezip-startBtn');
const imagezipProgressSection = document.getElementById('imagezip-progressSection');
const imagezipProgressFill = document.getElementById('imagezip-progressFill');
const imagezipProgressText = document.getElementById('imagezip-progressText');
const imagezipCurrentFolder = document.getElementById('imagezip-currentFolder');
const imagezipStage = document.getElementById('imagezip-stage');
const imagezipResultSection = document.getElementById('imagezip-resultSection');
const imagezipSuccessCount = document.getElementById('imagezip-successCount');
const imagezipImageCount = document.getElementById('imagezip-imageCount');
const imagezipFailedResult = document.getElementById('imagezip-failedResult');
const imagezipFailedCount = document.getElementById('imagezip-failedCount');
const imagezipOpenFolderBtn = document.getElementById('imagezip-openFolderBtn');
const imagezipResetBtn = document.getElementById('imagezip-resetBtn');
const imagezipErrorList = document.getElementById('imagezip-errorList');
const imagezipErrorListContent = document.getElementById('imagezip-errorListContent');

// 存储扫描到的图片文件夹
let scannedImageFolders = [];

// 选择图片源文件夹
imagezipSelectSourceBtn.addEventListener('click', async () => {
  const path = await window.electronAPI.selectSourceFolder();
  if (path) {
    imagezipSourcePath.value = path;
    imagezipScanBtn.disabled = false;
    // 隐藏之前的结果
    imagezipFolderListSection.style.display = 'none';
    imagezipTargetSection.style.display = 'none';
    imagezipResultSection.style.display = 'none';
  }
});

// 选择ZIP输出文件夹
imagezipSelectTargetBtn.addEventListener('click', async () => {
  const path = await window.electronAPI.selectTargetFolder();
  if (path) {
    imagezipTargetPath.value = path;
    updateImageZipButtonState();
  }
});

// 扫描图片文件夹
imagezipScanBtn.addEventListener('click', async () => {
  imagezipScanBtn.disabled = true;
  imagezipScanBtn.textContent = '扫描中...';
  
  try {
    scannedImageFolders = await window.electronAPI.scanImageFolders(imagezipSourcePath.value);
    
    // 显示结果
    imagezipFolderListSection.style.display = 'block';
    imagezipTargetSection.style.display = 'block';
    
    // 默认将输出文件夹设置为源文件夹下的"打包的图片"子文件夹
    if (!imagezipTargetPath.value) {
      const separator = imagezipSourcePath.value.includes('\\') ? '\\' : '/';
      imagezipTargetPath.value = imagezipSourcePath.value + separator + '打包的图片';
    }
    
    imagezipFolderCount.textContent = `共找到 ${scannedImageFolders.length} 个包含图片的子文件夹`;
    
    // 渲染文件夹列表
    renderImageFolderList();
    
  } catch (error) {
    alert('扫描出错: ' + error.message);
  } finally {
    imagezipScanBtn.disabled = false;
    imagezipScanBtn.textContent = '扫描子文件夹';
  }
});

// 渲染图片文件夹列表
function renderImageFolderList() {
  imagezipFolderList.innerHTML = '';
  
  if (scannedImageFolders.length === 0) {
    imagezipFolderList.innerHTML = '<div class="no-videos">未找到包含图片的子文件夹</div>';
    return;
  }
  
  scannedImageFolders.forEach((folder, index) => {
    const item = document.createElement('div');
    item.className = 'video-item';
    item.innerHTML = `
      <label class="checkbox-label">
        <input type="checkbox" class="imagezip-checkbox" data-index="${index}" checked>
        <div class="video-info">
          <span class="video-name" title="${folder.path}">📁 ${folder.name}</span>
          <span class="video-meta">
            <span class="video-folder">🖼️ ${folder.imageCount} 张图片</span>
            <span class="video-size">${formatFileSize(folder.totalSize)}</span>
          </span>
        </div>
      </label>
    `;
    imagezipFolderList.appendChild(item);
  });
  
  updateImageZipButtonState();
}

// 全选图片文件夹
imagezipSelectAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.imagezip-checkbox').forEach(cb => cb.checked = true);
  updateImageZipButtonState();
});

// 取消全选图片文件夹
imagezipDeselectAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.imagezip-checkbox').forEach(cb => cb.checked = false);
  updateImageZipButtonState();
});

// 监听复选框变化
imagezipFolderList.addEventListener('change', (e) => {
  if (e.target.classList.contains('imagezip-checkbox')) {
    updateImageZipButtonState();
  }
});

// 更新打包按钮状态
function updateImageZipButtonState() {
  const checkedCount = document.querySelectorAll('.imagezip-checkbox:checked').length;
  const hasTargetPath = imagezipTargetPath.value.trim() !== '';
  imagezipStartBtn.disabled = checkedCount === 0 || !hasTargetPath;
  
  if (checkedCount > 0) {
    imagezipStartBtn.textContent = `📦 打包 ${checkedCount} 个文件夹`;
  } else {
    imagezipStartBtn.textContent = '📦 开始打包';
  }
}

// 开始打包
imagezipStartBtn.addEventListener('click', async () => {
  // 获取选中的文件夹
  const selectedFolders = [];
  document.querySelectorAll('.imagezip-checkbox:checked').forEach(cb => {
    const index = parseInt(cb.dataset.index);
    selectedFolders.push(scannedImageFolders[index]);
  });
  
  if (selectedFolders.length === 0) {
    alert('请至少选择一个文件夹');
    return;
  }
  
  try {
    // 获取压缩级别设置
    const compressionLevel = parseInt(imagezipCompressionLevel.value, 10);
    
    // 添加任务到队列
    const taskId = await window.electronAPI.taskQueueAdd(
      'pack-images',
      {
        folders: selectedFolders,
        targetPath: imagezipTargetPath.value,
        compressionLevel: compressionLevel
      },
      `打包 ${selectedFolders.length} 个图片文件夹`
    );
    
    // 显示成功提示
    alert(`任务已添加到队列！\n任务ID: ${taskId}\n请查看任务队列面板了解进度。`);
    
  } catch (error) {
    alert('添加任务失败: ' + error.message);
  }
});

// 打开输出文件夹
imagezipOpenFolderBtn.addEventListener('click', () => {
  window.electronAPI.openFolder(imagezipTargetPath.value);
});

// 重新开始（图片打包工具）
imagezipResetBtn.addEventListener('click', () => {
  imagezipSourcePath.value = '';
  imagezipTargetPath.value = '';
  scannedImageFolders = [];
  imagezipScanBtn.disabled = true;
  imagezipStartBtn.disabled = true;
  imagezipFolderListSection.style.display = 'none';
  imagezipTargetSection.style.display = 'none';
  imagezipProgressSection.style.display = 'none';
  imagezipResultSection.style.display = 'none';
  imagezipProgressFill.style.width = '0%';
  imagezipProgressText.textContent = '0%';
  imagezipCurrentFolder.textContent = '';
  imagezipStage.textContent = '';
});

// ============ 任务队列管理 ============

// 获取DOM元素
const taskQueuePanel = document.getElementById('taskQueuePanel');
const toggleQueueBtn = document.getElementById('toggleQueueBtn');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');
const taskList = document.getElementById('taskList');
const taskQueueContent = document.getElementById('taskQueueContent');

let isQueueExpanded = true;

// 切换队列面板展开/收起
toggleQueueBtn.addEventListener('click', () => {
  isQueueExpanded = !isQueueExpanded;
  if (isQueueExpanded) {
    taskQueueContent.style.display = 'block';
    toggleQueueBtn.textContent = '▼';
  } else {
    taskQueueContent.style.display = 'none';
    toggleQueueBtn.textContent = '▲';
  }
});

// 清除已完成的任务
clearCompletedBtn.addEventListener('click', async () => {
  await window.electronAPI.taskQueueClearCompleted();
});

// 格式化任务状态
function formatTaskStatus(status) {
  const statusMap = {
    'pending': { text: '等待中', icon: '⏳', class: 'pending' },
    'running': { text: '执行中', icon: '▶️', class: 'running' },
    'completed': { text: '已完成', icon: '✅', class: 'completed' },
    'failed': { text: '失败', icon: '❌', class: 'failed' },
    'cancelled': { text: '已取消', icon: '🚫', class: 'cancelled' }
  };
  return statusMap[status] || { text: status, icon: '❓', class: 'unknown' };
}

// 格式化任务类型
function formatTaskType(type) {
  const typeMap = {
    'create-shortcuts': '视频快捷方式',
    'convert-7z-to-zip': '7z转ZIP',
    'pack-images': '图片打包'
  };
  return typeMap[type] || type;
}

// 格式化时间
function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  
  return date.toLocaleString('zh-CN', { 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

// 渲染任务列表
function renderTaskList(tasks) {
  if (!tasks || tasks.length === 0) {
    taskList.innerHTML = '<div class="task-empty">暂无任务</div>';
    return;
  }
  
  taskList.innerHTML = '';
  
  tasks.forEach(task => {
    const status = formatTaskStatus(task.status);
    const taskType = formatTaskType(task.type);
    const timeStr = formatTime(task.createdAt);
    
    const taskItem = document.createElement('div');
    taskItem.className = `task-item task-${status.class}`;
    taskItem.dataset.taskId = task.id;
    
    let progressHTML = '';
    if (task.status === 'running') {
      progressHTML = `
        <div class="task-progress-bar">
          <div class="task-progress-fill" style="width: ${task.progress}%"></div>
        </div>
        <div class="task-progress-text">${task.progress}%</div>
      `;
    }
    
    let resultHTML = '';
    if (task.status === 'completed' && task.result) {
      const r = task.result;
      resultHTML = `<div class="task-result">成功:${r.success} 失败:${r.failed}</div>`;
    } else if (task.status === 'failed') {
      resultHTML = `<div class="task-error">${task.error}</div>`;
    }
    
    let actionsHTML = '';
    if (task.status === 'pending') {
      actionsHTML = `
        <button class="task-btn-cancel" data-task-id="${task.id}">取消</button>
      `;
    }
    
    taskItem.innerHTML = `
      <div class="task-header">
        <span class="task-status-icon">${status.icon}</span>
        <div class="task-info">
          <div class="task-title">${task.name || taskType}</div>
          <div class="task-meta">
            <span class="task-type">${taskType}</span>
            <span class="task-time">${timeStr}</span>
            <span class="task-status">${status.text}</span>
          </div>
        </div>
        <div class="task-actions">
          ${actionsHTML}
        </div>
      </div>
      ${progressHTML}
      ${resultHTML}
    `;
    
    taskList.appendChild(taskItem);
  });
  
  // 绑定取消按钮事件
  taskList.querySelectorAll('.task-btn-cancel').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const taskId = parseInt(e.target.dataset.taskId);
      await window.electronAPI.taskQueueCancel(taskId);
    });
  });
}

// 监听任务更新
window.electronAPI.onTaskUpdate((task) => {
  // 更新单个任务
  const taskItem = document.querySelector(`.task-item[data-task-id="${task.id}"]`);
  if (taskItem) {
    // 重新获取所有任务并渲染
    window.electronAPI.taskQueueGetAll().then(renderTaskList);
  } else {
    // 新任务，重新获取所有任务
    window.electronAPI.taskQueueGetAll().then(renderTaskList);
  }
});

// 监听任务列表更新
window.electronAPI.onTaskListUpdate((tasks) => {
  renderTaskList(tasks);
});

// 初始化时加载任务列表
window.electronAPI.taskQueueGetAll().then(renderTaskList);

