import { money, pct } from './format';
import type { Forecast } from './forecast';
import type { CategoryRow, Totals } from './summary';

export interface Insight {
  tone: 'good' | 'bad' | 'neutral';
  icon: string;
  text: string;
}

/** Regras locais que transformam números em frases acionáveis. */
export function buildInsights(params: {
  totals: Totals;
  prevTotals: Totals;
  expenseRows: CategoryRow[];
  forecast: Forecast;
  limit?: number;
}): Insight[] {
  const { totals, prevTotals, expenseRows, forecast, limit } = params;
  const out: Insight[] = [];

  if (forecast.kind === 'current') {
    if (forecast.balance < 0) {
      out.push({ tone: 'bad', icon: '⚠️', text: `No ritmo atual você fecha o mês em ${money(forecast.balance)}.` });
    } else if (totals.income > 0) {
      out.push({ tone: 'good', icon: '🎯', text: `No ritmo atual você fecha o mês com ${money(forecast.balance)} de sobra.` });
    }
    if (limit && forecast.expense > limit && totals.expense < limit) {
      out.push({
        tone: 'bad',
        icon: '📉',
        text: `Projeção de gastos (${money(forecast.expense)}) passa do seu limite de ${money(limit)}.`,
      });
    }
  }

  const spikes = expenseRows
    .filter((r) => r.delta !== null && r.delta >= 0.3 && r.total - r.prevTotal >= 5000)
    .slice(0, 2);
  for (const r of spikes) {
    out.push({ tone: 'bad', icon: '📈', text: `${r.icon} ${r.name} subiu ${pct(r.delta!)} vs. mês passado (+${money(r.total - r.prevTotal)}).` });
  }
  const drops = expenseRows.filter((r) => r.delta !== null && r.delta <= -0.25 && r.prevTotal - r.total >= 5000);
  if (drops[0]) {
    const r = drops[0];
    out.push({ tone: 'good', icon: '👏', text: `Você gastou ${pct(-r.delta!)} a menos com ${r.name} que no mês passado.` });
  }

  if (expenseRows.length >= 4) {
    const top3 = expenseRows.slice(0, 3).reduce((a, r) => a + r.share, 0);
    out.push({ tone: 'neutral', icon: '🧭', text: `Suas 3 maiores categorias somam ${pct(top3)} dos gastos: ${expenseRows.slice(0, 3).map((r) => r.name).join(', ')}.` });
  }

  if (totals.income > 0) {
    const rate = totals.balance / totals.income;
    if (rate >= 0.2) out.push({ tone: 'good', icon: '🐷', text: `Taxa de poupança de ${pct(rate)} — acima da meta clássica de 20%.` });
    else if (rate > 0) out.push({ tone: 'neutral', icon: '🐷', text: `Taxa de poupança de ${pct(rate)}. A referência saudável é 20%.` });
  }

  if (prevTotals.expense > 0 && forecast.kind === 'past') {
    const d = (totals.expense - prevTotals.expense) / prevTotals.expense;
    if (Math.abs(d) >= 0.1) {
      out.push({ tone: d > 0 ? 'bad' : 'good', icon: d > 0 ? '🔺' : '🔻', text: `Gastos ${d > 0 ? 'subiram' : 'caíram'} ${pct(Math.abs(d))} em relação ao mês anterior.` });
    }
  }

  return out.slice(0, 5);
}
