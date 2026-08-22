export const teacherTitleByGender = (title: 0 | 1 | 2, gender: "M" | "F") => {
	if (gender === "M") return title === 0 ? "Καθηγητής" : title === 1 ? "Δάσκαλος" : "Επιμελητής";
	else return title === 0 ? "Καθηγήτρια" : title === 1 ? "Δασκάλα" : "Επιμελήτρια";
};

// Some older dev/replication snapshots store newlines as the two characters "\n"
// (backslash + n) instead of real newlines. Normalizing is a no-op on production
// content, which uses actual newline characters.
export const unescapeNewlines = (s: string) => s.replaceAll("\\n", "\n");
