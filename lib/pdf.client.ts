import type { Registrations } from "../types/entities";
//@ts-ignore
import * as zip from "https://cdn.jsdelivr.net/npm/client-zip/index.js";
import { UpdateHandler, asyncQueue, loadScript, sleep } from "./utils.client";


const DidactGothicFontBufffer = await (await fetch("/fonts/DidactGothic-Regular.ttf")).arrayBuffer();

const TemplateCache = new Map<string, ArrayBuffer>();

export class PDF {
	private static TemplateURL = ["/byz_template.pdf", "/par_template.pdf", "/eur_template.pdf"];
	private student: Registrations = {} as Registrations;
	private teachersName: string = "";
	private instrument: string = "";
	private doc = {} as typeof window.PDFLib.PDFDocument.prototype;
	constructor() { };

	public setTemplateData(student: Registrations, teachersName: string, instrument?: string): PDF {
		this.student = student;
		this.teachersName = teachersName;
		this.instrument = instrument || "";
		return this;
	}

	public getTemplateURL(): string {
		return PDF.TemplateURL[this.student.class_id];
	}

	public async fillTemplate(): Promise<void> {
		let url = this.getTemplateURL();
		if (!TemplateCache.has(url)) {
			let res = await fetch(url);
			TemplateCache.set(url, await res.arrayBuffer() as ArrayBuffer);
		}
		this.doc = await window.PDFLib.PDFDocument.load(TemplateCache.get(url) as ArrayBuffer);
		const p = this.doc.getPages()[0];
		const c = TemplateCoords;

		this.doc.registerFontkit(window.fontkit);
		const font = await this.doc.embedFont(DidactGothicFontBufffer);

		const fontSize = 14;
		const smFontSize = 12;
		const xsFontSize = 11;
		let s = this.student;
		p.drawText("" + s.am, { x: c.am.x, y: c.am.y, size: fontSize, font });
		p.drawText("" + s.last_name, { x: c.lastName.x, y: c.lastName.y, size: fontSize, font });
		p.drawText("" + s.first_name, { x: c.firstName.x, y: c.firstName.y, size: fontSize, font });
		p.drawText("" + s.fathers_name, { x: c.fathersName.x, y: c.fathersName.y, size: fontSize, font });
		p.drawText("" + s.road, { x: c.road.x, y: c.road.y, size: fontSize, font });
		p.drawText("" + s.number, { x: c.number.x, y: c.number.y, size: fontSize, font });
		p.drawText("" + s.tk, { x: c.tk.x, y: c.tk.y, size: fontSize, font });
		p.drawText("" + s.region, { x: c.region.x, y: c.region.y, size: fontSize, font });
		p.drawText("" + (new Date(s.birth_date)).getFullYear(), { x: c.birthDate.x, y: c.birthDate.y, size: fontSize, font });
		p.drawText("" + s.telephone, { x: c.telephone.x, y: c.telephone.y, size: fontSize, font });
		p.drawText("" + s.cellphone, { x: c.cellphone.x, y: c.cellphone.y, size: fontSize, font });
		p.drawText("" + s.email, { x: c.email.x, y: c.email.y, size: fontSize, font });
		p.drawText("" + s.registration_year, { x: c.registrationYear.x, y: c.registrationYear.y, size: fontSize, font });
		p.drawText("" + s.class_year, { x: c.classYear.x, y: c.classYear.y, size: fontSize, font });
		p.drawText("" + this.teachersName, { x: c.teachersName.x, y: c.teachersName.y, size: this.teachersName.length <= 24 ? fontSize : (this.teachersName.length <= 30 ? smFontSize : xsFontSize), font });

		const date = new Date(s.date);
		let month = (date.getMonth() + 1) + "";
		month = month.length === 1 ? "0" + month : month;

		let day = date.getDate() + "";
		day = day.length === 1 ? "0" + day : day;

		let year = (date.getFullYear() % 100) + "";
		year = year.length === 1 ? "0" + year : year;

		p.drawText(day, { x: c.dateDD.x, y: c.dateDD.y, size: fontSize, font });
		p.drawText(month, { x: c.dateMM.x, y: c.dateMM.y, size: fontSize, font });
		p.drawText(year, { x: c.dateYYYY.x, y: c.dateYYYY.y, size: fontSize, font });

		p.drawText("23", { x: c.year1.x, y: c.year1.y, size: fontSize, font });
		p.drawText("24", { x: c.year2.x, y: c.year2.y, size: fontSize, font });

		if (this.instrument.length > 15) {
			p.drawText(this.instrument, { x: c.instrumentLarge.x, y: c.instrumentLarge.y, size: fontSize, font });
		} else {
			if (this.student.class_id === 1) p.drawText(this.instrument, { x: c.instrumentPar.x, y: c.instrumentPar.y, size: fontSize, font });
			else if (this.student.class_id === 2) p.drawText(this.instrument, { x: c.instrumentEur.x, y: c.instrumentEur.y, size: fontSize, font });
		}
		if (this.instrument) {
			p.drawText(this.student.first_name + " " + this.student.last_name, { x: c.signatureEur.x, y: c.signatureEur.y, size: fontSize, font });
		} else {
			p.drawText(this.student.first_name + " " + this.student.last_name, { x: c.signatureByz.x, y: c.signatureByz.y, size: fontSize, font });
		}
	}

