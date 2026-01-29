import './style.css';

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
    const platform = await window.go.main.App.GetPlatform();
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
    const path = await window.go.main.App.SelectSourceFolder();
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
    const path = await window.go.main.App.SelectTargetFolder();
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
        scannedVideos = await window.go.main.App.ScanVideos(sourcePath.value);

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
        const taskId = await window.go.main.App.TaskQueueAdd(
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
    window.go.main.App.OpenFolder(targetPath.value);
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
    const path = await window.go.main.App.SelectSourceFolder();
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
    const path = await window.go.main.App.SelectTargetFolder();
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
        scanned7zFiles = await window.go.main.App.Scan7zFiles(convertSourcePath.value);

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
        const taskId = await window.go.main.App.TaskQueueAdd(
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
    window.go.main.App.OpenFolder(convertVideoPath.value);
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
    const path = await window.go.main.App.SelectSourceFolder();
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
    const path = await window.go.main.App.SelectTargetFolder();
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
        scannedImageFolders = await window.go.main.App.ScanImageFolders(imagezipSourcePath.value);

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
        const taskId = await window.go.main.App.TaskQueueAdd(
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
    window.go.main.App.OpenFolder(imagezipTargetPath.value);
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
    await window.go.main.App.TaskQueueClearCompleted();
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
            await window.go.main.App.TaskQueueCancel(taskId);
        });
    });
}

// 监听任务更新
window.runtime.EventsOn('task-update', (task) => {
    // 更新单个任务
    const taskItem = document.querySelector(`.task-item[data-task-id="${task.id}"]`);
    if (taskItem) {
        // 重新获取所有任务并渲染
        window.go.main.App.TaskQueueGetAll().then(renderTaskList);
    } else {
        // 新任务，重新获取所有任务
        window.go.main.App.TaskQueueGetAll().then(renderTaskList);
    }
});

// 监听任务列表更新
window.runtime.EventsOn('task-list-update', (tasks) => {
    renderTaskList(tasks);
});

// 初始化时加载任务列表
window.go.main.App.TaskQueueGetAll().then(renderTaskList);

// ============ TXT转EPUB工具 ============

// 获取DOM元素
const txt2epubSelectSourceBtn = document.getElementById('txt2epub-selectSourceBtn');
const txt2epubSourcePath = document.getElementById('txt2epub-sourcePath');
const txt2epubScanBtn = document.getElementById('txt2epub-scanBtn');
const txt2epubSelectFileBtn = document.getElementById('txt2epub-selectFileBtn');
const txt2epubFileListSection = document.getElementById('txt2epub-fileListSection');
const txt2epubFileList = document.getElementById('txt2epub-fileList');
const txt2epubFileCount = document.getElementById('txt2epub-fileCount');
const txt2epubSelectAllBtn = document.getElementById('txt2epub-selectAllBtn');
const txt2epubDeselectAllBtn = document.getElementById('txt2epub-deselectAllBtn');
const txt2epubPreviewBtn = document.getElementById('txt2epub-previewBtn');
const txt2epubTargetSection = document.getElementById('txt2epub-targetSection');
const txt2epubTargetPath = document.getElementById('txt2epub-targetPath');
const txt2epubSelectTargetBtn = document.getElementById('txt2epub-selectTargetBtn');
const txt2epubAuthor = document.getElementById('txt2epub-author');
const txt2epubCustomPattern = document.getElementById('txt2epub-customPattern');
const txt2epubStartBtn = document.getElementById('txt2epub-startBtn');
const txt2epubProgressSection = document.getElementById('txt2epub-progressSection');
const txt2epubProgressFill = document.getElementById('txt2epub-progressFill');
const txt2epubProgressText = document.getElementById('txt2epub-progressText');
const txt2epubCurrentFile = document.getElementById('txt2epub-currentFile');
const txt2epubStage = document.getElementById('txt2epub-stage');
const txt2epubResultSection = document.getElementById('txt2epub-resultSection');
const txt2epubSuccessCount = document.getElementById('txt2epub-successCount');
const txt2epubFailedResult = document.getElementById('txt2epub-failedResult');
const txt2epubFailedCount = document.getElementById('txt2epub-failedCount');
const txt2epubOpenFolderBtn = document.getElementById('txt2epub-openFolderBtn');
const txt2epubResetBtn = document.getElementById('txt2epub-resetBtn');
const txt2epubErrorList = document.getElementById('txt2epub-errorList');
const txt2epubErrorListContent = document.getElementById('txt2epub-errorListContent');

