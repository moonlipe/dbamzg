# AGENTS.md - Guia para Assistentes de IA

> Este documento orienta IAs que trabalham no projeto The Amzg DB.
> Leia antes de gerar código.

## Visão do Projeto

The Amzg DB é um cliente de banco de dados multi-db, inspirado no DBeaver, mas construído com Go + Wails v3 + React/TypeScript. É um projeto **GPL3**, **Linux-first**, multi-plataforma.

**Arquitetura**: Modular por packages (binário único, código bem organizado em packages separados).

## Stack Obrigatória

| Camada | Tecnologia |
|--------|------------|
| Desktop | Wails v3 |
| Backend | Go 1.22+ |
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS |
| Editor SQL | Monaco Editor |
| Grid | AG Grid Community |
| ERD | React Flow |
| State | Zustand |

## Regras de Código

### Go

- Usar `internal/` para código privado
- Packages devem ser pequenos e focados
- Seguir effective go (nomes, error handling)
- Sem CGO - usar apenas drivers pure Go
- Usar `context.Context` para operações assíncronas
- Retornar erros, não panic
- Formatar com `gofmt`

### TypeScript/React

- Componentes funcionais com hooks
- TypeScript strict mode
- Usar interfaces para props
- Separar lógica de apresentação
- Hooks em `src/hooks/`
- Stores em `src/store/` (Zustand)
- Componentes em `src/components/`

### Estrutura de Pastas

```
internal/
├── db/           # Connection manager, driver interface, executor
├── drivers/      # Implementações por banco de dados
├── export/       # Formatos de exportação
└── config/       # Configuração do app

frontend/src/
├── components/   # Componentes React
│   ├── Layout/   # Shell principal
│   ├── SqlEditor/ # Monaco wrapper
│   ├── DataGrid/ # AG Grid wrapper
│   ├── SchemaTree/ # Tree view do navigator
│   ├── ErdDiagram/ # React Flow ERD
│   ├── ConnectionDialog/ # Dialog de conexão
│   └── ExportDialog/ # Dialog de exportação
├── hooks/        # Custom hooks
├── store/        # Zustand stores
└── lib/          # Utilitários
```

## Interface de Driver

Todo driver de banco DEVE implementar:

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

### Drivers Suportados

| Banco | Driver Go | Import Path |
|-------|-----------|-------------|
| SQLite | modernc.org/sqlite | `modernc.org/sqlite` |
| PostgreSQL | pgx/v5 | `github.com/jackc/pgx/v5` |
| MySQL | go-sql-driver/mysql | `github.com/go-sql-driver/mysql` |
| SQL Server | go-mssqldb | `github.com/microsoft/go-mssqldb` |
| Oracle | godror | `github.com/godror/godror` |

## Funcionalidades Especiais

### SQL Variables

O editor SQL suporta variáveis no formato `${nome}` ou `:nome`.

**Fluxo:**
1. Usuário escreve SQL com variáveis: `SELECT * FROM users WHERE id = ${user_id}`
2. Ao executar, sistema detecta variáveis automaticamente
3. Abre modal com campos para preenchimento
4. Valores são substituídos no SQL antes da execução
5. Histórico de valores fica salvo (autocomplete)

**Implementação:**
- Backend: regex para detectar `${...}` ou `:word` no SQL
- Frontend: modal de variáveis antes de executar
- Store: manter histórico de valores por variável

### Exportação

Formatos suportados:

| Formato | Biblioteca | Notas |
|---------|------------|-------|
| CSV | encoding/csv (stdlib) | Delimitador configurável |
| JSON | encoding/json (stdlib) | Pretty print opcional |
| XML | encoding/xml (stdlib) | Formato hierárquico |
| SQL INSERT | Go puro | Gerar INSERT statements |
| XLSX | xlsx (SheetJS) ou exceljs | Uma aba por tabela |
| ODS | opends | Formato OpenDocument |

### Database Navigator

TreeView com estrutura:
```
Connection
├── Database
│   ├── Schema
│   │   ├── Tables
│   │   │   ├── Columns
│   │   │   ├── Indexes
│   │   │   └── Foreign Keys
│   │   ├── Views
│   │   ├── Procedures
│   │   └── Functions
```

## Comandos Úteis

```bash
# Desenvolvimento
wails dev

# Build production
wails build

# Build cross-platform
wails build -platform linux/amd64
wails build -platform darwin/universal
wails build -platform windows/amd64

# Go tests
go test ./...

# Frontend tests
cd frontend && npm test

# Lint Go
golangci-lint run

# Lint Frontend
cd frontend && npm run lint
```

## Antes de Commitar

1. Rodar `go test ./...`
2. Rodar `cd frontend && npm test`
3. Verificar `golangci-lint run`
4. Verificar `cd frontend && npm run lint`
5. Não committing segredos ou credenciais
6. Mensagens de commit em português ou inglês, formato conventional commits

## Formato de Commit

```
tipo(escopo): descrição

Exemplos:
feat(drivers): adicionar driver PostgreSQL
fix(ui): corrigir alinhamento da grid
docs(readme): atualizar instruções de instalação
```

## Contact

- Repositório: https://github.com/amzg/amzg-db
- Issues: https://github.com/amzg/amzg-db/issues
