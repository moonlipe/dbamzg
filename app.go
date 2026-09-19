package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"amzg-db/internal/db"
	"amzg-db/internal/drivers/mysql"
	"amzg-db/internal/drivers/oracle"
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

	// Inicializa connection manager (com persistência em disco)
	var err error
	a.connMgr, err = db.NewConnectionManager()
	if err != nil {
		panic(fmt.Sprintf("Erro ao inicializar gerenciador de conexões: %v", err))
	}

	// Registra drivers
	a.connMgr.RegisterDriver("sqlite", sqlite.New())
	a.connMgr.RegisterDriver("postgres", postgres.New())
	a.connMgr.RegisterDriver("mysql", mysql.New())
	a.connMgr.RegisterDriver("sqlserver", sqlserver.New())
	a.connMgr.RegisterDriver("oracle", oracle.New())
}

// GetSavedConnections retorna todas as conexões salvas
func (a *App) GetSavedConnections() []types.ConnectionConfig {
	return a.connMgr.GetAllConnections()
}

// SaveProject salva um projeto
func (a *App) SaveProject(project types.Project) error {
	return a.connMgr.SaveProject(project)
}

// RemoveProject remove um projeto
func (a *App) RemoveProject(name string) error {
	return a.connMgr.RemoveProject(name)
}

// GetProjects retorna todos os projetos
func (a *App) GetProjects() []types.Project {
	return a.connMgr.GetProjects()
}