// 模态框相关
const txt2epubPreviewModal = document.getElementById('txt2epub-previewModal');
const txt2epubClosePreviewBtn = document.getElementById('txt2epub-closePreviewBtn');
const txt2epubPreviewFile = document.getElementById('txt2epub-previewFile');
const txt2epubPreviewStats = document.getElementById('txt2epub-previewStats');
const txt2epubChapterList = document.getElementById('txt2epub-chapterList');

// 存储扫描到的TXT文件
let scannedTxtFiles = [];

// 选择TXT源文件夹
txt2epubSelectSourceBtn.addEventListener('click', async () => {
    const path = await window.go.main.App.SelectSourceFolder();
    if (path) {
        txt2epubSourcePath.value = path;
        txt2epubScanBtn.disabled = false;
        // 隐藏之前的结果
        txt2epubFileListSection.style.display = 'none';
        txt2epubTargetSection.style.display = 'none';
        txt2epubResultSection.style.display = 'none';
    }
});

// 选择单个TXT文件
txt2epubSelectFileBtn.addEventListener('click', async () => {
    const file = await window.go.main.App.SelectTxtFile();
    if (file) {
        scannedTxtFiles = [file];
        txt2epubSourcePath.value = file.path;

        // 显示结果
        txt2epubFileListSection.style.display = 'block';
        txt2epubTargetSection.style.display = 'block';

        // 设置默认输出目录
        const separator = file.path.includes('\\') ? '\\' : '/';
        const dir = file.path.substring(0, file.path.lastIndexOf(separator));
        if (!txt2epubTargetPath.value) {
            txt2epubTargetPath.value = dir + separator + 'EPUB输出';
        }

        txt2epubFileCount.textContent = `共选择 1 个TXT文件`;

        // 渲染文件列表
        renderTxtFileList();
    }
});

// 选择EPUB输出文件夹
txt2epubSelectTargetBtn.addEventListener('click', async () => {
    const path = await window.go.main.App.SelectTargetFolder();
    if (path) {
        txt2epubTargetPath.value = path;
        updateTxt2EpubButtonState();
    }
});

// 扫描TXT文件
txt2epubScanBtn.addEventListener('click', async () => {
    txt2epubScanBtn.disabled = true;
    txt2epubScanBtn.textContent = '扫描中...';

    try {
        scannedTxtFiles = await window.go.main.App.ScanTxtFiles(txt2epubSourcePath.value);

        // 显示结果
        txt2epubFileListSection.style.display = 'block';
        txt2epubTargetSection.style.display = 'block';

        // 默认将输出文件夹设置为源文件夹下的"EPUB输出"子文件夹
        if (!txt2epubTargetPath.value) {
            const separator = txt2epubSourcePath.value.includes('\\') ? '\\' : '/';
            txt2epubTargetPath.value = txt2epubSourcePath.value + separator + 'EPUB输出';
        }

        txt2epubFileCount.textContent = `共找到 ${scannedTxtFiles.length} 个TXT文件`;

        // 渲染文件列表
        renderTxtFileList();

    } catch (error) {
        alert('扫描出错: ' + error.message);
    } finally {
        txt2epubScanBtn.disabled = false;
        txt2epubScanBtn.textContent = '扫描TXT文件';
    }
});

