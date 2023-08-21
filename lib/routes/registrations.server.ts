import type { Registrations } from "../../types/entities";
import { RegistrationsRoutes } from "./registrations.client";
import { Transaction, execTryCatch, executeQuery, questionMarks } from "../utils";

// Include this in all .server.ts files
const serverRoutes = JSON.parse(JSON.stringify(RegistrationsRoutes)) as typeof RegistrationsRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _req => {
    return await execTryCatch(() => executeQuery<Registrations>("SELECT * FROM registrations"));
};

serverRoutes.getTotal.func = async _req => {
    return await execTryCatch(async () => (await executeQuery<{ total: number }>("SELECT amount AS total FROM total_registrations"))[0]);
};

serverRoutes.post.func = async function (req) {
    return await execTryCatch(async (T: Transaction) => {
        const body = await req.json();
        const [student] = await T.executeQuery<{ id: number }>("SELECT id FROM registrations WHERE am = ? AND first_name = ? AND instrument_id = ? AND cellphone = ? LIMIT 1", [
            body.am,
            body.first_name,
            body.instrument_id,
            body.cellphone
        ]);
        if (!student) {
            const args = Object.values(body);
            await T.executeQuery(
                `INSERT INTO registrations (last_name, first_name, am, fathers_name, telephone, cellphone, email, birth_year, road, number, tk, region, registration_year, class_year, teacher_id, class_id, instrument_id, date) VALUES (${questionMarks(args.length)})`,
                args
            );
            const [total_registrations] = await T.executeQuery<{ amount: number }>("SELECT amount FROM total_registrations");
            await T.executeQuery('UPDATE registrations SET id = ? WHERE am = ? AND first_name = ? AND instrument_id = ? AND cellphone = ? LIMIT 1', [total_registrations.amount + 1, body.am, body.first_name, body.instrument_id, body.cellphone]);
            await T.executeQuery("UPDATE total_registrations SET amount = amount + 1");
        } else {
            return "Registration already made";
        }

        return "Registrated successfully";
    });
};

serverRoutes.update.func = async function (req) {
    return await execTryCatch(async (T: Transaction) => {
        const body = await req.json();
        const args = Object.values(body);
        args.shift(); // Remove the id from the arguments
        await T.executeQuery(`UPDATE registrations SET last_name = ?, first_name = ?, am = ?, fathers_name = ?, telephone = ?, cellphone = ?, email = ?, birth_year = ?, road = ?, number = ?, tk = ?, region = ?, registration_year = ?, class_year = ?, date = ?, payment_amount = ? WHERE id = ?`, [...args, body.id]);
        return "Registration updated successfully";
    });
};
serverRoutes.complete.func = async function (req) {
    return await execTryCatch(async () => {
        const body = await req.json();
        if (body.length === 1) await executeQuery(`DELETE FROM registrations WHERE id = ?`, body);
        else await executeQuery(`DELETE FROM registrations WHERE id IN (${questionMarks(body.length)})`, body);
        return "Registration completed successfully";
    });
};

export const RegistrationsServerRoutes = serverRoutes;
