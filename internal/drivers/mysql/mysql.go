// Package mysql implementa o driver para MySQL/MariaDB.
// Usa github.com/go-sql-driver/mysql (pure Go, sem CGO).
package mysql

import (
	"database/sql"
	"fmt"
	"strings"

	"amzg-db/internal/types"

	_ "github.com/go-sql-driver/mysql"
)

// Driver implementa a interface types.Driver para MySQL.
type Driver struct{}

// New cria uma nova instância do driver MySQL.
func New() *Driver {
	return &Driver{}
}

// Connect abre uma conexão com o banco MySQL.
func (d *Driver) Connect(config types.ConnectionConfig) (*sql.DB, error) {
	// Constrói a connection string
	dsn := fmt.Sprintf(
		"%s:%s@tcp(%s:%d)/%s?parseTime=true&tls=%s",
		config.User,
		config.Password,
		config.Host,
		config.Port,
		config.Database,
		config.SSLMode,
	)

	dbConn, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("erro ao abrir MySQL: %w", err)
	}

	// Testa a conexão
	if err := dbConn.Ping(); err != nil {
		dbConn.Close()
		return nil, fmt.Errorf("erro ao conectar no MySQL: %w", err)
	}

	return dbConn, nil
}

// GetDatabases retorna a lista de bancos de dados disponíveis.
func (d *Driver) GetDatabases(dbConn *sql.DB) ([]string, error) {
	query := `SHOW DATABASES ORDER BY Database`
	rows, err := dbConn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar databases: %w", err)
	}
	defer rows.Close()

	var databases []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		databases = append(databases, name)
	}

	return databases, nil
}

// GetSchemas retorna os schemas (databases) de um banco.
func (d *Driver) GetSchemas(dbConn *sql.DB, database string) ([]string, error) {
	// MySQL não tem schemas separados, retorna o database atual
	var currentDB string
	err := dbConn.QueryRow("SELECT DATABASE()").Scan(&currentDB)
	if err != nil {
		return nil, err
	}
	return []string{currentDB}, nil
}

// GetTables retorna as tabelas de um schema.
func (d *Driver) GetTables(dbConn *sql.DB, schema string) ([]types.Table, error) {
	query := `SELECT TABLE_NAME, TABLE_COMMENT 
	FROM information_schema.TABLES 
	WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
	ORDER BY TABLE_NAME`
	rows, err := dbConn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar tabelas: %w", err)
	}
	defer rows.Close()

	var tables []types.Table
	for rows.Next() {
		var name, comment string
		if err := rows.Scan(&name, &comment); err != nil {
			return nil, err
		}
		tables = append(tables, types.Table{
			Name:    name,
			Schema:  schema,
			Comment: comment,
		})
	}

	return tables, nil
}

// GetColumns retorna as colunas de uma tabela.
func (d *Driver) GetColumns(dbConn *sql.DB, table string) ([]types.Column, error) {
	query := `SELECT 
		COLUMN_NAME,
		COLUMN_TYPE,
		CASE WHEN IS_NULLABLE = 'YES' THEN true ELSE false END,
		COALESCE(COLUMN_DEFAULT, ''),
		CASE WHEN COLUMN_KEY = 'PRI' THEN true ELSE false END,
		COALESCE(COLUMN_COMMENT, '')
	FROM information_schema.COLUMNS
	WHERE TABLE_NAME = $1 AND TABLE_SCHEMA = DATABASE()
	ORDER BY ORDINAL_POSITION`

	// MySQL não suporta Prepared Statements com $
	// Usa formato alternativo
	query = `SELECT 
		COLUMN_NAME,
		COLUMN_TYPE,
		CASE WHEN IS_NULLABLE = 'YES' THEN true ELSE false END,
		COALESCE(COLUMN_DEFAULT, ''),
		CASE WHEN COLUMN_KEY = 'PRI' THEN true ELSE false END,
		COALESCE(COLUMN_COMMENT, '')
	FROM information_schema.COLUMNS
	WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()
	ORDER BY ORDINAL_POSITION`

	rows, err := dbConn.Query(query, table)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar colunas: %w", err)
	}
	defer rows.Close()

	var columns []types.Column
	for rows.Next() {
		var name, dataType string
		var nullable bool
		var defaultValue, comment string
		var isPrimaryKey bool

		if err := rows.Scan(&name, &dataType, &nullable, &defaultValue, &isPrimaryKey, &comment); err != nil {
			return nil, err
		}

		columns = append(columns, types.Column{
			Name:         name,
			DataType:     dataType,
			Nullable:     nullable,
			DefaultValue: defaultValue,
			IsPrimaryKey: isPrimaryKey,
			Comment:      comment,
		})
	}

	return columns, nil
}