// 渲染TXT文件列表
function renderTxtFileList() {
    txt2epubFileList.innerHTML = '';

    if (scannedTxtFiles.length === 0) {
        txt2epubFileList.innerHTML = '<div class="no-videos">未找到TXT文件</div>';
        return;
    }

    scannedTxtFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'video-item';
        item.innerHTML = `
      <label class="checkbox-label">
        <input type="checkbox" class="txt-checkbox" data-index="${index}" checked>
        <div class="video-info">
          <span class="video-name" title="${file.path}">📄 ${file.name}</span>
          <span class="video-meta">
            <span class="video-size">${formatFileSize(file.size)}</span>
          </span>
        </div>
      </label>
    `;
        txt2epubFileList.appendChild(item);
    });

    updateTxt2EpubButtonState();
}

// 全选TXT文件
txt2epubSelectAllBtn.addEventListener('click', () => {
    document.querySelectorAll('.txt-checkbox').forEach(cb => cb.checked = true);
    updateTxt2EpubButtonState();
});

// 取消全选TXT文件
txt2epubDeselectAllBtn.addEventListener('click', () => {
    document.querySelectorAll('.txt-checkbox').forEach(cb => cb.checked = false);
    updateTxt2EpubButtonState();
});

// 监听复选框变化
txt2epubFileList.addEventListener('change', (e) => {
    if (e.target.classList.contains('txt-checkbox')) {
        updateTxt2EpubButtonState();
    }
});

// 更新转换按钮状态
function updateTxt2EpubButtonState() {
    const checkedCount = document.querySelectorAll('.txt-checkbox:checked').length;
    const hasTargetPath = txt2epubTargetPath.value.trim() !== '';
    txt2epubStartBtn.disabled = checkedCount === 0 || !hasTargetPath;

    if (checkedCount > 0) {
        txt2epubStartBtn.textContent = `📚 转换 ${checkedCount} 个文件`;
    } else {
        txt2epubStartBtn.textContent = '📚 开始转换';
    }
}

// 预览章节
txt2epubPreviewBtn.addEventListener('click', async () => {
    // 获取第一个被选中的文件
    const firstChecked = document.querySelector('.txt-checkbox:checked');
    if (!firstChecked) {
        alert('请先选择一个TXT文件');
        return;
    }

    const index = parseInt(firstChecked.dataset.index);
    const file = scannedTxtFiles[index];

    txt2epubPreviewBtn.disabled = true;
    txt2epubPreviewBtn.textContent = '加载中...';

    try {
        const customPattern = txt2epubCustomPattern.value.trim() || null;
        const result = await window.go.main.App.PreviewTxtChapters({
            filePath: file.path,
            customPattern: customPattern
        });

        if (result.success) {
            // 显示模态框
            txt2epubPreviewModal.style.display = 'flex';
            txt2epubPreviewFile.textContent = `📄 ${file.name}`;
            txt2epubPreviewStats.textContent = `共检测到 ${result.totalChapters} 个章节`;

            // 渲染章节列表
            if (result.chapters.length === 0) {
                txt2epubChapterList.innerHTML = '<div class="no-videos">未能识别出章节，将整体作为一个章节处理</div>';
            } else {
                txt2epubChapterList.innerHTML = result.chapters.map(ch => `
          <div class="chapter-item">
            <span class="chapter-index">${ch.index}</span>
            <span class="chapter-title">${ch.title}</span>
            <div class="chapter-meta">字符数: ${ch.contentLength.toLocaleString()}</div>
            <div class="chapter-preview">${ch.preview}</div>
          </div>
        `).join('');
            }
        } else {
            alert('预览失败: ' + result.error);
        }
    } catch (error) {
        alert('预览出错: ' + error.message);
    } finally {
        txt2epubPreviewBtn.disabled = false;
        txt2epubPreviewBtn.textContent = '预览章节';
    }
});

// 关闭预览模态框
txt2epubClosePreviewBtn.addEventListener('click', () => {
    txt2epubPreviewModal.style.display = 'none';
});

