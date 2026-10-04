import type { Category } from './types';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'moradia', name: 'Moradia', type: 'expense', color: '#2a78d6', icon: '🏠' },
  { id: 'alimentacao', name: 'Alimentação', type: 'expense', color: '#eb6834', icon: '🍽️' },
  { id: 'transporte', name: 'Transporte', type: 'expense', color: '#1baf7a', icon: '🚗' },
  { id: 'saude', name: 'Saúde', type: 'expense', color: '#eda100', icon: '🩺' },
  { id: 'lazer', name: 'Lazer', type: 'expense', color: '#e87ba4', icon: '🎉' },
  { id: 'educacao', name: 'Educação', type: 'expense', color: '#008300', icon: '📚' },
  { id: 'assinaturas', name: 'Assinaturas', type: 'expense', color: '#4a3aa7', icon: '📺' },
  { id: 'compras', name: 'Compras', type: 'expense', color: '#e34948', icon: '🛍️' },
  { id: 'outros-despesa', name: 'Outros', type: 'expense', color: '#898781', icon: '📦' },
  { id: 'salario', name: 'Salário', type: 'income', color: '#2a78d6', icon: '💼' },
  { id: 'freelance', name: 'Freelance', type: 'income', color: '#eb6834', icon: '🧑‍💻' },
  { id: 'investimentos', name: 'Investimentos', type: 'income', color: '#1baf7a', icon: '📈' },
  { id: 'outros-receita', name: 'Outros', type: 'income', color: '#898781', icon: '💰' },
];

export const FALLBACK_CATEGORY: Record<'expense' | 'income', string> = {
  expense: 'outros-despesa',
  income: 'outros-receita',
};

/** Palavras-chave usadas antes de existir histórico suficiente. */
export const KEYWORDS: Record<string, string[]> = {
  moradia: ['aluguel', 'condominio', 'luz', 'energia', 'agua', 'gas', 'internet', 'iptu', 'enel', 'sabesp', 'faxina'],
  alimentacao: ['mercado', 'supermercado', 'ifood', 'restaurante', 'padaria', 'almoco', 'jantar', 'lanche', 'cafe', 'rappi', 'acougue', 'feira', 'pizza'],
  transporte: ['uber', '99', 'taxi', 'gasolina', 'combustivel', 'posto', 'onibus', 'metro', 'estacionamento', 'pedagio', 'ipva', 'oficina'],
  saude: ['farmacia', 'remedio', 'medico', 'consulta', 'exame', 'dentista', 'plano', 'academia', 'drogasil', 'terapia'],
  lazer: ['cinema', 'show', 'bar', 'viagem', 'hotel', 'passeio', 'ingresso', 'cerveja', 'festa'],
  educacao: ['curso', 'escola', 'faculdade', 'livro', 'udemy', 'mensalidade', 'material'],
  assinaturas: ['netflix', 'spotify', 'prime', 'disney', 'hbo', 'max', 'youtube', 'icloud', 'globoplay', 'chatgpt', 'claude', 'assinatura'],
  compras: ['amazon', 'shopee', 'mercadolivre', 'shein', 'roupa', 'loja', 'presente', 'magalu'],
  salario: ['salario', 'pagamento', 'holerite', 'pro-labore', 'prolabore'],
  freelance: ['freela', 'freelance', 'projeto', 'cliente', 'consultoria'],
  investimentos: ['dividendo', 'rendimento', 'juros', 'cdb', 'tesouro', 'resgate'],
};
