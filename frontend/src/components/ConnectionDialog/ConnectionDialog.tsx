import { useState, useEffect } from 'react';
import { X, Database, TestTube } from 'lucide-react';
import { SaveConnection, TestConnection } from '../../../wailsjs/go/main/App';
import { types } from '../../../wailsjs/go/models';

interface ConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editConfig?: types.ConnectionConfig;
}

const DB_TYPES = [
  { value: 'sqlite', label: 'SQLite' },
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL/MariaDB' },
  { value: 'sqlserver', label: 'SQL Server' },
  { value: 'oracle', label: 'Oracle' },
];

const COLORS = [
  '#FF5733', '#33FF57', '#3357FF', '#FF33A6', '#A633FF',
  '#33FFF5', '#FFB833', '#33FFB8', '#B833FF', '#FF3333',
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
    Color: '#33FF57',
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
        Color: '#33FF57',
      });
    }
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-[500px] max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Database size={20} className="text-blue-400" />
            <h2 className="text-lg font-semibold">
              {editConfig ? 'Editar Conexão' : 'Nova Conexão'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Nome */}
          <div>
            <label className="block text-sm font-medium mb-1">Nome</label>
            <input
              type="text"
              value={config.Name}
              onChange={(e) => setConfig({ ...config, Name: e.target.value })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
              placeholder="Minha Conexão"
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium mb-1">Tipo</label>
            <select
              value={config.Type}
              onChange={(e) => setConfig({ ...config, Type: e.target.value })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
            >
              {DB_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Cor */}
          <div>
            <label className="block text-sm font-medium mb-1">Cor</label>
            <div className="flex gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setConfig({ ...config, Color: color })}
                  className={`w-8 h-8 rounded-full border-2 ${
                    config.Color === color ? 'border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {isFileBased ? (
            /* SQLite - Caminho do arquivo */
            <div>
              <label className="block text-sm font-medium mb-1">Caminho do Arquivo</label>
              <input
                type="text"
                value={config.Database}
                onChange={(e) => setConfig({ ...config, Database: e.target.value })}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                placeholder="/caminho/para/banco.db"
              />
            </div>
          ) : (
            <>
              {/* Host */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Host</label>
                  <input
                    type="text"
                    value={config.Host}
                    onChange={(e) => setConfig({ ...config, Host: e.target.value })}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                    placeholder="localhost"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Porta</label>
                  <input
                    type="number"
                    value={config.Port}
                    onChange={(e) => setConfig({ ...config, Port: parseInt(e.target.value) || 0 })}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Usuário/Senha */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Usuário</label>
                  <input
                    type="text"
                    value={config.User}
                    onChange={(e) => setConfig({ ...config, User: e.target.value })}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Senha</label>
                  <input
                    type="password"
                    value={config.Password}
                    onChange={(e) => setConfig({ ...config, Password: e.target.value })}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Database */}
              <div>
                <label className="block text-sm font-medium mb-1">Database</label>
                <input
                  type="text"
                  value={config.Database}
                  onChange={(e) => setConfig({ ...config, Database: e.target.value })}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* SSL */}
              <div>
                <label className="block text-sm font-medium mb-1">SSL Mode</label>
                <select
                  value={config.SSLMode}
                  onChange={(e) => setConfig({ ...config, SSLMode: e.target.value })}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                >
                  <option value="disable">Disable</option>
                  <option value="require">Require</option>
                  <option value="verify-ca">Verify CA</option>
                  <option value="verify-full">Verify Full</option>
                </select>
              </div>
            </>
          )}

          {/* Test Result */}
          {testResult && (
            <div
              className={`p-3 rounded ${
                testResult.success
                  ? 'bg-green-900/50 border border-green-700 text-green-200'
                  : 'bg-red-900/50 border border-red-700 text-red-200'
              }`}
            >
              {testResult.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-700">
          <button
            onClick={handleTest}
            disabled={testing || !config.Name}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded"
          >
            <TestTube size={16} />
            {testing ? 'Testando...' : 'Testar'}
          </button>
          <button
            onClick={handleSave}
            disabled={!config.Name}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
