package main

import (
	"archive/zip"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// ============ Handlers ============

func (a *App) handleCreateShortcuts(ctx context.Context, task *Task) (interface{}, error) {
	// Manual casting from map because Wails unmarshals interface{} as map[string]interface{}
	dataMap, ok := task.Data.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid data format")
	}

	targetPath := dataMap["targetPath"].(string)
	namingMode := dataMap["namingMode"].(string)

	videosListRaw, ok := dataMap["videos"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid videos list")
	}

	success := 0
	failed := 0
	var errors []ErrorDetail
	total := len(videosListRaw)

	for i, v := range videosListRaw {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		videoMap := v.(map[string]interface{})
		videoPath := videoMap["path"].(string)
		videoName := videoMap["name"].(string)
		parentFolder := videoMap["parentFolder"].(string)

		var linkName string
		ext := filepath.Ext(videoName)

		switch namingMode {
		case "folder":
			linkName = fmt.Sprintf("%s_%s", parentFolder, videoName)
		case "folderOnly":
			linkName = fmt.Sprintf("%s%s", parentFolder, ext)
			// Handle dupe
			counter := 1
			for {
				if _, err := os.Stat(filepath.Join(targetPath, linkName)); os.IsNotExist(err) {
					break
				}
				linkName = fmt.Sprintf("%s_%d%s", parentFolder, counter, ext)
				counter++
			}
		default:
			linkName = videoName
		}

		linkPath := filepath.Join(targetPath, linkName)
		err := a.createLink(videoPath, linkPath)
		if err != nil {
			failed++
			errors = append(errors, ErrorDetail{File: videoName, Error: err.Error()})
		} else {
			success++
		}

		// Update progress
		a.updateTaskProgress(task, i+1, total)
	}

	return TaskResult{Success: success, Failed: failed, Errors: errors}, nil
}

func (a *App) createLink(src, dst string) error {
	os.MkdirAll(filepath.Dir(dst), 0755)
	if runtime.GOOS == "windows" {
		if !strings.HasSuffix(strings.ToLower(dst), ".lnk") {
			dst += ".lnk"
		}
		// Powershell shortcut creation
		psScript := fmt.Sprintf("$s=(New-Object -COM WScript.Shell).CreateShortcut('%s');$s.TargetPath='%s';$s.Save()", dst, src)
		cmd := exec.Command("powershell", "-Command", psScript)
		return cmd.Run()
	}
	return os.Symlink(src, dst)
}

