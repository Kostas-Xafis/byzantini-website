import type { Locations } from "../../types/entities";
import { Bucket } from "../bucket";
import { execTryCatch, executeQuery, generateLink, questionMarks } from "../utils.server";
import { LocationsRoutes } from "./locations.client";


const bucketPrefix = "spoudastiria/";

// Include this in all .server.ts files
const serverRoutes = JSON.parse(JSON.stringify(LocationsRoutes)) as typeof LocationsRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _ctx => {
	return await execTryCatch(() => executeQuery<Locations>("SELECT * FROM locations"));
};

serverRoutes.getById.func = async ctx => {
	return await execTryCatch(async () => {
		const ids = await ctx.request.json();
		const [location] = await executeQuery<Locations>("SELECT * FROM locations WHERE id = ?", ids);
		if (!location) throw Error("Location not found");
		return location;
	});
};

serverRoutes.getByPriority.func = async _ctx => {
	return await execTryCatch(() => executeQuery<Locations>("SELECT * FROM locations ORDER BY priority ASC"));
};


serverRoutes.post.func = async ctx => {
	return await execTryCatch(async () => {
		const body = await ctx.request.json();
		const args = Object.values(body);
		const { insertId } = await executeQuery(
			`INSERT INTO locations (name, address, areacode, municipality, manager, email, telephones, priority, map, link, youtube, partner) VALUES (${questionMarks(args)})`,
			args
		);
		return { insertId };
	});
};

serverRoutes.update.func = async ctx => {
	return await execTryCatch(async () => {
		const body = await ctx.request.json();
		const args = Object.values(body);
		await executeQuery(`UPDATE locations SET name=?, address=?, areacode=?, municipality=?, manager=?, email=?, telephones=?, priority=?, map=?, link=?, youtube=?, partner=? WHERE id=?`, [
			...args.slice(1),
			body.id
		]);
		return "Location added successfully";
	});
};

const imageMIMEType = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jfif", "image/jpg"];
serverRoutes.fileUpload.func = async (ctx, slug) => {
	return await execTryCatch(async () => {
		const { id } = slug;
		const [location] = await executeQuery<Locations>("SELECT * FROM locations WHERE id = ?", [id]);
		if (!location) throw Error("Teacher not found");
		const blob = await ctx.request.blob();
		const filetype = blob.type;
		const body = await blob.arrayBuffer();
		const link = generateLink(12) + "." + filetype.split("/")[1];
		if (imageMIMEType.includes(filetype)) {
			await Bucket.put(ctx, body, link, filetype);
			await executeQuery(`UPDATE locations SET image = ? WHERE id = ?`, [link, id]);
			return "Image uploaded successfully";
		}
		throw Error("Invalid filetype");
	});
};

serverRoutes.fileDelete.func = async (ctx, slug) => {
	return await execTryCatch(async () => {
		const { id } = slug;
		const [location] = await executeQuery<Locations>("SELECT * FROM locations WHERE id = ?", [id]);
		if (!location) throw Error("Teacher not found");
		if (location.image) await Bucket.delete(ctx, location.image);
		await executeQuery(`UPDATE locations SET image = NULL WHERE id = ?`, [id]);
		return "Image deleted successfully";
	});
};

serverRoutes.delete.func = async ctx => {
	return await execTryCatch(async T => {
		const body = await ctx.request.json();
		const files = await T.executeQuery<Pick<Locations, "image">>(
			`SELECT image FROM locations WHERE id IN (${questionMarks(body)})`,
			body
		);
		for (const file of files) {
			if (file.image) await Bucket.delete(ctx, file.image);
		}
		await T.executeQuery(`DELETE FROM locations WHERE id IN (${questionMarks(body)})`, body);
		return "Locations deleted successfully";
	});
};

export const LocationsServerRoutes = serverRoutes;