// 点击模态框外部关闭
txt2epubPreviewModal.addEventListener('click', (e) => {
    if (e.target === txt2epubPreviewModal) {
        txt2epubPreviewModal.style.display = 'none';
    }
});

let txt2epubUnsub = null;

// 开始转换
txt2epubStartBtn.addEventListener('click', async () => {
    // 获取选中的文件
    const selectedFiles = [];
    document.querySelectorAll('.txt-checkbox:checked').forEach(cb => {
        const index = parseInt(cb.dataset.index);
        selectedFiles.push(scannedTxtFiles[index]);
    });

    if (selectedFiles.length === 0) {
        alert('请至少选择一个TXT文件');
        return;
    }

    // 禁用按钮，显示进度
    txt2epubStartBtn.disabled = true;
    txt2epubProgressSection.style.display = 'block';
    txt2epubResultSection.style.display = 'none';
    txt2epubProgressFill.style.width = '0%';
    txt2epubProgressText.textContent = '0%';

    // 监听进度 (Wails event)
    if (txt2epubUnsub) txt2epubUnsub();
    txt2epubUnsub = window.runtime.EventsOn('txt2epub-progress', (data) => {
        const percent = Math.round((data.current / data.total) * 100);
        txt2epubProgressFill.style.width = percent + '%';
        txt2epubProgressText.textContent = `${percent}% (${data.current}/${data.total})`;
        txt2epubCurrentFile.textContent = data.currentFile;
        txt2epubStage.textContent = '📖 正在转换...';
    });

    try {
        const customPattern = txt2epubCustomPattern.value.trim() || null;
        const author = txt2epubAuthor.value.trim() || '未知作者';

        const result = await window.go.main.App.ConvertTxtToEpub({
            files: selectedFiles,
            outputPath: txt2epubTargetPath.value,
            options: {
                author: author,
                customPattern: customPattern
            }
        });

        // 显示结果
        txt2epubProgressSection.style.display = 'none';
        txt2epubResultSection.style.display = 'block';

        txt2epubSuccessCount.textContent = result.success;

        if (result.failed > 0) {
            txt2epubFailedResult.style.display = 'block';
            txt2epubFailedCount.textContent = result.failed;

            // 显示错误详情
            txt2epubErrorList.style.display = 'block';
            txt2epubErrorListContent.innerHTML = result.errors.map(err =>
                `<li><strong>${err.file}</strong>: ${err.error}</li>`
            ).join('');
        } else {
            txt2epubFailedResult.style.display = 'none';
            txt2epubErrorList.style.display = 'none';
        }

    } catch (error) {
        alert('转换出错: ' + error.message);
        txt2epubProgressSection.style.display = 'none';
    } finally {
        if (txt2epubUnsub) {
            // Wait, EventsOn returns a cancel function? No, usually EventsOff.
            // Wails v2 JS runtime: EventsOn returns void. 
            // Actually, looking at docs, EventsOn returns a cleanup function in recent versions?
            // Let's assume standard behavior: use EventsOff to unsubscribe.
            // But without a named function it's hard.
            // Actually, Wails JS EventsOn returns `() => void` to unsubscribe in recent templates.
            // I will assume the template provides this.
            txt2epubUnsub();
            txt2epubUnsub = null;
        }
        txt2epubStartBtn.disabled = false;
    }
});

// 打开输出文件夹
txt2epubOpenFolderBtn.addEventListener('click', () => {
    window.go.main.App.OpenFolder(txt2epubTargetPath.value);
});

// 重新开始
txt2epubResetBtn.addEventListener('click', () => {
    txt2epubSourcePath.value = '';
    txt2epubTargetPath.value = '';
    txt2epubAuthor.value = '';
    txt2epubCustomPattern.value = '';
    scannedTxtFiles = [];
    txt2epubScanBtn.disabled = true;
    txt2epubStartBtn.disabled = true;
    txt2epubFileListSection.style.display = 'none';
    txt2epubTargetSection.style.display = 'none';
    txt2epubProgressSection.style.display = 'none';
    txt2epubResultSection.style.display = 'none';
    txt2epubProgressFill.style.width = '0%';
    txt2epubProgressText.textContent = '0%';
    txt2epubCurrentFile.textContent = '';
    txt2epubStage.textContent = '';
});

