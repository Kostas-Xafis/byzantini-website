export const teacherTitleByGender = (title: 0 | 1 | 2, gender: "M" | "F") => {
    if (gender === "M")
        return title === 0 ? "Καθηγητής" : title === 1 ? "Δάσκαλος" : "Επιμελητής";
    else
        return title === 0 ? "Καθηγήτρια" : title === 1 ? "Δασκάλα" : "Επιμελήτρια";
};
