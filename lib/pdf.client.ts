import type { Registrations } from "../types/entities";
//@ts-ignore
import * as zip from "https://cdn.jsdelivr.net/npm/client-zip/index.js";
import { asyncQueue, sleep } from "./utils.client";


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

    public static async createInstance(): Promise<PDF> {
        if (window.PDFLib) return new PDF();

        let s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
        s.setAttribute("defer", "");
        document.body.appendChild(s);

        s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js";
        s.setAttribute("defer", "");
        document.body.appendChild(s);

        while (!window.PDFLib || !window.fontkit) await sleep(100);
        return new PDF();
    }

    public async toBlob(): Promise<Blob> {
        let uintArr = await this.doc.save();
        return new Blob([uintArr], { type: "application/pdf" });
    }

    public async download(): Promise<void> {
        let a = document.createElement("a");
        a.href = URL.createObjectURL(await this.toBlob());
        a.download = `${this.student.first_name}_${this.student.last_name}.pdf`;
        a.click();
    }

    public static async downloadBulk(arr: PDF[]): Promise<void> {
        let serverTimeout = false;
        let requestArr = arr.map((pdf) => async () => {
            let res;
            if (!serverTimeout && Math.random() > 0.7) {
                try {
                    let resp = await fetch("https://pdf-create.koxafis.workers.dev/" + pdf.student.class_id, {
                        method: "POST",
                        body: JSON.stringify({
                            student: pdf.student,
                            teachersName: pdf.teachersName,
                            instrument: pdf.instrument,
                        })
                    });
                    res = await resp.blob();
                } catch (e) {
                    serverTimeout = true;
                    setTimeout(() => serverTimeout = false, 1000 * 20);
                }
            }
            if (!res) {
                await pdf.fillTemplate();
                let blob = await pdf.toBlob();
                return { input: blob, name: `${pdf.teachersName}/${pdf.student.first_name}_${pdf.student.last_name}.pdf`, size: blob.size };
            } else {
                return { input: res, name: `${pdf.teachersName}/${pdf.student.first_name}_${pdf.student.last_name}.pdf`, size: res.size };
            }
        });
        let t = Date.now();
        let queueResult = await asyncQueue(requestArr, 6, true)
        console.log("Queue took", Date.now() - t);

        let z = zip as typeof import("client-zip");
        const zipFile = await z.downloadZip(queueResult).blob();

        let a = document.createElement("a");
        a.href = URL.createObjectURL(zipFile);
        a.download = `Εγγραφές.zip`;
        a.click();
        a.remove();
    }
}

type TemplateCoords = {
    am: { x: number, y: number },
    lastName: { x: number, y: number },
    firstName: { x: number, y: number },
    fathersName: { x: number, y: number },
    road: { x: number, y: number },
    number: { x: number, y: number },
    tk: { x: number, y: number },
    region: { x: number, y: number },
    birthDate: { x: number, y: number },
    telephone: { x: number, y: number },
    cellphone: { x: number, y: number },
    email: { x: number, y: number },
    registrationYear: { x: number, y: number },
    classYear: { x: number, y: number },
    teachersName: { x: number, y: number },
    dateDD: { x: number, y: number },
    dateMM: { x: number, y: number },
    dateYYYY: { x: number, y: number },
    year1: { x: number, y: number },
    year2: { x: number, y: number },
    instrumentPar: { x: number, y: number },
    instrumentEur: { x: number, y: number },
    instrumentLarge: { x: number, y: number },
    signatureByz: { x: number, y: number },
    signatureEur: { x: number, y: number },
}

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
}
Object.values(TemplateCoords).forEach(v => v.y = H(v.y));