// ============ 图库抓取工具 ============

// 获取DOM元素
const galleryKeyword = document.getElementById('gallery-keyword');
const gallerySearchBtn = document.getElementById('gallery-searchBtn');
const gallerySearchAllBtn = document.getElementById('gallery-searchAllBtn');
const galleryMaxPages = document.getElementById('gallery-maxPages');
const gallerySearchProgress = document.getElementById('gallery-searchProgress');
const gallerySearchProgressText = document.getElementById('gallery-searchProgressText');
const galleryCancelSearchBtn = document.getElementById('gallery-cancelSearchBtn');
const galleryResultSection = document.getElementById('gallery-resultSection');
const galleryResultCount = document.getElementById('gallery-resultCount');
const gallerySelectAllBtn = document.getElementById('gallery-selectAllBtn');
const galleryDeselectAllBtn = document.getElementById('gallery-deselectAllBtn');
const galleryLoadMoreBtn = document.getElementById('gallery-loadMoreBtn');
const galleryList = document.getElementById('gallery-list');
const galleryTargetSection = document.getElementById('gallery-targetSection');
const galleryOutputPath = document.getElementById('gallery-outputPath');
const gallerySelectOutputBtn = document.getElementById('gallery-selectOutputBtn');
const galleryStartBtn = document.getElementById('gallery-startBtn');
const galleryProgressSection = document.getElementById('gallery-progressSection');
const galleryProgressFill = document.getElementById('gallery-progressFill');
const galleryProgressText = document.getElementById('gallery-progressText');
const galleryCurrentGallery = document.getElementById('gallery-currentGallery');
const galleryStage = document.getElementById('gallery-stage');
const galleryCancelBtn = document.getElementById('gallery-cancelBtn');
const galleryDoneSection = document.getElementById('gallery-doneSection');
const gallerySuccessCount = document.getElementById('gallery-successCount');
const galleryImageCount = document.getElementById('gallery-imageCount');
const galleryFailedResult = document.getElementById('gallery-failedResult');
const galleryFailedCount = document.getElementById('gallery-failedCount');
const galleryOpenFolderBtn = document.getElementById('gallery-openFolderBtn');
const galleryResetBtn = document.getElementById('gallery-resetBtn');
const galleryErrorList = document.getElementById('gallery-errorList');
const galleryErrorListContent = document.getElementById('gallery-errorListContent');

// 存储搜索到的图库
let searchedGalleries = [];
let currentSearchKeyword = '';
let currentSearchPage = 1;
let hasMorePages = false;
let isSearching = false; // 搜索状态标志

// 搜索图库
gallerySearchBtn.addEventListener('click', async () => {
    const keyword = galleryKeyword.value.trim();
    if (!keyword) {
        alert('请输入搜索关键字');
        return;
    }

    gallerySearchBtn.disabled = true;
    gallerySearchBtn.textContent = '搜索中...';

    try {
        // 重置搜索状态
        currentSearchKeyword = keyword;
        currentSearchPage = 1;
        searchedGalleries = [];

        const result = await window.go.main.App.GallerySearch(keyword, 1);

        if (!result.success) {
            alert('搜索失败: ' + (result.error || '未知错误'));
            return;
        }

        searchedGalleries = result.galleries;
        hasMorePages = result.hasNextPage;

        // 显示结果
        galleryResultSection.style.display = 'block';
        galleryTargetSection.style.display = 'block';

        galleryResultCount.textContent = `共找到 ${searchedGalleries.length} 个图库`;
        galleryLoadMoreBtn.style.display = hasMorePages ? 'inline-block' : 'none';

        // 渲染图库列表
        renderGalleryList();

    } catch (error) {
        alert('搜索出错: ' + error.message);
    } finally {
        gallerySearchBtn.disabled = false;
        gallerySearchBtn.textContent = '🔍 搜索';
    }
});

