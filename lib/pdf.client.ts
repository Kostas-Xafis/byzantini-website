import type { Registrations } from "../types/entities";
import type { PDFRequestType } from "../pdfWorker/src/types";
//@ts-ignore
import * as zip from "https://cdn.jsdelivr.net/npm/client-zip/index.js";
import { asyncQueue, getCookie, loadScript, looseStringEquals, sleep } from "./utils.client";

export class PDF {
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

	public async download(): Promise<void> {
		const body: PDFRequestType<false> = {
			isMultiple: false,
			data: {
				student: this.student,
				teachersName: this.teachersName,
				instrument: this.instrument,
			}
		};
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

	public async print() {
		await loadScript("https://cdnjs.cloudflare.com/ajax/libs/print-js/1.6.0/print.min.js", () => !!window["printJS"]);
		const body: PDFRequestType<false> = {
			isMultiple: false,
			data: {
				student: this.student,
				teachersName: this.teachersName,
				instrument: this.instrument,
			}
		};
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
		await loadScript("https://cdnjs.cloudflare.com/ajax/libs/print-js/1.6.0/print.min.js", () => !!window["printJS"]);
		const body: PDFRequestType<true> = {
			isMultiple: true,
			data: pdfs.map((pdf) => ({
				student: pdf.student,
				teachersName: pdf.teachersName,
				instrument: pdf.instrument,
			}))
		};
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

	public static async downloadBulk(arr: PDF[], progressCallback?: (prog: number) => any): Promise<void> {
		const namesArr: string[] = [];
		const requestArr = arr.map((pdf) => async () => {
			let expoTime = 1000;
			const body: PDFRequestType<false> = {
				isMultiple: false,
				data: {
					student: pdf.student,
					teachersName: pdf.teachersName,
					instrument: pdf.instrument,
				}
			};
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
}

export const loadXLSX = async () => {
	if (window["XLSX"]) return window["XLSX"];
	await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", () => !!window["XLSX"]);
	await sleep(100);
	return window["XLSX"];
};
