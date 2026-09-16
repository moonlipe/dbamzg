package main

import (
	"context"
	"time"

	"amzg-db/internal/db"
	"amzg-db/internal/drivers/mysql"
	"amzg-db/internal/drivers/postgres"
	"amzg-db/internal/drivers/sqlite"
	"amzg-db/internal/drivers/sqlserver"
	"amzg-db/internal/export"
	"amzg-db/internal/history"
	"amzg-db/internal/sqlvariables"
	"amzg-db/internal/types"
)

// App struct
type App struct {
	ctx         context.Context
	connMgr     *db.ConnectionManager
	history     *history.History
	variableMgr *sqlvariables.VariableManager
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		history:     history.NewHistory(),
		variableMgr: sqlvariables.NewVariableManager(),
	}
}

// startup is called when the app starts
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Inicializa connection manager
	a.connMgr = db.NewConnectionManager()

	// Registra drivers
	a.connMgr.RegisterDriver("sqlite", sqlite.New())
	a.connMgr.RegisterDriver("postgres", postgres.New())
	a.connMgr.RegisterDriver("mysql", mysql.New())
	a.connMgr.RegisterDriver("sqlserver", sqlserver.New())
}

// GetSavedConnections retorna todas as conexões salvas
func (a *App) GetSavedConnections() []types.ConnectionConfig {
	return a.connMgr.GetSavedConnections()
}

// SaveConnection salva uma nova conexão
func (a *App) SaveConnection(config types.ConnectionConfig) error {
	return a.connMgr.SaveConnection(config)
}

// RemoveConnection remove uma conexão
func (a *App) RemoveConnection(name string) error {
	return a.connMgr.RemoveConnection(name)
}

// TestConnection testa uma conexão
func (a *App) TestConnection(config types.ConnectionConfig) error {
	return a.connMgr.TestConnection(config)
}

// Connect conecta a um banco de dados
func (a *App) Connect(config types.ConnectionConfig) error {
	_, err := a.connMgr.Connect(config)
	return err
}

// Disconnect desconecta de um banco
func (a *App) Disconnect(name string) error {
	return a.connMgr.Disconnect(name)
}

// GetDatabases retorna os bancos de uma conexão
func (a *App) GetDatabases(connName string) ([]string, error) {
	conn, err := a.connMgr.GetConnection(connName)
	if err != nil {
		return nil, err
	}

	return conn.Driver.GetDatabases(conn.DB)
}

// GetSchemas retorna os schemas de um banco
func (a *App) GetSchemas(connName, database string) ([]string, error) {
	conn, err := a.connMgr.GetConnection(connName)
	if err != nil {
		return nil, err
	}

	return conn.Driver.GetSchemas(conn.DB, database)
}

// GetTables retorna as tabelas de um schema
func (a *App) GetTables(connName, schema string) ([]types.Table, error) {
	conn, err := a.connMgr.GetConnection(connName)
	if err != nil {
		return nil, err
	}

	return conn.Driver.GetTables(conn.DB, schema)
}

// GetColumns retorna as colunas de uma tabela
func (a *App) GetColumns(connName, table string) ([]types.Column, error) {
	conn, err := a.connMgr.GetConnection(connName)
	if err != nil {
		return nil, err
	}

	return conn.Driver.GetColumns(conn.DB, table)
}

// ExecuteQuery executa uma query
func (a *App) ExecuteQuery(connName, query string) (*types.QueryResult, error) {
	conn, err := a.connMgr.GetConnection(connName)
	if err != nil {
		return nil, err
	}

	start := time.Now()
	result, err := conn.Driver.ExecuteQuery(conn.DB, query)
	if err != nil {
		return nil, err
	}

	result.Duration = time.Since(start).Milliseconds()
	return result, nil
}

// ExportData exporta dados para um arquivo
func (a *App) ExportData(result *types.QueryResult, filename string, format string) error {
	f := export.Format(format)
	return export.ExportToFile(result, filename, f)
}

// GetQueryHistory retorna o histórico de queries
func (a *App) GetQueryHistory() ([]history.QueryEntry, error) {
	return a.history.GetAll()
}

// GetQueryHistoryByConnection retorna histórico filtrado por conexão
func (a *App) GetQueryHistoryByConnection(connection string) ([]history.QueryEntry, error) {
	return a.history.GetByConnection(connection)
}

// SearchQueryHistory busca no histórico
func (a *App) SearchQueryHistory(text string) ([]history.QueryEntry, error) {
	return a.history.Search(text)
}

// ClearQueryHistory limpa o histórico
func (a *App) ClearQueryHistory() error {
	return a.history.Clear()
}

// ExtractSQLVariables extrai variáveis de uma query
func (a *App) ExtractSQLVariables(query string) []sqlvariables.Variable {
	return a.variableMgr.ExtractVariables(query)
}

// ReplaceSQLVariables substitui variáveis na query
func (a *App) ReplaceSQLVariables(query string, values map[string]string) string {
	return a.variableMgr.ReplaceVariables(query, values)
}
