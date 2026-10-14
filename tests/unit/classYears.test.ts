/**
 * Byzantine class years are stored in `pupil_enrollments.class_year` and validated against
 * `classYearsByMusicType`. The old spelling "Α' Ετος" (no tonos) was migrated to "Α' Έτος" in
 * `0005_class_year_tonos.sql`; these tests keep the list, and the code that compares against it, in sync.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { classYearsByMusicType, MusicType } from "../../lib/classYears";

const repoRoot = path.resolve(import.meta.dir, "../..");

test("Byzantine class years carry the tonos", () => {
	const years = classYearsByMusicType[MusicType.Byzantine];
	expect(years).toContain("Α' Έτος");
	expect(years).toContain("Β' Έτος Διπλώματος");
	expect(years.filter((y) => y.includes("Ετος"))).toEqual([]);
});

test("the unaccented spelling is not used by any source file", () => {
	const files = ["lib/classYears.ts", "lib/api/routes/pupils.ts", "src/components/registrations/RegistrationForm.solid.tsx"];
	const offenders = files.filter((f) => readFileSync(path.join(repoRoot, f), "utf8").includes("Ετος"));
	expect(offenders).toEqual([]);
});
