import type { Registrations } from "../../types/entities";
import { RegistrationsRoutes } from "./registrations.client";
import { Transaction, execTryCatch, executeQuery, questionMarks } from "../utils.server";

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
        const args = Object.values(body);
        await T.executeQuery(
            `INSERT INTO registrations (last_name, first_name, am, fathers_name, telephone, cellphone, email, birth_date, road, number, tk, region, registration_year, class_year, class_id, teacher_id, instrument_id, date) VALUES (${questionMarks(args.length)})`,
            args
        );
        await T.executeQuery("UPDATE total_registrations SET amount = amount + 1");
        return "Registrated successfully";
    });
};

serverRoutes.update.func = async function (req) {
    return await execTryCatch(async () => {
        const body = await req.json();
        const args = Object.values(body);
        args.push(args.shift() as any); // Remove the id from the arguments and push it at the end
        await executeQuery(`UPDATE registrations SET am=?, last_name=?, first_name=?, fathers_name=?, telephone=?, cellphone=?, email=?, birth_date=?, road=?, number=?, tk=?, region=?, registration_year=?, class_year=?, class_id=?, teacher_id=?, instrument_id=?, date=?, payment_amount=?, payment_date=? WHERE id=?`, args);
        return "Registration updated successfully";
    });
};

serverRoutes.complete.func = async function (req) {
    return await execTryCatch(async (T) => {
        const body = await req.json();
        if (body.length === 1) await T.executeQuery(`DELETE FROM registrations WHERE id=?`, body);
        else await T.executeQuery(`DELETE FROM registrations WHERE id IN (${questionMarks(body.length)})`, body);
        await T.executeQuery("UPDATE total_registrations SET amount = amount - ?", [body.length]);
        return "Registration completed successfully";
    });
};

export const RegistrationsServerRoutes = serverRoutes;
