import { useState, useEffect } from 'react';
import './style.css';
import {
  GetSavedConnections,
  Connect,
  Disconnect,
  ExecuteQuery,
} from '../wailsjs/go/main/App';
import { types } from '../wailsjs/go/models';
import SchemaTree from './components/SchemaTree/SchemaTree';
import ConnectionDialog from './components/ConnectionDialog/ConnectionDialog';
import SqlEditor from './components/SqlEditor/SqlEditor';

function App() {
  const [connections, setConnections] = useState<types.ConnectionConfig[]>([]);
  const [activeConnection, setActiveConnection] = useState<string | null>(null);
  const [query, setQuery] = useState('SELECT * FROM ');
  const [result, setResult] = useState<types.QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const conns = await GetSavedConnections();
      setConnections(conns || []);
    } catch (err) {
      console.error('Erro ao carregar conexões:', err);
    }
  };

  const handleConnect = async (config: types.ConnectionConfig) => {
    try {
      await Connect(config);
      setActiveConnection(config.Name);
      setError(null);
    } catch (err) {
      setError(`Erro ao conectar: ${err}`);
    }
  };

  const handleDisconnect = async () => {
    if (activeConnection) {
      try {
        await Disconnect(activeConnection);
        setActiveConnection(null);
        setResult(null);
      } catch (err) {
        setError(`Erro ao desconectar: ${err}`);
      }
    }
  };

  const handleExecuteQuery = async () => {
    if (!activeConnection) {
      setError('Nenhuma conexão ativa');
      return;
    }

    try {
      const res = await ExecuteQuery(activeConnection, query);
      setResult(res);
      setError(null);
    } catch (err) {
      setError(`Erro ao executar query: ${err}`);
    }
  };

  const handleTableSelect = (tableName: string) => {
    setQuery(`SELECT * FROM ${tableName}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecuteQuery();
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white" onKeyDown={handleKeyDown}>
      {/* Header */}
      <header className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span className="text-blue-400">⚡</span> The Amzg DB
        </h1>
        <div className="flex items-center gap-2">
          {activeConnection && (
            <span className="text-sm text-gray-400">
              Conectado: <span className="text-white">{activeConnection}</span>
            </span>
          )}
        </div>
      </header>

      <div className="flex h-[calc(100vh-52px)]">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-850 border-r border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-700 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-300">Conexões</span>
            <button
              onClick={() => setIsDialogOpen(true)}
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              + Nova
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            {connections.length === 0 ? (
              <p className="p-4 text-gray-500 text-sm">Nenhuma conexão salva</p>
            ) : (
              <div className="py-1">
                {connections.map((conn) => (
                  <div key={conn.Name}>
                    <button
                      onClick={() => handleConnect(conn)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-700 ${
                        activeConnection === conn.Name ? 'bg-blue-600/30 border-l-2 border-blue-500' : ''
                      }`}
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: conn.Color || '#33FF57' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{conn.Name}</div>
                        <div className="text-xs text-gray-500">{conn.Type}</div>
                      </div>
                    </button>
                    {activeConnection === conn.Name && (
                      <div className="border-l-2 border-blue-500">
                        <SchemaTree
                          connectionName={conn.Name}
                          onTableSelect={handleTableSelect}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          {activeConnection && (
            <div className="p-3 border-t border-gray-700">
              <button
                onClick={handleDisconnect}
                className="w-full px-3 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-sm"
              >
                Desconectar
              </button>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center gap-2">
            <button
              onClick={handleExecuteQuery}
              disabled={!activeConnection}
              className="flex items-center gap-2 px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium"
            >
              ▶ Executar
            </button>
            <span className="text-xs text-gray-500">Ctrl+Enter</span>
          </div>

          {/* SQL Editor */}
          <div className="h-[200px] border-b border-gray-700">
            <SqlEditor value={query} onChange={setQuery} />
          </div>

          {/* Error */}
          {error && (
            <div className="mx-4 mt-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Results */}
          <div className="flex-1 overflow-auto p-4">
            {result && (
              <div>
                <div className="text-sm text-gray-400 mb-2">
                  {result.Message} ({result.Duration}ms)
                </div>
                <div className="border border-gray-700 rounded overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-800">
                        {result.Columns?.map((col: string) => (
                          <th
                            key={col}
                            className="px-3 py-2 text-left text-xs font-medium text-gray-300 border-b border-gray-700"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.Rows?.map((row: any[], rowIdx: number) => (
                        <tr key={rowIdx} className="hover:bg-gray-800/50">
                          {row.map((cell: any, cellIdx: number) => (
                            <td
                              key={cellIdx}
                              className="px-3 py-2 border-b border-gray-700/50 text-sm"
                            >
                              {cell !== null ? (
                                String(cell)
                              ) : (
                                <span className="text-gray-500 italic">NULL</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Connection Dialog */}
      <ConnectionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSave={loadConnections}
      />
    </div>
  );
}

export default App;