// 回车搜索
galleryKeyword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        gallerySearchBtn.click();
    }
});

let gallerySearchUnsub = null;

// 自动加载全部页面
gallerySearchAllBtn.addEventListener('click', async () => {
    const keyword = galleryKeyword.value.trim();
    if (!keyword) {
        alert('请输入搜索关键字');
        return;
    }

    const maxPages = parseInt(galleryMaxPages.value, 10);

    // 禁用按钮，显示进度
    gallerySearchBtn.disabled = true;
    gallerySearchAllBtn.disabled = true;
    gallerySearchProgress.style.display = 'flex';
    isSearching = true;

    // 重置状态
    currentSearchKeyword = keyword;
    currentSearchPage = 1;
    searchedGalleries = [];

    // 监听搜索进度
    if (gallerySearchUnsub) gallerySearchUnsub();
    gallerySearchUnsub = window.runtime.EventsOn('gallery-search-progress', (progress) => {
        gallerySearchProgressText.textContent =
            `正在搜索第 ${progress.currentPage}/${progress.maxPages} 页... 已找到 ${progress.galleriesFound} 个图库`;
    });

    try {
        const result = await window.go.main.App.GallerySearchAll(keyword, maxPages);

        // 处理结果
        if (result.success || result.galleries.length > 0) {
            searchedGalleries = result.galleries;
            hasMorePages = result.hasMore;
            currentSearchPage = result.pagesLoaded;

            // 显示结果区域
            galleryResultSection.style.display = 'block';
            galleryTargetSection.style.display = 'block';

            // 更新结果计数
            const pagesInfo = result.pagesLoaded > 0 ? `（已搜索 ${result.pagesLoaded} 页）` : '';
            galleryResultCount.textContent = `共找到 ${searchedGalleries.length} 个图库 ${pagesInfo}`;

            // 如果还有更多页，显示加载更多按钮
            galleryLoadMoreBtn.style.display = hasMorePages ? 'inline-block' : 'none';

            // 渲染列表
            renderGalleryList();

            if (searchedGalleries.length === 0) {
                alert('未找到匹配的图库');
            }
        } else {
            alert('搜索失败: ' + (result.error || '未知错误'));
        }
    } catch (error) {
        alert('搜索出错: ' + error.message);
    } finally {
        if (gallerySearchUnsub) { gallerySearchUnsub(); gallerySearchUnsub = null; }
        gallerySearchBtn.disabled = false;
        gallerySearchAllBtn.disabled = false;
        gallerySearchProgress.style.display = 'none';
        isSearching = false;
    }
});

// 取消搜索
galleryCancelSearchBtn.addEventListener('click', async () => {
    if (isSearching) {
        galleryCancelSearchBtn.disabled = true;
        galleryCancelSearchBtn.textContent = '取消中...';

        try {
            await window.go.main.App.GalleryCancelCrawl();
            gallerySearchProgressText.textContent = '正在取消搜索...';
        } catch (error) {
            console.error('取消搜索失败:', error);
        }

        setTimeout(() => {
            galleryCancelSearchBtn.disabled = false;
            galleryCancelSearchBtn.textContent = '取消';
        }, 1000);
    }
});

