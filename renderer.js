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
  
  // 显示进度
  progressSection.style.display = 'block';
  resultSection.style.display = 'none';
  createBtn.disabled = true;
  
  // 监听进度更新
  window.electronAPI.onProgressUpdate((data) => {
    const percent = Math.round((data.current / data.total) * 100);
    progressFill.style.width = percent + '%';
    progressText.textContent = `${percent}% (${data.current}/${data.total})`;
    currentFile.textContent = data.currentFile;
  });
  
  try {
    const result = await window.electronAPI.createShortcuts({
      videos: selectedVideos,
      targetPath: targetPath.value,
      namingMode: namingMode
    });
    
    // 显示结果
    progressSection.style.display = 'none';
    resultSection.style.display = 'block';
    
    successCount.textContent = result.success;
    
    if (result.failed > 0) {
      failedResult.style.display = 'flex';
      failedCount.textContent = result.failed;
      
      // 显示错误详情
      errorList.style.display = 'block';
      errorListContent.innerHTML = '';
      result.errors.forEach(err => {
        const li = document.createElement('li');
        li.textContent = `${err.video}: ${err.error}`;
        errorListContent.appendChild(li);
      });
    } else {
      failedResult.style.display = 'none';
      errorList.style.display = 'none';
    }
    
  } catch (error) {
    alert('创建快捷方式出错: ' + error.message);
    progressSection.style.display = 'none';
  } finally {
    window.electronAPI.removeProgressListener();
    createBtn.disabled = false;
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
  
  // 显示进度
  convertProgressSection.style.display = 'block';
  convertResultSection.style.display = 'none';
  convertStartBtn.disabled = true;
  
  // 监听进度更新
  window.electronAPI.onConvertProgress((data) => {
    const percent = Math.round((data.current / data.total) * 100);
    convertProgressFill.style.width = percent + '%';
    convertProgressText.textContent = `${percent}% (${data.current}/${data.total})`;
    convertCurrentFile.textContent = data.currentFile;
    convertStage.textContent = getStageDescription(data.stage);
  });
  
  try {
    const result = await window.electronAPI.convert7zToZip({
      files: selectedFiles,
      videoOutputPath: convertVideoPath.value,
      keepOriginal: convertKeepOriginal.checked
    });
    
    // 显示结果
    convertProgressSection.style.display = 'none';
    convertResultSection.style.display = 'block';
    
    convertSuccessCount.textContent = result.success;
    convertVideoCount.textContent = result.videosExtracted;
    
    if (result.failed > 0) {
      convertFailedResult.style.display = 'flex';
      convertFailedCount.textContent = result.failed;
      
      // 显示错误详情
      convertErrorList.style.display = 'block';
      convertErrorListContent.innerHTML = '';
      result.errors.forEach(err => {
        const li = document.createElement('li');
        li.textContent = `${err.file}: ${err.error}`;
        convertErrorListContent.appendChild(li);
      });
    } else {
      convertFailedResult.style.display = 'none';
      convertErrorList.style.display = 'none';
    }
    
  } catch (error) {
    alert('转换出错: ' + error.message);
    convertProgressSection.style.display = 'none';
  } finally {
    window.electronAPI.removeConvertProgressListener();
    convertStartBtn.disabled = false;
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
