import type { Registrations } from "../../types/entities";
import { RegistrationsRoutes } from "./registrations.client";
import { Transaction, execTryCatch, executeQuery, questionMarks } from "../utils";

// Include this in all .server.ts files
const serverRoutes = JSON.parse(JSON.stringify(RegistrationsRoutes)) as typeof RegistrationsRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _req => {
    return await execTryCatch(() => executeQuery<Registrations>("SELECT * FROM registrations"));
};

serverRoutes.post.func = async function (req) {
    return await execTryCatch(async (T: Transaction) => {
        const body = await req.json();
        const args = Object.values(body);
        await T.executeQuery(
            `INSERT INTO registrations (last_name, first_name, am, fathers_name, telephone, cellphone, email, birth_year, road, number, tk, region, registration_year, class_year, teacher_id, class_id, instrument_id, date) VALUES (${questionMarks(args.length)})`,
            args
        );
        return "Registrated successfully";
    });
};

serverRoutes.delete.func = async function (req) {
    return await execTryCatch(async () => {
        const body = await req.json();
        if (body.length === 1) await executeQuery(`DELETE FROM registrations WHERE id = ?`, body);
        else await executeQuery(`DELETE FROM registrations WHERE id IN (${questionMarks(body.length)})`, body);
        return "Book deleted successfully";
    });
};

export const RegistrationsServerRoutes = serverRoutes;
