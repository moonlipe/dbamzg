// Package db fornece executor de queries e inspetor de schema.
package db

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// Executor executa queries e gerencia transações.
type Executor struct {
	conn *ActiveConnection
}

// NewExecutor cria um novo executor para uma conexão.
func NewExecutor(conn *ActiveConnection) *Executor {
	return &Executor{conn: conn}
}

// Execute executa uma query e retorna o resultado.
func (e *Executor) Execute(query string) (*QueryResult, error) {
	start := time.Now()

	result, err := e.conn.Driver.ExecuteQuery(e.conn.DB, query)
	if err != nil {
		return nil, err
	}

	result.Duration = time.Since(start).Milliseconds()
	return result, nil
}

// ExecuteWithVars executa uma query substituindo variáveis.
// Variáveis no formato ${nome} ou :nome são substituídas pelos valores do map.
func (e *Executor) ExecuteWithVars(query string, vars map[string]string) (*QueryResult, error) {
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
func (si *SchemaInspector) GetTables(schema string) ([]Table, error) {
	return si.conn.Driver.GetTables(si.conn.DB, schema)
}

// GetColumns retorna as colunas de uma tabela.
func (si *SchemaInspector) GetColumns(table string) ([]Column, error) {
	return si.conn.Driver.GetColumns(si.conn.DB, table)
}

// GetIndexes retorna os índices de uma tabela.
func (si *SchemaInspector) GetIndexes(table string) ([]Index, error) {
	return si.conn.Driver.GetIndexes(si.conn.DB, table)
}

// GetForeignKeys retorna as foreign keys de uma tabela.
func (si *SchemaInspector) GetForeignKeys(table string) ([]ForeignKey, error) {
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
