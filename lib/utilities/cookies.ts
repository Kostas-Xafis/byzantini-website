// Cookie functions from w3schools
export function setCookie(cname: string, cvalue: string | number | boolean = "", exdays = 0, path = "/") {
    const d = new Date();
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    let expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=" + path;
}
export function deleteCookie(cname: string, path = "/") {
    document.cookie = cname + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=" + path;
}
export function getCookie(cname: string): string {
    let name = cname + "=";
    let ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}
