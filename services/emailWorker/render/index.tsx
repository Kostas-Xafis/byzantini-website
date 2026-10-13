import type { ReactElement } from "react";
import {
	SuccessfulRegistration,
	type SuccessfulRegistrationLevel,
} from "./emails/SuccessfulRegistration";
import { SysuserRegisterLink } from "./emails/SysuserRegisterLink";
import { UpenthimisiEggrafis } from "./emails/UpenthimisiEggrafis";
import { EpistrofiMathiton } from "./emails/EpistrofiMathiton";
import { AgiasmosAponomi } from "./emails/AgiasmosAponomi";
import { AgiasmosAponomiKathigites } from "./emails/AgiasmosAponomiKathigites";
import { GoogleReview } from "./emails/GoogleReview";
import { UpenthimisiEggrafisKathigites } from "./emails/UpenthimisiEggrafisKathigites";

/**
 * One static HTML file per class level of the successful-registration email.
 * The website picks the file name (see lib/routes/registrations.server.ts)
 * from the student's class_id / class_year and posts it as htmlTemplateName.
 */
const successfulRegistrationTemplates: {
	name: string;
	level: SuccessfulRegistrationLevel;
}[] = [
	{ name: "epitixis/epitixis_eggrafi.html", level: "default" },
	{ name: "epitixis/epitixis_eggrafi_byzantine.html", level: "byzantine_default" },
	{ name: "epitixis/epitixis_eggrafi_byzantine_e.html", level: "byzantine_e" },
	{ name: "epitixis/epitixis_eggrafi_byzantine_b_diploma.html", level: "byzantine_b_diploma" },
	{ name: "epitixis/epitixis_eggrafi_traditional.html", level: "traditional_default" },
	{
		name: "epitixis/epitixis_eggrafi_traditional_b_anotera.html",
		level: "traditional_b_anotera",
	},
	{
		name: "epitixis/epitixis_eggrafi_traditional_b_diploma.html",
		level: "traditional_b_diploma",
	},
];

export type TemplateDef = {
	/** Output path relative to email/html_templates/. */
	name: string;
	/** Builds the email element with {{placeholder}} values as literal props. */
	build: () => ReactElement;
};

/**
 * Registry of React Email templates, compiled to static HTML by
 * `bun run templates:build` (scripts/buildTemplates.ts).
 */
export const templates: TemplateDef[] = [
	...successfulRegistrationTemplates.map(({ name, level }) => ({
		name,
		build: () => (
			<SuccessfulRegistration
				level={level}
				classYear={"{{class_year}}"}
				classType={"{{class_type}}"}
				schoolYear={"{{registration_year}}"}
			/>
		),
	})),
	{
		name: "sysuser_register_link.html",
		build: () => <SysuserRegisterLink token={"{{token}}"} />,
	},
	{
		name: "2026/upenthimisi_eggrafis.html",
		build: () => (
			<UpenthimisiEggrafis
				token={"{{token}}"}
				regid={"{{regid}}"}
				am={"{{am}}"}
				first_name={"{{first_name}}"}
				last_name={"{{last_name}}"}
			/>
		),
	},
	{
		name: "2026/epistrofi_mathiton.html",
		build: () => <EpistrofiMathiton token={"{{token}}"} />,
	},
	{
		name: "2026/google_review.html",
		build: () => <GoogleReview token={"{{token}}"} first_name={"{{first_name}}"} />,
	},
	{
		name: "2026/upenthimisi_eggrafis_kathigites.html",
		build: () => <UpenthimisiEggrafisKathigites greeting={"{{greeting}}"} />,
	},
	{
		name: "2026/agiasmos_aponomi.html",
		build: () => <AgiasmosAponomi token={"{{token}}"} />,
	},
	{
		name: "2026/agiasmos_aponomi_kathigites.html",
		build: () => <AgiasmosAponomiKathigites />,
	},
];
