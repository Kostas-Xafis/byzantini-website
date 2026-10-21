import { z } from "astro/zod";
import type { Locations } from "@_types/entities";
import { Bucket } from "@lib/bucket";
import { extensionOfType, fileBaseName, safeBaseName, splitFileName, versionedFileName } from "@lib/bucket/fileNames";
import { isUploadImageType, MAX_UPLOAD_BYTES } from "@lib/bucket/publicFiles";
import { executeQuery, questionMarks } from "@lib/utils.server";
import { z_BlobUpload, z_IdArray, z_Locations, z_LocationsResponse } from "@lib/api/schemas";
import { APIError } from "./APIError";
import { APIServer, handlerResult, HTTP } from "./APIServer";
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
	get: new APIServer({ method: "GET", path: "/locations", responseSchema: z.array(z_LocationsResponse) }, [], () =>
		handlerResult(() => executeQuery<Locations>("SELECT * FROM locations"), "Σφάλμα κατά την ανάκτηση των σπουδαστηρίων"),
	),
	getById: new APIServer(
		{ method: "POST", path: "/locations/id", schema: z_IdArray, responseSchema: z_LocationsResponse },
		[authenticateMiddleware],
		({ body }) =>
			handlerResult(async () => {
				const [id] = body;
				const [location] = await executeQuery<Locations>("SELECT * FROM locations WHERE id = ?", [id]);
				if (!location) throw APIError.notFound("Το σπουδαστήριο δεν βρέθηκε");
				return location;
			}),
	),
	getByPriority: new APIServer({ method: "GET", path: "/locations/priority", responseSchema: z.array(z_LocationsResponse) }, [], () =>
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
	// A renamed location keeps its image: the stored file follows the new name (like Teachers.fileRename), so the
	// file name keeps matching the location and the public URL changes with it.
	update: new APIServer({ method: "PUT", path: "/locations", schema: quantityReq }, [authenticateMiddleware], ({ body }) =>
		handlerResult(async (T) => {
			const [previous] = await T.executeQuery<Pick<Locations, "name" | "image">>("SELECT name, image FROM locations WHERE id = ?", [body.id]);
			if (!previous) throw APIError.notFound("Το σπουδαστήριο δεν βρέθηκε");
			await T.executeQuery(
				`UPDATE locations SET name=?, address=?, areacode=?, municipality=?, manager=?, email=?, telephones=?, priority=?, map=?, link=?, youtube=?, partner=? WHERE id=?`,
				body,
			);
			if (previous.image && fileBaseName(previous.image) !== safeBaseName(body.name)) {
				const renamed = versionedFileName(body.name, splitFileName(previous.image).ext);
				// Copy first, point the row at the copy, and only then delete the old key — a failure at any step leaves
				// the row on a file that exists.
				if (await Bucket.copy(bucketPrefix + previous.image, bucketPrefix + renamed)) {
					await T.executeQuery(`UPDATE locations SET image = ? WHERE id = ? AND image = ?`, [renamed, body.id, previous.image]);
					await Bucket.delete(bucketPrefix + previous.image);
				}
			}
			return "Location updated successfully";
		}, "Σφάλμα κατά την ενημέρωση του σπουδαστηρίου"),
	),
	fileUpload: new APIServer(
		{ method: "PUT", path: "/locations/file/[id:number]", rawBlob: true, schema: z_BlobUpload },
		[authenticateMiddleware],
		({ params, body: rawBody, request }) =>
			handlerResult(async (T) => {
				const [location] = await T.executeQuery<Locations>("SELECT * FROM locations WHERE id = ?", [Number(params.id)]);
				if (!location) throw APIError.notFound("Το σπουδαστήριο δεν βρέθηκε");

				const blob = rawBody;
				if (blob.size > MAX_UPLOAD_BYTES) throw new APIError(HTTP.PAYLOAD_TOO_LARGE, "Το αρχείο είναι πολύ μεγάλο (έως 10 MB)");
				const filetype = blob.type;
				if (isUploadImageType(filetype)) {
					// Replace safely: store the new file under a fresh versioned name, point the row at it, and only then
					// delete the previous file — a failed upload leaves the old image in place.
					const filename = versionedFileName(location.name, extensionOfType(filetype));
					await Bucket.put(await blob.arrayBuffer(), bucketPrefix + filename, filetype);
					await T.executeQuery(`UPDATE locations SET image = ? WHERE id = ?`, [filename, Number(params.id)]);
					if (location.image && location.image !== filename) await Bucket.delete(bucketPrefix + location.image);
					return "Image uploaded successfully";
				}
				throw new APIError(HTTP.UNSUPPORTED_MEDIA_TYPE, "Μη υποστηριζόμενος τύπος αρχείου");
			}, "Σφάλμα κατά το ανέβασμα της εικόνας"),
	),
	fileDelete: new APIServer({ method: "DELETE", path: "/locations/file/[id:number]" }, [authenticateMiddleware], ({ params, request }) =>
		handlerResult(async (T) => {
			const [location] = await T.executeQuery<Locations>("SELECT * FROM locations WHERE id = ?", [Number(params.id)]);
			if (!location) throw APIError.notFound("Το σπουδαστήριο δεν βρέθηκε");

			if (location.image) await Bucket.delete(bucketPrefix + location.image);
			await T.executeQuery(`UPDATE locations SET image = NULL WHERE id = ?`, [Number(params.id)]);
			return "Image deleted successfully";
		}, "Σφάλμα κατά τη διαγραφή της εικόνας"),
	),
	delete: new APIServer({ method: "DELETE", path: "/locations", schema: z_IdArray }, [authenticateMiddleware], ({ body, request }) =>
		handlerResult(async (T) => {
			const ids = body;
			const files = await T.executeQuery<Pick<Locations, "image">>(`SELECT image FROM locations WHERE id IN (${questionMarks(ids)})`, ids);
			for (const file of files) {
				if (file.image) await Bucket.delete(bucketPrefix + file.image);
			}
			await T.executeQuery(`DELETE FROM locations WHERE id IN (${questionMarks(ids)})`, ids);
			return "Locations deleted successfully";
		}, "Σφάλμα κατά τη διαγραφή των σπουδαστηρίων"),
	),
};
