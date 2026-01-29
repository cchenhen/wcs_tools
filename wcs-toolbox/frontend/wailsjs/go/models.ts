export namespace main {
	
	export class Chapter {
	    index: number;
	    title: string;
	    contentLength: number;
	    preview: string;
	
	    static createFrom(source: any = {}) {
	        return new Chapter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.title = source["title"];
	        this.contentLength = source["contentLength"];
	        this.preview = source["preview"];
	    }
	}
	export class ErrorDetail {
	    file?: string;
	    gallery?: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new ErrorDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.file = source["file"];
	        this.gallery = source["gallery"];
	        this.error = source["error"];
	    }
	}
	export class ConvertResult {
	    success: number;
	    failed: number;
	    errors: ErrorDetail[];
	
	    static createFrom(source: any = {}) {
	        return new ConvertResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.failed = source["failed"];
	        this.errors = this.convertValues(source["errors"], ErrorDetail);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FileInfo {
	    name: string;
	    path: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new FileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.size = source["size"];
	    }
	}
	export class ConvertTxtParams {
	    files: FileInfo[];
	    outputPath: string;
	    // Go type: struct { Author string "json:\"author\""; CustomPattern string "json:\"customPattern\"" }
	    options: any;
	
	    static createFrom(source: any = {}) {
	        return new ConvertTxtParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.files = this.convertValues(source["files"], FileInfo);
	        this.outputPath = source["outputPath"];
	        this.options = this.convertValues(source["options"], Object);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CrawlResult {
	    success: number;
	    failed: number;
	    totalImages: number;
	    errors: ErrorDetail[];
	
	    static createFrom(source: any = {}) {
	        return new CrawlResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.failed = source["failed"];
	        this.totalImages = source["totalImages"];
	        this.errors = this.convertValues(source["errors"], ErrorDetail);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class FolderInfo {
	    name: string;
	    path: string;
	    imageCount: number;
	    totalSize: number;
	
	    static createFrom(source: any = {}) {
	        return new FolderInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.imageCount = source["imageCount"];
	        this.totalSize = source["totalSize"];
	    }
	}
	export class Gallery {
	    url: string;
	    title: string;
	    imageCount: number;
	    thumbnail: string;
	
	    static createFrom(source: any = {}) {
	        return new Gallery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.title = source["title"];
	        this.imageCount = source["imageCount"];
	        this.thumbnail = source["thumbnail"];
	    }
	}
	export class GallerySearchResult {
	    success: boolean;
	    error?: string;
	    galleries: Gallery[];
	    currentPage: number;
	    hasNextPage: boolean;
	    hasMore: boolean;
	    pagesLoaded: number;
	
	    static createFrom(source: any = {}) {
	        return new GallerySearchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.error = source["error"];
	        this.galleries = this.convertValues(source["galleries"], Gallery);
	        this.currentPage = source["currentPage"];
	        this.hasNextPage = source["hasNextPage"];
	        this.hasMore = source["hasMore"];
	        this.pagesLoaded = source["pagesLoaded"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PreviewResult {
	    success: boolean;
	    error?: string;
	    totalChapters: number;
	    chapters: Chapter[];
	
	    static createFrom(source: any = {}) {
	        return new PreviewResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.error = source["error"];
	        this.totalChapters = source["totalChapters"];
	        this.chapters = this.convertValues(source["chapters"], Chapter);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PreviewTxtParams {
	    filePath: string;
	    customPattern: string;
	
	    static createFrom(source: any = {}) {
	        return new PreviewTxtParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filePath = source["filePath"];
	        this.customPattern = source["customPattern"];
	    }
	}
	export class Task {
	    id: number;
	    type: string;
	    name: string;
	    status: string;
	    data: any;
	    progress: number;
	    result?: any;
	    error?: string;
	    createdAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Task(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.name = source["name"];
	        this.status = source["status"];
	        this.data = source["data"];
	        this.progress = source["progress"];
	        this.result = source["result"];
	        this.error = source["error"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class VideoFile {
	    name: string;
	    path: string;
	    size: number;
	    parentFolder: string;
	
	    static createFrom(source: any = {}) {
	        return new VideoFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.size = source["size"];
	        this.parentFolder = source["parentFolder"];
	    }
	}

}

