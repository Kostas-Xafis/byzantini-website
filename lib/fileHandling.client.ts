type DragEvents = {
	enterEvent?: (e: DragEvent) => void,
	leaveEvent?: (e: DragEvent) => void,
	dropEvent?: (e: DragEvent) => void;
};

export type FileProxy<T extends Record<string, any>> =
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
		metadata: T;
	};

type Constructor<T extends Record<string, any>> = {
	isSingleFile: false;
	files?: FileProxy<T>[];
	metadata?: T;
} |
{
	isSingleFile: true;
	file?: FileProxy<T>;
	metadata?: T;
};

// The file / multifile input is generating a filehandler class, that a component can consume to get the files or delete previously uploaded ones.
export class FileHandler<Metadata extends Record<string, any>> {
	private static AllFiles: Record<string, FileHandler<any>> = {};
	private files: FileProxy<Metadata>[] = [];
	private metadata: Metadata;
	private initialFileProxies: FileProxy<Metadata>[] = [];
	private isSingleFile: boolean = false;

	constructor(prefix: string, config: Constructor<Metadata> = { isSingleFile: false, files: [], metadata: {} as Metadata }) {
		FileHandler.AllFiles[prefix] = this;

		this.metadata = config.metadata || {} as Metadata;
		this.isSingleFile = config.isSingleFile;
		if (!config.isSingleFile && Array.isArray(config.files)) {
			this.files = config.files.slice();
			this.initialFileProxies = config.files.slice();
		} else if (config.isSingleFile && config.file) {
			this.files = [config.file];
			this.initialFileProxies = [config.file];
		}
	}

	addFiles(files: File[] | FileList, metadata?: Metadata) {
		if (files.length == 0) return;
		const proxyFiles = Array.from(files).map(file => FileHandler.createFileProxy<Metadata>(file.name, { isProxy: false, file, metadata: metadata || this.metadata }));

		if (this.isSingleFile) {
			this.files = [proxyFiles[0]];
			return;
		}

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
	removeFile(index: number, force: boolean = false): void {
		if (index < 0 || index >= this.files.length) throw Error("Index out of bounds");

		const file = this.files[index];
		if (file.isProxy) {
			if (force) this.initialFileProxies = this.initialFileProxies.filter(f => f.name != file.name);
			else this.markAsDeleteFileProxy(file);
		}
		if (this.isSingleFile) this.files = [];
		else this.files.splice(index, 1);
	}
	removeDeletedFiles() {
		// Newly appended files are remove immidiately from the list
		this.files = this.files.filter(f => !f.isProxy || !f.markForDeletion);
		this.initialFileProxies = this.initialFileProxies.filter(f => !f.isProxy || !f.markForDeletion);
	}
	getFile(index: number) {
		if (index < 0 || index >= this.files.length) throw Error("Index out of bounds");
		return this.files[index];
	}
	getFiles() {
		return this.files;
	}
	getNewFiles() {
		return this.files.filter((f: FileProxy<Metadata>) => !f.isProxy);
	}
	getDeletedFiles() {
		return this.initialFileProxies.filter((f: FileProxy<Metadata>) => f.isProxy && f.markForDeletion);
	}
	getInitialFiles() {
		return this.initialFileProxies.filter((f: FileProxy<Metadata>) => f.isProxy && !f.markForDeletion);
	}
	getMetadata() {
		return this.metadata;
	}
	setMetadata(metadata: Metadata) {
		this.metadata = metadata;
		this.files.forEach(f => {
			f.metadata = { ...f.metadata, ...metadata };
		});
	}

	markAsDeleteFileProxy(file: FileProxy<Metadata>) {
		if (!file.isProxy) return;

		const initFile = this.initialFileProxies.find(f => f.name == file.name);
		if (initFile && initFile.isProxy)
			initFile.markForDeletion = true;
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
		if (FileHandler.AllFiles[prefix] == null) return [];
		return FileHandler.AllFiles[prefix].getFiles();
	}
	static getNewFiles(prefix: string) {
		if (FileHandler.AllFiles[prefix] == null) return [];
		return FileHandler.AllFiles[prefix].getNewFiles();
	}
	static getDeletedFiles(prefix: string) {
		if (FileHandler.AllFiles[prefix] == null) return [];
		return FileHandler.AllFiles[prefix].getDeletedFiles();
	}
	static getInitialFiles(prefix: string) {
		if (FileHandler.AllFiles[prefix] == null) return [];
		return FileHandler.AllFiles[prefix].getInitialFiles();
	}
	static createFileProxy<K extends Record<string, any>>(name?: string, { isProxy = true, file = null, metadata = {} as K }: { isProxy?: boolean, file?: File | null; metadata?: K; } = {}): FileProxy<K> {
		if (typeof name !== "string") throw Error("Name not provided");
		if (isProxy)
			return { isProxy, name, file: null, markForDeletion: false, metadata };
		if (file == null || !("name" in file)) throw Error("File is null");
		return { isProxy, name, file, metadata };
	}
	static getHandler<Metadata extends Record<string, any>>(prefix: string) {
		return FileHandler.AllFiles[prefix] as FileHandler<Metadata>;
	}

	private static downloadBlob(blob: Blob | null, name: string) {
		if (!blob) return;
		let a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = name;
		a.click();
	}

	async downloadFile(index: number) {
		const fileProxy = this.files[index];
		if (fileProxy.isProxy) return;
		FileHandler.downloadBlob(await FileHandler.fileToBlob(fileProxy.file), fileProxy.name);
	}

	static async downloadFile(file: File, name: string) {
		FileHandler.downloadBlob(await FileHandler.fileToBlob(file), name);
	}

	fileToBlob(index: number): Promise<Blob> {
		const file = this.files[index];
		if (!file || !file.name || file.isProxy) return Promise.resolve(new Blob([]));
		return new Promise((res) => {
			const reader = new FileReader();
			reader.onload = () => {
				if (reader.result)
					res(new Blob([reader.result], { type: file.file.type }));
				else res(new Blob([]));
			};
			reader.readAsArrayBuffer(file.file);
		});
	}


	static fileToBlob(file?: File | null): Promise<Blob> {
		if (!file || !file.name) return Promise.resolve(new Blob([]));
		return new Promise((res) => {
			const reader = new FileReader();
			reader.onload = () => {
				if (reader.result)
					res(new Blob([reader.result], { type: file.type }));
				else res(new Blob([]));
			};
			reader.readAsArrayBuffer(file);
		});
	}

	static async fileToUint8Array(file: File): Promise<Uint8Array> {
		return new Uint8Array(await file.arrayBuffer());
	}

	static async fileToUint8(file?: File | null): Promise<Uint8Array | null> {
		if (!file || !file.name) return Promise.resolve(null);
		return new Uint8Array(await file.arrayBuffer());
	}
}
