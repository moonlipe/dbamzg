# The Amzg Db - Plano do Projeto

> **NOTA**: Este arquivo é apenas para referência interna e não é versionado.

## Visão Geral

Clone do DBeaver construído com **Go + Wails v3** + **React/TypeScript**, sob licença **GPL3**. Multi-banco de dados, sem Java, binários leves (~10-30MB).

**Linux-first**, mas multi-plataforma (macOS, Windows).

**Arquitetura**: Modular por packages (binário único, código bem organizado).

## Stack Tecnológica

### Backend (Go)
- **Runtime**: Go 1.22+
- **Desktop Framework**: Wails v3
- **Drivers de DB** (pure Go, sem CGO):
  - SQLite: `modernc.org/sqlite`
  - PostgreSQL: `github.com/jackc/pgx/v5`
  - MySQL/MariaDB: `github.com/go-sql-driver/mysql`
  - SQL Server: `github.com/microsoft/go-mssqldb`
  - Oracle: `github.com/godror/godror`

### Frontend (WebView)
- **Framework**: React 18+ com TypeScript
- **Build Tool**: Vite
- **UI Library**: shadcn/ui + Tailwind CSS
- **Code Editor**: Monaco Editor
- **Tabela de Dados**: AG Grid Community
- **Diagrams**: React Flow (para ERD)
- **State Management**: Zustand
- **Export Libraries**: 
  - XLSX: `xlsx` (SheetJS) ou `exceljs`
  - ODS: `ods` ou `opends`

### Infraestrutura
- **Versionamento**: Git + GitHub
- **CI/CD**: GitHub Actions (build multi-plataforma)
- **Licença**: GPL-3.0

## Wayland vs X11

Wails usa WebView nativo do OS. No Linux:
- **Wayland**: WebKitGTK suporta nativamente via `GDK_BACKEND=wayland`
- **X11**: WebKitGTK suporta via `GDK_BACKEND=x11` ou fallback automático

Não há configuração especial necessária - o WebKitGTK detecta automaticamente o display server disponível.

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    Desktop App (Wails v3)               │
├─────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript)                          │
│  ┌───────────┬───────────┬───────────┬───────────────┐  │
│  │ SQL Editor│ Data Grid │ ERD View  │ Connection Mgr│  │
│  │ (Monaco)  │ (AG Grid) │(ReactFlow)│               │  │
│  └───────────┴───────────┴───────────┴───────────────┘  │
├─────────────────────────────────────────────────────────┤
│  Wails Bridge (JSON, in-memory, <1ms)                   │
├─────────────────────────────────────────────────────────┤
│  Backend (Go)                                           │
│  ┌───────────┬───────────┬───────────┬───────────────┐  │
│  │ DB Manager│ Query Exec│ Schema    │ Export/Import │  │
│  │           │           │ Inspector │               │  │
│  └───────────┴───────────┴───────────┴───────────────┘  │
│  ┌───────────┬───────────┬───────────┬───────────────┐  │
│  │ SQLite    │ PostgreSQL│ MySQL     │ SQL Server    │  │
│  │ driver    │ driver    │ driver    │ driver        │  │
│  └───────────┴───────────┴───────────┴───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Features (Fase 1 - MVP)

### 1. Gerenciamento de Conexões
- Criar/editar/excluir conexões
- Suporte a: SQLite, PostgreSQL, MySQL/MariaDB, SQL Server, Oracle
- Testar conexão antes de salvar
- SSH Tunnel (via `golang.org/x/crypto/ssh`)
- SSL/TLS configuration
- Salvar credenciais (encrypted local storage)
- Color coding por conexão

### 2. Database Navigator (Tree View)
- Árvore de conexões → bancos → schemas → tabelas
- Expandir para ver: colunas, índices, constraints, views, procedures
- Busca/filter por nome
- Click para ver DDL
- Context menu com ações

### 3. Editor SQL
- Monaco Editor com syntax highlighting
- Autocomplete inteligente (baseado no schema)
- Multi-tab (scripts múltiplos)
- Executar seleção ou query inteira
- Formatação de SQL
- Histórico de queries
- Output de execução (rows affected, tempo)
- **SQL Variables**: Variáveis no formato `${nome_variavel}` ou `:nome_variavel`
  - Ao executar query com variáveis, abre modal para preenchimento
  - Variáveis detectadas automaticamente no SQL
  - Valores preenchidos são substituídos antes da execução
  - Histórico de valores usados por variável (autocomplete)

