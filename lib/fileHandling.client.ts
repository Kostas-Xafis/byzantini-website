import type { AnyRecord } from "@_types/global";
import { PDF } from "./pdf.client";

type DragEvents = {
	enterEvent?: (e: DragEvent) => void,
	leaveEvent?: (e: DragEvent) => void,
	dropEvent?: (e: DragEvent) => void;
};

// export type FileProxy<T extends Record<string, any>> =
// 	({
// 		isProxy: true, // If true, the file is not uploaded to the server, but is sent to the client for crud operations.
// 		file: null;
// 		markForDeletion?: boolean;
// 	} |
// 	{
// 		isProxy: false,
// 		file: File;
// 	}) &
// 	{
// 		name: string,
// 		metadata: T;
// 	};

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

export class FileProxy<T extends Record<string, any>> {
	#isFileProxy: boolean;
	#name: string;
	#file: File | null;
	#markForDeletion: boolean;
	#metadata: T;

	constructor({ isProxy, name, file = null, markForDeletion = false, metadata = {} as any }:
		{ isProxy: boolean, name: string, file?: File | null, markForDeletion?: boolean, metadata?: T; }) {
		this.#isFileProxy = isProxy;
		this.#name = name;
		this.#file = file;
		this.#markForDeletion = markForDeletion;
		this.#metadata = metadata;
	}

