import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from './defaults';
import { buildPreview, decodeStatement, parseCSV, parseOFX, parseSigned, parseStatement, tidyDescription } from './statement';
import type { Transaction } from './types';

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252

<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>Banco Itau</ORG></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261002100000[-03:EST]
<TRNAMT>-45.90
<FITID>202610020001
<MEMO>IFOOD *RESTAURANTE
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261005
<TRNAMT>7800.00
<FITID>202610050002
<NAME>SALARIO
<MEMO>EMPRESA XYZ LTDA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261006
<TRNAMT>-1234,56
<FITID>202610060003
<MEMO>PAGAMENTO FATURA CARTAO
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const OFX_CARD_XML = `<?xml version="1.0"?><OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
<BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261003</DTPOSTED><TRNAMT>-89.90</TRNAMT><FITID>abc</FITID><MEMO>Netflix.com</MEMO></STMTTRN></BANKTRANLIST>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

describe('parseSigned', () => {
  it.each([
    ['-1.234,56', -123456],
    ['1,234.56', 123456],
    ['(50,00)', -5000],
    ['50,00 D', -5000],
    ['50,00 C', 5000],
    ['R$ -12', -1200],
    ['-45.90', -4590],
    ['12,50-', -1250],
    ['abc', null],
  ])('%s → %s', (input, expected) => expect(parseSigned(input)).toBe(expected));
});

describe('OFX', () => {
  it('lê OFX SGML de banco (Itaú/Bradesco/Santander/BB/Caixa)', () => {
    const p = parseOFX(OFX_SGML);
    expect(p.bank).toBe('Banco Itau');
    expect(p.creditCard).toBe(false);
    expect(p.rows).toEqual([
      { date: '2026-10-02', amount: -4590, description: 'Ifood *Restaurante', fitId: '202610020001' },
      { date: '2026-10-05', amount: 780000, description: 'Salario Empresa Xyz Ltda', fitId: '202610050002' },
      { date: '2026-10-06', amount: -123456, description: 'Pagamento Fatura Cartao', fitId: '202610060003' },
    ]);
  });

  it('lê OFX XML de cartão', () => {
    const p = parseStatement(OFX_CARD_XML, 'fatura.ofx');
    expect(p.creditCard).toBe(true);
    expect(p.rows[0]).toMatchObject({ date: '2026-10-03', amount: -8990, description: 'Netflix.com' });
  });

  it('decodifica Windows-1252', () => {
    const bytes = new Uint8Array([0x50, 0x41, 0x44, 0x41, 0x52, 0x49, 0x41, 0x20, 0x53, 0xc3 - 0xc3 + 0xc3]);
    // "PADARIA SÃ" em 1252: Ã = 0xC3 sozinho (UTF-8 inválido)
    expect(decodeStatement(bytes.buffer)).toBe('PADARIA SÃ');
  });
});

describe('CSV', () => {
  it('Nubank conta (Data,Valor,Identificador,Descrição)', () => {
    const csv = `Data,Valor,Identificador,Descrição
01/10/2026,-32.50,6512ab-01,Compra no débito - Padaria Pão Quente
02/10/2026,1500.00,6512ab-02,Transferência recebida pelo Pix - FULANO DE TAL`;
    const p = parseCSV(csv);
    expect(p.bank).toBe('Nubank');
    expect(p.creditCard).toBe(false);
    expect(p.rows).toEqual([
      { date: '2026-10-01', amount: -3250, description: 'Compra no débito - Padaria Pão Quente', fitId: '6512ab-01' },
      { date: '2026-10-02', amount: 150000, description: 'Transferência recebida pelo Pix - FULANO DE TAL', fitId: '6512ab-02' },
    ]);
  });

  it('Nubank fatura (date,title,amount) — compras positivas', () => {
    const p = parseCSV(`date,title,amount\n2026-10-01,Uber *Trip,23.40\n2026-10-05,Pagamento recebido,-500.00`);
    expect(p.creditCard).toBe(true);
    const items = buildPreview(p, [], DEFAULT_CATEGORIES);
    expect(items[0]).toMatchObject({ type: 'expense', amount: 2340, categoryId: 'transporte', status: 'new', selected: true });
    expect(items[1]).toMatchObject({ type: 'income', status: 'card-payment', selected: false });
  });

  it('Inter: preâmbulo, ponto e vírgula, histórico + descrição, ignora saldo', () => {
    const csv = `Extrato Conta Corrente
