package main

import (
	"archive/zip"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ============ Gallery Crawler ============

func (a *App) GallerySearch(keyword string, page int) GallerySearchResult {
	if page < 1 {
		page = 1
	}

	searchUrl := fmt.Sprintf("https://www.hentaiclub.net/search/%s/", url.QueryEscape(keyword))
	if page > 1 {
		searchUrl = fmt.Sprintf("https://www.hentaiclub.net/search/%s/%d/", url.QueryEscape(keyword), page)
	}

	req, _ := http.NewRequest("GET", searchUrl, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := a.crawlerClient.Do(req)
	if err != nil {
		return GallerySearchResult{Success: false, Error: err.Error(), CurrentPage: page}
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return GallerySearchResult{Success: false, Error: fmt.Sprintf("Status code: %d", resp.StatusCode), CurrentPage: page}
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return GallerySearchResult{Success: false, Error: err.Error(), CurrentPage: page}
	}

	var galleries []Gallery
	doc.Find(".item-link, a.item-link, .post-item a").Each(func(i int, s *goquery.Selection) {
		href, exists := s.Attr("href")
		if !exists {
			return
		}

		if (strings.Contains(href, "/r15/") || strings.Contains(href, "/r18/")) && strings.HasSuffix(href, ".html") {
			title := strings.TrimSpace(s.Find(".item-title, .post-title, h2, h3").Text())
			if title == "" {
				title, _ = s.Attr("title")
			}
			if title == "" {
				title = strings.TrimSpace(s.Text())
			}

			// Extract image count
			count := 0
			// Regex \[(\d+)P\]
			// Simplified extraction
			if idx := strings.LastIndex(title, "["); idx != -1 {
				part := title[idx:] // [123P]
				if idx2 := strings.Index(part, "P]"); idx2 != -1 {
					cStr := part[1:idx2]
					count, _ = strconv.Atoi(cStr)
				}
			}

			thumb, _ := s.Find("img").Attr("src")
			if thumb == "" {
				thumb, _ = s.Find("img").Attr("data-src")
			}

			if !strings.HasPrefix(href, "http") {
				href = "https://www.hentaiclub.net" + href
			}

			galleries = append(galleries, Gallery{
				URL:        href,
				Title:      title,
				ImageCount: count,
				Thumbnail:  thumb,
			})
		}
	})

	// Deduplicate
	unique := make([]Gallery, 0, len(galleries))
	seen := make(map[string]bool)
	for _, g := range galleries {
		if !seen[g.URL] {
			seen[g.URL] = true
			unique = append(unique, g)
		}
	}

	// Check HasNextPage
	hasNext := false
	doc.Find("a[href*='/search/']").Each(func(i int, s *goquery.Selection) {
		href, _ := s.Attr("href")
		if strings.Contains(href, fmt.Sprintf("/%d/", page+1)) {
			hasNext = true
		}
	})

	return GallerySearchResult{
		Success:     true,
		Galleries:   unique,
		CurrentPage: page,
		HasNextPage: hasNext,
		HasMore:     hasNext,
	}
}

func (a *App) GallerySearchAll(keyword string, maxPages int) GallerySearchResult {
	// Start a background search?
	// The implementation in Node was: auto fetch pages.
	// Since this is Wails, we can do it sync in loop and emit events.

	a.crawlerCancel = nil // Reset
	ctx, cancel := context.WithCancel(context.Background())
	a.crawlerCancel = cancel

	var allGalleries []Gallery
	seen := make(map[string]bool)

	currentPage := 1
	hasMore := true

	for currentPage <= maxPages && hasMore {
		if ctx.Err() != nil {
			break
		}

		res := a.GallerySearch(keyword, currentPage)
		if !res.Success {
			break
		}

		for _, g := range res.Galleries {
			if !seen[g.URL] {
				seen[g.URL] = true
				allGalleries = append(allGalleries, g)
			}
		}

		runtime.EventsEmit(a.ctx, "gallery-search-progress", map[string]interface{}{
			"currentPage":    currentPage,
			"maxPages":       maxPages,
			"galleriesFound": len(allGalleries),
		})

		hasMore = res.HasNextPage
		currentPage++
		time.Sleep(500 * time.Millisecond) // Delay
	}

	return GallerySearchResult{
		Success:     true,
		Galleries:   allGalleries,
		PagesLoaded: currentPage - 1,
		HasMore:     hasMore && currentPage <= maxPages,
	}
}

func (a *App) GalleryCancelCrawl() {
	if a.crawlerCancel != nil {
		a.crawlerCancel()
	}
}

func (a *App) GallerySelectOutputFolder() string {
	return a.SelectTargetFolder()
}

func (a *App) GalleryCrawlAndPack(galleries []Gallery, outputPath string) CrawlResult {
	a.crawlerCancel = nil
	ctx, cancel := context.WithCancel(context.Background())
	a.crawlerCancel = cancel

	os.MkdirAll(outputPath, 0755)

	result := CrawlResult{Errors: []ErrorDetail{}}

	for i, g := range galleries {
		if ctx.Err() != nil {
			result.Errors = append(result.Errors, ErrorDetail{Gallery: "System", Error: "Cancelled"})
			break
		}

		runtime.EventsEmit(a.ctx, "gallery-crawl-progress", map[string]interface{}{
			"current":        i + 1,
			"total":          len(galleries),
			"currentGallery": g.Title,
			"stage":          "fetching",
		})

		err := a.processGallery(ctx, g, outputPath, i+1, len(galleries))
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, ErrorDetail{Gallery: g.Title, Error: err.Error()})
		} else {
			result.Success++
			result.TotalImages += g.ImageCount // Approximation, or actual downloaded count
		}
	}

	return result
}

