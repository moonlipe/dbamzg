// Package sqlserver implementa o driver para Microsoft SQL Server.
// Usa github.com/microsoft/go-mssqldb (pure Go, sem CGO).
package sqlserver

import (
	"database/sql"
	"fmt"
	"strings"

	"amzg-db/internal/types"

	_ "github.com/microsoft/go-mssqldb"
)

// Driver implementa a interface types.Driver para SQL Server.
type Driver struct{}

// New cria uma nova instância do driver SQL Server.
func New() *Driver {
	return &Driver{}
}

// Connect abre uma conexão com o banco SQL Server.
func (d *Driver) Connect(config types.ConnectionConfig) (*sql.DB, error) {
	// Constrói a connection string
	dsn := fmt.Sprintf(
		"server=%s;user id=%s;password=%s;port=%d;database=%s;encrypt=%s",
		config.Host,
		config.User,
		config.Password,
		config.Port,
		config.Database,
		config.SSLMode,
	)

	dbConn, err := sql.Open("sqlserver", dsn)
	if err != nil {
		return nil, fmt.Errorf("erro ao abrir SQL Server: %w", err)
	}

	// Testa a conexão
	if err := dbConn.Ping(); err != nil {
		dbConn.Close()
		return nil, fmt.Errorf("erro ao conectar no SQL Server: %w", err)
	}

	return dbConn, nil
}

// GetDatabases retorna a lista de bancos de dados disponíveis.
func (d *Driver) GetDatabases(dbConn *sql.DB) ([]string, error) {
	query := `SELECT name FROM sys.databases WHERE name NOT IN ('master', 'model', 'msdb', 'tempdb') ORDER BY name`
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

// GetSchemas retorna os schemas de um banco.
func (d *Driver) GetSchemas(dbConn *sql.DB, database string) ([]string, error) {
	query := `SELECT name FROM sys.schemas WHERE name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest', 'db_*') ORDER BY name`
	rows, err := dbConn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar schemas: %w", err)
	}
	defer rows.Close()

	var schemas []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		schemas = append(schemas, name)
	}

	return schemas, nil
}

// GetTables retorna as tabelas de um schema.
func (d *Driver) GetTables(dbConn *sql.DB, schema string) ([]types.Table, error) {
	if schema == "" {
		schema = "dbo"
	}

	query := `SELECT t.name, ISNULL(ep.value, '') 
	FROM sys.tables t
	LEFT JOIN sys.extended_properties ep 
		ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
	ORDER BY t.name`
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
		c.name AS column_name,
		tp.name AS data_type,
		CASE WHEN c.is_nullable = 1 THEN 1 ELSE 0 END,
		COALESCE(dc.definition, ''),
		CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END,
		COALESCE(ep.value, '')
	FROM sys.columns c
	JOIN sys.types tp ON c.user_type_id = tp.user_type_id
	LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
	LEFT JOIN (
		SELECT ic.column_id
		FROM sys.index_columns ic
		JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
		WHERE i.is_primary_key = 1 AND OBJECT_NAME(i.object_id) = @p1
	) pk ON c.column_id = pk.column_id
	LEFT JOIN sys.extended_properties ep 
		ON ep.major_id = c.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
	WHERE OBJECT_NAME(c.object_id) = @p1
	ORDER BY c.column_id`

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
	query := `SELECT 
		i.name AS index_name,
		STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns,
		i.is_unique,
		i.is_primary_key
	FROM sys.indexes i
	JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
	JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
	WHERE i.name IS NOT NULL AND OBJECT_NAME(i.object_id) = @p1
	GROUP BY i.name, i.is_unique, i.is_primary_key
	ORDER BY i.name`

	rows, err := dbConn.Query(query, table)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar índices: %w", err)
	}
	defer rows.Close()

	var indexes []types.Index
	for rows.Next() {
		var name, columnsStr string
		var unique, primary bool

		if err := rows.Scan(&name, &columnsStr, &unique, &primary); err != nil {
			return nil, err
		}

		columns := strings.Split(columnsStr, ",")
		indexes = append(indexes, types.Index{
			Name:      name,
			Columns:   columns,
			Unique:    unique,
			IsPrimary: primary,
		})
	}

	return indexes, nil
}

// GetForeignKeys retorna as chaves estrangeiras de uma tabela.
func (d *Driver) GetForeignKeys(dbConn *sql.DB, table string) ([]types.ForeignKey, error) {
	query := `SELECT 
		fk.name AS constraint_name,
		COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name,
		OBJECT_NAME(fkc.referenced_object_id) AS referenced_table,
		COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS referenced_column,
		rc.delete_referential_action_desc AS delete_rule,
		rc.update_referential_action_desc AS update_rule
	FROM sys.foreign_keys fk
	JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
	JOIN sys.referential_constraints rc ON fk.object_id = rc.constraint_object_id
	WHERE OBJECT_NAME(fk.parent_object_id) = @p1
	ORDER BY fk.name`

	rows, err := dbConn.Query(query, table)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar foreign keys: %w", err)
	}
	defer rows.Close()

	var fks []types.ForeignKey
	for rows.Next() {
		var name, column, refTable, refColumn, onDelete, onUpdate string

		if err := rows.Scan(&name, &column, &refTable, &refColumn, &onDelete, &onUpdate); err != nil {
			return nil, err
		}

		fks = append(fks, types.ForeignKey{
			Name:             name,
			Column:           column,
			ReferencedTable:  refTable,
			ReferencedColumn: refColumn,
			OnDelete:         onDelete,
			OnUpdate:         onUpdate,
		})
	}

	return fks, nil
}

// GetDDL retorna o DDL de uma tabela.
func (d *Driver) GetDDL(dbConn *sql.DB, table string) (string, error) {
	// SQL Server não tem uma função nativa para gerar DDL completo
	// Retorna um template básico
	query := `SELECT 'CREATE TABLE ' + QUOTENAME(TABLE_SCHEMA) + '.' + QUOTENAME(TABLE_NAME) + ' (' + 
		STRING_AGG(
			CHAR(10) + '  ' + QUOTENAME(COLUMN_NAME) + ' ' + DATA_TYPE + 
			CASE WHEN CHARACTER_MAXIMUM_LENGTH IS NOT NULL THEN '(' + CAST(CHARACTER_MAXIMUM_LENGTH AS VARCHAR) + ')' ELSE '' END +
			CASE WHEN IS_NULLABLE = 'NO' THEN ' NOT NULL' ELSE '' END,
			',' 
		) + CHAR(10) + ');'
	FROM INFORMATION_SCHEMA.COLUMNS
	WHERE TABLE_NAME = @p1
	GROUP BY TABLE_SCHEMA, TABLE_NAME`

	var ddl string
	err := dbConn.QueryRow(query, table).Scan(&ddl)
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
		strings.HasPrefix(queryType, "EXEC")

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
