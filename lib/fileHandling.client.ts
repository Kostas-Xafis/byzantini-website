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
		if (this.isSingleFile) this.files = [files[0]];
		else this.files = [...new Set([...this.files, ...files])];
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

	static getFiles(prefix: string) {
		return FileHandler.AllFiles[prefix].getFiles();
	}
}

