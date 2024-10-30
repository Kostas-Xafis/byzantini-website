import type { Locations } from "../../types/entities";
import { Bucket } from "../bucket";
import { deepCopy } from "../utils.client";
import { ImageMIMEType, execTryCatch, executeQuery, getUsedBody, questionMarks } from "../utils.server";
import { LocationsRoutes } from "./locations.client";


const bucketPrefix = "spoudastiria/";

// Include this in all .server.ts files
const serverRoutes = deepCopy(LocationsRoutes);

serverRoutes.get.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<Locations>("SELECT * FROM locations"), "Σφάλμα κατά την ανάκτηση των σπουδαστηρίων");
};

serverRoutes.getById.func = ({ ctx }) => {
	return execTryCatch(async () => {
		const [id] = getUsedBody(ctx) || await ctx.request.json();
		const [location] = await executeQuery<Locations>("SELECT * FROM locations WHERE id = ?", [id]);
		if (!location) throw Error("Location not found");
		return location;
	});
};

serverRoutes.getByPriority.func = ({ ctx: _ctx }) => {
	return execTryCatch(() => executeQuery<Locations>("SELECT * FROM locations ORDER BY priority ASC"));
};

serverRoutes.post.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const { insertId } = await T.executeQuery(
			`INSERT INTO locations (name, address, areacode, municipality, manager, email, telephones, priority, map, link, youtube, partner) VALUES (???)`,
			body
		);
		return { insertId };
	}, "Σφάλμα κατά την προσθήκη του σπουδαστηρίου");
};

serverRoutes.update.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		await T.executeQuery(`UPDATE locations SET name=?, address=?, areacode=?, municipality=?, manager=?, email=?, telephones=?, priority=?, map=?, link=?, youtube=?, partner=? WHERE id=?`,
			body
		);
		return "Location updated successfully";
	}, "Σφάλμα κατά την ενημέρωση του σπουδαστηρίου");
};

serverRoutes.fileUpload.func = ({ ctx, slug }) => {
	return execTryCatch(async T => {
		const [location] = await T.executeQuery<Locations>("SELECT * FROM locations WHERE id = ?", slug);
		if (!location) throw Error("Location not found");

		const blob = await ctx.request.blob();
		const filetype = blob.type;
		if (ImageMIMEType.includes(filetype)) {
			const body = await blob.arrayBuffer();
			const filename = location.name + "." + filetype.split("/")[1];
			const link = bucketPrefix + filename;
			await Bucket.put(ctx, body, link, filetype);
			await T.executeQuery(`UPDATE locations SET image = ? WHERE id = ?`, [filename, slug.id]);
			return "Image uploaded successfully";
		}
		throw Error("Invalid filetype");
	}, "Σφάλμα κατά το ανέβασμα της εικόνας");
};

serverRoutes.fileDelete.func = ({ ctx, slug }) => {
	return execTryCatch(async T => {
		const [location] = await T.executeQuery<Locations>("SELECT * FROM locations WHERE id = ?", slug);
		if (!location) throw Error("Location not found");

		if (location.image) await Bucket.delete(ctx, bucketPrefix + location.image);
		await T.executeQuery(`UPDATE locations SET image = NULL WHERE id = ?`, slug);
		return "Image deleted successfully";
	}, "Σφάλμα κατά την διαγραφή της εικόνας");
};

serverRoutes.delete.func = ({ ctx }) => {
	return execTryCatch(async T => {
		const body = getUsedBody(ctx) || await ctx.request.json();
		const files = await T.executeQuery<Pick<Locations, "image">>(
			`SELECT image FROM locations WHERE id IN (???)`,
			body
		);
		for (const file of files) {
			if (file.image) await Bucket.delete(ctx, file.image);
		}
		await T.executeQuery(`DELETE FROM locations WHERE id IN (???)`, body);
		return "Locations deleted successfully";
	}, "Σφάλμα κατά την διαγραφή των σπουδαστηρίων");
};

export const LocationsServerRoutes = serverRoutes;
