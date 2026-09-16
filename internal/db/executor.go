// Package db fornece executor de queries e inspetor de schema.
package db

import (
	"database/sql"
	"fmt"
	"regexp"
	"strings"
	"time"

	"amzg-db/internal/types"
)

const DefaultRowLimit = 200

// Executor executa queries e gerencia transações.
type Executor struct {
	conn *ActiveConnection
}

// NewExecutor cria um novo executor para uma conexão.
func NewExecutor(conn *ActiveConnection) *Executor {
	return &Executor{conn: conn}
}

// isSelectQuery verifica se a query é um SELECT.
func isSelectQuery(query string) bool {
	trimmed := strings.TrimSpace(strings.ToUpper(query))
	return strings.HasPrefix(trimmed, "SELECT") || strings.HasPrefix(trimmed, "WITH")
}

// addLimit adiciona cláusula LIMIT/TOP à query.
// Retorna a query modificada com limite.
func addLimit(query string, limit int, driverType string) string {
	if !isSelectQuery(query) {
		return query
	}

	// Não adicionar limit se já tiver TOP ou LIMIT
	upperQuery := strings.ToUpper(query)
	if strings.Contains(upperQuery, " TOP ") || strings.Contains(upperQuery, "\nTOP ") || strings.HasPrefix(strings.TrimSpace(upperQuery), "TOP ") {
		return query
	}
	if matched, _ := regexp.MatchString(`(?i)\bLIMIT\s+\d`, query); matched {
		return query
	}

	trimmed := strings.TrimSpace(query)

	// Para SQL Server, usar TOP
	if driverType == "sqlserver" {
		// Inserir TOP N após o SELECT
		if strings.HasPrefix(strings.ToUpper(trimmed), "SELECT ") {
			return "SELECT TOP " + fmt.Sprintf("%d", limit) + " " + trimmed[7:]
		}
	}

	// Para PostgreSQL, MySQL, SQLite, Oracle - usar LIMIT no final
	if strings.HasSuffix(strings.TrimSpace(trimmed), ";") {
		trimmed = strings.TrimSuffix(trimmed, ";")
		return trimmed + fmt.Sprintf(" LIMIT %d;", limit)
	}
	return trimmed + fmt.Sprintf(" LIMIT %d", limit)
}

// Execute executa uma query e retorna o resultado.
func (e *Executor) Execute(query string) (*types.QueryResult, error) {
	start := time.Now()

	// Adicionar limit para queries SELECT
	limitedQuery := addLimit(query, DefaultRowLimit, e.conn.Config.Type)

	result, err := e.conn.Driver.ExecuteQuery(e.conn.DB, limitedQuery)
	if err != nil {
		return nil, err
	}

	result.Duration = time.Since(start).Milliseconds()
	return result, nil
}

// ExecuteWithVars executa uma query substituindo variáveis.
// Variáveis no formato ${nome} ou :nome são substituídas pelos valores do map.
func (e *Executor) ExecuteWithVars(query string, vars map[string]string) (*types.QueryResult, error) {
	// Substitui ${nome} por valor
	for name, value := range vars {
		query = strings.ReplaceAll(query, "${"+name+"}", value)
		query = strings.ReplaceAll(query, ":"+name, value)
	}

	return e.Execute(query)
}

// Begin inicia uma transação.
func (e *Executor) Begin() (*sql.Tx, error) {
	return e.conn.DB.Begin()
}

// SchemaInspector inspeciona a estrutura do banco de dados.
type SchemaInspector struct {
	conn *ActiveConnection
}

// NewSchemaInspector cria um novo inspetor de schema.
func NewSchemaInspector(conn *ActiveConnection) *SchemaInspector {
	return &SchemaInspector{conn: conn}
}

// GetDatabases retorna os bancos disponíveis.
func (si *SchemaInspector) GetDatabases() ([]string, error) {
	return si.conn.Driver.GetDatabases(si.conn.DB)
}

// GetSchemas retorna os schemas de um banco.
func (si *SchemaInspector) GetSchemas(database string) ([]string, error) {
	return si.conn.Driver.GetSchemas(si.conn.DB, database)
}

// GetTables retorna as tabelas de um schema.
func (si *SchemaInspector) GetTables(schema string) ([]types.Table, error) {
	return si.conn.Driver.GetTables(si.conn.DB, schema)
}

// GetColumns retorna as colunas de uma tabela.
func (si *SchemaInspector) GetColumns(table string) ([]types.Column, error) {
	return si.conn.Driver.GetColumns(si.conn.DB, table)
}

// GetIndexes retorna os índices de uma tabela.
func (si *SchemaInspector) GetIndexes(table string) ([]types.Index, error) {
	return si.conn.Driver.GetIndexes(si.conn.DB, table)
}

// GetForeignKeys retorna as foreign keys de uma tabela.
func (si *SchemaInspector) GetForeignKeys(table string) ([]types.ForeignKey, error) {
	return si.conn.Driver.GetForeignKeys(si.conn.DB, table)
}

// GetDDL retorna o DDL de uma tabela.
func (si *SchemaInspector) GetDDL(table string) (string, error) {
	return si.conn.Driver.GetDDL(si.conn.DB, table)
}

// GetFullSchema retorna o schema completo (tabelas + colunas + índices + FKs).
func (si *SchemaInspector) GetFullSchema(schema string) (map[string]interface{}, error) {
	tables, err := si.GetTables(schema)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar tabelas: %w", err)
	}

	fullSchema := make(map[string]interface{})
	for _, table := range tables {
		tableInfo := map[string]interface{}{
			"name":   table.Name,
			"schema": table.Schema,
		}

		columns, err := si.GetColumns(table.Name)
		if err == nil {
			tableInfo["columns"] = columns
		}

		indexes, err := si.GetIndexes(table.Name)
		if err == nil {
			tableInfo["indexes"] = indexes
		}

		fks, err := si.GetForeignKeys(table.Name)
		if err == nil {
			tableInfo["foreignKeys"] = fks
		}

		fullSchema[table.Name] = tableInfo
	}

	return fullSchema, nil
}
