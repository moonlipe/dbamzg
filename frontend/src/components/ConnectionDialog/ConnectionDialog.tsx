import { useState, useEffect } from 'react';
import { SaveConnection, TestConnection } from '../../../wailsjs/go/main/App';
import { types } from '../../../wailsjs/go/models';

interface ConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editConfig?: types.ConnectionConfig;
}

const DB_TYPES = [
  { value: 'sqlite', label: 'SQLite', icon: '💾', defaultPort: 0 },
  { value: 'postgres', label: 'PostgreSQL', icon: '🐘', defaultPort: 5432 },
  { value: 'mysql', label: 'MySQL', icon: '🐬', defaultPort: 3306 },
  { value: 'sqlserver', label: 'SQL Server', icon: '🔷', defaultPort: 1433 },
  { value: 'oracle', label: 'Oracle', icon: '🔴', defaultPort: 1521 },
  { value: 'custom', label: 'Personalizado', icon: '🔧', defaultPort: 0 },
];

const COLORS = [
  '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f97316',
  '#eab308', '#06b6d4', '#8b5cf6', '#f43f5e', '#14b8a6',
];

export default function ConnectionDialog({ isOpen, onClose, onSave, editConfig }: ConnectionDialogProps) {
  const [config, setConfig] = useState<types.ConnectionConfig>({
    Name: '',
    Type: 'sqlite',
    Host: 'localhost',
    Port: 5432,
    User: '',
    Password: '',
    Database: '',
    SSLMode: 'disable',
    Color: '#22c55e',
    ProjectID: '',
    DriverPath: '',
    ExtraOptions: '',
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (editConfig) {
      setConfig(editConfig);
    } else {
      setConfig({
        Name: '',
        Type: 'sqlite',
        Host: 'localhost',
        Port: 5432,
        User: '',
        Password: '',
        Database: '',
        SSLMode: 'disable',
        Color: '#22c55e',
        ProjectID: '',
        DriverPath: '',
        ExtraOptions: '',
      });
    }
    setTestResult(null);
  }, [editConfig, isOpen]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await TestConnection(config);
      setTestResult({ success: true, message: 'Conexão testada com sucesso!' });
    } catch (err) {
      setTestResult({ success: false, message: `Erro: ${err}` });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      await SaveConnection(config);
      onSave();
      onClose();
    } catch (err) {
      console.error('Erro ao salvar:', err);
    }
  };

  const isFileBased = config.Type === 'sqlite';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-app-surface border border-app-border rounded-lg w-[440px] max-h-[85vh] overflow-hidden shadow-2xl animate-slide-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-app-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-blue/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-blue">
                <path d="M4 7c0-1.1.9-2 2-2h8l4 4v10c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V7z" />
                <path d="M9 13h6M9 17h4" />
              </svg>
            </div>
            <h2 className="text-base font-semibold">
              {editConfig ? 'Editar Conexão' : 'Nova Conexão'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-app-hover flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[calc(85vh-140px)] overflow-y-auto">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Nome da Conexão</label>
            <input
              type="text"
              value={config.Name}
              onChange={(e) => setConfig({ ...config, Name: e.target.value })}
              className="w-full h-9 px-3 bg-app-bg border border-app-border rounded text-sm focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors"
              placeholder="Ex: Produção, Local Dev..."
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Tipo de Banco</label>
            <div className="grid grid-cols-5 gap-2">
              {DB_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setConfig({ ...config, Type: t.value, Port: t.defaultPort })}
                  className={`py-2 px-1 rounded border text-xs flex flex-col items-center gap-1 transition-all ${
                    config.Type === t.value
                      ? 'border-accent-blue bg-accent-blue/10 text-white'
                      : 'border-app-border bg-app-bg hover:border-zinc-600 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span className="text-base">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Cor de Identificação</label>
            <div className="flex gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setConfig({ ...config, Color: color })}
                  className={`w-7 h-7 rounded-full transition-all ${
                    config.Color === color
                      ? 'ring-2 ring-offset-2 ring-offset-app-surface'
                      : 'hover:scale-110'
                  }`}
                  style={{
                    backgroundColor: color,
                    boxShadow: config.Color === color ? `0 0 0 2px #0f1117, 0 0 0 4px ${color}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {isFileBased ? (
            /* SQLite */
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Caminho do Arquivo</label>
              <input
                type="text"
                value={config.Database}
                onChange={(e) => setConfig({ ...config, Database: e.target.value })}
                className="w-full h-9 px-3 bg-app-bg border border-app-border rounded text-sm font-mono focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors"
                placeholder="/caminho/para/banco.db"
              />
            </div>
          ) : (
            <>
              {/* Host + Port */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Host</label>
                  <input
                    type="text"
                    value={config.Host}
                    onChange={(e) => setConfig({ ...config, Host: e.target.value })}
                    className="w-full h-9 px-3 bg-app-bg border border-app-border rounded text-sm font-mono focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors"
                    placeholder="localhost"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Porta</label>
                  <input
                    type="number"
                    value={config.Port}
                    onChange={(e) => setConfig({ ...config, Port: parseInt(e.target.value) || 0 })}
                    className="w-full h-9 px-3 bg-app-bg border border-app-border rounded text-sm font-mono focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors"
                  />
                </div>
              </div>

              {/* User + Password */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Usuário</label>
                  <input
                    type="text"
                    value={config.User}
                    onChange={(e) => setConfig({ ...config, User: e.target.value })}
                    className="w-full h-9 px-3 bg-app-bg border border-app-border rounded text-sm focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Senha</label>
                  <input
                    type="password"
                    value={config.Password}
                    onChange={(e) => setConfig({ ...config, Password: e.target.value })}
                    className="w-full h-9 px-3 bg-app-bg border border-app-border rounded text-sm focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors"
                  />
                </div>
              </div>

              {/* Database */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Database</label>
                <input
                  type="text"
                  value={config.Database}
                  onChange={(e) => setConfig({ ...config, Database: e.target.value })}
                  className="w-full h-9 px-3 bg-app-bg border border-app-border rounded text-sm font-mono focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors"
                />
              </div>

              {/* SSL */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">SSL Mode</label>
                <select
                  value={config.SSLMode}
                  onChange={(e) => setConfig({ ...config, SSLMode: e.target.value })}
                  className="w-full h-9 px-3 bg-app-bg border border-app-border rounded text-sm focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors"
                >
                  <option value="disable">Disable</option>
                  <option value="require">Require</option>
                  <option value="verify-ca">Verify CA</option>
                  <option value="verify-full">Verify Full</option>
                </select>
              </div>
            </>
          )}

          {/* Oracle Wallet */}
          {config.Type === 'oracle' && (
            <div className="p-3 bg-app-bg rounded border border-app-border">
              <p className="text-[10px] text-zinc-500 mb-2">
                Para Oracle Wallet, deixe Usuario e Senha em branco.
                O sistema usara o wallet configurado no Oracle Instant Client.
              </p>
              <p className="text-[10px] text-zinc-500">
                TNS_ADMIN deve estar configurado para o diretorio do wallet.
              </p>
            </div>
          )}

          {/* Custom Driver */}
          {config.Type === 'custom' && (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Caminho do Driver (.so/.dll)</label>
                <input
                  type="text"
                  value={config.DriverPath}
                  onChange={(e) => setConfig({ ...config, DriverPath: e.target.value })}
                  className="w-full h-9 px-3 bg-app-bg border border-app-border rounded text-sm font-mono focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors"
                  placeholder="/usr/lib/libmariadb.so ou C:\mariadb-connector-odbc.dll"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Driver Name (para sql.Open)</label>
                <input
                  type="text"
                  value={config.ExtraOptions}
                  onChange={(e) => setConfig({ ...config, ExtraOptions: e.target.value })}
                  className="w-full h-9 px-3 bg-app-bg border border-app-border rounded text-sm font-mono focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors"
                  placeholder="mariadb"
                />
              </div>
            </>
          )}

          {/* Test Result */}
          {testResult && (
            <div
              className={`px-3 py-2 rounded text-xs flex items-center gap-2 ${
                testResult.success
                  ? 'bg-accent-green/10 border border-accent-green/20 text-accent-green'
                  : 'bg-accent-red/10 border border-accent-red/20 text-accent-red'
              }`}
            >
              {testResult.success ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
              )}
              {testResult.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-app-border flex items-center justify-between">
          <button
            onClick={handleTest}
            disabled={testing || !config.Name}
            className="h-8 px-4 bg-app-bg border border-app-border rounded text-xs font-medium text-zinc-300 hover:bg-app-hover hover:text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            {testing ? (
              <>
                <div className="w-3 h-3 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
                Testando...
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <path d="M22 4L12 14.01l-3-3" />
                </svg>
                Testar Conexão
              </>
            )}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="h-8 px-4 rounded text-xs font-medium text-zinc-400 hover:text-white hover:bg-app-hover transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!config.Name}
              className="h-8 px-4 bg-accent-blue hover:bg-accent-blue/90 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded text-xs font-medium text-white transition-colors"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
