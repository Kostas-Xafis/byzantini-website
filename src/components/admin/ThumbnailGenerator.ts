import { loadScript } from "../../../lib/utils.client";

export class ThumbnailGenerator {
	private static compressorLoaded: boolean = false;

	constructor() { }

	static async loadCompressor() {
		if (this.compressorLoaded) return;

		await loadScript("https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.1/dist/browser-image-compression.js");
		this.compressorLoaded = true;
	}

	async createThumbnail(imageFile: File, imgName: string) {
		if (!ThumbnailGenerator.compressorLoaded) await ThumbnailGenerator.loadCompressor();

		const type = imgName.split('.').pop();
		if (!type) throw Error('Invalid image type');

		const options = {
			maxSizeMB: 0.04,
		};

		// @ts-ignore
		const compressedFile = await imageCompression(imageFile, options);

		return compressedFile as File;
	}
}
