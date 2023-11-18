type DragEvents = {
	enterEvent?: (e: DragEvent) => void,
	leaveEvent?: (e: DragEvent) => void,
	dropEvent?: (e: DragEvent) => void;
};

export type FileProxy =
	({
		isProxy: true, // If true, the file is not uploaded to the server, but is sent to the client for crud operations.
		file: null;
		markForDeletion?: boolean;
	} |
	{
		isProxy: false,
		file: File;
	}) &
	{
		name: string,
	};

type Constructor = {
	isSingleFile: false;
	files?: FileProxy[];
} |
{
	isSingleFile: true;
	file?: FileProxy;
};

// The file / multifile input is generating a filehandler class, that a component can consume to get the files or delete previously uploaded ones.
export class FileHandler {
	private static AllFiles: Record<string, FileHandler> = {};
	private files: FileProxy[] = [];
	private initialFileProxies: FileProxy[] = [];
	private isSingleFile: boolean = false;

	constructor(prefix: string, config: Constructor = { isSingleFile: false, files: [] }) {
		FileHandler.AllFiles[prefix] = this;

		this.isSingleFile = config.isSingleFile;
		if (!config.isSingleFile && Array.isArray(config.files)) {
			this.files = config.files.slice();
			this.initialFileProxies = config.files.slice();
		} else if (config.isSingleFile && config.file) {
			this.files = [config.file];
			this.initialFileProxies = [config.file];
		}
	}

	addFiles(files: File[] | FileList) {
		if (files.length == 0) return;
		const proxyFiles = Array.from(files).map(file => FileHandler.createFileProxy(file.name, { isProxy: false, file }));

		if (this.isSingleFile) {
			this.files = [proxyFiles[0]];
			return;
		};

		const newFiles = [];
		for (const file of proxyFiles) {
			const fileExists = this.files.some(f => f.name === file.name);
			if (fileExists) {
				const oldFileIndex = this.files.findIndex(f => f.name == file.name);
				let tempFile = this.files[oldFileIndex];
				// Mark the file for deletion if it is uploaded to the server.
				if (tempFile.isProxy) this.markAsDeleteFileProxy(tempFile);

				this.files[oldFileIndex] = file;
			} else {
				newFiles.push(file);
			}
		}
		this.files = this.files.concat(newFiles);
	}
	removeFile(index?: number) {
		if (index == undefined) throw Error("Index not provided");
		if (index < 0 || index >= this.files.length) throw Error("Index out of bounds");

		const file = this.files[index];
		if (file.isProxy) {
			this.markAsDeleteFileProxy(file);
		}
		if (this.isSingleFile) this.files = [];
		else this.files.splice(index, 1);
	}
	getFile(index: number) {
		if (index < 0 || index >= this.files.length) throw Error("Index out of bounds");
		return this.files[index];
	}
	getFiles() {
		return this.files;
	}
	getDeletedFiles() {
		return this.initialFileProxies.filter((f: FileProxy) => f.isProxy && f.markForDeletion);
	}
	getInitialFiles() {
		return this.initialFileProxies;
	}

	mountDragAndDrop(element: HTMLElement, events: DragEvents) {
		const { enterEvent, leaveEvent, dropEvent } = events;
		element.addEventListener("dragenter", (e) => {
			e.preventDefault();
			enterEvent && enterEvent(e);
		});
		element.addEventListener("dragover", (e) => {
			e.preventDefault();
		});
		leaveEvent && element.addEventListener("dragleave", (e) => {
			e.preventDefault();
			let div = e.currentTarget as HTMLDivElement;
			// return if the mouse position is outside the element
			const {
				height: h,
				width: w,
				x: px,
				y: py,
			} = div.getBoundingClientRect();
			const { x: mx, y: my } = e;
			if (
				mx >= px &&
				mx <= px + w &&
				my >= py &&
				my <= py + h
			)
				return;
			leaveEvent(e);
		});
		element.addEventListener("drop", (e) => {
			e.preventDefault();
			e.stopImmediatePropagation();
			if (e.dataTransfer == null || e.dataTransfer.files == null) return;
			this.addFiles(e.dataTransfer.files);
			dropEvent && dropEvent(e);
		});
	}

	markAsDeleteFileProxy(file: FileProxy) {
		if (!file.isProxy) return;

		const initFile = this.initialFileProxies.find(f => f.name == file.name);
		if (initFile && initFile.isProxy)
			initFile.markForDeletion = true;
	}

	static getFiles(prefix: string) {
		if (FileHandler.AllFiles[prefix] == null) return [];
		return FileHandler.AllFiles[prefix].getFiles();
	}
	static getDeletedFiles(prefix: string) {
		if (FileHandler.AllFiles[prefix] == null) return [];
		return FileHandler.AllFiles[prefix].getDeletedFiles();
	}
	static getInitialFiles(prefix: string) {
		if (FileHandler.AllFiles[prefix] == null) return [];
		return FileHandler.AllFiles[prefix].getInitialFiles();
	}
	static createFileProxy(name?: string, { isProxy = true, file = null }: { isProxy?: boolean, file?: File | null; } = {}) {
		if (typeof name !== "string") throw Error("Name not provided");
		if (isProxy)
			return { isProxy, name, file: null, markForDeletion: false };
		if (file == null || !("name" in file)) throw Error("File is null");
		return { isProxy, name, file };
	}
}