	private static loadingScript = -1; // -1: not loading, 0: loading, 1: loaded
	public static async createInstance(): Promise<PDF> {
		if (PDF.loadingScript === 0) return new Promise((resolve) => setTimeout(async () => resolve(await PDF.createInstance()), 500));
		else if (PDF.loadingScript === 1) return new PDF();

		if (window.PDFLib) return new PDF();
		PDF.loadingScript = 0;
		await Promise.all([
			loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js", () => !!window["PDFLib"]),
			loadScript("https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js", () => !!window["fontkit"]),
		]);
		PDF.loadingScript = 1;
		return new PDF();
	}

	public async toBlob(): Promise<Blob> {
		let uintArr = await this.doc.save();
		return new Blob([uintArr], { type: "application/pdf" });
	}

	public async toFile(): Promise<Blob> {
		let uintArr = await this.doc.save();
		return new File([uintArr], this.getFileName(), { type: "application/pdf" });
	}

	public getFileName(): string {
		return `${this.teachersName}/${this.student.first_name}_${this.student.last_name}.pdf`;
	}

	public async download(): Promise<void> {
		let a = document.createElement("a");
		a.href = URL.createObjectURL(await this.toBlob());
		a.download = `${this.student.first_name}_${this.student.last_name}.pdf`;
		a.click();
	}

	public static async downloadBulk(arr: PDF[], progressCallback?: (prog: number) => any): Promise<void> {
		let serverTimeout = false;
		const updateHandler = UpdateHandler.createInstance(5000);
		updateHandler.setBackoff(5000, 2);
		updateHandler.setFunction(() => {
			serverTimeout = false;
		});

		let requestArr = arr.map((pdf) => async () => {
			let res;
			if (!serverTimeout && Math.random() > 0.725) {
				try {
					let resp = await fetch("https://pdf-create.koxafis.workers.dev/" + pdf.student.class_id, {
						method: "POST",
						body: JSON.stringify({
							student: pdf.student,
							teachersName: pdf.teachersName,
							instrument: pdf.instrument,
						})
					});
					if (resp.status >= 400) throw new Error("Server error");
					res = await resp.blob();
				} catch (e) {
					serverTimeout = true;
					if (!updateHandler.isTriggered()) {
						updateHandler.trigger().catch(console.error);
					} else {
						updateHandler.reset({});
					}
				}
			}
			if (!res) {
				await pdf.fillTemplate();
				let file = await pdf.toFile();
				return { input: file, name: pdf.getFileName(), size: file.size };
			} else {
				return { input: res, name: pdf.getFileName(), size: res.size };
			}
		});
		let t = Date.now();
		let queueResult = await asyncQueue(requestArr, { maxJobs: 6, verbose: true, progressCallback });
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

type Coords = { x: number, y: number; };
type TemplateCoords = {
	am: Coords,
	lastName: Coords,
	firstName: Coords,
	fathersName: Coords,
	road: Coords,
	number: Coords,
	tk: Coords,
	region: Coords,
	birthDate: Coords,
	telephone: Coords,
	cellphone: Coords,
	email: Coords,
	registrationYear: Coords,
	classYear: Coords,
	teachersName: Coords,
	dateDD: Coords,
	dateMM: Coords,
	dateYYYY: Coords,
	year1: Coords,
	year2: Coords,
	instrumentPar: Coords,
	instrumentEur: Coords,
	instrumentLarge: Coords,
	signatureByz: Coords,
	signatureEur: Coords,
};

const pdfHeight = 841.89;
const H = (y: number) => pdfHeight - y;
const TemplateCoords: TemplateCoords = {
	am: { x: 140, y: 260 },
	lastName: { x: 105, y: 285 },
	firstName: { x: 85, y: 310 },
	fathersName: { x: 130, y: 335 },
	birthDate: { x: 130, y: 361 },
	road: { x: 75, y: 412 },
	number: { x: 112.5, y: 438 },
	tk: { x: 200, y: 438 },
	region: { x: 148, y: 463 },
	telephone: { x: 128, y: 490 },
	cellphone: { x: 115, y: 515 },
	email: { x: 80, y: 540 },
	registrationYear: { x: 110, y: 566 },
	classYear: { x: 135, y: 591 },
	teachersName: { x: 115, y: 619 },
	dateDD: { x: 164, y: 736 },
	dateMM: { x: 193, y: 736 },
	dateYYYY: { x: 237, y: 736 },
	year1: { x: 418, y: 436 },
	year2: { x: 480, y: 436 },
	instrumentPar: { x: 475, y: 488 },
	instrumentEur: { x: 420, y: 489 },
	instrumentLarge: { x: 325, y: 513 },
	signatureByz: { x: 360, y: 622 },
	signatureEur: { x: 360, y: 662 },
};
Object.values(TemplateCoords).forEach(v => v.y = H(v.y));



export const loadXLSX = async () => {
	if (window["XLSX"]) return window["XLSX"];
	await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", () => !!window["XLSX"]);
	await sleep(100);
	return window["XLSX"];
};