func (a *App) handleConvert7z(ctx context.Context, task *Task) (interface{}, error) {
	dataMap, _ := task.Data.(map[string]interface{})
	filesListRaw, _ := dataMap["files"].([]interface{})
	videoOut := dataMap["videoOutputPath"].(string)

	// Ensure video output dir exists
	os.MkdirAll(videoOut, 0755)

	total := len(filesListRaw)
	success := 0
	failed := 0
	var errors []ErrorDetail

	for i, f := range filesListRaw {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		fMap := f.(map[string]interface{})
		path7z := fMap["path"].(string)
		name := fMap["name"].(string)

		// Create temp dir
		tempDir, err := os.MkdirTemp("", "wcs_extract_")
		if err != nil {
			failed++
			errors = append(errors, ErrorDetail{File: name, Error: "Temp dir error"})
			continue
		}

		// Run 7z
		// We use "7z" command. If not in path, this fails.
		// TODO: Bundling 7z is better but out of scope for simple migration without binary resources.
		cmd := exec.Command("7z", "x", path7z, "-o"+tempDir, "-y")
		if err := cmd.Run(); err != nil {
			// Try "7za" (often on Mac/Linux)
			cmd = exec.Command("7za", "x", path7z, "-o"+tempDir, "-y")
			if err := cmd.Run(); err != nil {
				os.RemoveAll(tempDir)
				failed++
				errors = append(errors, ErrorDetail{File: name, Error: "7z extract failed: " + err.Error()})
				continue
			}
		}

		// Scan and Move/Zip
		var filesToZip []string

		err = filepath.Walk(tempDir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if !info.IsDir() {
				ext := strings.ToLower(filepath.Ext(path))
				isVideo := false
				for _, ve := range []string{".mp4", ".mkv", ".avi", ".wmv", ".mov", ".flv", ".webm", ".ts"} {
					if ext == ve {
						isVideo = true
						break
					}
				}

				if isVideo {
					// Move to videoOut
					destName := info.Name()
					destPath := filepath.Join(videoOut, destName)

					// Handle duplicate
					counter := 1
					for {
						if _, err := os.Stat(destPath); os.IsNotExist(err) {
							break
						}
						destPath = filepath.Join(videoOut, fmt.Sprintf("%s_%d%s", strings.TrimSuffix(destName, ext), counter, ext))
						counter++
					}

					os.Rename(path, destPath)
				} else {
					filesToZip = append(filesToZip, path)
				}
			}
			return nil
		})

		// Create Zip
		if len(filesToZip) > 0 {
			zipPath := strings.TrimSuffix(path7z, filepath.Ext(path7z)) + ".zip"
			err = zipFiles(zipPath, filesToZip, tempDir)
			if err != nil {
				errors = append(errors, ErrorDetail{File: name, Error: "Zip failed: " + err.Error()})
				// But we count as success if extraction worked? No, partial failure.
			}
			success++
		} else {
			// Only videos? Success.
			success++
		}

		os.RemoveAll(tempDir)
		a.updateTaskProgress(task, i+1, total)
	}

	return TaskResult{Success: success, Failed: failed, Errors: errors}, nil
}

func (a *App) handlePackImages(ctx context.Context, task *Task) (interface{}, error) {
	dataMap, _ := task.Data.(map[string]interface{})
	foldersListRaw, _ := dataMap["folders"].([]interface{})
	targetPath := dataMap["targetPath"].(string)

	os.MkdirAll(targetPath, 0755)

	success := 0
	failed := 0
	var errors []ErrorDetail
	total := len(foldersListRaw)

	for i, folder := range foldersListRaw {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		fMap := folder.(map[string]interface{})
		folderPath := fMap["path"].(string)
		folderName := fMap["name"].(string)

		zipName := folderName + ".zip"
		dest := filepath.Join(targetPath, zipName)

		// Collect images
		var images []string
		filepath.Walk(folderPath, func(path string, info os.FileInfo, err error) error {
			if !info.IsDir() {
				ext := strings.ToLower(filepath.Ext(path))
				// Simple check
				if strings.Contains(".jpg.jpeg.png.gif.bmp.webp", ext) {
					images = append(images, path)
				}
			}
			return nil
		})

		if len(images) > 0 {
			err := zipFiles(dest, images, folderPath)
			if err != nil {
				failed++
				errors = append(errors, ErrorDetail{File: folderName, Error: err.Error()})
			} else {
				success++
			}
		} else {
			// No images -> skip or consider success?
			failed++
			errors = append(errors, ErrorDetail{File: folderName, Error: "No images found"})
		}

		a.updateTaskProgress(task, i+1, total)
	}

	return TaskResult{Success: success, Failed: failed, Errors: errors}, nil
}

func (a *App) updateTaskProgress(task *Task, current, total int) {
	a.tasksMutex.Lock()
	task.Progress = int(float64(current) / float64(total) * 100)
	a.tasksMutex.Unlock()
	a.broadcastTaskUpdate(task)
}

func zipFiles(dest string, files []string, baseDir string) error {
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()

	w := zip.NewWriter(f)
	defer w.Close()

	for _, file := range files {
		rel, err := filepath.Rel(baseDir, file)
		if err != nil {
			rel = filepath.Base(file)
		} // Fallback

		zf, err := w.Create(rel)
		if err != nil {
			return err
		}

		c, err := os.ReadFile(file)
		if err != nil {
			return err
		}

		_, err = zf.Write(c)
		if err != nil {
			return err
		}
	}
	return nil
}
