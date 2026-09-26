import { Link } from 'react-router-dom';
import { useApp } from '../store';
import { api } from '../api';
import { Icon } from './ui';

export function Toasts() {
  const { toasts, dismiss } = useApp();
  if (toasts.length === 0) return null;

  const tone = {
    success: { cls: 'border-success/30 bg-success-container text-on-success-container', icon: 'check_circle', fill: true },
    error: { cls: 'border-error/30 bg-error-container text-on-error-container', icon: 'error', fill: true },
    warn: { cls: 'border-warning/40 bg-warning-container text-on-warning-container', icon: 'block', fill: true },
    info: { cls: 'border-tertiary/25 bg-tertiary-container text-on-tertiary-container', icon: 'info', fill: true },
  } as const;

  return (
    <div className="pointer-events-none fixed top-3 right-3 z-[100] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2">
      {toasts.map((t) => {
        const s = tone[t.kind];
        return (
          <div
            key={t.id}
            className={`animate-pop pointer-events-auto flex gap-2.5 rounded-xl border p-3 shadow-lg ${s.cls}`}
          >
            <Icon name={s.icon} size={19} fill={s.fill} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-bold">{t.title}</p>
              {t.detail && <p className="mt-0.5 text-[11.5px] leading-snug opacity-85">{t.detail}</p>}
              {t.blockers && t.blockers.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {t.blockers.map((b) => (
                    <li
                      key={b}
                      className="flex items-start gap-1.5 rounded-md bg-on-surface/[0.06] px-2 py-1 font-mono text-[10.5px]"
                    >
                      <Icon name="error" size={13} className="mt-0.5 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 self-start opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The 4-step audit walkthrough. Each press advances the real backend by one
 * mutation, so the numbers on screen are the numbers the server holds.
 */
export function ScenarioBar() {
  const { snap, run, busy, can } = useApp();
  const sc = snap?.scenario;
  if (!sc) return null;

  const mayDrill = can('demo.reset');

  const onRun = () =>
    void run('Lifecycle step', () => api.runScenario(), { success: 'Lifecycle drill advanced' });

  const onRewind = () =>
    void run('Rewind the drill', () => api.startDrill(), {
      success: 'Drill rewound — the rack is empty and step 1 is ready.',
    });

  const onReset = () =>
    void run('Restore seed', () => api.reset(), { success: 'Canonical seed restored' });

  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-outline-variant bg-surface-lowest">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-outline-variant bg-surface-low px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.12em] text-primary uppercase">
          <Icon name="science" size={16} fill />
          Lifecycle drill
        </span>
        <span className="text-[11.5px] text-on-surface/60">
          {sc.complete
            ? 'The seeded system already shows the finished lifecycle. Rewind it to run the four steps by hand.'
            : 'Receive 100 kg → transfer to production → deliver 20 kg → post a −3 kg count variance'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {mayDrill && (
            <button className="btn btn-outline !py-1.5" onClick={onReset} disabled={busy}>
              <Icon name="restart_alt" size={15} />
              Restore seed
            </button>
          )}
          {mayDrill && (
            <button
              className="btn btn-outline !py-1.5"
              onClick={onRewind}
              disabled={busy || !sc.complete}
              title={
                sc.complete
                  ? 'Rewind the four documents to an empty rack'
                  : 'Already rewound — restore the seed first'
              }
            >
              <Icon name="undo" size={15} />
              Start the drill
            </button>
          )}
          <button className="btn btn-primary !py-1.5" onClick={onRun} disabled={busy || sc.complete}>
            <Icon name={sc.complete ? 'task_alt' : 'play_arrow'} size={16} fill />
            {sc.complete ? 'Drill complete' : `Run step ${sc.currentStep + 1}`}
          </button>
        </div>
      </div>

      <ol className="grid gap-px bg-outline-variant sm:grid-cols-2 lg:grid-cols-4">
        {sc.steps.map((s) => (
          <li key={s.key} className="bg-surface-lowest px-3.5 py-2.5">
            <div className="flex items-start gap-2.5">
              <span
                className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold ${
                  s.completed
                    ? 'bg-success text-on-success'
                    : s.active
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-outline'
                }`}
              >
                {s.completed ? <Icon name="check" size={13} /> : s.index + 1}
              </span>
              <div className="min-w-0">
                <p
                  className={`truncate text-[12px] font-bold ${
                    s.completed ? 'text-success' : s.active ? 'text-primary' : 'text-on-surface/55'
                  }`}
                >
                  {s.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-on-surface/50">
                  {s.detail}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {sc.steel && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-outline-variant px-4 py-2 text-[11.5px]">
          <span className="font-bold text-on-surface/65">
            <span className="ref">{sc.steel.sku}</span> live balance
          </span>
          <span className="tnum">
            total <b>{sc.steel.total}</b> kg
          </span>
          <span className="tnum">
            <Link to="/warehouse" className="text-tertiary hover:underline">
              Heavy-Rack-01 <b>{sc.steel.rack}</b>
            </Link>
          </span>
          <span className="tnum">
            <Link to="/warehouse" className="text-tertiary hover:underline">
              WH-Production <b>{sc.steel.production}</b>
            </Link>
          </span>
          {sc.steel.total === 0 && (
            <span className="flex items-center gap-1 text-warning">
              <Icon name="warning" size={14} fill /> deliveries on this SKU are blocked
            </span>
          )}
        </div>
      )}
    </div>
  );
}
