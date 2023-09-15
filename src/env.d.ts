/// <reference types="astro/client" />
type AdvancedRuntime = import('@astrojs/cloudflare').AdvancedRuntime;
type PDFLIB = typeof import('pdf-lib');
type FontKit = typeof import("@pdf-lib/fontkit");
type ZIP = typeof import("client-zip");

// 💖💖💖💖 All the types without the 1MB added js!!!!!

declare namespace App {
    interface Locals extends AdvancedRuntime { }
}

declare global {
    interface Window {
        fontkit: FontKit;
        PDFLib: PDFLIB;
    }
    interface App {
        ZIP: ZIP;
    }
}

export { }