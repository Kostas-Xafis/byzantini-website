import type { JoinedEnrollments } from "@_types/entities";
import type { PDFRequest } from "../services/pdfWorker/src/types";
import { asyncQueue } from "@utilities/AsyncQueue";
import { dynamicImport, loadScript } from "@utilities/scripts";
import { sleep } from "@utilities/sleep";
import { classYearLabel } from "@lib/classYears";
import { APIRequestError, readAPIResponse } from "@lib/api/transport";
//@ts-ignore
import * as zip from "https://cdn.jsdelivr.net/npm/client-zip/index.js";

const PDFTypeWrap = <Type extends PDFRequest["type"]>(type: Type, data: PDFRequest<Type>["request"]) => {
	return {
		type,
		request: data,
	};
};

export class PDF {
	private static TemplateFileName = ["/pdf_templates/byz_template.pdf", "/pdf_templates/par_template.pdf", "/pdf_templates/eur_template.pdf"];
	/**
	 * Same-origin API proxy to the PDF worker (service binding). The session
	 * cookie travels automatically — no Authorization header needed, and the
	 * worker is no longer reachable straight from the browser.
	 */
	private static PDFEndpoint = "/api/pdf";
	private student: JoinedEnrollments = {} as JoinedEnrollments;
	private teachersName: string = "";
	private instrument: string = "";
	private awaitingPlacement = false;
	constructor() {}

	public setTemplateData(student: JoinedEnrollments, teachersName: string, instrument?: string): PDF {
		// The PDF worker prints `class_year` as is: an evaluation row awaiting placement ('') prints «Υπό Κατάταξη».
		this.student = { ...student, class_year: classYearLabel(student.class_year, student.evaluation) };
		this.awaitingPlacement = !!student.evaluation && !student.class_year;
		this.teachersName = teachersName;
		this.instrument = instrument || "";
		return this;
	}

	public getFileName(): string {
		if (this.awaitingPlacement) {
			return `Υπό κατάταξη/${this.student.first_name}_${this.student.last_name}.pdf`;
		}
		return `${this.teachersName}/${this.student.first_name}_${this.student.last_name}.pdf`;
	}

	/**
	 * Posts a request to the PDF route and returns the PDF. Anything else (an error envelope, an empty
	 * body from a worker killed mid-response) throws `APIRequestError`, so it reaches the caller's toast
	 * instead of being saved as a blank .pdf.
	 */
	private static async fetchPDF(body: PDFRequest): Promise<Blob> {
		const response = await fetch(PDF.PDFEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});
		const isPdf = response.ok && (response.headers.get("Content-Type") ?? "").startsWith("application/pdf");
		if (!isPdf) {
			await readAPIResponse(response);
			throw new APIRequestError(response.status, "Αποτυχία δημιουργίας του PDF.", { envelope: false });
		}
		const blob = await response.blob();
		if (blob.size === 0) throw new APIRequestError(response.status, "Αποτυχία δημιουργίας του PDF.", { envelope: false });
		return blob;
	}

	private static loadPrintJS() {
		return loadScript("https://cdnjs.cloudflare.com/ajax/libs/print-js/1.6.0/print.min.js", () => !!window["printJS"]);
	}

	public async print() {
		await PDF.loadPrintJS();
		const body: PDFRequest = PDFTypeWrap("registration", {
			isMultiple: false,
			data: {
				url: PDF.TemplateFileName[this.student.class_id],
				student: this.student,
				teachersName: this.teachersName,
				instrument: this.instrument,
			},
		});
		const imgBlob = await PDF.fetchPDF(body);
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
			})),
		});
		const imgBlob = await PDF.fetchPDF(body);
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
			},
		});
		const imgBlob = await PDF.fetchPDF(body);

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
				},
			});
			while (expoTime <= 8000) {
				try {
					const imgBlob = await PDF.fetchPDF(body);
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
		// let t = Date.now();
		let queueResult = await asyncQueue(requestArr, { maxJobs: 6, verbose: true, progressCallback, progressOnThrow: true });
		// console.log("Queue took", Date.now() - t);

		let z = zip as Window["zip"];
		const zipFile = await z.downloadZip(queueResult).blob();

		let a = document.createElement("a");
		a.href = URL.createObjectURL(zipFile);
		a.download = `Εγγραφές.zip`;
		a.click();
		a.remove();
	}

	public static async convertFirstPageToImage(buffer: Uint8Array): Promise<string> {
		const { getDocument, GlobalWorkerOptions } = await dynamicImport<typeof import("pdfjs-dist")>(
			"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.mjs",
			"pdfjsLib",
		);
		if (!GlobalWorkerOptions.workerSrc) GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs";

		// Load the PDF document
		const pdf = await getDocument({ data: buffer }).promise;

		// Get the first page
		const page = await pdf.getPage(1);

		// Set up a canvas with page dimensions
		const viewport = page.getViewport({ scale: 1 });
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d")!;
		canvas.width = viewport.width;
		canvas.height = viewport.height;

		// Render the page onto the canvas
		await page.render({
			canvasContext: context,
			viewport: viewport,
		}).promise;

		// Convert the canvas to a data URL
		return canvas.toDataURL("image/png");
	}
}

export const loadXLSX = async () => {
	if (window["XLSX"]) return window["XLSX"];
	await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", () => !!window["XLSX"]);
	await sleep(100);
	return window["XLSX"];
};
