# The Amzg DB - Features

## Fase 1 (MVP)

### 1. Gerenciamento de Conexões
- Criar/editar/excluir conexões
- Suporte a: SQLite, PostgreSQL, MySQL/MariaDB, SQL Server, Oracle
- Testar conexão antes de salvar
- SSH Tunnel
- SSL/TLS
- Color coding por conexão

### 2. Database Navigator
- Tree view: conexões → bancos → schemas → tabelas
- Expandir: colunas, índices, constraints, views, procedures
- Busca por nome
- DDL viewer
- Context menu

### 3. Editor SQL
- Monaco Editor com syntax highlighting
- Autocomplete inteligente
- Multi-tab
- Executar seleção ou query inteira
- Formatação de SQL
- Histórico de queries
- **SQL Variables**: `${nome}` ou `:nome` com modal de preenchimento

### 4. Visualizador de Dados
- AG Grid com paginação
- Edição inline
- Filtros e sorting
- Export selection

### 5. Schema Visual (ERD)
- React Flow com tables e foreign keys
- Auto-layout
- Zoom/pan
- Export PNG/SVG

### 6. Execução de Scripts
- Multi-query editor
- Transaction support
- Progress tracking

### 7. Import/Export
- **Export**: CSV, JSON, XML, SQL INSERT, XLSX, ODS
- **Import**: CSV, XLSX, ODS
- Column mapping
- Preview

### 8. Monitoramento
- Query history (local SQLite)
- Execution time tracking
- EXPLAIN visualization

## Fase 2 (Post-MVP)

- Schema compare
- Data compare
- Mock data generation
- Dashboards
- Git integration
- Backup/restore
- Mais drivers (MongoDB, Redis, DuckDB)