Conta ;123456
Período ;01/10/2026 a 31/10/2026

Data Lançamento;Histórico;Descrição;Valor;Saldo
01/10/2026;Pix enviado ;Mercado Bom Preço;-245,90;1.754,10
02/10/2026;Pix recebido;Cliente ABC;2.000,00;3.754,10`;
    const p = parseCSV(csv);
    expect(p.rows).toEqual([
      { date: '2026-10-01', amount: -24590, description: 'Mercado Bom Preço · Pix enviado' },
      { date: '2026-10-02', amount: 200000, description: 'Cliente ABC · Pix recebido' },
    ]);
  });

  it('Banco do Brasil: coluna de tipo Entrada/Saída e linha de saldo', () => {
    const csv = `"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"
"30/09/2026","Saldo Anterior","","","1000,00",""
"01/10/2026","Pix - Enviado","01/10 10:00 Farmacia Sao Joao","123","85,00","Saída"
"03/10/2026","Pix - Recebido","03/10 Fulano","124","300,00","Entrada"`;
    const p = parseCSV(csv);
    expect(p.rows.map((r) => [r.date, r.amount])).toEqual([
      ['2026-10-01', -8500],
      ['2026-10-03', 30000],
    ]);
  });

  it('colunas separadas de crédito e débito', () => {
    const p = parseCSV(`Data;Descrição;Crédito;Débito\n01/10/2026;Salário;5.000,00;\n02/10/2026;Aluguel;;2.200,00`);
    expect(p.rows.map((r) => r.amount)).toEqual([500000, -220000]);
  });

  it('CSV sem cabeçalho (deduz pelo conteúdo)', () => {
    const p = parseCSV(`03/10/2026;PIX ENVIADO JOAO;-50,00;950,00\n04/10/2026;UBER TRIP;-23,10;926,90`);
    expect(p.rows.map((r) => [r.description, r.amount])).toEqual([
      ['Pix Enviado Joao', -5000],
      ['Uber Trip', -2310],
    ]);
  });
});

describe('buildPreview', () => {
  const tx = (p: Partial<Transaction>): Transaction => ({ id: 'x', type: 'expense', amount: 4590, date: '2026-10-02', categoryId: 'alimentacao', description: '', createdAt: 0, ...p });

  it('marca duplicados por FITID e possíveis duplicados por data+valor', () => {
    const p = parseOFX(OFX_SGML);
    const items = buildPreview(p, [tx({ importKey: 'fit:202610020001' }), tx({ type: 'income', amount: 780000, date: '2026-10-05' })], DEFAULT_CATEGORIES);
    expect(items.map((i) => i.status)).toEqual(['duplicate', 'maybe-duplicate', 'card-payment']);
    expect(items.every((i) => !i.selected)).toBe(true);
  });

  it('linhas idênticas no mesmo arquivo viram chaves diferentes', () => {
    const p = parseCSV(`Data;Descrição;Valor\n01/10/2026;Café;-5,00\n01/10/2026;Café;-5,00`);
    const items = buildPreview(p, [], DEFAULT_CATEGORIES);
    expect(new Set(items.map((i) => i.key)).size).toBe(2);
  });

  it('sugere categoria pelo histórico e por palavra-chave', () => {
    const p = parseCSV(`Data;Descrição;Valor\n01/10/2026;Posto Shell;-200,00\n02/10/2026;Drogasil;-30,00`);
    const items = buildPreview(p, [tx({ description: 'Posto Shell', categoryId: 'transporte' })], DEFAULT_CATEGORIES);
    expect(items.map((i) => i.categoryId)).toEqual(['transporte', 'saude']);
  });
});

describe('tidyDescription', () => {
  it('só converte textos em CAIXA ALTA', () => {
    expect(tidyDescription('UBER   *TRIP')).toBe('Uber *Trip');
    expect(tidyDescription('Padaria do Zé')).toBe('Padaria do Zé');
  });
});
