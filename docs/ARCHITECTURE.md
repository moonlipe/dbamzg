# The Amzg DB - Arquitetura

## Visão Geral

Arquitetura **modular por packages** com binário único. Go + Wails v3 + React/TypeScript.

## Diagrama de Camadas

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

## Estrutura de Packages

```
internal/
├── db/           # Connection manager, driver interface, executor
├── drivers/      # Implementações por banco de dados
├── export/       # Formatos de exportação
└── config/       # Configuração do app

frontend/src/
├── components/   # Componentes React
├── hooks/        # Custom hooks
├── store/        # Zustand stores
└── lib/          # Utilitários
```

## Princípios

- **Modular**: Cada funcionalidade é um package separado
- **Interface-driven**: Drivers implementam interface comum
- **Pure Go**: Sem CGO para facilitar cross-compilation
- **Linux-first**: WebKitGTK nativo (Wayland + X11)