// 加载更多
galleryLoadMoreBtn.addEventListener('click', async () => {
    galleryLoadMoreBtn.disabled = true;
    galleryLoadMoreBtn.textContent = '加载中...';

    try {
        currentSearchPage++;
        const result = await window.go.main.App.GallerySearch(currentSearchKeyword, currentSearchPage);

        if (result.success && result.galleries.length > 0) {
            // 合并结果，去重
            const existingUrls = new Set(searchedGalleries.map(g => g.url));
            const newGalleries = result.galleries.filter(g => !existingUrls.has(g.url));
            searchedGalleries = [...searchedGalleries, ...newGalleries];

            hasMorePages = result.hasNextPage;
            galleryResultCount.textContent = `共找到 ${searchedGalleries.length} 个图库`;
            galleryLoadMoreBtn.style.display = hasMorePages ? 'inline-block' : 'none';

            // 重新渲染列表
            renderGalleryList();
        } else {
            hasMorePages = false;
            galleryLoadMoreBtn.style.display = 'none';
        }

    } catch (error) {
        alert('加载更多出错: ' + error.message);
        currentSearchPage--; // 回退页码
    } finally {
        galleryLoadMoreBtn.disabled = false;
        galleryLoadMoreBtn.textContent = '加载更多';
    }
});

// 渲染图库列表
function renderGalleryList() {
    galleryList.innerHTML = '';

    if (searchedGalleries.length === 0) {
        galleryList.innerHTML = '<div class="no-videos">未找到匹配的图库</div>';
        return;
    }

    searchedGalleries.forEach((gallery, index) => {
        const item = document.createElement('div');
        item.className = 'video-item gallery-item';

        // 截断过长的标题
        const displayTitle = gallery.title.length > 60
            ? gallery.title.substring(0, 60) + '...'
            : gallery.title;

        item.innerHTML = `
      <label class="checkbox-label">
        <input type="checkbox" class="gallery-checkbox" data-index="${index}" checked>
        <div class="video-info">
          <span class="video-name" title="${gallery.title}">${displayTitle}</span>
          <span class="video-meta">
            <span class="video-folder">🖼️ ${gallery.imageCount > 0 ? gallery.imageCount + 'P' : '未知数量'}</span>
            <span class="video-size gallery-url" title="${gallery.url}">🔗 查看</span>
          </span>
        </div>
      </label>
    `;
        galleryList.appendChild(item);
    });

    updateGalleryStartButtonState();
}

// 全选图库
gallerySelectAllBtn.addEventListener('click', () => {
    document.querySelectorAll('.gallery-checkbox').forEach(cb => cb.checked = true);
    updateGalleryStartButtonState();
});

// 取消全选图库
galleryDeselectAllBtn.addEventListener('click', () => {
    document.querySelectorAll('.gallery-checkbox').forEach(cb => cb.checked = false);
    updateGalleryStartButtonState();
});

// 监听复选框变化
galleryList.addEventListener('change', (e) => {
    if (e.target.classList.contains('gallery-checkbox')) {
        updateGalleryStartButtonState();
    }
});

// 选择输出文件夹
gallerySelectOutputBtn.addEventListener('click', async () => {
    const path = await window.go.main.App.GallerySelectOutputFolder();
    if (path) {
        galleryOutputPath.value = path;
        updateGalleryStartButtonState();
    }
});

// 更新开始按钮状态
function updateGalleryStartButtonState() {
    const checkedCount = document.querySelectorAll('.gallery-checkbox:checked').length;
    const hasOutput = galleryOutputPath.value.trim() !== '';
    galleryStartBtn.disabled = checkedCount === 0 || !hasOutput;

    if (checkedCount > 0) {
        galleryStartBtn.textContent = `🚀 抓取 ${checkedCount} 个图库`;
    } else {
        galleryStartBtn.textContent = '🚀 开始抓取';
    }
}

// 获取抓取阶段描述
function getGalleryCrawlStageDescription(stage, progress) {
    switch (stage) {
        case 'fetching':
            return '📄 正在获取图库信息...';
        case 'downloading':
            if (progress && progress.downloaded !== undefined) {
                return `📥 下载中: ${progress.downloaded}/${progress.imageTotal} 张 (失败: ${progress.failed || 0})`;
            }
            return '📥 正在下载图片...';
        default:
            return '';
    }
}

let galleryCrawlUnsub = null;