### 4. Visualizador de Dados (Grid)
- AG Grid com dados paginados
- Editar células inline
- Adicionar/editar/deletar rows
- Filtros por coluna
- Sorting
- Exportar selection ou tudo (CSV, JSON, SQL)

### 5. Schema Visual (ERD)
- Gerar diagrama de um schema/banco
- React Flow com nodes (tables) e edges (FKs)
- Auto-layout
- Zoom/pan
- Editar (criar tabela, adicionar coluna) - gera SQL
- Exportar como PNG/SVG

### 6. Execução de Scripts
- Script editor multi-query
- Executar tudo ou por bloco
- Transaction support (BEGIN/COMMIT/ROLLBACK)
- Progresso de execução
- Cancelar query em execução

### 7. Import/Export
- **Export formats**: CSV, JSON, XML, SQL INSERT, XLSX, ODS
- **Import formats**: CSV, XLSX, ODS → tabela
- Mapeamento de colunas
- Preview antes de importar
- Configuração de encoding e delimitador para CSV

### 8. Monitoramento
- Query history (local SQLite)
- Execution time tracking
- Query plan visualization (EXPLAIN)

## Features (Fase 2 - Post-MVP)

- SSH key management
- Schema compare (entre databases)
- Data compare
- Mock data generation
- Dashboards/metrics
- Git integration para scripts
- Backup/restore
- More drivers (MongoDB, Redis, DuckDB)

## Estrutura de Diretórios

```
amzg-db/
├── main.go                    # Entry point Wails
├── app.go                     # App struct (Wails bindings)
├── go.mod
├── go.sum
├── wails.json                 # Configuração Wails
├── internal/
│   ├── db/
│   │   ├── manager.go         # Connection manager
│   │   ├── driver.go          # Driver interface
│   │   ├── executor.go        # Query executor
│   │   └── schema.go          # Schema inspector
│   ├── drivers/
│   │   ├── sqlite.go
│   │   ├── postgres.go
│   │   ├── mysql.go
│   │   ├── sqlserver.go
│   │   └── oracle.go
│   ├── export/
│   │   ├── csv.go
│   │   ├── json.go
│   │   ├── sql.go
│   │   ├── xlsx.go
│   │   └── ods.go
│   └── config/
│       └── config.go          # App config (connections, prefs)
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/
│   │   │   ├── Layout/
│   │   │   ├── SqlEditor/
│   │   │   ├── DataGrid/
│   │   │   ├── SchemaTree/
│   │   │   ├── ErdDiagram/
│   │   │   ├── ConnectionDialog/
│   │   │   └── ExportDialog/
│   │   ├── hooks/
│   │   ├── store/
│   │   └── lib/
│   └── wailsjs/               # Auto-generated Go bindings
└── build/
    ├── appicon.png
    └── ...
```

## Ordem de Implementação

### Semana 1-2: Setup e Fundação
1. Inicializar projeto Wails com template React-TS
2. Configurar shadcn/ui + Tailwind
3. Implementar driver interface genérica
4. Implementar SQLite driver (mais simples)
5. Connection manager (CRUD + save config)

### Semana 3-4: UI Básica
1. Layout principal (sidebar + tabs)
2. Database Navigator (tree view)
3. Connection dialog
4. Basic SQL editor (Monaco)

### Semana 5-6: Core Features
1. Query executor com results grid
2. PostgreSQL driver
3. MySQL driver
4. Data grid editável

### Semana 7-8: Advanced Features
1. ERD visualization
2. Export/Import
3. Query history
4. SQL Server + Oracle drivers

### Semana 9-10: Polish
1. SSH tunnel support
2. SQL formatting
3. Keyboard shortcuts
4. Error handling
5. Testing

## Driver Interface

```go
type Driver interface {
    Connect(config ConnectionConfig) (*sql.DB, error)
    GetDatabases(db *sql.DB) ([]string, error)
    GetSchemas(db *sql.DB, database string) ([]string, error)
    GetTables(db *sql.DB, schema string) ([]Table, error)
    GetColumns(db *sql.DB, table string) ([]Column, error)
    GetIndexes(db *sql.DB, table string) ([]Index, error)
    GetForeignKeys(db *sql.DB, table string) ([]ForeignKey, error)
    GetDDL(db *sql.DB, table string) (string, error)
    ExecuteQuery(db *sql.DB, query string) (*QueryResult, error)
}
```
