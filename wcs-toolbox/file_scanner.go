package main

import (
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// ============ File System Methods ============

func (a *App) SelectSourceFolder() string {
	path, err := wruntime.OpenDirectoryDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "选择源文件夹",
	})
	if err != nil {
		return ""
	}
	return path
}

func (a *App) SelectTargetFolder() string {
	path, err := wruntime.OpenDirectoryDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "选择目标文件夹",
	})
	if err != nil {
		return ""
	}
	return path
}

func (a *App) SelectTxtFile() FileInfo {
	path, err := wruntime.OpenFileDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "选择TXT文件",
		Filters: []wruntime.FileFilter{
			{DisplayName: "Text Files", Pattern: "*.txt"},
		},
	})
	if err != nil || path == "" {
		return FileInfo{}
	}
	info, _ := os.Stat(path)
	return FileInfo{
		Name: filepath.Base(path),
		Path: path,
		Size: info.Size(),
	}
}

func (a *App) OpenFolder(path string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", path)
	case "windows":
		cmd = exec.Command("explorer", path)
	case "linux":
		cmd = exec.Command("xdg-open", path)
	default:
		return
	}
	cmd.Run()
}

func (a *App) GetPlatform() string {
	return runtime.GOOS
}

// ============ Scanners ============

func (a *App) ScanVideos(rootPath string) []VideoFile {
	var videos []VideoFile
	videoExts := map[string]bool{
		".mp4": true, ".mkv": true, ".avi": true, ".mov": true, ".wmv": true, ".flv": true, ".webm": true, ".m4v": true, ".ts": true,
	}

	filepath.WalkDir(rootPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			ext := strings.ToLower(filepath.Ext(path))
			if videoExts[ext] {
				parent := filepath.Base(filepath.Dir(path))
				// Ensure not root if rootPath is file? No, Input is always folder
				if filepath.Dir(path) == rootPath {
					parent = filepath.Base(rootPath)
				}

				info, _ := d.Info()
				videos = append(videos, VideoFile{
					Name:         d.Name(),
					Path:         path,
					Size:         info.Size(),
					ParentFolder: parent,
				})
			}
		}
		return nil
	})
	return videos
}

func (a *App) Scan7zFiles(rootPath string) []FileInfo {
	var files []FileInfo
	filepath.WalkDir(rootPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() && strings.HasSuffix(strings.ToLower(d.Name()), ".7z") {
			info, _ := d.Info()
			files = append(files, FileInfo{
				Name: d.Name(),
				Path: path,
				Size: info.Size(),
			})
		}
		return nil
	})
	return files
}

func (a *App) ScanImageFolders(rootPath string) []FolderInfo {
	var folders []FolderInfo
	imageExts := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".bmp": true, ".webp": true,
	}

	// Just walk dirs
	filepath.WalkDir(rootPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() && path != rootPath {
			// Check if this folder has images
			imgCount := 0
			var totalSize int64 = 0

			entries, err := os.ReadDir(path)
			if err == nil {
				for _, entry := range entries {
					if !entry.IsDir() {
						ext := strings.ToLower(filepath.Ext(entry.Name()))
						if imageExts[ext] {
							imgCount++
							info, _ := entry.Info()
							totalSize += info.Size()
						}
					}
				}
			}

			if imgCount > 0 {
				folders = append(folders, FolderInfo{
					Name:       d.Name(),
					Path:       path,
					ImageCount: imgCount,
					TotalSize:  totalSize,
				})
			}
		}
		return nil
	})
	return folders
}