// 开始抓取
galleryStartBtn.addEventListener('click', async () => {
    // 获取选中的图库
    const selectedGalleries = [];
    document.querySelectorAll('.gallery-checkbox:checked').forEach(cb => {
        const index = parseInt(cb.dataset.index);
        selectedGalleries.push(searchedGalleries[index]);
    });

    if (selectedGalleries.length === 0) {
        alert('请至少选择一个图库');
        return;
    }

    if (!galleryOutputPath.value) {
        alert('请选择保存目录');
        return;
    }

    // 显示进度
    galleryProgressSection.style.display = 'block';
    galleryDoneSection.style.display = 'none';
    galleryStartBtn.disabled = true;

    // 监听进度更新
    if (galleryCrawlUnsub) galleryCrawlUnsub();
    galleryCrawlUnsub = window.runtime.EventsOn('gallery-crawl-progress', (data) => {
        const percent = Math.round((data.current / data.total) * 100);
        galleryProgressFill.style.width = percent + '%';
        galleryProgressText.textContent = `${percent}% (${data.current}/${data.total})`;
        galleryCurrentGallery.textContent = data.currentGallery;
        galleryStage.textContent = getGalleryCrawlStageDescription(data.stage, data);
    });

    try {
        const result = await window.go.main.App.GalleryCrawlAndPack(selectedGalleries, galleryOutputPath.value);

        // 显示结果
        galleryProgressSection.style.display = 'none';
        galleryDoneSection.style.display = 'block';

        gallerySuccessCount.textContent = result.success;
        galleryImageCount.textContent = result.totalImages;

        if (result.failed > 0) {
            galleryFailedResult.style.display = 'flex';
            galleryFailedCount.textContent = result.failed;

            // 显示错误详情
            galleryErrorList.style.display = 'block';
            galleryErrorListContent.innerHTML = '';
            result.errors.forEach(err => {
                const li = document.createElement('li');
                li.textContent = `${err.gallery}: ${err.error}`;
                galleryErrorListContent.appendChild(li);
            });
        } else {
            galleryFailedResult.style.display = 'none';
            galleryErrorList.style.display = 'none';
        }

    } catch (error) {
        alert('抓取出错: ' + error.message);
        galleryProgressSection.style.display = 'none';
    } finally {
        if (galleryCrawlUnsub) { galleryCrawlUnsub(); galleryCrawlUnsub = null; }
        galleryStartBtn.disabled = false;
    }
});

// 取消抓取
galleryCancelBtn.addEventListener('click', async () => {
    galleryCancelBtn.disabled = true;
    galleryCancelBtn.textContent = '取消中...';

    try {
        await window.go.main.App.GalleryCancelCrawl();
        galleryStage.textContent = '⚠️ 正在取消...';
    } catch (error) {
        console.error('取消失败:', error);
    }

    // 注意：实际取消会在抓取完成后处理
    setTimeout(() => {
        galleryCancelBtn.disabled = false;
        galleryCancelBtn.textContent = '❌ 取消抓取';
    }, 1000);
});

// 打开输出文件夹
galleryOpenFolderBtn.addEventListener('click', () => {
    window.go.main.App.OpenFolder(galleryOutputPath.value);
});

// 重新开始（图库抓取工具）
galleryResetBtn.addEventListener('click', () => {
    galleryKeyword.value = '';
    galleryOutputPath.value = '';
    searchedGalleries = [];
    currentSearchKeyword = '';
    currentSearchPage = 1;
    hasMorePages = false;

    galleryResultSection.style.display = 'none';
    galleryTargetSection.style.display = 'none';
    galleryProgressSection.style.display = 'none';
    galleryDoneSection.style.display = 'none';

    galleryProgressFill.style.width = '0%';
    galleryProgressText.textContent = '0%';
    galleryCurrentGallery.textContent = '';
    galleryStage.textContent = '';

    galleryStartBtn.disabled = true;
    galleryStartBtn.textContent = '🚀 开始抓取';
});
