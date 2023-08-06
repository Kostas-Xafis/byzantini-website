import { SysUsersRoutes } from "./sysusers.client";
import { Transaction, createSessionId, execTryCatch, executeQuery, generateLink, questionMarks } from "../utils";
import type { SysUserRegisterLink, SysUsers } from "../../types/entities";
import { getSessionId } from "../middleware/authentication";

const serverRoutes = JSON.parse(JSON.stringify(SysUsersRoutes)) as typeof SysUsersRoutes;


serverRoutes.get.func = async (req) => {
    return await execTryCatch(() => executeQuery<Pick<SysUsers, "id" | "email" | "privilege">>("SELECT id, email, privilege FROM sys_users"));
}

serverRoutes.getBySid.func = async (req) => {
    return await execTryCatch(async () => {
        const session_id = getSessionId(req) as string;
        const [user] = await executeQuery<SysUsers>("SELECT * FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
        return user;
    });
}

serverRoutes.post.func = async function (req) {
    return await execTryCatch(async () => {
        const body = await req.json();
        const args = Object.values(body);
        const { session_id, session_exp_date } = createSessionId();
        args.push(session_id, session_exp_date);
        await executeQuery(
            `INSERT INTO sys_users (email, password, role, session_id, session_exp_date) VALUES (${questionMarks(args.length)})`,
            args
        );
        return { session_id };
    });
}

serverRoutes.delete.func = async function (req) {
    return await execTryCatch(async () => {
        let body = await req.json();
        const session_id = getSessionId(req) as string;
        const [{ id, privilege }] = await executeQuery<Pick<SysUsers, "id" | "privilege">>("SELECT id, privilege FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
        if (body.includes(id)) {
            body = body.filter(id => id !== id);
            await executeQuery(`DELETE FROM sys_users WHERE id = ?`, [id]);
            if (body.length === 0) return "Deleted self successfully";
        }
        if (body.length === 1) await executeQuery(`DELETE FROM sys_users WHERE id = ? AND privilege < ?`, [body[0], privilege]);
        else await executeQuery(`DELETE FROM sys_users WHERE id IN (${questionMarks(body.length)}) AND privelege < ?`, [...body, privilege]);
        return "User/s deleted successfully";
    });
}


serverRoutes.registerSysUser.func = async function (req, slug) {
    const { link } = slug;
    return await execTryCatch(async (T: Transaction) => {
        const linkCheck = await T.executeQuery<SysUserRegisterLink>("SELECT * FROM sys_user_register_links WHERE link = ?", [link]);
        if (linkCheck.length === 0) {
            throw new Error("Invalid Link");
        } else if (linkCheck[0].exp_date < Date.now()) {
            await T.executeQuery("DELETE FROM sys_user_register_links WHERE link = ?", [link]);
            throw new Error("Invalid Link");
        }
        const args = Object.values(await req.json()) as any[];
        const { session_id, session_exp_date } = createSessionId();
        args.push(linkCheck[0].privilege, session_id, session_exp_date); 5
        await T.executeQuery(`INSERT INTO sys_users (email, password, privilege, session_id, session_exp_date) VALUES (${questionMarks(args.length)})`, args);
        return { session_id };
    });
};


serverRoutes.createRegisterLink.func = async function (req) {
    return await execTryCatch(async () => {
        const link = generateLink();
        const exp_date = Date.now() + 1000 * 60 * 60 * 24;
        const session_id = getSessionId(req);
        const [{ privilege }] = await executeQuery<Pick<SysUsers, "privilege">>("SELECT privilege FROM sys_users WHERE session_id = ? LIMIT 1", [session_id]);
        await executeQuery("INSERT INTO sys_user_register_links (link, exp_date, privilege) VALUES (?, ?, ?)", [link, exp_date, privilege - 1]);
        return { link };
    });
};

serverRoutes.validateRegisterLink.func = async function (req, slug) {
    return await execTryCatch(async () => {
        const { link } = slug;
        const [{ exp_date }] = await executeQuery<Pick<SysUserRegisterLink, "exp_date">>("SELECT exp_date FROM sys_user_register_links WHERE link = ? LIMIT 1", [
            link
        ]);
        if (!exp_date) throw new Error("Invalid Link");
        if (exp_date < Date.now()) {
            await executeQuery("DELETE FROM sys_user_register_links WHERE link = ?", [link]);
            throw new Error("Invalid Link");
        }
        return { isValid: true };
    });
}


export const SysUsersServerRoutes = serverRoutes;
