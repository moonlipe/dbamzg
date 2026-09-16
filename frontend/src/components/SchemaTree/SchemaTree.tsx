import { useState } from 'react';
import { ChevronRight, ChevronDown, Database, Table, Columns, Key } from 'lucide-react';
import { GetDatabases, GetSchemas, GetTables, GetColumns } from '../../../wailsjs/go/main/App';

interface TreeNode {
  id: string;
  name: string;
  type: 'connection' | 'database' | 'schema' | 'table' | 'column';
  children?: TreeNode[];
  data?: any;
  loaded?: boolean;
}

interface SchemaTreeProps {
  connectionName: string;
  onTableSelect: (tableName: string) => void;
}

export default function SchemaTree({ connectionName, onTableSelect }: SchemaTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [tree, setTree] = useState<TreeNode[]>([]);

  const setLoadingState = (id: string, isLoading: boolean) => {
    setLoading((prev) => {
      const next = new Set(prev);
      if (isLoading) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleExpand = async (node: TreeNode) => {
    const isExpanded = expanded.has(node.id);

    if (isExpanded) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });
      return;
    }

    // Expand first
    setExpanded((prev) => new Set(prev).add(node.id));

    // Load children if not loaded yet
    if (!node.loaded && node.type !== 'column') {
      await loadChildren(node);
    }
  };

  const loadChildren = async (node: TreeNode) => {
    setLoadingState(node.id, true);

    try {
      let children: TreeNode[] = [];

      if (node.type === 'connection') {
        // Load databases
        const databases = await GetDatabases(connectionName);
        children = (databases || []).map((dbName) => ({
          id: `${connectionName}/${dbName}`,
          name: dbName,
          type: 'database' as const,
          loaded: false,
        }));
      } else if (node.type === 'database') {
        // Load schemas
        const dbName = node.name;
        const schemas = await GetSchemas(connectionName, dbName);
        children = (schemas || []).map((schemaName) => ({
          id: `${connectionName}/${dbName}/${schemaName}`,
          name: schemaName,
          type: 'schema' as const,
          loaded: false,
        }));
      } else if (node.type === 'schema') {
        // Load tables
        const parts = node.id.split('/');
        const schemaName = parts[parts.length - 1];
        const tables = await GetTables(connectionName, schemaName);
        children = (tables || []).map((table) => ({
          id: `${node.id}/${table.Name}`,
          name: table.Name,
          type: 'table' as const,
          loaded: false,
          data: table,
        }));
      } else if (node.type === 'table') {
        // Load columns
        const tableName = node.name;
        const columns = await GetColumns(connectionName, tableName);
        children = (columns || []).map((col) => ({
          id: `${node.id}/${col.Name}`,
          name: col.Name,
          type: 'column' as const,
          loaded: true,
          data: col,
        }));
      }

      // Update the tree with loaded children
      setTree((prev) => updateNodeChildren(prev, node.id, children, true));
    } catch (err) {
      console.error('Erro ao carregar filhos:', err);
    } finally {
      setLoadingState(node.id, false);
    }
  };

  const updateNodeChildren = (
    nodes: TreeNode[],
    targetId: string,
    children: TreeNode[],
    loaded: boolean
  ): TreeNode[] => {
    return nodes.map((node) => {
      if (node.id === targetId) {
        return { ...node, children, loaded };
      }
      if (node.children) {
        return { ...node, children: updateNodeChildren(node.children, targetId, children, loaded) };
      }
      return node;
    });
  };

  // Initialize with connection root node
  if (tree.length === 0) {
    setTree([{
      id: connectionName,
      name: connectionName,
      type: 'connection',
      loaded: false,
    }]);
  }

  const getIcon = (type: string) => {
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
    const hasChildren = node.type !== 'column';
    const isTable = node.type === 'table';
    const isLoadingNode = loading.has(node.id);

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
              toggleExpand(node);
            }
            if (isTable) {
              onTableSelect(node.name);
            }
          }}
        >
          {/* Expand arrow or spinner */}
          {hasChildren ? (
            <span className="w-4 h-4 flex items-center justify-center shrink-0">
              {isLoadingNode ? (
                <div className="w-3 h-3 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
              ) : isExpanded ? (
                <ChevronDown size={12} className="text-zinc-500" />
              ) : (
                <ChevronRight size={12} className="text-zinc-500" />
              )}
            </span>
          ) : (
            <span className="w-4" />
          )}

          {/* Icon */}
          {getIcon(node.type)}

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
        {isExpanded && node.children && (
          <div className="animate-fade-in">
            {node.children.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="text-xs py-1">
      {tree.map((node) => renderNode(node))}
    </div>
  );
}
