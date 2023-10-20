import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";
import { imageMIMETypes } from "../../../lib/utils.client";

const ffmpeg = new FFmpeg();
export class ThumbnailGenerator {
	private static ffmpegLoaded: boolean = false;
	private static storedFiles: string[] = [];

	constructor() { }

	static async loadFFMPEG() {
		if (this.ffmpegLoaded) return;
		const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.4/dist/esm";
		await ffmpeg.load({
			coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
			wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
		});
		this.ffmpegLoaded = true;
	}

	async createThumbnail(imgFile: File, imgName: string) {
		if (!ThumbnailGenerator.ffmpegLoaded) await ThumbnailGenerator.loadFFMPEG();

		const type = imgName.split('.').pop();
		if (!type) throw Error('Invalid image type');
		const inputName = 'input.' + type;
		const outputName = 'output.' + type;
		ThumbnailGenerator.storedFiles.push(inputName, outputName);

		const file = await fetchFile(imgFile);
		await ffmpeg.writeFile(inputName, file);
		// ffmpeg - i input.jpg -b:v 200K - vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" output.jpg

		// Find a divisor so that the image is around 20KB
		const divisor = Math.floor((imgFile.size / 20000) ** 0.5); // using square root because both width and height are divided by the same number
		console.log('divisor', divisor);
		if (divisor <= 1) return imgFile;

		await ffmpeg.exec(['-i', inputName, '-vf', `scale=trunc(iw/${divisor}):trunc(ih/${divisor})`, outputName]);
		const data = await ffmpeg.readFile(outputName);
		let mime = imageMIMETypes.find(mime => mime.includes(type));

		return new File([data], outputName, { type: mime });
	}

	static async cleanup() {
		if (!this.ffmpegLoaded) return;
		await Promise.allSettled(this.storedFiles.map(file => {
			return ffmpeg.deleteFile(file);
		}));
		ffmpeg.terminate();
		this.ffmpegLoaded = false;
	}
}
