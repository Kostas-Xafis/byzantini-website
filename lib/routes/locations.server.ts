import type { Locations } from "../../types/entities";
import { LocationsRoutes } from "./locations.client";
import { Transaction, execTryCatch, executeQuery, generateLink, questionMarks } from "../utils";
import { bucketFileUpload } from "../bucket/fileUpload";
import { bucketFileDelete } from "../bucket/fileDelete";

// Include this in all .server.ts files
let serverRoutes = JSON.parse(JSON.stringify(LocationsRoutes)) as typeof LocationsRoutes; // Copy the routes object to split it into client and server routes

serverRoutes.get.func = async _req => {
	return await execTryCatch(() => executeQuery<Locations>("SELECT * FROM locations"));
};

serverRoutes.post.func = async req => {
	return await execTryCatch(async () => {
		const body = await req.json();
		const args = Object.values(body);
		const { insertId } = await executeQuery(
			`INSERT INTO locations (name, address, number, areacode, municipality, link) VALUES (${questionMarks(args.length)})`,
			args
		);
		return { insertId };
	});
};

serverRoutes.update.func = async req => {
	return await execTryCatch(async () => {
		const body = await req.json();
		const args = Object.values(body);
		await executeQuery(`UPDATE locations SET name=?, address=?, number=?, areacode=?, municipality=?, link=? WHERE id=?`, [
			...args.slice(1),
			body.id
		]);
		return "Location added successfully";
	});
};

const imageMIMEType = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jfif", "image/jpg"];
serverRoutes.fileUpload.func = async (req, slug) => {
	return await execTryCatch(async () => {
		const { id } = slug;
		const [location] = await executeQuery<Locations>("SELECT * FROM locations WHERE id = ?", [id]);
		if (!location) throw Error("Teacher not found");
		const blob = await req.blob();
		const filetype = blob.type;
		const body = await blob.arrayBuffer();
		const link = generateLink(12) + "." + filetype.split("/")[1];
		if (imageMIMEType.includes(filetype)) {
			if (location.image) await bucketFileDelete(location.image);
			await bucketFileUpload(Buffer.from(body), link, filetype);
			await executeQuery(`UPDATE locations SET image = ? WHERE id = ?`, [link, id]);
			return "Image uploaded successfully";
		}
		throw Error("Invalid filetype");
	});
};

serverRoutes.fileDelete.func = async req => {
	return await execTryCatch(async () => {
		const body = await req.json();
		const [location] = await executeQuery<Locations>("SELECT * FROM locations WHERE id = ?", [body.id]);
		if (!location) throw Error("Teacher not found");
		if (location.image) await bucketFileDelete(location.image);
		await executeQuery(`UPDATE locations SET image = NULL WHERE id = ?`, [body.id]);
		return "Image deleted successfully";
	});
};

serverRoutes.delete.func = async req => {
	return await execTryCatch(async (T: Transaction) => {
		const body = await req.json();
		const files = await T.execute<Pick<Locations, "image">>(
			`SELECT image FROM locations WHERE id IN (${questionMarks(body.length)})`,
			body
		);
		for (const file of files) {
			if (file.image) await bucketFileDelete(file.image);
		}
		await T.execute(`DELETE FROM locations WHERE id IN (${questionMarks(body.length)})`, body);
		return "Locations deleted successfully";
	});
};

export const LocationsServerRoutes = serverRoutes;