// GetProject retorna um projeto pelo nome
func (a *App) GetProject(name string) (*types.Project, error) {
	return a.connMgr.GetProject(name)
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

// GetViews retorna as views de um schema
func (a *App) GetViews(connName, schema string) ([]types.View, error) {
	conn, err := a.connMgr.GetConnection(connName)
	if err != nil {
		return nil, err
	}

	return conn.Driver.GetViews(conn.DB, schema)
}

// GetProcedures retorna as stored procedures de um schema
func (a *App) GetProcedures(connName, schema string) ([]types.Procedure, error) {
	conn, err := a.connMgr.GetConnection(connName)
	if err != nil {
		return nil, err
	}

	return conn.Driver.GetProcedures(conn.DB, schema)
}

// GetFunctions retorna as functions de um schema
func (a *App) GetFunctions(connName, schema string) ([]types.DBFunc, error) {
	conn, err := a.connMgr.GetConnection(connName)
	if err != nil {
		return nil, err
	}

	return conn.Driver.GetFunctions(conn.DB, schema)
}

// GetTriggers retorna os triggers de um schema
func (a *App) GetTriggers(connName, schema string) ([]types.Trigger, error) {
	conn, err := a.connMgr.GetConnection(connName)
	if err != nil {
		return nil, err
	}

	return conn.Driver.GetTriggers(conn.DB, schema)
}

// ExecuteQuery executa uma query
func (a *App) ExecuteQuery(connName, query string, transactionMode string) (*types.QueryResult, error) {
	conn, err := a.connMgr.GetConnection(connName)
	if err != nil {
		return nil, err
	}

	start := time.Now()

	// Detectar tipo antes de iniciar tx
	trimmedUpper := strings.TrimSpace(strings.ToUpper(query))
	isSelect := strings.HasPrefix(trimmedUpper, "SELECT") || strings.HasPrefix(trimmedUpper, "WITH")
	isDML := strings.HasPrefix(trimmedUpper, "INSERT") || strings.HasPrefix(trimmedUpper, "UPDATE") || strings.HasPrefix(trimmedUpper, "DELETE") || strings.HasPrefix(trimmedUpper, "MERGE")

	// Iniciar transação conforme o modo
	if conn.Tx == nil {
		if transactionMode == "manual" {
			tx, err := conn.DB.Begin()
			if err != nil {
				return nil, fmt.Errorf("erro ao iniciar transação: %w", err)
			}
			conn.Tx = tx
			conn.TxMode = types.Manual
			log.Printf("[manager] Transação iniciada para modo manual")
		} else if transactionMode == "smartcommit" && isDML {
			tx, err := conn.DB.Begin()
			if err != nil {
				return nil, fmt.Errorf("erro ao iniciar transação: %w", err)
			}
			conn.Tx = tx
			conn.TxMode = types.SmartCommit
			log.Printf("[manager] Transação iniciada para smartcommit DML")
		}
	}

	// Se tiver transação ativa, executar nela
	var result *types.QueryResult
	if conn.Tx != nil {
		if isSelect {
			rows, err := conn.Tx.Query(query)
			if err != nil {
				return nil, err
			}
			defer rows.Close()

			columns, err := rows.Columns()
			if err != nil {
				return nil, err
			}

			var data [][]interface{}
			for rows.Next() {
				values := make([]interface{}, len(columns))
				valuePtrs := make([]interface{}, len(columns))
				for i := range values {
					valuePtrs[i] = &values[i]
				}
				if err := rows.Scan(valuePtrs...); err != nil {
					return nil, err
				}
				for i, v := range values {
					if b, ok := v.([]byte); ok {
						values[i] = string(b)
					}
				}
				data = append(data, values)
			}

			result = &types.QueryResult{
				Columns:  columns,
				Rows:     data,
				RowCount: len(data),
				Message:  fmt.Sprintf("%d rows returned", len(data)),
			}
		} else {
			// Para DML/DDL, executar na transação
			res, err := conn.Tx.Exec(query)
			if err != nil {
				return nil, err
			}
			affected, _ := res.RowsAffected()
			result = &types.QueryResult{
				RowCount: int(affected),
				Message:  fmt.Sprintf("%d rows affected", affected),
			}
		}
	} else {
		// Executar direto (autocommit ou smartcommit sem tx)
		trimmed := strings.TrimSpace(strings.ToUpper(query))
		if strings.HasPrefix(trimmed, "SELECT") || strings.HasPrefix(trimmed, "WITH") {
			if !strings.Contains(trimmed, " TOP ") && !strings.Contains(trimmed, "\nTOP ") && !strings.HasPrefix(strings.TrimSpace(trimmed), "TOP ") {
				if matched, _ := regexp.MatchString(`(?i)\bLIMIT\s+\d`, query); !matched {
					if conn.Config.Type == "sqlserver" {
						query = "SELECT TOP 200 " + query[7:]
					} else {
						if strings.HasSuffix(strings.TrimSpace(query), ";") {
							query = strings.TrimSuffix(strings.TrimSpace(query), ";") + " LIMIT 200;"
						} else {
							query = strings.TrimSpace(query) + " LIMIT 200"
						}
					}
				}
			}
		}
		result, err = conn.Driver.ExecuteQuery(conn.DB, query)
		if err != nil {
			return nil, err
		}
	}

	result.Duration = time.Since(start).Milliseconds()
	return result, nil
}

// ExecuteQueryUnlimited executa uma query sem limite de linhas
func (a *App) ExecuteQueryUnlimited(connName, query string) (*types.QueryResult, error) {
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

// BeginTransaction inicia uma transação manual
func (a *App) BeginTransaction(connName string) error {
	return a.connMgr.BeginTransaction(connName)
}

// Commit confirma a transação ativa
func (a *App) Commit(connName string) error {
	return a.connMgr.Commit(connName)
}

// Rollback desfaz a transação ativa
func (a *App) Rollback(connName string) error {
	return a.connMgr.Rollback(connName)
}

// SetTransactionMode define o modo de transação
func (a *App) SetTransactionMode(connName string, mode string) error {
	return a.connMgr.SetTransactionMode(connName, types.TransactionMode(mode))
}

// GetTransactionMode retorna o modo de transação atual
func (a *App) GetTransactionMode(connName string) (string, error) {
	mode, err := a.connMgr.GetTransactionMode(connName)
	return string(mode), err
}

// --- Queries Salvas ---

// SaveSavedQuery salva uma query
func (a *App) SaveSavedQuery(q types.SavedQuery) error {
	return a.connMgr.SaveSavedQuery(q)
}

// RemoveSavedQuery remove uma query salva
func (a *App) RemoveSavedQuery(name string) error {
	return a.connMgr.RemoveSavedQuery(name)
}

// GetSavedQueries retorna todas as queries salvas
func (a *App) GetSavedQueries() []types.SavedQuery {
	return a.connMgr.GetSavedQueries()
}

// ExecuteQueryPaginated executa uma query com paginação server-side
func (a *App) ExecuteQueryPaginated(connName, query string, offset, limit int, transactionMode string) (*types.QueryResult, error) {
	conn, err := a.connMgr.GetConnection(connName)
	if err != nil {
		return nil, err
	}

	start := time.Now()

	// Detectar tipo da query antes de iniciar transação
	trimmed := strings.TrimSpace(strings.ToUpper(query))
	isSelect := strings.HasPrefix(trimmed, "SELECT") || strings.HasPrefix(trimmed, "WITH")
	isDML := strings.HasPrefix(trimmed, "INSERT") || strings.HasPrefix(trimmed, "UPDATE") || strings.HasPrefix(trimmed, "DELETE") || strings.HasPrefix(trimmed, "MERGE")

	// Iniciar transação conforme o modo
	if conn.Tx == nil {
		if transactionMode == "manual" {
			tx, err := conn.DB.Begin()
			if err != nil {
				return nil, fmt.Errorf("erro ao iniciar transação: %w", err)
			}
			conn.Tx = tx
			conn.TxMode = types.Manual
			log.Printf("[manager] Transação iniciada para modo manual (paginated)")
		} else if transactionMode == "smartcommit" && isDML {
			tx, err := conn.DB.Begin()
			if err != nil {
				return nil, fmt.Errorf("erro ao iniciar transação: %w", err)
			}
			conn.Tx = tx
			conn.TxMode = types.SmartCommit
			log.Printf("[manager] Transação iniciada para smartcommit DML (paginated)")
		}
	}

	// Wrap SELECT with pagination
	if isSelect {
		matched, _ := regexp.MatchString(`(?i)\bLIMIT\s+\d`, query)
		hasLimit := matched
		hasTop := strings.Contains(trimmed, " TOP ")

		if !hasLimit && !hasTop {
			q := strings.TrimSpace(query)
			q = strings.TrimSuffix(q, ";")

			if conn.Config.Type == "sqlserver" {
				hasOrderBy := strings.Contains(trimmed, " ORDER BY ")
				orderBy := ""
				if !hasOrderBy {
					orderBy = " ORDER BY (SELECT NULL)"
				}
				query = q + orderBy + fmt.Sprintf(" OFFSET %d ROWS FETCH NEXT %d ROWS ONLY", offset, limit)
			} else {
				query = q + fmt.Sprintf(" LIMIT %d OFFSET %d", limit, offset)
			}
		}
	}

	// Se tiver transação ativa, executar nela (SELECT e DML)
	if conn.Tx != nil {
		if isSelect {
			rows, err := conn.Tx.Query(query)
			if err != nil {
				return nil, err
			}
			defer rows.Close()

			columns, err := rows.Columns()
			if err != nil {
				return nil, err
			}

			colTypes, err := rows.ColumnTypes()
			var typeNames []string
			if err == nil {
				typeNames = make([]string, len(colTypes))
				for i, ct := range colTypes {
					typeNames[i] = ct.DatabaseTypeName()
				}
			}

			var data [][]interface{}
			for rows.Next() {
				values := make([]interface{}, len(columns))
				valuePtrs := make([]interface{}, len(columns))
				for i := range values {
					valuePtrs[i] = &values[i]
				}
				if err := rows.Scan(valuePtrs...); err != nil {
					return nil, err
				}
				for i, v := range values {
					if b, ok := v.([]byte); ok {
						values[i] = string(b)
					}
				}
				data = append(data, values)
			}

			result := &types.QueryResult{
				Columns:     columns,
				ColumnTypes: typeNames,
				Rows:        data,
				RowCount:    len(data),
				Message:     fmt.Sprintf("%d rows returned", len(data)),
			}
			result.Duration = time.Since(start).Milliseconds()
			return result, nil
		} else if isDML {
			res, err := conn.Tx.Exec(query)
			if err != nil {
				return nil, err
			}
			affected, _ := res.RowsAffected()
			result := &types.QueryResult{
				RowCount: int(affected),
				Message:  fmt.Sprintf("%d rows affected", affected),
			}
			result.Duration = time.Since(start).Milliseconds()
			return result, nil
		}
	}

	result, err := conn.Driver.ExecuteQuery(conn.DB, query)
	if err != nil {
		return nil, err
	}

	result.Duration = time.Since(start).Milliseconds()
	return result, nil
}

// ExportProject retorna JSON de um projeto para exportacao.
func (a *App) ExportProject(name string) (string, error) {
	project, err := a.connMgr.GetProject(name)
	if err != nil {
		return "", err
	}

	data, err := json.MarshalIndent(project, "", "  ")
	if err != nil {
		return "", fmt.Errorf("erro ao serializar projeto: %w", err)
	}

	return string(data), nil
}

// ImportProject importa um projeto a partir de JSON.
func (a *App) ImportProject(jsonData string) error {
	var project types.Project
	if err := json.Unmarshal([]byte(jsonData), &project); err != nil {
		return fmt.Errorf("JSON invalido: %w", err)
	}

	if project.Name == "" {
		return fmt.Errorf("projeto deve ter um nome")
	}

	return a.connMgr.SaveProject(project)
}