func (a *App) processGallery(ctx context.Context, g Gallery, outputPath string, gIdx, gTotal int) error {
	// Fetch images
	req, _ := http.NewRequest("GET", g.URL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0")
	resp, err := a.crawlerClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return err
	}

	var images []string

	// Selectors
	doc.Find("#masonry .post-item img, .post-item-img, .post-content img, article img").Each(func(i int, s *goquery.Selection) {
		src, _ := s.Attr("data-src")
		if src == "" {
			src, _ = s.Attr("src")
		}
		if src != "" && !strings.Contains(src, "logo") && !strings.Contains(src, "ads") {
			if !strings.HasPrefix(src, "http") {
				src = "https:" + src
			}
			images = append(images, src)
		}
	})

	if len(images) == 0 {
		return fmt.Errorf("no images found")
	}

	// Download
	// Create Zip
	safeTitle := sanitizeFilename(g.Title)
	if len(safeTitle) > 100 {
		safeTitle = safeTitle[:100]
	}
	zipPath := filepath.Join(outputPath, safeTitle+".zip")

	// Prepare for zip
	f, err := os.Create(zipPath)
	if err != nil {
		return err
	}
	defer f.Close()

	zw := zip.NewWriter(f)
	defer zw.Close()

	// Concurrent config
	var wg sync.WaitGroup
	sem := make(chan struct{}, 5) // max concurrent
	var downloaded int
	var mu sync.Mutex

	for j, imgUrl := range images {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		wg.Add(1)
		sem <- struct{}{}

		go func(idx int, u string) {
			defer wg.Done()
			defer func() { <-sem }()

			// Download
			data, err := downloadUrl(a.crawlerClient, u)
			if err == nil {
				mu.Lock()
				// Write to zip
				ext := filepath.Ext(parseUrlPath(u))
				if ext == "" {
					ext = ".jpg"
				} // Default
				fname := fmt.Sprintf("%04d%s", idx+1, ext)

				zipFile, _ := zw.Create(fname)
				zipFile.Write(data)

				downloaded++
				// Notify
				runtime.EventsEmit(a.ctx, "gallery-crawl-progress", map[string]interface{}{
					"current":        gIdx,
					"total":          gTotal,
					"currentGallery": g.Title,
					"stage":          "downloading",
					"downloaded":     downloaded,
					"totalImages":    len(images), // Note: mismatched field name vs frontend (imageTotal), fixed below
					"imageTotal":     len(images),
				})
				mu.Unlock()
			}
		}(j, imgUrl)
	}

	wg.Wait()

	if downloaded == 0 {
		return fmt.Errorf("all downloads failed")
	}
	return nil
}

func sanitizeFilename(name string) string {
	reg := regexp.MustCompile(`[<>:"/\\|?*]`)
	return reg.ReplaceAllString(name, "_")
}

func parseUrlPath(u string) string {
	parsed, _ := url.Parse(u)
	return parsed.Path
}

func downloadUrl(client *http.Client, u string) ([]byte, error) {
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0")
	req.Header.Set("Referer", "https://www.hentaiclub.net/")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	return io.ReadAll(resp.Body)
}
