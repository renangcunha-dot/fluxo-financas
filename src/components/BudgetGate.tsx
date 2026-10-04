import { useEffect, useState } from 'react';
import { money, monthLabel, monthOf, pct } from '../domain/format';
import { TOTAL_SCOPE } from '../domain/types';
import type { AppData } from '../hooks/useData';
import { useUI } from '../store/ui';
import { Button, inputCls, LimitBar, Modal } from './ui';

const REASONS_CONTINUE = ['Emergência', 'Já estava planejado', 'Vale a pena', 'Vou compensar no próximo mês'];
const REASONS_UNBLOCK = ['Emergência', 'Conta essencial', 'Ajustei meu planejamento'];

/**
 * O "freio consciente": aparece quando um lançamento atinge o limite (bloquear × continuar)
 * ou quando a categoria/mês já está bloqueado (desbloquear com motivo).
 */
export function BudgetGate({ data }: { data: AppData }) {
  const gate = useUI((s) => s.gate);
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'choose' | 'reason'>('choose');

  useEffect(() => {
    setReason('');
    setStep('choose');
  }, [gate]);

  if (!gate) return null;
  const { tx } = gate;
  const month = monthLabel(monthOf(tx.date));
  const name = (scope: string) => {
    if (scope === TOTAL_SCOPE) return 'Gastos do mês';
    const c = data.catMap.get(scope);
    return c ? `${c.icon} ${c.name}` : scope;
  };
  const cancel = () => gate.resolve({ choice: 'cancel' });

  if (gate.kind === 'blocked') {
    return (
      <Modal open onClose={cancel} title={<>🔒 Bloqueado em {month}</>}>
        <p className="text-ink-2">
          Você decidiu bloquear <b className="text-ink">{gate.scopes.map(name).join(' e ')}</b> neste mês. Este lançamento de{' '}
          <b className="text-ink">{money(tx.amount)}</b>
          {tx.description && <> ({tx.description})</>} não foi salvo.
        </p>
        <p className="mt-3 text-sm text-ink-2">Para desbloquear, registre o motivo. Ele fica no seu histórico de decisões.</p>
        <ReasonPicker options={REASONS_UNBLOCK} value={reason} onChange={setReason} />
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button variant="primary" className="flex-1" onClick={cancel}>Manter bloqueado</Button>
          <Button variant="ghost" className="flex-1" disabled={!reason.trim()} onClick={() => gate.resolve({ choice: 'unblock', reason: reason.trim() })}>
            Desbloquear e salvar
          </Button>
        </div>
      </Modal>
    );
  }

  const main = gate.exceeded[0];
  return (
    <Modal open onClose={cancel} title="🚦 Você chegou no seu limite">
      <div className="space-y-3">
        {gate.exceeded.map((s) => (
          <div key={s.scope} className="rounded-xl bg-surface-2 p-3">
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="font-semibold">{name(s.scope)}</span>
              <span className="tabular text-ink-2">
                <b className="text-bad">{money(s.after)}</b> de {money(s.limit)} · {pct(s.after / s.limit)}
              </span>
            </div>
            <LimitBar spent={s.after} limit={s.limit} />
          </div>
        ))}
        <p className="text-ink-2">
          Com <b className="text-ink">{money(tx.amount)}</b>
          {tx.description && <> em “{tx.description}”</>}, você {main.after > main.limit ? <>passa <b className="text-bad">{money(main.after - main.limit)}</b> do</> : 'atinge o'} limite de {month}.{' '}
          <b className="text-ink">E agora, o que você quer fazer?</b>
        </p>
      </div>

      {step === 'choose' ? (
        <div className="mt-5 grid gap-2">
          <button
            onClick={() => gate.resolve({ choice: 'block' })}
            className="rounded-2xl border-2 border-brand bg-brand-soft p-4 text-left transition hover:brightness-95"
          >
            <span className="block font-bold">🛑 Bloquear</span>
            <span className="text-sm text-ink-2">Não salva este gasto e trava novas despesas em {gate.exceeded.map((s) => name(s.scope).toLowerCase()).join(' e ')} até o fim de {month}.</span>
          </button>
          <button onClick={() => setStep('reason')} className="rounded-2xl border border-line p-4 text-left transition hover:bg-surface-2">
            <span className="block font-bold">Continuar gastando</span>
            <span className="text-sm text-ink-2">Salva o gasto e registra o motivo no seu histórico de estouros. Não pergunto de novo este mês.</span>
          </button>
          <Button variant="ghost" onClick={cancel}>Voltar e editar</Button>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm font-semibold">Por que vale a pena passar do limite?</p>
          <ReasonPicker options={REASONS_CONTINUE} value={reason} onChange={setReason} />
          <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
            <Button variant="danger" className="flex-1" disabled={!reason.trim()} onClick={() => gate.resolve({ choice: 'continue', reason: reason.trim() })}>
              Confirmar e continuar
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => setStep('choose')}>Voltar</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ReasonPicker({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`rounded-full border px-3 py-1 text-sm ${value === o ? 'border-brand bg-brand-soft font-semibold' : 'border-line hover:bg-surface-2'}`}
          >
            {o}
          </button>
        ))}
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ou escreva o motivo…" className={inputCls} />
    </div>
  );
}
