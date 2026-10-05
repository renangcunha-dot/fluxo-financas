import type { PdfTextItem } from '../domain/pdfStatement';

type PdfJs = typeof import('pdfjs-dist');

export class PdfPasswordError extends Error {
  constructor(public incorrect: boolean) {
    super(incorrect ? 'Senha incorreta' : 'Este PDF tem senha');
  }
}

export class PdfNoTextError extends Error {
  constructor() {
    super('Este PDF não tem texto (parece escaneado ou foto).');
  }
}

let loaded: Promise<PdfJs> | null = null;

/** Carrega o pdf.js só quando alguém importa um PDF (o resto do app não paga esse peso). */
function loadPdfJs(): Promise<PdfJs> {
  loaded ??= (async () => {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return loaded;
}

/** Extrai todos os textos do PDF com posição. Tudo acontece no aparelho. */
export async function extractPdfItems(data: ArrayBuffer, password?: string, lib?: PdfJs): Promise<PdfTextItem[]> {
  const pdfjs = lib ?? (await loadPdfJs());
  // cópia: o pdf.js transfere (e invalida) o buffer recebido
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), password });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    await task.destroy();
    if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === 2);
    throw e;
  }
  const items: PdfTextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, page: p });
    }
  }
  await task.destroy();
  if (!items.length) throw new PdfNoTextError();
  return items;
}
