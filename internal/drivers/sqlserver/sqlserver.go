// Package sqlserver implementa o driver para Microsoft SQL Server.
// Usa github.com/microsoft/go-mssqldb (pure Go, sem CGO).
package sqlserver

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

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
	log.Printf("[sqlserver] Conectando em %s:%d database=%s user=%s", config.Host, config.Port, config.Database, config.User)

	start := time.Now()

	// Constrói a connection string
	dsn := fmt.Sprintf(
		"server=%s;user id=%s;password=%s;port=%d;database=%s;encrypt=%s;connection timeout=30; packet size=4096",
		config.Host,
		config.User,
		config.Password,
		config.Port,
		config.Database,
		config.SSLMode,
	)

	log.Printf("[sqlserver] DSN: server=%s;user id=%s;port=%d;database=%s;encrypt=%s",
		config.Host, config.User, config.Port, config.Database, config.SSLMode)

	dbConn, err := sql.Open("sqlserver", dsn)
	if err != nil {
		log.Printf("[sqlserver] ERRO ao abrir conexao: %v", err)
		return nil, fmt.Errorf("erro ao abrir SQL Server: %w", err)
	}

	dbConn.SetMaxOpenConns(5)
	dbConn.SetMaxIdleConns(2)

	// Testa a conexão
	log.Printf("[sqlserver] Testando conexao (Ping)...")
	if err := dbConn.Ping(); err != nil {
		elapsed := time.Since(start)
		log.Printf("[sqlserver] ERRO no Ping apos %v: %v", elapsed, err)
		dbConn.Close()
		return nil, fmt.Errorf("erro ao conectar no SQL Server: %w", err)
	}

	elapsed := time.Since(start)
	log.Printf("[sqlserver] Conexao estabelecida com sucesso em %v", elapsed)

	return dbConn, nil
}

