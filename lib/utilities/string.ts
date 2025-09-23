//  String utility functions
export function stringEquals(str1: string, str2: string, caseSensitive = false): boolean {
    return caseSensitive ? str1 === str2 : str1.toLowerCase() === str2.toLowerCase();
}
export function looseStringEquals(str1: string, str2: string): boolean {
    return stringEquals(removeAccents(str1), removeAccents(str2), true);
}
export function looseStringIncludes(str1: string, str2: string): boolean {
    return removeAccents(str1).toLowerCase().includes(removeAccents(str2).toLowerCase());
}
export function removeAccents(str: string): string {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};
export function trimWhitespace(str: string): string {
    return str.replace(/(^\s+|\s+)$/g, "");
}
export function trimAndReduceWhitespace(str: string): string {
    return trimWhitespace(str).replace(/\s+/g, " ");
}
export function capitalizeWords(str: string): string {
    return str.replace(/\b\w/g, char => char.toUpperCase());
}
export function capitalizeFirstLetter(str: string): string {
    if (str.length === 0) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}
export function toTitleCase(str: string): string {
    return str.toLowerCase().split(' ').map(word => capitalizeFirstLetter(word)).join(' ');
}
export function truncateString(str: string, maxLength: number, ellipsis = true): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength) + (ellipsis ? "…" : "");
}