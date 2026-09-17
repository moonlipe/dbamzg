import { useState, useEffect } from 'react';

export interface AppSettings {
  executeMode: 'statement' | 'all';
  statementDelimiter: 'blank_line' | 'semicolon';
  autoExpandProject: boolean;
  confirmOnDelete: boolean;
  fontSize: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  executeMode: 'statement',
  statementDelimiter: 'blank_line',
  autoExpandProject: false,
  confirmOnDelete: true,
  fontSize: 13,
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

export default function SettingsModal({ isOpen, onClose, settings, onSave }: SettingsModalProps) {
  const [local, setLocal] = useState<AppSettings>(settings);

  useEffect(() => {
    setLocal(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-app-surface border border-app-border rounded-lg w-[520px] max-h-[85vh] overflow-hidden shadow-2xl animate-slide-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-app-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-orange/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-orange">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-white">Configuracoes</h2>
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

        {/* Settings */}
        <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Execucao de queries */}
          <div>
            <h3 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider mb-3">Execucao de Queries</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1.5">Modo de execucao (Ctrl+Enter)</label>
                <div className="flex gap-2">
                  {([['statement', 'Statement atual'], ['all', 'Arquivo inteiro']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setLocal({ ...local, executeMode: val })}
                      className={`flex-1 h-8 px-3 rounded border text-[11px] font-medium transition-colors ${
                        local.executeMode === val
                          ? 'bg-accent-blue/20 border-accent-blue text-accent-blue'
                          : 'bg-app-bg border-app-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1.5">Delimitador de statement</label>
                <div className="flex gap-2">
                  {([['blank_line', 'Linha em branco'], ['semicolon', 'Ponto e virgula']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setLocal({ ...local, statementDelimiter: val })}
                      className={`flex-1 h-8 px-3 rounded border text-[11px] font-medium transition-colors ${
                        local.statementDelimiter === val
                          ? 'bg-accent-blue/20 border-accent-blue text-accent-blue'
                          : 'bg-app-bg border-app-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-zinc-600 mt-1">
                  {local.statementDelimiter === 'blank_line'
                    ? 'Separa statements por linhas em branco (estilo DBeaver)'
                    : 'Separa statements por ponto e virgula'}
                </p>
              </div>
            </div>
          </div>

          {/* UI */}
          <div>
            <h3 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider mb-3">Interface</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1.5">Tamanho da fonte do editor</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="10"
                    max="20"
                    value={local.fontSize}
                    onChange={(e) => setLocal({ ...local, fontSize: Number(e.target.value) })}
                    className="flex-1 accent-accent-blue"
                  />
                  <span className="text-[11px] text-zinc-300 font-mono w-8 text-right">{local.fontSize}px</span>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={local.autoExpandProject}
                  onChange={(e) => setLocal({ ...local, autoExpandProject: e.target.checked })}
                  className="rounded border-zinc-600 bg-app-bg text-accent-blue focus:ring-accent-blue/50"
                />
                <span className="text-[11px] text-zinc-400">Expandir projetos automaticamente ao iniciar</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={local.confirmOnDelete}
                  onChange={(e) => setLocal({ ...local, confirmOnDelete: e.target.checked })}
                  className="rounded border-zinc-600 bg-app-bg text-accent-blue focus:ring-accent-blue/50"
                />
                <span className="text-[11px] text-zinc-400">Confirmar antes de excluir conexoes/projetos</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-app-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-8 px-3 bg-app-bg hover:bg-app-elevated border border-app-border rounded text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => { onSave(local); onClose(); }}
            className="h-8 px-4 bg-accent-blue hover:bg-accent-blue/80 rounded text-[11px] text-white font-medium transition-colors"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