// GetDatabases retorna a lista de bancos de dados que o usuário tem acesso.
func (d *Driver) GetDatabases(dbConn *sql.DB) ([]string, error) {
	log.Printf("[sqlserver] Listando databases com acesso...")
	start := time.Now()

	// Usar HAS_DBACCESS para verificar acesso real do usuário
	query := `SELECT name FROM sys.databases 
		WHERE HAS_DBACCESS(name) = 1 
		AND name NOT IN ('master', 'model', 'msdb', 'tempdb')
		ORDER BY name`
	rows, err := dbConn.Query(query)
	if err != nil {
		log.Printf("[sqlserver] ERRO ao listar databases: %v", err)
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

	log.Printf("[sqlserver] %d databases encontrados em %v", len(databases), time.Since(start))
	return databases, nil
}

// GetSchemas retorna os schemas do banco especificado.
func (d *Driver) GetSchemas(dbConn *sql.DB, database string) ([]string, error) {
	log.Printf("[sqlserver] Listando schemas do banco %s...", database)
	start := time.Now()

	// Usar query com USE para trocar contexto do banco
	// NOTA: Isso não funciona bem com pools de conexão, mas é mais simples
	// Alternativa: usar sysschemas ou query direta
	query := fmt.Sprintf(`SELECT DISTINCT s.name 
		FROM [%s].sys.schemas s
		INNER JOIN [%s].sys.database_principals dp 
			ON s.principal_id = dp.principal_id
		WHERE s.name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest', 'dbo')
		AND dp.type IN ('S', 'U', 'E')  -- SQL user, Windows user, External user
		ORDER BY s.name`, database, database)
	
	rows, err := dbConn.Query(query)
	if err != nil {
		// Se falhar (ex: sem acesso ao banco), retornar apenas dbo
		log.Printf("[sqlserver] WARN: Erro ao listar schemas do banco %s, retornando apenas dbo: %v", database, err)
		return []string{"dbo"}, nil
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

	// Sempre incluir dbo se não estiver na lista
	hasDbo := false
	for _, s := range schemas {
		if s == "dbo" {
			hasDbo = true
			break
		}
	}
	if !hasDbo {
		schemas = append([]string{"dbo"}, schemas...)
	}

	log.Printf("[sqlserver] %d schemas encontrados em %v", len(schemas), time.Since(start))
	return schemas, nil
}

// GetTables retorna as tabelas de um schema.
func (d *Driver) GetTables(dbConn *sql.DB, schema string) ([]types.Table, error) {
	if schema == "" {
		schema = "dbo"
	}

	log.Printf("[sqlserver] Listando tabelas do schema %s...", schema)
	query := `SELECT t.name, ISNULL(ep.value, '') 
	FROM sys.tables t
	LEFT JOIN sys.extended_properties ep 
		ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
	ORDER BY t.name`
	rows, err := dbConn.Query(query)
	if err != nil {
		log.Printf("[sqlserver] ERRO ao listar tabelas: %v", err)
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

	log.Printf("[sqlserver] %d tabelas encontradas", len(tables))
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
		return nil, fmt.Errorf("erro ao listar indices: %w", err)
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

func (d *Driver) GetDefinition(dbConn *sql.DB, objectType string, name string) (string, error) {
	var query string
	switch objectType {
	case "view", "procedure", "function", "trigger":
		query = `SELECT OBJECT_DEFINITION(OBJECT_ID(@p1))`
	default:
		return d.GetDDL(dbConn, name)
	}
	var def sql.NullString
	err := dbConn.QueryRow(query, name).Scan(&def)
	if err != nil {
		return "", fmt.Errorf("definition not found: %w", err)
	}
	if !def.Valid || def.String == "" {
		return "", fmt.Errorf("definition not found for %s '%s'", objectType, name)
	}
	return def.String, nil
}

// GetViews retorna as views de um schema.
func (d *Driver) GetViews(dbConn *sql.DB, schema string) ([]types.View, error) {
	if schema == "" {
		schema = "dbo"
	}

	log.Printf("[sqlserver] Listando views do schema %s...", schema)
	query := `SELECT v.name, ISNULL(OBJECT_DEFINITION(v.object_id), ''), ISNULL(ep.value, '') 
	FROM sys.views v
	LEFT JOIN sys.extended_properties ep 
		ON ep.major_id = v.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
	WHERE SCHEMA_NAME(v.schema_id) = @p1
	ORDER BY v.name`
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	rows, err := dbConn.QueryContext(ctx, query, schema)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar views: %w", err)
	}
	defer rows.Close()

	var views []types.View
	for rows.Next() {
		var name, definition, comment string
		if err := rows.Scan(&name, &definition, &comment); err != nil {
			return nil, err
		}
		views = append(views, types.View{
			Name:       name,
			Schema:     schema,
			Comment:    comment,
			Definition: definition,
		})
	}

	log.Printf("[sqlserver] %d views encontradas", len(views))
	return views, nil
}

// GetProcedures retorna as stored procedures de um schema.
func (d *Driver) GetProcedures(dbConn *sql.DB, schema string) ([]types.Procedure, error) {
	if schema == "" {
		schema = "dbo"
	}

	log.Printf("[sqlserver] Listando procedures do schema %s...", schema)
	query := `SELECT p.name, ISNULL(OBJECT_DEFINITION(p.object_id), ''), ISNULL(ep.value, '') 
	FROM sys.procedures p
	LEFT JOIN sys.extended_properties ep 
		ON ep.major_id = p.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
	WHERE SCHEMA_NAME(p.schema_id) = @p1
	ORDER BY p.name`
	rows, err := dbConn.Query(query, schema)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar procedures: %w", err)
	}
	defer rows.Close()

	var procedures []types.Procedure
	for rows.Next() {
		var name, definition, comment string
		if err := rows.Scan(&name, &definition, &comment); err != nil {
			return nil, err
		}
		procedures = append(procedures, types.Procedure{
			Name:       name,
			Schema:     schema,
			Comment:    comment,
			Definition: definition,
		})
	}

	log.Printf("[sqlserver] %d procedures encontradas", len(procedures))
	return procedures, nil
}

// GetFunctions retorna as functions de um schema.
func (d *Driver) GetFunctions(dbConn *sql.DB, schema string) ([]types.DBFunc, error) {
	if schema == "" {
		schema = "dbo"
	}

	log.Printf("[sqlserver] Listando functions do schema %s...", schema)
	query := `SELECT o.name, 
		ISNULL(OBJECT_DEFINITION(o.object_id), ''),
		ISNULL(ep.value, '')
	FROM sys.objects o
	LEFT JOIN sys.extended_properties ep 
		ON ep.major_id = o.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
	WHERE o.type IN ('FN', 'IF', 'TF')
	AND SCHEMA_NAME(o.schema_id) = @p1
	ORDER BY o.name`
	rows, err := dbConn.Query(query, schema)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar functions: %w", err)
	}
	defer rows.Close()

	var functions []types.DBFunc
	for rows.Next() {
		var name, def, comment string
		if err := rows.Scan(&name, &def, &comment); err != nil {
			return nil, err
		}
		returnType := "unknown"
		if strings.Contains(strings.ToUpper(def), "RETURNS @") {
			returnType = "TABLE"
		} else if strings.Contains(strings.ToUpper(def), "RETURNS ") {
			parts := strings.Split(strings.ToUpper(def), "RETURNS ")
			if len(parts) > 1 {
				returnType = strings.TrimSpace(parts[1])
				if idx := strings.Index(returnType, " "); idx > 0 {
					returnType = returnType[:idx]
				}
			}
		}
		functions = append(functions, types.DBFunc{
			Name:       name,
			Schema:     schema,
			ReturnType: returnType,
			Comment:    comment,
			Definition: def,
		})
	}

	log.Printf("[sqlserver] %d functions encontradas", len(functions))
	return functions, nil
}

// GetTriggers retorna os triggers de um schema.
func (d *Driver) GetTriggers(dbConn *sql.DB, schema string) ([]types.Trigger, error) {
	if schema == "" {
		schema = "dbo"
	}

	log.Printf("[sqlserver] Listando triggers do schema %s...", schema)
	query := `SELECT t.name, 
		OBJECT_NAME(t.parent_id) AS table_name,
		ISNULL(OBJECT_DEFINITION(t.object_id), ''),
		ISNULL(ep.value, '')
	FROM sys.triggers t
	LEFT JOIN sys.extended_properties ep 
		ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
	WHERE SCHEMA_NAME(t.schema_id) = @p1
	AND t.is_ms_shipped = 0
	ORDER BY t.name`
	rows, err := dbConn.Query(query, schema)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar triggers: %w", err)
	}
	defer rows.Close()

	var triggers []types.Trigger
	for rows.Next() {
		var name, tableName, definition, comment string
		if err := rows.Scan(&name, &tableName, &definition, &comment); err != nil {
			return nil, err
		}
		triggers = append(triggers, types.Trigger{
			Name:       name,
			Table:      tableName,
			Comment:    comment,
			Definition: definition,
		})
	}

	log.Printf("[sqlserver] %d triggers encontrados", len(triggers))
	return triggers, nil
}