	isProxy() {
		return this.#isFileProxy;
	}
	isMarkedForDeletion() {
		return this.#markForDeletion;
	}
	getFile() {
		if (this.#isFileProxy) return null;
		return this.#file;
	}
	setFileData(file: File | Blob | ArrayBuffer, { type }: { type?: string; } = {}) {
		if (file instanceof Blob) {
			this.#file = new File([file], this.#name, { type });
		} else if (file instanceof ArrayBuffer) {
			this.#file = new File([file], this.#name, { type });
		} else {
			this.#file = file;
		}
	}
	setProxy(isProxy: boolean) {
		this.#isFileProxy = isProxy;
	}
	getMetadata() {
		return this.#metadata;
	}
	setMetadata(metadata: T) {
		this.#metadata = { ...this.#metadata, ...metadata };
	}
	getName() {
		return this.#name;
	}
	setName(name: string) {
		this.#name = name;
	}
	setMarkForDeletion(value: boolean) {
		// console.log(`Setting mark for deletion for file ${this.#name} to ${value}`);
		this.#markForDeletion = value;
	}
	equalsByName(file: FileProxy<AnyRecord>) {
		return this.#name == file.#name;
	}
	toString() {
		return `FileProxy(${this.#name}, isProxy=${this.#isFileProxy}, markedForDeletion=${this.#markForDeletion}, metadata=${JSON.stringify(this.#metadata)})`;
	}

	async toImageUrl(): Promise<string> {
		let file = this.getFile();
		let type: string;
		if (this.#isFileProxy && this.#name.endsWith(".pdf")) {
			const pdf = await (await fetch("/kathigites/cv/" + this.#name)).arrayBuffer();
			type = "application/pdf";
			file = new File([pdf], this.#name, { type });
		} else if (file) {
			type = file.type;
			if (!type) throw Error("File type not found");
		} else throw Error("File not found");

		if (type.includes("image")) {
			return URL.createObjectURL(file);
		} else if (type.includes("pdf")) {
			return await PDF.convertFirstPageToImage(new Uint8Array(await file.arrayBuffer()));
		} else {
			throw Error("File type not supported");
		}
	}
}


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
		// console.log("Adding files: ", files, " with metadata: ", metadata);
		const proxyFiles = Array.from(files).map(file => FileHandler.createFileProxy<Metadata>(file.name, { file, metadata: metadata || this.metadata }));
		// console.log("Adding files: ", proxyFiles);
		if (this.isSingleFile) {
			this.files = [proxyFiles[0]];
			return;
		}

		const newFiles = [];
		for (const file of proxyFiles) {
			const fileExists = this.files.some(f => f.equalsByName(file));
			if (fileExists) {
				const oldFileIndex = this.files.findIndex(f => f.equalsByName(file));
				let tempFile = this.files[oldFileIndex];
				// Mark the file for deletion if it is uploaded to the server.
				if (tempFile.isProxy()) this.markAsDeleteFileProxy(tempFile);

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
		if (file.isProxy()) {
			const index = this.initialFileProxies.findIndex(f => f.equalsByName(file));
			if (force && index !== -1) this.initialFileProxies.splice(index, 1);
			else this.markAsDeleteFileProxy(file);
		}
		if (this.isSingleFile) this.files = [];
		else this.files.splice(index, 1);
	}
	removeDeletedFiles() {
		// Newly appended files are remove immidiately from the list
		this.files = this.files.filter(f => !f.isProxy() || !f.isMarkedForDeletion());
		this.initialFileProxies = this.initialFileProxies.filter(f => !f.isProxy() || !f.isMarkedForDeletion());
	}
	getFile(index: number) {
		if (index < 0 || index >= this.files.length) return null;
		return this.files[index];
	}
	getFiles() {
		return this.files;
	}
	getNewFiles() {
		return this.files.filter((f: FileProxy<Metadata>) => !f.isProxy());
	}
	getDeletedFiles() {
		return this.initialFileProxies.filter((f: FileProxy<Metadata>) => f.isProxy() && f.isMarkedForDeletion());
	}
	getInitialFiles() {
		return this.initialFileProxies.filter((f: FileProxy<Metadata>) => f.isProxy() && !f.isMarkedForDeletion());
	}
	getMetadata() {
		return this.metadata;
	}
	setMetadata(metadata: Metadata) {
		this.metadata = metadata;
		this.files.forEach(f => {
			f.setMetadata(metadata);
		});
	}

	markAsDeleteFileProxy(file: FileProxy<Metadata>) {
		if (!file.isProxy()) return;

		const initFile = this.initialFileProxies.find(f => f.equalsByName(file));
		if (initFile && initFile.isProxy())
			initFile.setMarkForDeletion(true);
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
	static createFileProxy<K extends Record<string, any>>(name?: string, { file = null, metadata = {} as K }: { isProxy?: boolean, file?: File | null; metadata?: K; } = {}) {
		if (typeof name !== "string" || (file && !("name" in file))) throw Error("Name not provided");
		const isProxy = file === null;
		const fileProxy = new FileProxy<K>({ isProxy, name, file, metadata });
		// console.log("Created FileProxy: ", fileProxy);
		return fileProxy;
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
		if (fileProxy.isProxy()) return;
		const file = fileProxy.getFile();
		if (!file) throw Error("File not found");
		FileHandler.downloadBlob(await FileHandler.fileToBlob(file), fileProxy.getName());
	}

	static async downloadFile(file: File, name: string) {
		FileHandler.downloadBlob(await FileHandler.fileToBlob(file), name);
	}

	fileToBlob(index: number): Promise<Blob> {
		const fProxy = this.files[index];
		if (!fProxy || !fProxy.getName() || fProxy.isProxy()) return Promise.resolve(new Blob([]));
		const file = fProxy.getFile();
		if (!file) throw Error("File not found");

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

	static async fileToUint8Array(file?: File | null): Promise<Uint8Array | null> {
		if (!file || !file.name) return Promise.resolve(null);
		return new Uint8Array(await file.arrayBuffer());
	}

	static async fileToImageUrl(fileProxy: FileProxy<AnyRecord>): Promise<string> {
		const file = fileProxy.getFile();
		if (!file) throw Error("File not found");
		const type = fileProxy.getFile()?.type;
		if (!type) throw Error("File type not found");

		if (type.includes("image")) {
			return URL.createObjectURL(file);
		} else if (type.includes("pdf")) {
			return await PDF.convertFirstPageToImage(new Uint8Array(await file.arrayBuffer()));
		} else {
			throw Error("File type not supported");
		}
	}
}
