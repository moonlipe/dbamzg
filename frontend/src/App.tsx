import { useState, useEffect } from 'react';
import './style.css';
import {
  GetSavedConnections,
  SaveConnection,
  Connect,
  Disconnect,
  GetDatabases,
  GetTables,
  ExecuteQuery
} from '../wailsjs/go/main/App';
import { types } from '../wailsjs/go/models';

type ConnectionConfig = types.ConnectionConfig;
type Table = types.Table;
type QueryResult = types.QueryResult;

function App() {
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [activeConnection, setActiveConnection] = useState<string | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [query, setQuery] = useState('SELECT * FROM ');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Carrega conexões salvas
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

  const handleConnect = async (config: ConnectionConfig) => {
    try {
      await Connect(config);
      setActiveConnection(config.Name);
      setError(null);

      // Carrega bancos de dados
      const dbs = await GetDatabases(config.Name);
      setDatabases(dbs || []);
    } catch (err) {
      setError(`Erro ao conectar: ${err}`);
    }
  };

  const handleDisconnect = async () => {
    if (activeConnection) {
      try {
        await Disconnect(activeConnection);
        setActiveConnection(null);
        setDatabases([]);
        setTables([]);
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

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">The Amzg DB</h1>
      </header>

      <div className="flex h-[calc(100vh-64px)]">
        {/* Sidebar - Database Navigator */}
        <aside className="w-64 bg-gray-850 border-r border-gray-700 p-4">
          <h2 className="text-lg font-semibold mb-4">Conexões</h2>

          {connections.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhuma conexão salva</p>
          ) : (
            <ul className="space-y-2">
              {connections.map((conn) => (
                <li key={conn.Name}>
                  <button
                    onClick={() => handleConnect(conn)}
                    className={`w-full text-left p-2 rounded ${
                      activeConnection === conn.Name
                        ? 'bg-blue-600'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    <span className="font-medium">{conn.Name}</span>
                    <span className="block text-xs text-gray-400">{conn.Type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {activeConnection && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold mb-2">Tabelas</h3>
              <ul className="space-y-1">
                {tables.map((table) => (
                  <li key={table.Name}>
                    <button
                      onClick={() => setQuery(`SELECT * FROM ${table.Name}`)}
                      className="w-full text-left p-1 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded"
                    >
                      {table.Name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">
          {/* SQL Editor */}
          <div className="flex-1 p-4">
            <div className="mb-4">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full h-32 p-3 bg-gray-800 border border-gray-700 rounded font-mono text-sm resize-none focus:outline-none focus:border-blue-500"
                placeholder="Digite sua query SQL..."
              />
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={handleExecuteQuery}
                disabled={!activeConnection}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium"
              >
                Executar
              </button>
              <button
                onClick={handleDisconnect}
                disabled={!activeConnection}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium"
              >
                Desconectar
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded mb-4 text-red-200">
                {error}
              </div>
            )}

            {/* Results Grid */}
            {result && (
              <div className="border border-gray-700 rounded overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-800">
                      {result.Columns?.map((col: string) => (
                        <th key={col} className="p-2 text-left border-b border-gray-700">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.Rows?.map((row: any[], rowIdx: number) => (
                      <tr key={rowIdx} className="hover:bg-gray-800">
                        {row.map((cell: any, cellIdx: number) => (
                          <td key={cellIdx} className="p-2 border-b border-gray-700">
                            {cell !== null ? String(cell) : <span className="text-gray-500">NULL</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-2 text-sm text-gray-400 bg-gray-800">
                  {result.RowCount} linhas retornadas
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
