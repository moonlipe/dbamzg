import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Database, Table, Columns, Key } from 'lucide-react';
import { GetDatabases, GetSchemas, GetTables, GetColumns } from '../../../wailsjs/go/main/App';
import { types } from '../../../wailsjs/go/models';

interface TreeNode {
  id: string;
  name: string;
  type: 'connection' | 'database' | 'schema' | 'table' | 'column';
  children?: TreeNode[];
  data?: any;
}

interface SchemaTreeProps {
  connectionName: string;
  onTableSelect: (tableName: string) => void;
}

export default function SchemaTree({ connectionName, onTableSelect }: SchemaTreeProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTree();
  }, [connectionName]);

  const loadTree = async () => {
    if (!connectionName) return;
    setLoading(true);

    try {
      const databases = await GetDatabases(connectionName);
      const dbNodes: TreeNode[] = [];

      for (const dbName of databases || []) {
        const schemas = await GetSchemas(connectionName, dbName);
        const schemaNodes: TreeNode[] = [];

        for (const schemaName of schemas || []) {
          const tables = await GetTables(connectionName, schemaName);
          const tableNodes: TreeNode[] = [];

          for (const table of tables || []) {
            const columns = await GetColumns(connectionName, table.Name);
            const columnNodes: TreeNode[] = (columns || []).map((col) => ({
              id: `${connectionName}/${dbName}/${schemaName}/${table.Name}/${col.Name}`,
              name: col.Name,
              type: 'column' as const,
              data: col,
            }));

            tableNodes.push({
              id: `${connectionName}/${dbName}/${schemaName}/${table.Name}`,
              name: table.Name,
              type: 'table',
              children: columnNodes,
              data: table,
            });
          }

          schemaNodes.push({
            id: `${connectionName}/${dbName}/${schemaName}`,
            name: schemaName,
            type: 'schema',
            children: tableNodes,
          });
        }

        dbNodes.push({
          id: `${connectionName}/${dbName}`,
          name: dbName,
          type: 'database',
          children: schemaNodes,
        });
      }

      setTree(dbNodes);
      // Auto-expand first level
      if (dbNodes.length > 0) {
        setExpanded(new Set([dbNodes[0].id]));
      }
    } catch (err) {
      console.error('Erro ao carregar schema:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getIcon = (type: string, isExpanded?: boolean) => {
    const size = 14;
    switch (type) {
      case 'database':
        return <Database size={size} className="text-accent-blue shrink-0" />;
      case 'schema':
        return (
          <div className="w-3.5 h-3.5 rounded border border-zinc-600 flex items-center justify-center shrink-0">
            <div className="w-1.5 h-1.5 rounded-sm bg-zinc-500" />
          </div>
        );
      case 'table':
        return <Table size={size} className="text-accent-purple shrink-0" />;
      case 'column':
        return <Columns size={size} className="text-zinc-500 shrink-0" />;
      default:
        return null;
    }
  };

  const renderNode = (node: TreeNode, level: number = 0) => {
    const isExpanded = expanded.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isTable = node.type === 'table';

    return (
      <div key={node.id}>
        <div
          className={`group flex items-center gap-1.5 py-1 px-2 cursor-pointer transition-colors ${
            isTable
              ? 'hover:bg-accent-purple/10 hover:text-white text-zinc-300'
              : 'hover:bg-app-hover text-zinc-400 hover:text-zinc-200'
          }`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => {
            if (hasChildren) {
              toggleExpand(node.id);
            }
            if (isTable) {
              onTableSelect(node.name);
            }
          }}
        >
          {/* Expand arrow */}
          {hasChildren ? (
            <span className="w-4 h-4 flex items-center justify-center shrink-0">
              {isExpanded ? (
                <ChevronDown size={12} className="text-zinc-500" />
              ) : (
                <ChevronRight size={12} className="text-zinc-500" />
              )}
            </span>
          ) : (
            <span className="w-4" />
          )}

          {/* Icon */}
          {getIcon(node.type, isExpanded)}

          {/* Name */}
          <span className={`text-xs truncate ${isTable ? 'font-medium' : ''}`}>
            {node.name}
          </span>

          {/* Type badge for columns */}
          {node.type === 'column' && node.data && (
            <div className="ml-auto flex items-center gap-1">
              {node.data.IsPrimaryKey && (
                <Key size={10} className="text-accent-yellow" />
              )}
              <span className="text-2xs text-zinc-600 font-mono">
                {node.data.DataType}
              </span>
            </div>
          )}
        </div>

        {/* Children */}
        {isExpanded && hasChildren && (
          <div className="animate-fade-in">
            {node.children!.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="px-4 py-3 text-xs text-zinc-500 flex items-center gap-2">
        <div className="w-3 h-3 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="text-xs py-1">
      {tree.length === 0 ? (
        <div className="px-4 py-2 text-zinc-500 text-xs">
          Nenhum schema encontrado
        </div>
      ) : (
        tree.map((node) => renderNode(node))
      )}
    </div>
  );
}
