import { useEffect, useMemo, useState } from 'react';
import { Button, Card, HealthTag, inputCls, LimitBar } from '../components/ui';
import { db } from '../db/schema';
import { money, monthLabel, parseAmount } from '../domain/format';
import { spentInScope } from '../domain/summary';
import { TOTAL_SCOPE } from '../domain/types';
import type { AppData } from '../hooks/useData';
import { notificationPermission, notificationsSupported, push, requestPermission } from '../notifications/notify';
import { blockNow, unblock } from '../store/actions';
import { useUI } from '../store/ui';

function LimitInput({ scope, current }: { scope: string; current?: number }) {
  const [value, setValue] = useState(current ? (current / 100).toFixed(2).replace('.', ',') : '');
  useEffect(() => setValue(current ? (current / 100).toFixed(2).replace('.', ',') : ''), [current]);
  const commit = async () => {
    const cents = parseAmount(value);
    if (!value.trim()) await db.budgets.delete(scope);
    else if (cents && cents !== current) {
      await db.budgets.put({ scope, amount: cents });
      if (notificationPermission() === 'default') requestPermission();
    }
  };
  return (
    <div className="flex items-center rounded-xl border border-line bg-surface-2 px-2.5 focus-within:border-brand">
      <span className="text-xs text-muted">R$</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        inputMode="decimal"
        placeholder="sem limite"
        className="tabular w-24 bg-transparent px-1.5 py-1.5 text-right text-sm outline-none placeholder:text-muted"
        aria-label="Limite mensal"
      />
    </div>
  );
}

export function Budgets({ data }: { data: AppData }) {
  const { month, toast } = useUI();
  const [perm, setPerm] = useState(notificationPermission());
  const limits = useMemo(() => new Map(data.budgets.map((b) => [b.scope, b.amount])), [data.budgets]);
  const blocked = new Set(data.blocks.filter((b) => b.month === month).map((b) => b.scope));
  const totalLimit = limits.get(TOTAL_SCOPE);
  const totalSpent = spentInScope(data.transactions, month, TOTAL_SCOPE);
  const expenseCats = data.categories.filter((c) => c.type === 'expense' && !c.archived);
  const catLimitsSum = expenseCats.reduce((a, c) => a + (limits.get(c.id) ?? 0), 0);

  const doUnblock = async (scope: string) => {
    const reason = prompt('Por que desbloquear? (fica registrado)');
    if (!reason?.trim()) return;
    await unblock(month, scope, reason.trim());
    toast('Desbloqueado', 'neutral');
  };

  const askPerm = async () => setPerm(await requestPermission());

  const BlockToggle = ({ scope }: { scope: string }) =>
    blocked.has(scope) ? (
      <button onClick={() => doUnblock(scope)} className="rounded-lg bg-[var(--bad-mark)]/15 px-2 py-1 text-xs font-semibold text-bad" title="Desbloquear">🔒 Bloqueado</button>
    ) : (
      <button onClick={() => blockNow(month, scope)} className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2" title="Bloquear agora">🔓</button>
    );

  return (
    <div className="space-y-4">
      {perm !== 'granted' && (
        <Card className="border-brand/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="text-3xl">🔔</span>
            <div className="flex-1 text-sm">
              <p className="font-semibold">Ative as notificações</p>
              <p className="text-ink-2">
                {!notificationsSupported()
                  ? 'Seu navegador não suporta notificações. Os alertas aparecem dentro do app.'
                  : perm === 'denied'
                    ? 'As notificações estão bloqueadas no navegador. Libere nas permissões do site (ícone de cadeado na barra de endereço).'
                    : 'Receba um push quando chegar a 50%, 80% e 100% do limite, com os botões Bloquear e Continuar.'}
              </p>
            </div>
            {perm === 'default' && <Button variant="primary" onClick={askPerm}>Ativar</Button>}
          </div>
        </Card>
      )}

      <Card title={`Limite geral · ${monthLabel(month)}`} action={<BlockToggle scope={TOTAL_SCOPE} />}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="tabular text-2xl font-bold">{money(totalSpent)}</p>
            <p className="text-sm text-ink-2">gastos {totalLimit ? <>de {money(totalLimit)}</> : 'no mês'}</p>
          </div>
          <LimitInput scope={TOTAL_SCOPE} current={totalLimit} />
        </div>
        {totalLimit ? (
          <div className="mt-3 space-y-1">
            <LimitBar spent={totalSpent} limit={totalLimit} />
            <HealthTag spent={totalSpent} limit={totalLimit} />
          </div>
        ) : null}
        <p className="mt-3 text-xs text-muted">O limite vale todo mês. Avisos aos 50% e 80%; no limite você decide entre bloquear e continuar.</p>
      </Card>

      <Card
        title="Limites por categoria"
        action={catLimitsSum > 0 && <span className="text-xs text-muted tabular">soma: {money(catLimitsSum)}{totalLimit && catLimitsSum > totalLimit ? ' ⚠️ acima do geral' : ''}</span>}
      >
        <ul className="divide-y divide-line">
          {expenseCats.map((c) => {
            const spent = spentInScope(data.transactions, month, c.id);
            const limit = limits.get(c.id);
            return (
              <li key={c.id} className="py-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-hidden>{c.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="tabular block text-xs text-muted">{money(spent)}{limit ? ` de ${money(limit)}` : ''}</span>
                  </span>
                  <BlockToggle scope={c.id} />
                  <LimitInput scope={c.id} current={limit} />
                </div>
                {limit ? <div className="mt-2 pl-8"><LimitBar spent={spent} limit={limit} slim /></div> : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Histórico de decisões" action={perm === 'granted' && <button className="text-xs text-brand" onClick={() => push('🔔 Teste', 'As notificações do Fluxo estão funcionando.')}>Testar notificação</button>}>
        {data.overrides.length === 0 ? (
          <p className="text-sm text-muted">Quando você passar de um limite ou desbloquear algo, o motivo aparece aqui. Ótimo para revisar no fim do mês.</p>
        ) : (
          <ul className="space-y-2">
            {data.overrides.slice(0, 30).map((o) => (
              <li key={o.id} className="flex gap-3 rounded-xl bg-surface-2 p-3 text-sm">
                <span aria-hidden>{o.kind === 'continue' ? '⚠️' : '🔓'}</span>
                <span className="flex-1">
                  <b>{o.kind === 'continue' ? 'Continuou gastando' : 'Desbloqueou'}</b> em {o.scope === TOTAL_SCOPE ? 'gastos do mês' : data.catMap.get(o.scope)?.name ?? o.scope}
                  {o.amount ? <> · {money(o.amount)}{o.description && ` (${o.description})`}</> : null}
                  <span className="block text-ink-2">“{o.reason}”</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
