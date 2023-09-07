import type { Registrations } from "../types/entities";
import { sleep } from "./utils.client";

export class PDF {
    private static font: ArrayBuffer;
    private static TemplateURL = ["/byz_template.pdf", "/par_template.pdf", "/eur_template.pdf"]
    private student = {} as Registrations;
    private teachersName = "";
    private instrument = "";
    private doc = {} as typeof window.PDFLib.PDFDocument.prototype;

    constructor() { };

    public setTemplateData(student: Registrations, teachersName: string, instrument?: string): PDF {
        this.student = student;
        this.teachersName = teachersName;
        this.instrument = instrument || "";
        return this;
    }

    public async fillTemplate(): Promise<void> {
        const p = this.doc.getPages()[0];
        console.log(p);
        const c = ByzTemplateCoords;
        this.doc.registerFontkit(window.fontkit);
        const DidactGothicFont = await this.doc.embedFont(await (await fetch("/fonts/ANAKTORIA.OTF")).arrayBuffer());
        const fontSize = 14;
        let s = this.student;
        p.drawText("" + s.am, { x: c.am.x, y: c.am.y, size: fontSize, font: DidactGothicFont, });
        p.drawText("" + s.last_name, { x: c.lastName.x, y: c.lastName.y, size: fontSize, font: DidactGothicFont });
        p.drawText("" + s.first_name, { x: c.firstName.x, y: c.firstName.y, size: fontSize, font: DidactGothicFont });
        p.drawText("" + s.fathers_name, { x: c.fathersName.x, y: c.fathersName.y, size: fontSize, font: DidactGothicFont });
        p.drawText("" + s.road, { x: c.road.x, y: c.road.y, size: fontSize, font: DidactGothicFont });
        p.drawText("" + s.number, { x: c.number.x, y: c.number.y, size: fontSize, font: DidactGothicFont });
        p.drawText("" + s.tk, { x: c.tk.x, y: c.tk.y, size: fontSize, font: DidactGothicFont });
        p.drawText("" + s.region, { x: c.region.x, y: c.region.y, size: fontSize, font: DidactGothicFont });
        p.drawText("" + (new Date(s.birth_date)).getFullYear(), { x: c.birthDate.x, y: c.birthDate.y, size: fontSize, font: DidactGothicFont });
        p.drawText("" + s.telephone, { x: c.telephone.x, y: c.telephone.y, size: fontSize, font: DidactGothicFont });
        p.drawText("" + s.cellphone, { x: c.cellphone.x, y: c.cellphone.y, size: fontSize, font: DidactGothicFont });
        p.drawText("" + s.email, { x: c.email.x, y: c.email.y, size: fontSize, font: DidactGothicFont });
        p.drawText("" + s.registration_year, { x: c.registrationYear.x, y: c.registrationYear.y, size: fontSize, font: DidactGothicFont });
        p.drawText("" + s.class_year, { x: c.classYear.x, y: c.classYear.y, size: fontSize, font: DidactGothicFont });
        p.drawText("" + this.teachersName, { x: c.teachersName.x, y: c.teachersName.y, size: fontSize, font: DidactGothicFont });

        const date = new Date(s.date);
        let month = (date.getMonth() + 1) + "";
        month = month.length === 1 ? "0" + month : month;

        let day = date.getDate() + "";
        day = day.length === 1 ? "0" + day : day;

        let year = (date.getFullYear() % 100) + "";
        year = year.length === 1 ? "0" + year : year;

        p.drawText(day, { x: c.dateDD.x, y: c.dateDD.y, size: fontSize, font: DidactGothicFont });
        p.drawText(month, { x: c.dateMM.x, y: c.dateMM.y, size: fontSize, font: DidactGothicFont });
        p.drawText(year, { x: c.dateYYYY.x, y: c.dateYYYY.y, size: fontSize, font: DidactGothicFont });

        p.drawText("23", { x: c.year1.x, y: c.year1.y, size: fontSize, font: DidactGothicFont });
        p.drawText("24", { x: c.year2.x, y: c.year2.y, size: fontSize, font: DidactGothicFont });
    }

    public async loadTemplate(): Promise<void> {
        let buffer = await (await fetch(this.getTemplateURL())).arrayBuffer();
        this.doc = await window.PDFLib.PDFDocument.load(buffer);
    }

    public static async loadPDFLib(): Promise<void> {
        if (window.PDFLib) return;

        let s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
        s.setAttribute("defer", "");
        document.body.appendChild(s);

        s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js";
        s.setAttribute("defer", "");
        document.body.appendChild(s);

        while (!window.PDFLib || !window.fontkit) await sleep(100);
    }

    public async download(): Promise<void> {
        let uintArr = await this.doc.save();
        let blob = new Blob([uintArr], { type: "application/pdf" });

        let a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${this.student.first_name}_${this.student.last_name}.pdf`;
        a.click();
    }

    public getTemplateURL(): string {
        return PDF.TemplateURL[this.student.class_id];
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
    instrument?: { x: number, y: number },
}

const pdfHeight = 841.89;
const H = (y: number) => pdfHeight - y;
const ByzTemplateCoords: TemplateCoords = {
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
    year2: { x: 480, y: 436 }
}
Object.values(ByzTemplateCoords).forEach(v => v.y = H(v.y));