// ExecuteQuery executa uma query e retorna os resultados.
func (d *Driver) ExecuteQuery(dbConn *sql.DB, query string) (*types.QueryResult, error) {
	log.Printf("[sqlserver] Executando query: %s", truncate(query, 200))
	start := time.Now()

	queryType := strings.TrimSpace(strings.ToUpper(query))
	isSelect := strings.HasPrefix(queryType, "SELECT") ||
		strings.HasPrefix(queryType, "WITH") ||
		strings.HasPrefix(queryType, "EXEC")

	var result *types.QueryResult
	var err error

	if isSelect {
		result, err = d.executeQuerySelect(dbConn, query)
	} else {
		result, err = d.executeNonQuery(dbConn, query)
	}

	if err != nil {
		log.Printf("[sqlserver] ERRO ao executar query apos %v: %v", time.Since(start), err)
	} else {
		log.Printf("[sqlserver] Query executada com sucesso em %v: %s", time.Since(start), result.Message)
	}

	return result, err
}

// executeQuerySelect executa queries SELECT.
func (d *Driver) executeQuerySelect(dbConn *sql.DB, query string) (*types.QueryResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	rows, err := dbConn.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("erro ao executar query: %w", err)
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	colTypes, err := rows.ColumnTypes()
	if err != nil {
		return nil, err
	}
	typeNames := make([]string, len(colTypes))
	for i, ct := range colTypes {
		typeNames[i] = ct.DatabaseTypeName()
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
		Columns:     columns,
		ColumnTypes: typeNames,
		Rows:        result,
		RowCount:    len(result),
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

// truncate trunca uma string para debug.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
