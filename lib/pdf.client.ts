import type { Registrations } from "../types/entities";
import type { PDFRequest } from "../pdfWorker/src/types";
//@ts-ignore
import * as zip from "https://cdn.jsdelivr.net/npm/client-zip/index.js";
import { asyncQueue, dynamicImport, getCookie, loadScript, looseStringEquals, sleep } from "./utils.client";

const PDFTypeWrap = <Type extends PDFRequest["type"]>(type: Type, data: PDFRequest<Type>["request"]) => {
	return {
		type,
		request: data
	};
};



export class PDF {
	private static TemplateFileName = ["/pdf_templates/byz_template.pdf", "/pdf_templates/par_template.pdf", "/pdf_templates/eur_template.pdf"];
	private static PDFWorkerURL = import.meta.env.VITE_PDF_SERVICE_URL;
	private student: Registrations = {} as Registrations;
	private teachersName: string = "";
	private instrument: string = "";
	constructor() { };

	public setTemplateData(student: Registrations, teachersName: string, instrument?: string): PDF {
		this.student = student;
		this.teachersName = teachersName;
		this.instrument = instrument || "";
		return this;
	}

	public getFileName(): string {
		if (looseStringEquals(this.student.class_year, "Υπό Κατάταξη")) {
			return `Υπό κατάταξη/${this.student.first_name}_${this.student.last_name}.pdf`;
		}
		return `${this.teachersName}/${this.student.first_name}_${this.student.last_name}.pdf`;
	}

	private static loadPrintJS() {
		return loadScript("https://cdnjs.cloudflare.com/ajax/libs/print-js/1.6.0/print.min.js", () => !!window["printJS"]);
	};

	public async print() {
		await PDF.loadPrintJS();
		const body: PDFRequest = PDFTypeWrap("registration", {
			isMultiple: false,
			data: {
				url: PDF.TemplateFileName[this.student.class_id],
				student: this.student,
				teachersName: this.teachersName,
				instrument: this.instrument,
			}
		});
		const imgBlob = await (await fetch(PDF.PDFWorkerURL, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${getCookie("session_id")}`
			},
			body: JSON.stringify(body)
		})).blob();
		const fileURL = URL.createObjectURL(imgBlob);
		const printWindow = window.open(fileURL, "_blank");
		printWindow?.print();
	}

	public static async printBulk(pdfs: PDF[]) {
		if (pdfs.length === 0) throw new Error("No PDFs to print");

		await PDF.loadPrintJS();

		if (pdfs.length === 1) {
			return pdfs[0].print();
		}

		const body: PDFRequest = PDFTypeWrap("registration", {
			isMultiple: true,
			data: pdfs.map((pdf) => ({
				url: PDF.TemplateFileName[pdf.student.class_id],
				student: pdf.student,
				teachersName: pdf.teachersName,
				instrument: pdf.instrument,
			}))
		});
		const imgBlob = await (await fetch(PDF.PDFWorkerURL, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${getCookie("session_id")}`
			},
			body: JSON.stringify(body)
		})).blob();
		const fileURL = URL.createObjectURL(imgBlob);
		const printWindow = window.open(fileURL, "_blank");
		printWindow?.print();
	}

	public async download(): Promise<void> {
		if (!this.student.first_name || !this.student.last_name) throw new Error("Student data not set");

		const body: PDFRequest = PDFTypeWrap("registration", {
			isMultiple: false,
			data: {
				url: PDF.TemplateFileName[this.student.class_id],
				student: this.student,
				teachersName: this.teachersName,
				instrument: this.instrument,
			}
		});
		const imgBlob = await (await fetch(PDF.PDFWorkerURL, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${getCookie("session_id")}`
			},
			body: JSON.stringify(body)
		})).blob();

		let a = document.createElement("a");
		a.href = URL.createObjectURL(imgBlob);
		a.download = `${this.student.first_name}_${this.student.last_name}.pdf`;
		a.click();
	}

	public static async downloadBulk(arr: PDF[], progressCallback?: (prog: number) => any): Promise<void> {
		if (arr.length === 0) throw new Error("No PDFs to download");
		if (arr.length === 1) {
			return arr[0].download();
		}

		// Use queue to limit number of concurrent requests
		const namesArr: string[] = [];
		const requestArr = arr.map((pdf) => async () => {
			let expoTime = 1000;
			const body: PDFRequest = PDFTypeWrap("registration", {
				isMultiple: false,
				data: {
					url: PDF.TemplateFileName[pdf.student.class_id],
					student: pdf.student,
					teachersName: pdf.teachersName,
					instrument: pdf.instrument,
				}
			});
			while (expoTime <= 8000) {
				try {
					let resp = await fetch(PDF.PDFWorkerURL, {
						method: "POST",
						headers: {
							"Authorization": `Bearer ${getCookie("session_id")}`
						},
						body: JSON.stringify(body)
					});
					if (resp.status >= 400)
						throw new Error("Server Error");

					const imgBlob = await resp.blob();
					let fileName = pdf.getFileName();
					if (!namesArr.includes(fileName)) {
						namesArr.push(fileName);
					} else {
						let i = 1;
						while (namesArr.includes(fileName.replace(".pdf", ` (${i}).pdf`))) {
							i++;
						}
						fileName = fileName.replace(".pdf", ` (${i}).pdf`);
					}
					return { input: imgBlob, name: fileName, size: imgBlob.size };
				} catch (e) {
					console.error(e);
					await sleep(expoTime);
					expoTime *= 2;
				}
			}
			throw new Error("Server Timeout");
		});
		let t = Date.now();
		let queueResult = await asyncQueue(requestArr, { maxJobs: 6, verbose: true, progressCallback, progressOnThrow: true });
		console.log("Queue took", Date.now() - t);

		let z = zip as typeof zip;
		const zipFile = await z.downloadZip(queueResult).blob();

		let a = document.createElement("a");
		a.href = URL.createObjectURL(zipFile);
		a.download = `Εγγραφές.zip`;
		a.click();
		a.remove();
	}

	public static async convertFirstPageToImage(file: ArrayBuffer | string): Promise<string> {
		const { getDocument, GlobalWorkerOptions } = await dynamicImport<typeof import("pdfjs-dist")>("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.mjs", "pdfjsLib");
		if (!GlobalWorkerOptions.workerSrc)
			GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs';

		// Load the PDF document
		const pdf = await getDocument({ data: file }).promise;

		// Get the first page
		const page = await pdf.getPage(1);

		// Set up a canvas with page dimensions
		const viewport = page.getViewport({ scale: 1 });
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d')!;
		canvas.width = viewport.width;
		canvas.height = viewport.height;

		// Render the page onto the canvas
		await page.render({
			canvasContext: context,
			viewport: viewport,
		}).promise;

		// Convert the canvas to a data URL
		return canvas.toDataURL('image/png');
	}

}

export const loadXLSX = async () => {
	if (window["XLSX"]) return window["XLSX"];
	await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", () => !!window["XLSX"]);
	await sleep(100);
	return window["XLSX"];
};
