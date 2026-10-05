import fs from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { extractPdfItems, PdfNoTextError, PdfPasswordError } from '../import/pdfText';
import { DEFAULT_CATEGORIES } from './defaults';
import { groupLines, parsePdfLines } from './pdfStatement';
import { buildPreview } from './statement';

const dir = path.join(import.meta.dirname, '__fixtures__/pdf');
const load = (name: string) => {
  const b = fs.readFileSync(path.join(dir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const parse = async (name: string, password?: string) =>
  parsePdfLines(groupLines(await extractPdfItems(load(name), password, pdfjs as never)));
const simple = (rows: { date: string; amount: number; description: string }[]) => rows.map((r) => [r.date, r.amount, r.description]);

describe('PDF de extrato', () => {
  it('Itaú: coluna valor com sinal, ignora saldo', async () => {
    const p = await parse('itau-conta.pdf');
    expect(p.bank).toBe('Itaú');
    expect(p.creditCard).toBe(false);
    expect(simple(p.rows)).toEqual([
      ['2026-10-02', -25590, 'Pix Transf Joao Silva02/10'],
      ['2026-10-03', 780000, 'Sispag Salario Empresa Xyz'],
      ['2026-10-05', -18045, 'Da Enel 0012345'],
      ['2026-10-06', -123456, 'Cartao Itau Pagamento Fatura'],
    ]);
  });

  it('Bradesco: colunas crédito/débito, data só na 1ª linha do dia, histórico em duas linhas', async () => {
    const p = await parse('bradesco-conta.pdf');
    expect(p.bank).toBe('Bradesco');
    expect(simple(p.rows)).toEqual([
      ['2026-10-02', 150000, 'Pix - Rec 1234567 Rem: Fulano De Tal'],
      ['2026-10-02', -32000, 'Pagto Eletron Cobranca 7654321 Escola De Ingles'],
      ['2026-10-04', -8900, 'Visa Electron Drogasil 000123'],
    ]);
  });

  it('Banco do Brasil: dd/mm com ano do período e sufixo D/C', async () => {
    const p = await parse('bb-conta.pdf');
    expect(p.bank).toBe('Banco do Brasil');
    expect(simple(p.rows)).toEqual([
      ['2026-10-01', -8500, 'Pix - Enviado Farmacia Sao Joao'],
      ['2026-10-03', 30000, 'Pix - Recebido Fulano'],
      ['2026-10-04', -20000, 'Compra com Cartão Posto Shell'],
    ]);
  });

  it('Nubank conta: datas "01 OUT 2026" e sinal pela seção entradas/saídas', async () => {
    const p = await parse('nubank-conta.pdf');
    expect(p.bank).toBe('Nubank');
    expect(simple(p.rows)).toEqual([
      ['2026-10-01', 780000, 'Transferência recebida pelo Pix EMPRESA XYZ LTDA'],
      ['2026-10-01', -3200, 'Compra no débito PADARIA REAL'],
      ['2026-10-01', -25590, 'Transferência enviada pelo Pix JOAO SILVA'],
      ['2026-10-03', -4490, 'Compra no débito Netflix.com'],
    ]);
  });

  it('Nubank fatura: "05 SET" sem ano, compras positivas, pagamento e estorno negativos', async () => {
    const p = await parse('nubank-fatura.pdf');
    expect(p.creditCard).toBe(true);
    expect(simple(p.rows)).toEqual([
      ['2026-09-05', 2340, 'Uber *Trip'],
      ['2026-09-12', 4490, 'Netflix.com'],
      ['2026-09-15', -120000, 'Pagamento em 15 SET'],
      ['2026-09-20', 12000, 'Restaurante Sabor'],
      ['2026-09-28', 9990, 'Amazon - Parcela 2/3'],
      ['2026-10-01', -1990, 'Estorno Amazon'],
    ]);
    const items = buildPreview(p, [], DEFAULT_CATEGORIES);
    expect(items.map((i) => [i.type, i.status])).toEqual([
      ['expense', 'new'],
      ['expense', 'new'],
      ['income', 'card-payment'], // "Pagamento em 15 SET" fica de fora
      ['expense', 'new'],
      ['expense', 'new'],
      ['income', 'new'],
    ]);
  });

  it('Inter: data por extenso e "-R$ 245,90"', async () => {
    const p = await parse('inter-conta.pdf');
    expect(p.bank).toBe('Inter');
    expect(simple(p.rows)).toEqual([
      ['2026-10-01', -24590, 'Pix enviado: "Mercado Bom Preço"'],
      ['2026-10-01', 200000, 'Pix recebido: "Cliente ABC"'],
      ['2026-10-02', -2310, 'Compra no débito: "Uber *Trip"'],
    ]);
  });

  it('PDF com senha: pede a senha, recusa a errada e abre com a certa', async () => {
    await expect(extractPdfItems(load('itau-senha-12345.pdf'), undefined, pdfjs as never)).rejects.toMatchObject({ incorrect: false });
    await expect(extractPdfItems(load('itau-senha-12345.pdf'), '000', pdfjs as never)).rejects.toBeInstanceOf(PdfPasswordError);
    const p = await parse('itau-senha-12345.pdf', '12345');
    expect(p.rows).toHaveLength(4);
  });

  it('PDF escaneado (só imagem) avisa que não tem texto', async () => {
    await expect(extractPdfItems(load('escaneado.pdf'), undefined, pdfjs as never)).rejects.toBeInstanceOf(PdfNoTextError);
  });
});
