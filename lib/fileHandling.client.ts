type DragEvents = {
	enterEvent?: (e: DragEvent) => void,
	leaveEvent?: (e: DragEvent) => void,
	dropEvent?: (e: DragEvent) => void;
};

// The file / multifile input is generating a filehandler class, that a component is consuming to get the files (maybe static function).
export class FileHandler {
	private static AllFiles: Record<string, FileHandler> = {};
	private files: File[] = [];
	private isSingleFile: boolean = false;
	constructor(prefix: string, isSingleFile = false) {
		this.isSingleFile = isSingleFile;
		FileHandler.AllFiles[prefix] = this;
	}
	addFiles(files: File[] | FileList) {
		if (this.isSingleFile) {
			this.files = [files[0]];
			return;
		};
		const newFiles = [];
		for (const file of files) {
			if (this.files.some(f => f.name === file.name)) {
				const oldFileIndex = this.files.findIndex(f => f.name == file.name);
				this.files[oldFileIndex] = file;
				continue;
			}
			newFiles.push(file);
		}
		this.files = this.files.concat(newFiles);
	}
	removeFile(index?: number) {
		if (this.isSingleFile) this.files = [];
		if (index == undefined) throw Error("Index not provided");
		if (index < 0 || index >= this.files.length) throw Error("Index out of bounds");
		else this.files.splice(index, 1);
	}
	getFile(index: number) {
		if (index < 0 || index >= this.files.length) throw Error("Index out of bounds");
		return this.files[index];
	}
	getFiles() {
		return this.files;
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

	static getFiles(prefix: string) {
		return FileHandler.AllFiles[prefix].getFiles();
	}
}

