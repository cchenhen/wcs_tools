package main

import (
	"context"
	"crypto/tls"
	"net/http"
	"sync"
	"time"
)

// ============ Structs (Models) ============

type VideoFile struct {
	Name         string `json:"name"`
	Path         string `json:"path"`
	Size         int64  `json:"size"`
	ParentFolder string `json:"parentFolder"`
}

type FileInfo struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Size int64  `json:"size"`
}

type FolderInfo struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	ImageCount int    `json:"imageCount"`
	TotalSize  int64  `json:"totalSize"`
}

type Task struct {
	ID        int         `json:"id"`
	Type      string      `json:"type"`
	Name      string      `json:"name"`
	Status    string      `json:"status"` // pending, running, completed, failed, cancelled
	Data      interface{} `json:"data"`
	Progress  int         `json:"progress"`
	Result    interface{} `json:"result,omitempty"`
	Error     string      `json:"error,omitempty"`
	CreatedAt int64       `json:"createdAt"`
	cancel    context.CancelFunc
}

type TaskResult struct {
	Success int           `json:"success"`
	Failed  int           `json:"failed"`
	Errors  []ErrorDetail `json:"errors"`
}

type ErrorDetail struct {
	File    string `json:"file,omitempty"`
	Gallery string `json:"gallery,omitempty"`
	Error   string `json:"error"`
}

type PreviewResult struct {
	Success       bool      `json:"success"`
	Error         string    `json:"error,omitempty"`
	TotalChapters int       `json:"totalChapters"`
	Chapters      []Chapter `json:"chapters"`
}

type Chapter struct {
	Index         int    `json:"index"`
	Title         string `json:"title"`
	ContentLength int    `json:"contentLength"`
	Preview       string `json:"preview"`
}

type ConvertResult struct {
	Success int           `json:"success"`
	Failed  int           `json:"failed"`
	Errors  []ErrorDetail `json:"errors"`
}

type Gallery struct {
	URL        string `json:"url"`
	Title      string `json:"title"`
	ImageCount int    `json:"imageCount"`
	Thumbnail  string `json:"thumbnail"`
}

type GallerySearchResult struct {
	Success     bool      `json:"success"`
	Error       string    `json:"error,omitempty"`
	Galleries   []Gallery `json:"galleries"`
	CurrentPage int       `json:"currentPage"`
	HasNextPage bool      `json:"hasNextPage"`
	HasMore     bool      `json:"hasMore"` // alias for HasNextPage
	PagesLoaded int       `json:"pagesLoaded"`
}

type CrawlResult struct {
	Success     int           `json:"success"`
	Failed      int           `json:"failed"`
	TotalImages int           `json:"totalImages"`
	Errors      []ErrorDetail `json:"errors"`
}

// Params structs for Task Data casting
type CreateShortcutsParams struct {
	Videos     []VideoFile `json:"videos"`
	TargetPath string      `json:"targetPath"`
	NamingMode string      `json:"namingMode"`
}

type Convert7zParams struct {
	Files            []FileInfo `json:"files"`
	VideoOutputPath  string     `json:"videoOutputPath"`
	KeepOriginal     bool       `json:"keepOriginal"`
	CompressionLevel int        `json:"compressionLevel"`
}

type PackImagesParams struct {
	Folders          []FolderInfo `json:"folders"`
	TargetPath       string       `json:"targetPath"`
	CompressionLevel int          `json:"compressionLevel"`
}

type ConvertTxtParams struct {
	Files      []FileInfo `json:"files"`
	OutputPath string     `json:"outputPath"`
	Options    struct {
		Author        string `json:"author"`
		CustomPattern string `json:"customPattern"`
	} `json:"options"`
}

type PreviewTxtParams struct {
	FilePath      string `json:"filePath"`
	CustomPattern string `json:"customPattern"`
}

// App struct
type App struct {
	ctx        context.Context
	tasks      map[int]*Task
	tasksMutex sync.Mutex
	taskIdSeq  int
	taskQueue  chan int

	crawlerClient *http.Client
	crawlerCancel context.CancelFunc
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		tasks:     make(map[int]*Task),
		taskQueue: make(chan int, 100), // Buffer
		crawlerClient: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		},
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// Start task processor
	go a.processTasks() // Defined in task_queue.go
}
