type DragEvents = {
	enterEvent?: (e: DragEvent) => void,
	leaveEvent?: (e: DragEvent) => void,
	dropEvent?: (e: DragEvent) => void;
};

export type FileProxy = {
	isProxy: true, // If true, the file is not uploaded to the server, but is sent to the client for crud operations.
	name: string,
	operation: "create" | "update" | "delete" | "read";
} | (File & { isProxy: false; });

export interface FileListProxy {
	readonly length: number;
	item(index: number): FileProxy | null;
	[index: number]: FileProxy;
	[Symbol.iterator](): IterableIterator<FileProxy>;
}


// The file / multifile input is generating a filehandler class, that a component can consume to get the files or delete previously uploaded ones.
export class FileHandler {
	private static AllFiles: Record<string, FileHandler> = {};
	private files: FileProxy[] = [];
	private initialFileProxies: FileProxy[] = [];
	private isSingleFile: boolean = false;
	constructor(prefix: string, { isSingleFile, files }: { isSingleFile: boolean, files: string[]; } = { isSingleFile: false, files: [] }) {
		this.isSingleFile = isSingleFile;
		FileHandler.AllFiles[prefix] = this;

		if (files.length == 0) return;
		const fileProxies: FileProxy[] = files.map(file => ({ isProxy: true, name: file, operation: "read" }));
		this.files = fileProxies.slice();
		this.initialFileProxies = fileProxies.slice();
	}

	addFiles(files: FileProxy[] | FileListProxy) {
		if (files.length == 0) return;
		this.setFileProxy(files, false);
		if (this.isSingleFile) {
			this.files = [files[0]];
			return;
		};
		const newFiles = [];
		for (const file of files) {
			if (this.files.some(f => f.name === file.name)) {
				const oldFileIndex = this.files.findIndex(f => f.name == file.name);
				let tempFile = this.files[oldFileIndex];
				// Mark the file for deletion if it was previously uploaded
				if (tempFile.isProxy) this.removeFileProxy(tempFile);

				this.files[oldFileIndex] = file;
				continue;
			}
			newFiles.push(file);
		}
		this.files = this.files.concat(newFiles);
	}
	removeFile(index?: number) {
		if (index == undefined) throw Error("Index not provided");
		if (index < 0 || index >= this.files.length) throw Error("Index out of bounds");

		const file = this.files[index];
		if (file.isProxy) {
			this.removeFileProxy(file);
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
			this.addFiles(e.dataTransfer.files as FileListProxy);
			dropEvent && dropEvent(e);
		});
	}

	setFileProxy(files: FileProxy[] | FileListProxy, toggle: boolean) {
		for (const file of files) {
			file.isProxy = toggle;
		}
	}
	removeFileProxy(file: FileProxy) {
		if (!file.isProxy) return;

		const initFile = this.initialFileProxies.find(f => f.name == file.name);
		if (initFile && initFile.isProxy) {
			initFile.operation = "delete";
		}
	}

	static getFiles(prefix: string) {
		return FileHandler.AllFiles[prefix].getFiles();
	}
	static getInitialFiles(prefix: string) {
		return FileHandler.AllFiles[prefix].getInitialFiles();
	}
}

