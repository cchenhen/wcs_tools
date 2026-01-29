package main

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) TaskQueueAdd(taskType string, data interface{}, name string) int {
	a.tasksMutex.Lock()
	defer a.tasksMutex.Unlock()

	a.taskIdSeq++
	id := a.taskIdSeq

	task := &Task{
		ID:        id,
		Type:      taskType,
		Name:      name,
		Status:    "pending",
		Data:      data, // cast later
		CreatedAt: time.Now().UnixMilli(),
		Progress:  0,
	}

	a.tasks[id] = task
	a.taskQueue <- id

	go a.broadcastTaskList()

	return id
}

func (a *App) TaskQueueCancel(id int) {
	a.tasksMutex.Lock()
	if task, ok := a.tasks[id]; ok {
		if task.Status == "pending" || task.Status == "running" {
			task.Status = "cancelled"
			if task.cancel != nil {
				task.cancel()
			}
		}
	}
	a.tasksMutex.Unlock()
	a.broadcastTaskList()
}

func (a *App) TaskQueueClearCompleted() {
	a.tasksMutex.Lock()
	for id, task := range a.tasks {
		if task.Status == "completed" || task.Status == "failed" || task.Status == "cancelled" {
			delete(a.tasks, id)
		}
	}
	a.tasksMutex.Unlock()
	a.broadcastTaskList()
}

func (a *App) TaskQueueGetAll() []Task {
	a.tasksMutex.Lock()
	defer a.tasksMutex.Unlock()
	var tasks []Task
	for _, t := range a.tasks {
		tasks = append(tasks, *t)
	}
	// Sort by ID DESC
	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].ID > tasks[j].ID
	})
	return tasks
}

func (a *App) broadcastTaskList() {
	// Slight delay to allow status updates to propagate
	time.Sleep(50 * time.Millisecond)
	tasks := a.TaskQueueGetAll()
	runtime.EventsEmit(a.ctx, "task-list-update", tasks)
}

func (a *App) processTasks() {
	// Worker pool size 1 to avoid overwhelming disk I/O, or 2 allowed.
	// Electron version had maxConcurrent = 2.
	limit := 2
	sem := make(chan struct{}, limit)

	for id := range a.taskQueue {
		sem <- struct{}{}
		go func(taskId int) {
			defer func() { <-sem }()
			a.runTask(taskId)
		}(id)
	}
}

func (a *App) runTask(taskId int) {
	a.tasksMutex.Lock()
	task, exists := a.tasks[taskId]
	if !exists || task.Status == "cancelled" {
		a.tasksMutex.Unlock()
		return
	}
	task.Status = "running"
	ctx, cancel := context.WithCancel(context.Background())
	task.cancel = cancel
	a.tasksMutex.Unlock()

	a.broadcastTaskUpdate(task)

	var err error
	var result interface{}

	// Dispatch based on type
	switch task.Type {
	case "create-shortcuts":
		result, err = a.handleCreateShortcuts(ctx, task)
	case "convert-7z-to-zip":
		result, err = a.handleConvert7z(ctx, task)
	case "pack-images":
		result, err = a.handlePackImages(ctx, task)
	case "convert-txt-to-epub":
		result, err = a.handleConvertTxtToEpub(ctx, task)
	default:
		err = fmt.Errorf("unknown task type: %s", task.Type)
	}

	// Update Final Status
	a.tasksMutex.Lock()
	// Check if cancelled again just in case
	if ctx.Err() != nil || task.Status == "cancelled" {
		task.Status = "cancelled" // Ensure cancelled state
	} else if err != nil {
		task.Status = "failed"
		task.Error = err.Error()
	} else {
		task.Status = "completed"
		task.Result = result
		task.Progress = 100
	}
	a.tasksMutex.Unlock()

	a.broadcastTaskUpdate(task)
	// Also update list
	a.broadcastTaskList()
}

func (a *App) broadcastTaskUpdate(task *Task) {
	runtime.EventsEmit(a.ctx, "task-update", task)
}
