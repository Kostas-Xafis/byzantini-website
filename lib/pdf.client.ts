import type { Registrations } from "../types/entities";
//@ts-ignore
import * as zip from "https://cdn.jsdelivr.net/npm/client-zip/index.js";
import { asyncQueue, loadScript, looseStringEquals, sleep } from "./utils.client";

export class PDF {
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
		const imgBlob = await (await fetch("https://byz-pdfworker-1063742578003.europe-west1.run.app/" + this.student.class_id, {
			method: "POST",
			body: JSON.stringify({
				student: this.student,
				teachersName: this.teachersName,
				instrument: this.instrument,
			})
		})).blob();

		let a = document.createElement("a");
		a.href = URL.createObjectURL(imgBlob);
		a.download = `${this.student.first_name}_${this.student.last_name}.pdf`;
		a.click();
	}

	public static async downloadBulk(arr: PDF[], progressCallback?: (prog: number) => any): Promise<void> {
		const namesArr: string[] = [];
		const requestArr = arr.map((pdf) => async () => {
			// let failTest = Math.random() > .75;
			let expoTime = 1000;
			while (expoTime < 8000) {
				try {
					let resp = await fetch("https://byz-pdfworker-1063742578003.europe-west1.run.app/" + pdf.student.class_id, {
						method: "POST",
						body: JSON.stringify({
							student: pdf.student,
							teachersName: pdf.teachersName,
							instrument: pdf.instrument,
						})
					});
					if (resp.status >= 400) {
						throw new Error("Server Error");
					}
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
