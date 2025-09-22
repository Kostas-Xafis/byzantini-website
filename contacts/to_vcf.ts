import type { Registrations } from '../types/entities';
import { createDbConnection } from '../lib/db';


async function loadRegistrations() {
    try {
        const db = await createDbConnection("sqlite-prod");

        const query = `SELECT * FROM registrations WHERE registration_year = '2024-2025' AND class_id=1 GROUP BY cellphone`;
        const result = (await db.execute({ sql: query, args: [] })).rows as any as Registrations[];
        return result;
    } catch (error) {
        throw new Error(`Failed to load registrations: \n\t\t${error}`);
    }
}

function toVCard(contact: Registrations): string {
    return `BEGIN:VCARD
VERSION:3.0
N:${contact.last_name};${contact.first_name};;;
FN:${contact.first_name} ${contact.last_name}
EMAIL:${contact.email} ${(contact.telephone !== "-" && contact.telephone !== contact.cellphone) ? `\nTEL;TYPE=HOME:${contact.telephone}` : ''}
TEL;TYPE=CELL:${contact.cellphone}
END:VCARD
`;
}

function trim(reg: Registrations): Registrations {
    return {
        ...reg,
        first_name: reg.first_name.trim(),
        last_name: reg.last_name.trim(),
        email: reg.email.trim(),
        telephone: reg.telephone.trim(),
        cellphone: reg.cellphone.trim(),
        registration_year: reg.registration_year.trim(),
        class_id: reg.class_id,
        amka: reg.amka ? reg.amka.trim() : ''
    };
}


async function to_vcf_file(loader: () => Promise<Registrations[] | undefined>) {
    try {
        const registrations = await loader();
        if (!registrations || registrations.length === 0) {
            console.error("No registrations found for the specified criteria.");
            return;
        }

        const vcf_string = registrations.map(trim).map(toVCard).join('\n');

        const fs = require('fs/promises');
        const path = require('path');
        const vcfFilePath = path.join(__dirname, 'registrations.vcf');
        await fs.writeFile(vcfFilePath, vcf_string, 'utf8');
        console.log(`VCF file created successfully at ${vcfFilePath}`);
    } catch (error) {
        console.error(`Error creating VCF file: \n\t${error}`);
    }
}
to_vcf_file(loadRegistrations);