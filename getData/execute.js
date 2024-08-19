const dotenv = require("dotenv");
const sdb = require("./sqlite");

export const generateLink = (size = 16) => {
	const lluSize = 62;
	const linkLookup = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
	let link = "";
	for (let j = 0; j < size; j++) {
		link += linkLookup[Math.floor(Math.random() * lluSize)];
	}
	return link;
};

async function main() {
	dotenv.config({
		path: "../.env.development",
	});
	const conn = sdb(false);

	const query = "SELECT * FROM registrations";
	const data = (await conn.execute(query)).rows;

	for (const reg of data) {
		const link = generateLink(32);
		const updateQuery = `UPDATE registrations SET registration_url = '${link}' WHERE id = ${reg.id}`;
		await conn.execute(updateQuery);
		console.log(`Updated link for ${reg.id}`);
	}
}

main();
