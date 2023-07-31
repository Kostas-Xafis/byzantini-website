// Will update the registrations API later because the code is a mess and the students/classes/lessons tables are subject to change

const { scryptSync } = require("crypto");
const { sendRegistrationMail } = require("../mailService");
const { questionMarks } = require("../utils");

const storeStudent = async (db, student) => {
	const args = Object.values(student);
	const query = `INSERT INTO students (AM, LastName, FirstName, FatherName, BirthYear, Road, Number, TK, Region, Telephone, Cellphone, Email, RegistrationYear, ClassYear, Teacher, Classes, Date) VALUES (${questionMarks(
		args.length
	)})`;
	const [{ insertId }] = await db.execute(query, args);

	const query2 = `INSERT INTO lessons (studentId, Teacher, Class) VALUES (${questionMarks(3)})`;
	if (1 & student.Classes) await db.execute(query2, [insertId, student.Teacher, 1]);
	if (2 & student.Classes) await db.execute(query2, [insertId, student.Teacher, 2]);
	if (4 & student.Classes) await db.execute(query2, [insertId, student.Teacher, 4]);
};

const getStudentsForExcel = async (db, date, classType) => {
	try {
		let { query, args } = studentQuery(date);
		query += `${date ? "AND" : "WHERE"} (classes & ? != 0)`;
		args = args.concat([classType]);
		let [students] = await db.execute(query, args);
		for (const student of students) {
			student.Teacher = (
				await db.execute("SELECT Teacher FROM lessons WHERE studentId = ? AND class = ?", [student.id, classType])
			)[0][0]?.Teacher;
		}
		return { students };
	} catch (err) {
		console.log(err);
	}
};

const getStudentsForZip = async (db, date) => {
	try {
		let { query, args } = studentQuery(date);
		const [students] = await db.execute(query, args);
		for (const student of students) {
			student.Teachers = (await db.execute("SELECT Teacher FROM lessons WHERE studentId = ?", [student.id]))[0]?.map(
				teacherObj => teacherObj.Teacher
			);
		}
		return { students };
	} catch (err) {
		console.log(err);
	}
};

const studentQuery = date => {
	let query = "SELECT * FROM students ";
	let args = [];
	if (date) {
		query += "WHERE (Date BETWEEN ? AND ?) ";
		args = [date.start, date.end];
	}
	return { query, args };
};

module.exports = {
	get: {
		authenticate: true,
		method: "get",
		path: "/registrations/get",
		func: db => {
			return async (req, res) => {
				const hashedPwd = process.env.HASH;
				const { pwd, date, classType } = req.body;
				const [pwdHash, salt] = hashedPwd.split(":");
				const newHash = scryptSync(pwd, salt, 128).toString("hex");
				if (newHash !== pwdHash) return res.status(400).send();
				if (classType) res.json(await getStudentsForExcel(db, date, classType));
				else res.json(await getStudentsForZip(db, date));
			};
		}
	},
	post: {
		method: "post",
		path: "/registrations/post",
		func: db => {
			return async (req, res) => {
				try {
					await storeStudent(db, req.body);
					res.status(200).send();
					if (process.env.ENV === "production") sendRegistrationMail(req.body);
				} catch (error) {
					console.log(error);
					res.status(400).send();
				}
			};
		}
	}
};
