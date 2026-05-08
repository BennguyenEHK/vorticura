// Stubs DOM globals that pdfjs-dist@5.x references at module-eval on Node serverless.
// Only text extraction (getTextContent) is used here, so no-op classes are sufficient.

if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === 'undefined') {
  // @ts-expect-error — minimal stub; pdfjs-dist's text path does not invoke matrix methods
  globalThis.DOMMatrix = class {};
  // @ts-expect-error
  globalThis.Path2D = class {};
  // @ts-expect-error
  globalThis.ImageData = class {};
}

export {};
