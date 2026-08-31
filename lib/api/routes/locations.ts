import type { APIContext } from "astro";
import { z } from "astro/zod";
import type { Locations } from "@_types/entities";
import { Bucket } from "@lib/bucket";
import { executeQuery, questionMarks, ImageMIMEType } from "@lib/utils.server";
import { z_BlobUpload, z_Locations, z_LocationsResponse } from "@lib/api/schemas";
import { APIServer, handlerResult } from "./APIServer";
import { authenticateMiddleware } from "./middleware/authenticate";

/**
 * Locations — Phase 4 (ported from lib/routes/locations.client|server.ts).
 *
 * Route keys mirror the old `LocationsRoutes` so components keep working:
 * get, getById, getByPriority, post, update, fileUpload, fileDelete, delete.
 */

const bucketPrefix = "spoudastiria/";

// Request schemas mirror the old valibot omit() contracts (in-file per spec).
const postReq = z_Locations.omit({ id: true, image: true });
const quantityReq = z_Locations.omit({ image: true });

/**
 * Null-tolerant Locations response schema.
 *
 * The `locations` table declares `manager`, `email`, `image`, `link`,
 * `youtube` as `DEFAULT NULL`, and D1 surfaces those as JS `null`. The ported
 * `z_Locations` marks the optional ones `.optional()` (rejects `null`), so
 * using it directly as a responseSchema would break reads on rows with null
 * columns. This variant tolerates null/empty for those columns while keeping
 * the request-validation schema (`z_Locations`) unchanged.
 */

export const locationsRoutes = {
	get: new APIServer(
		{ method: "GET", path: "/locations", responseSchema: z.array(z_LocationsResponse) },
		[],
		() =>
			handlerResult(
				() => executeQuery<Locations>("SELECT * FROM locations"),
				"Σφάλμα κατά την ανάκτηση των σπουδαστηρίων",
			),
	),
	getById: new APIServer(
		{ method: "POST", path: "/locations/id", responseSchema: z_LocationsResponse },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async () => {
				const [id] = body as number[];
				const [location] = await executeQuery<Locations>("SELECT * FROM locations WHERE id = ?", [id]);
				if (!location) throw Error("Location not found");
				return location;
			}),
	),
	getByPriority: new APIServer(
		{ method: "GET", path: "/locations/priority", responseSchema: z.array(z_LocationsResponse) },
		[],
		() =>
			handlerResult(() => executeQuery<Locations>("SELECT * FROM locations ORDER BY priority ASC")),
	),
	post: new APIServer(
		{ method: "POST", path: "/locations", schema: postReq, responseSchema: z.object({ insertId: z.number() }) },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				const { insertId } = await T.executeQuery(
					`INSERT INTO locations (name, address, areacode, municipality, manager, email, telephones, priority, map, link, youtube, partner) VALUES (${questionMarks(body)})`,
					body,
				);
				return { insertId };
			}, "Σφάλμα κατά την προσθήκη του σπουδαστηρίου"),
	),
	update: new APIServer(
		{ method: "PUT", path: "/locations", schema: quantityReq },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async (T) => {
				await T.executeQuery(
					`UPDATE locations SET name=?, address=?, areacode=?, municipality=?, manager=?, email=?, telephones=?, priority=?, map=?, link=?, youtube=?, partner=? WHERE id=?`,
					body,
				);
				return "Location updated successfully";
			}, "Σφάλμα κατά την ενημέρωση του σπουδαστηρίου"),
	),
	fileUpload: new APIServer(
		{ method: "PUT", path: "/locations/file/[id:number]", rawBlob: true, schema: z_BlobUpload },
		[authenticateMiddleware],
		({ params, body: rawBody, request }) =>
			handlerResult(async (T) => {
				const [location] = await T.executeQuery<Locations>("SELECT * FROM locations WHERE id = ?", [Number(params.id)]);
				if (!location) throw Error("Location not found");

				const blob = rawBody as Blob;
				const filetype = blob.type;
				if (ImageMIMEType.includes(filetype)) {
					const fileBuffer = await blob.arrayBuffer();
					const filename = location.name + "." + filetype.split("/")[1];
					const link = bucketPrefix + filename;
					await Bucket.put(request as unknown as APIContext, fileBuffer, link, filetype);
					await T.executeQuery(`UPDATE locations SET image = ? WHERE id = ?`, [filename, Number(params.id)]);
					return "Image uploaded successfully";
				}
				throw Error("Invalid filetype");
			}, "Σφάλμα κατά το ανέβασμα της εικόνας"),
	),
	fileDelete: new APIServer(
		{ method: "DELETE", path: "/locations/file/[id:number]" },
		[authenticateMiddleware],
		({ params, request }) =>
			handlerResult(async (T) => {
				const [location] = await T.executeQuery<Locations>("SELECT * FROM locations WHERE id = ?", [Number(params.id)]);
				if (!location) throw Error("Location not found");

				if (location.image) await Bucket.delete(request as unknown as APIContext, bucketPrefix + location.image);
				await T.executeQuery(`UPDATE locations SET image = NULL WHERE id = ?`, [Number(params.id)]);
				return "Image deleted successfully";
			}, "Σφάλμα κατά την διαγραφή της εικόνας"),
	),
	delete: new APIServer(
		{ method: "DELETE", path: "/locations" },
		[authenticateMiddleware],
		({ body, request }) =>
			handlerResult(async (T) => {
				const ids = body as number[];
				const files = await T.executeQuery<Pick<Locations, "image">>(
					`SELECT image FROM locations WHERE id IN (${questionMarks(ids)})`,
					ids,
				);
				for (const file of files) {
					if (file.image) await Bucket.delete(request as unknown as APIContext, file.image);
				}
				await T.executeQuery(`DELETE FROM locations WHERE id IN (${questionMarks(ids)})`, ids);
				return "Locations deleted successfully";
			}, "Σφάλμα κατά την διαγραφή των σπουδαστηρίων"),
	),
};
