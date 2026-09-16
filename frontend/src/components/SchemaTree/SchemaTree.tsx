import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Database, Table, Columns, Key, Hash } from 'lucide-react';
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
      const rootNode: TreeNode = {
        id: connectionName,
        name: connectionName,
        type: 'connection',
        children: [],
      };

      // Carrega databases
      const databases = await GetDatabases(connectionName);
      for (const dbName of databases || []) {
        const dbNode: TreeNode = {
          id: `${connectionName}/${dbName}`,
          name: dbName,
          type: 'database',
          children: [],
        };

        // Carrega schemas
        const schemas = await GetSchemas(connectionName, dbName);
        for (const schemaName of schemas || []) {
          const schemaNode: TreeNode = {
            id: `${connectionName}/${dbName}/${schemaName}`,
            name: schemaName,
            type: 'schema',
            children: [],
          };

          // Carrega tabelas
          const tables = await GetTables(connectionName, schemaName);
          for (const table of tables || []) {
            const tableNode: TreeNode = {
              id: `${connectionName}/${dbName}/${schemaName}/${table.Name}`,
              name: table.Name,
              type: 'table',
              children: [],
              data: table,
            };

            // Carrega colunas
            const columns = await GetColumns(connectionName, table.Name);
            for (const col of columns || []) {
              tableNode.children!.push({
                id: `${connectionName}/${dbName}/${schemaName}/${table.Name}/${col.Name}`,
                name: col.Name,
                type: 'column',
                data: col,
              });
            }

            schemaNode.children!.push(tableNode);
          }

          dbNode.children!.push(schemaNode);
        }

        rootNode.children!.push(dbNode);
      }

      setTree([rootNode]);
      setExpanded(new Set([connectionName]));
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

  const getIcon = (type: string) => {
    switch (type) {
      case 'connection':
        return <Database size={16} className="text-blue-400" />;
      case 'database':
        return <Database size={16} className="text-green-400" />;
      case 'schema':
        return <Database size={16} className="text-yellow-400" />;
      case 'table':
        return <Table size={16} className="text-purple-400" />;
      case 'column':
        return <Columns size={16} className="text-gray-400" />;
      default:
        return null;
    }
  };

  const renderNode = (node: TreeNode, level: number = 0) => {
    const isExpanded = expanded.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1 py-1 px-2 hover:bg-gray-700 rounded cursor-pointer`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => {
            if (hasChildren) {
              toggleExpand(node.id);
            }
            if (node.type === 'table') {
              onTableSelect(node.name);
            }
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown size={14} className="text-gray-400" />
            ) : (
              <ChevronRight size={14} className="text-gray-400" />
            )
          ) : (
            <span className="w-[14px]" />
          )}
          {getIcon(node.type)}
          <span className="text-sm truncate">{node.name}</span>
          {node.type === 'column' && node.data?.IsPrimaryKey && (
            <Key size={12} className="text-yellow-400 ml-auto" />
          )}
          {node.type === 'column' && (
            <span className="text-xs text-gray-500 ml-auto">{node.data?.DataType}</span>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div>
            {node.children!.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="p-4 text-gray-400 text-sm">Carregando schema...</div>;
  }

  return (
    <div className="text-sm">
      {tree.map((node) => renderNode(node))}
    </div>
  );
}
