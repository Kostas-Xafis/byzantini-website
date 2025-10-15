import { createMemo, createSignal } from "solid-js";
import { API, type APIResponse } from "@lib/routes/index.client";
import { looseStringIncludes } from "@utilities/string";
import type { Instruments, Registrations, Teachers } from "@_types/entities";
import { CompareList, getCompareFn, type SearchColumn, type SearchSetter } from "../../SearchTable.solid";
import { toggleCheckboxes } from "../../table/Row.solid";
import type { ColumnType } from "../../table/Table.solid";
import { getKeyIndex } from "@utilities/objects";

const registrationsToTable = (
    registrations: Registrations[],
    teachers: Teachers[],
    instruments: Instruments[]
) => {
    return registrations.map((reg) => {
        const columns = Object.values(reg) as any[];
        columns[15] = ["Βυζαντινή Μουσική", "Παραδοσιακή Μουσική", "Ευρωπαϊκή Μουσική"][
            columns[15] as number
        ];
        columns[16] = teachers.find((t) => t.id === columns[16])?.fullname;
        columns[17] = instruments.find((i) => i.id === columns[17])?.name;
        if (columns[19] === 0 || !columns[19]) columns[19] = null;
        if (columns[20] === 0 || !columns[20]) columns[20] = null;

        columns[22] = reg.amka;
        columns[23] = reg.pass;
        columns[24] = location.origin + "/eggrafes/?regid=" + reg.registration_url;
        return columns;
    });
};

export const columns: ColumnType<Registrations> = {
    id: { type: "number", name: "Id" },
    am: { type: "number", name: "Αριθμός Μητρώου", size: 7 },
    last_name: { type: "string", name: "Επώνυμο", size: 15 },
    first_name: { type: "string", name: "Όνομα", size: 15 },
    fathers_name: { type: "string", name: "Πατρώνυμο", size: 15 },
    birth_date: { type: "date", name: "Ημερομηνία Γέννησης", size: 12 },
    road: { type: "string", name: "Οδός", size: 15 },
    number: { type: "number", name: "Αριθμός" },
    tk: { type: "number", name: "Τ.Κ." },
    region: { type: "string", name: "Δήμος/Περιοχή", size: 15 },
    telephone: { type: "string", name: "Τηλέφωνο", size: 12 },
    cellphone: { type: "string", name: "Κινητό", size: 12 },
    email: { type: "string", name: "Email", size: 20 },
    registration_year: { type: "string", name: "Σχολικό Έτος", size: 10 },
    class_year: { type: "string", name: "Έτος Φοίτησης", size: 12 },
    class_id: { type: "string", name: "Τάξη", size: 15 },
    teacher_id: { type: "string", name: "Καθηγητής", size: 15 },
    instrument_id: { type: "string", name: "Όργανο", size: 12 },
    date: { type: "date", name: "Ημερομηνία Εγγραφής", size: 12 },
    payment_amount: { type: "number", name: "Ποσό Πληρωμής", size: 8 },
    total_payment: { type: "number", name: "Σύνολο Πληρωμής", size: 8 },
    payment_date: { type: "date", name: "Ημερομηνία Πληρωμής", size: 12 },
    amka: { type: "string", name: "ΑΜΚΑ", size: 15 },
    pass: { type: "boolean", name: "Προάχθει", size: 8 },
    registration_url: { type: "link", name: "URL Εγγραφής", size: 12 },
};


export const searchColumns: SearchColumn[] = [
    { columnName: "last_name", name: "Επώνυμο", type: "string" },
    { columnName: "first_name", name: "Όνομα", type: "string" },
    { columnName: "am", name: "ΑΜ", type: "number" },
    { columnName: "amka", name: "ΑΜΚΑ", type: "string" },
    { columnName: "teacher_id", name: "Καθηγητής", type: "string" },
    { columnName: "telephone", name: "Τηλέφωνο", type: "string" },
    { columnName: "cellphone", name: "Κινητό", type: "string" },
    { columnName: "email", name: "Email", type: "string" },
    { columnName: "date", name: "Ημερομηνία Εγγραφής", type: "date" },
    { columnName: "class_year", name: "Έτος Φοίτησης", type: "string" },
];


export const reshapeData = function (
    store: Partial<APIResponse>,
    searchQuery: Partial<SearchSetter<Registrations>>
) {
    const [dataLength, setDataLength] = createSignal(0);

    return [createMemo(() => {
        const registrations = store[API.Registrations.get];
        const teachers = store[API.Teachers.getByFullnames];
        const instruments = store[API.Instruments.get];
        if (!registrations || !teachers || !instruments) return [];
        let { columnName, value, type } = searchQuery;
        if (!columnName || !value || !type) {
            toggleCheckboxes(false);
            setDataLength(registrations.length);
            return registrationsToTable(registrations, teachers, instruments);
        }
        let searchRows = registrationsToTable(registrations, teachers, instruments);
        const columnIndex = getKeyIndex(columnName, registrations[0]);
        if (type === "number") {
            // @ts-ignore value is misstyped....
            const EqCheck = CompareList.findLast((col) => value.startsWith(col));
            const nVal = Number(value.slice((EqCheck || "").length));
            const fn = EqCheck && getCompareFn(value);
            searchRows = searchRows.filter((row) => {
                //Converting to number because the column might be a stringified number
                //@ts-ignore
                const nCol = Number(row[columnIndex]);
                if (fn) return fn(nCol, nVal);
                let sCol = "" + nCol;
                let sVal = "" + nVal;
                return sCol.includes(sVal) || sVal === sCol;
            });
        } else if (type === "string") {
            searchRows = searchRows.filter((r) => {
                //@ts-ignore
                const col = r[columnIndex] as string;
                if (!col) {
                    // In case where there is not a value for the column
                    return false;
                }
                return looseStringIncludes(col, value as string);
            });
        } else if (type === "date") {
            // @ts-ignore
            const EqCheck = CompareList.findLast((c) => value.startsWith(c));
            const fn = EqCheck && getCompareFn(value);
            value = value.replace(EqCheck || "", "");
            if (EqCheck === "=") {
                return searchRows.filter((r) => {
                    //@ts-ignore
                    const nCol = r[columnIndex] as number;
                    const sCol = new Date(nCol).toLocaleDateString("el-GR");
                    return value === sCol;
                });
            }

            let [day, month = 1, year = 1970] = value.split("/").map((x) => Number(x));
            const dVal = new Date(year, month - 1, day);
            const nVal = dVal.getTime();
            const sVal = dVal.toLocaleDateString("el-GR");
            searchRows = searchRows.filter((r) => {
                //@ts-ignore
                const nCol = r[columnIndex] as number;
                if (fn) return fn(nCol, nVal - 1);
                let sCol = new Date(nCol).toLocaleDateString("el-GR");
                return sCol.includes(sVal);
            });
        }
        toggleCheckboxes(false);
        setDataLength(searchRows.length);
        return searchRows;
    }), dataLength] as const;
};
