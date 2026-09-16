# The Amzg DB - Stack Tecnológica

## Backend

| Componente | Tecnologia |
|------------|------------|
| Linguagem | Go 1.22+ |
| Desktop Framework | Wails v3 |
| Database | SQLite (local config) |

### Drivers de Banco (pure Go, sem CGO)

| Banco | Driver Go | Import Path |
|-------|-----------|-------------|
| SQLite | modernc.org/sqlite | `modernc.org/sqlite` |
| PostgreSQL | pgx/v5 | `github.com/jackc/pgx/v5` |
| MySQL/MariaDB | go-sql-driver/mysql | `github.com/go-sql-driver/mysql` |
| SQL Server | go-mssqldb | `github.com/microsoft/go-mssqldb` |
| Oracle | godror | `github.com/godror/godror` |

## Frontend (WebView)

| Componente | Tecnologia |
|------------|------------|
| Framework | React 18 + TypeScript |
| Build Tool | Vite |
| UI Library | shadcn/ui + Tailwind CSS |
| Code Editor | Monaco Editor |
| Data Grid | AG Grid Community |
| ERD | React Flow |
| State | Zustand |

### Bibliotecas de Exportação

| Formato | Biblioteca |
|---------|------------|
| XLSX | xlsx (SheetJS) ou exceljs |
| ODS | opends |

## Licença

GPL-3.0
