/// <reference types="astro/client" />
type AdvancedRuntime = import('@astrojs/cloudflare').AdvancedRuntime;
type PDFLIB = typeof import('pdf-lib');
type FontKit = typeof import("@pdf-lib/fontkit");

// 💖💖💖💖 All the types without the 1MB added js!!!!!

declare namespace App {
    interface Locals extends AdvancedRuntime {
        user: {
            name: string;
            surname: string;
        };
    }
}

declare global {
    interface Window {
        fontkit: FontKit;
        PDFLib: PDFLIB;
    }
}

export { }