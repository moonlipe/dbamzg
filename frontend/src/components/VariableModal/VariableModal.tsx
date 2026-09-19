import { useState, useEffect } from 'react';
import { sqlvariables } from '../../../wailsjs/go/models';

interface VariableModalProps {
  isOpen: boolean;
  variables: sqlvariables.Variable[];
  onClose: () => void;
  onExecute: (values: Record<string, string>) => void;
}

export default function VariableModal({ isOpen, variables, onClose, onExecute }: VariableModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      variables.forEach((v) => {
        initial[v.name] = v.default_value || (v.history && v.history.length > 0 ? v.history[0] : '');
      });
      setValues(initial);
    }
  }, [isOpen, variables]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    onExecute(values);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-app-surface border border-app-border rounded-lg w-[420px] max-h-[80vh] overflow-hidden shadow-2xl animate-slide-in">
        <div className="px-5 py-4 border-b border-app-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-purple/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-purple">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Variaveis SQL</h2>
              <p className="text-[0.83em] text-zinc-500">Preencha os valores para executar</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
          {variables.map((v) => (
            <div key={v.name}>
              <label className="block text-[0.917em] font-medium text-zinc-400 mb-1">
                <span className="text-accent-blue font-mono">{`{${v.name}}`}</span>
              </label>
              <input
                type="text"
                value={values[v.name] || ''}
                onChange={(e) => setValues({ ...values, [v.name]: e.target.value })}
                placeholder={v.default_value || `Valor para ${v.name}...`}
                className="w-full px-3 py-2 bg-app-bg border border-app-border rounded text-xs text-white placeholder-zinc-600 focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors font-mono"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                  if (e.key === 'Escape') onClose();
                }}
              />
              {v.history && v.history.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {v.history.slice(0, 5).map((h, i) => (
                    <button
                      key={i}
                      onClick={() => setValues({ ...values, [v.name]: h })}
                      className="px-2 py-0.5 bg-app-bg hover:bg-app-elevated rounded text-[0.75em] text-zinc-500 hover:text-zinc-300 transition-colors font-mono"
                    >
                      {h}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-app-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-8 px-3 bg-app-bg hover:bg-app-elevated border border-app-border rounded text-[0.917em] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="h-8 px-4 bg-accent-blue hover:bg-accent-blue/80 rounded text-[0.917em] text-white font-medium transition-colors"
          >
            Executar
          </button>
        </div>
      </div>
    </div>
  );
}
