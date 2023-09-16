//@ts-ignore
import { Registrations } from "../../types/entities";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { R2Bucket } from "@cloudflare/workers-types";
export interface Env {
	BUCKET: R2Bucket;
}

export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const corsHeaders = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, OPTIONS",
			"Access-Control-Allow-Headers": "*",
		}

		if (req.method === "OPTIONS") {
			function handleOptions(request: Request) {
				if (request.headers.get("Origin") !== null &&
					request.headers.get("Access-Control-Request-Method") !== null &&
					request.headers.get("Access-Control-Request-Headers") !== null) {
					// Handle CORS pre-flight request.
					return new Response(null, {
						headers: corsHeaders
					})
				} else {
					// Handle standard OPTIONS request.
					return new Response(null, {
						headers: {
							"Allow": "GET, HEAD, POST, OPTIONS",
						}
					})
				}
			}
			return handleOptions(req);
		}

		let slug_id = Number(new URL(req.url).pathname.split("/")[1] || "-1");
		if (isNaN(slug_id)) slug_id = -1;
		if (slug_id < 0 || slug_id > 2) return new Response("Invalid slug_id", { status: 400 });

		const pdf = new PDF(env);
		await pdf.fillTemplate(req, slug_id);

		return new Response(await pdf.getBlob(), {
			headers: {
				...corsHeaders,
				"Content-Type": "application/pdf",
				"Access-Control-Allow-Origin": "*",
			}
		});
	},
};

export class PDF {
	private static TemplateFileName = ["byz_template.pdf", "par_template.pdf", "eur_template.pdf"]
	private doc = {} as typeof PDFDocument.prototype;
	private env = {} as Env;
	constructor(env: Env) {
		this.env = env;
	};

	public async fillTemplate(req: Request, class_id: number): Promise<void> {
		const [templateBuffer, fontBuffer, body] = await Promise.all([
			(async () =>
				(await this.env.BUCKET.get(this.getTemplateURL(class_id)) as R2ObjectBody).arrayBuffer()
			)(),
			DidactGothicFontBuff(),
			req.json() as Promise<{ student: Registrations; teachersName: string; instrument?: string }>
		]);
		this.doc = await PDFDocument.load(templateBuffer);

		const p = this.doc.getPages()[0];
		const c = TemplateCoords;

		this.doc.registerFontkit(fontkit);
		const font = await this.doc.embedFont(fontBuffer);

		const fontSize = 14;
		const smFontSize = 12;
		const xsFontSize = 11;
		let s = body.student;
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
		p.drawText("" + body.teachersName, { x: c.teachersName.x, y: c.teachersName.y, size: body.teachersName.length <= 24 ? fontSize : (body.teachersName.length <= 30 ? smFontSize : xsFontSize), font });

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

		if (body?.instrument && body.instrument.length > 15) {
			p.drawText(body.instrument, { x: c.instrumentLarge.x, y: c.instrumentLarge.y, size: fontSize, font });
		} else if (body.instrument) {
			if (s.class_id === 1) p.drawText(body.instrument, { x: c.instrumentPar.x, y: c.instrumentPar.y, size: fontSize, font });
			else if (body?.student.class_id === 2) p.drawText(body.instrument, { x: c.instrumentEur.x, y: c.instrumentEur.y, size: fontSize, font });
		}
	}

	public getBlob(): Promise<Uint8Array> {
		return this.doc.save();
	}

	public getTemplateURL(id: number): string {
		return PDF.TemplateFileName[id];
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

const DidactGothicFontBuff = async () => {
	return await (await fetch("https://musicschool-metamorfosi.gr/fonts/DidactGothic-Regular.ttf")).arrayBuffer();
};