// GetIndexes retorna os índices de uma tabela.
func (d *Driver) GetIndexes(dbConn *sql.DB, table string) ([]types.Index, error) {
	query := `SHOW INDEX FROM ?`
	rows, err := dbConn.Query(query, table)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar índices: %w", err)
	}
	defer rows.Close()

	// Agrupa colunas por índice
	indexMap := make(map[string]*types.Index)
	var order []string

	for rows.Next() {
		var table2 string
		var nonUnique int
		var indexName, columnName string
		var seqInIndex int
		var indexType string

		if err := rows.Scan(&table2, &nonUnique, &indexName, &seqInIndex, &columnName, &indexType); err != nil {
			return nil, err
		}

		if _, exists := indexMap[indexName]; !exists {
			indexMap[indexName] = &types.Index{
				Name:    indexName,
				Columns: []string{},
				Unique:  nonUnique == 0,
			}
			order = append(order, indexName)
		}

		indexMap[indexName].Columns = append(indexMap[indexName].Columns, columnName)
	}

	var indexes []types.Index
	for _, name := range order {
		indexes = append(indexes, *indexMap[name])
	}

	return indexes, nil
}

// GetForeignKeys retorna as chaves estrangeiras de uma tabela.
func (d *Driver) GetForeignKeys(dbConn *sql.DB, table string) ([]types.ForeignKey, error) {
	query := `SELECT
		CONSTRAINT_NAME,
		COLUMN_NAME,
		REFERENCED_TABLE_NAME,
		REFERENCED_COLUMN_NAME
	FROM information_schema.KEY_COLUMN_USAGE
	WHERE TABLE_NAME = ? 
		AND TABLE_SCHEMA = DATABASE()
		AND REFERENCED_TABLE_NAME IS NOT NULL
	ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`

	rows, err := dbConn.Query(query, table)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar foreign keys: %w", err)
	}
	defer rows.Close()

	var fks []types.ForeignKey
	for rows.Next() {
		var name, column, refTable, refColumn string

		if err := rows.Scan(&name, &column, &refTable, &refColumn); err != nil {
			return nil, err
		}

		fks = append(fks, types.ForeignKey{
			Name:             name,
			Column:           column,
			ReferencedTable:  refTable,
			ReferencedColumn: refColumn,
			OnDelete:         "RESTRICT",
			OnUpdate:         "RESTRICT",
		})
	}

	return fks, nil
}

// GetDDL retorna o DDL de uma tabela.
func (d *Driver) GetDDL(dbConn *sql.DB, table string) (string, error) {
	query := `SHOW CREATE TABLE ?`
	var tableName, ddl string
	err := dbConn.QueryRow(query, table).Scan(&tableName, &ddl)
	if err != nil {
		return "", fmt.Errorf("erro ao obter DDL: %w", err)
	}
	return ddl, nil
}

// ExecuteQuery executa uma query e retorna os resultados.
func (d *Driver) ExecuteQuery(dbConn *sql.DB, query string) (*types.QueryResult, error) {
	queryType := strings.TrimSpace(strings.ToUpper(query))
	isSelect := strings.HasPrefix(queryType, "SELECT") ||
		strings.HasPrefix(queryType, "WITH") ||
		strings.HasPrefix(queryType, "SHOW") ||
		strings.HasPrefix(queryType, "DESCRIBE") ||
		strings.HasPrefix(queryType, "EXPLAIN")

	if isSelect {
		return d.executeQuerySelect(dbConn, query)
	}
	return d.executeNonQuery(dbConn, query)
}

// executeQuerySelect executa queries SELECT.
func (d *Driver) executeQuerySelect(dbConn *sql.DB, query string) (*types.QueryResult, error) {
	rows, err := dbConn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("erro ao executar query: %w", err)
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	var result [][]interface{}
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

		result = append(result, values)
	}

	return &types.QueryResult{
		Columns:  columns,
		Rows:     result,
		RowCount: len(result),
		Message:  fmt.Sprintf("%d rows returned", len(result)),
	}, nil
}

// executeNonQuery executa INSERT, UPDATE, DELETE, etc.
func (d *Driver) executeNonQuery(dbConn *sql.DB, query string) (*types.QueryResult, error) {
	result, err := dbConn.Exec(query)
	if err != nil {
		return nil, fmt.Errorf("erro ao executar statement: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return nil, err
	}

	return &types.QueryResult{
		RowCount: int(affected),
		Message:  fmt.Sprintf("%d rows affected", affected),
	}, nil
}
