// Package postgres implementa o driver para PostgreSQL.
// Usa github.com/jackc/pgx/v5 (pure Go, sem CGO).
package postgres

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"amzg-db/internal/types"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// Driver implementa a interface types.Driver para PostgreSQL.
type Driver struct{}

// New cria uma nova instância do driver PostgreSQL.
func New() *Driver {
	return &Driver{}
}

// Connect abre uma conexão com o banco PostgreSQL.
func (d *Driver) Connect(config types.ConnectionConfig) (*sql.DB, error) {
	log.Printf("[postgres] Conectando em %s:%d database=%s user=%s", config.Host, config.Port, config.Database, config.User)

	start := time.Now()

	// Constrói a connection string
	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s connect_timeout=10",
		config.Host,
		config.Port,
		config.User,
		config.Password,
		config.Database,
		config.SSLMode,
	)

	log.Printf("[postgres] DSN: host=%s port=%d dbname=%s sslmode=%s", config.Host, config.Port, config.Database, config.SSLMode)

	dbConn, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Printf("[postgres] ERRO ao abrir conexao: %v", err)
		return nil, fmt.Errorf("erro ao abrir PostgreSQL: %w", err)
	}

	dbConn.SetMaxOpenConns(5)
	dbConn.SetMaxIdleConns(2)

	// Testa a conexão
	log.Printf("[postgres] Testando conexao (Ping)...")
	if err := dbConn.Ping(); err != nil {
		elapsed := time.Since(start)
		log.Printf("[postgres] ERRO no Ping apos %v: %v", elapsed, err)
		dbConn.Close()
		return nil, fmt.Errorf("erro ao conectar no PostgreSQL: %w", err)
	}

	elapsed := time.Since(start)
	log.Printf("[postgres] Conexao estabelecida com sucesso em %v", elapsed)

	return dbConn, nil
}

// GetDatabases retorna a lista de bancos de dados disponíveis.
func (d *Driver) GetDatabases(dbConn *sql.DB) ([]string, error) {
	query := `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`
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
	query := `SELECT schema_name FROM information_schema.schemata 
	WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
	ORDER BY schema_name`
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
		schema = "public"
	}

	query := `SELECT table_name, obj_description((quote_ident(table_schema)||'.'||quote_ident(table_name))::regclass) 
	FROM information_schema.tables 
	WHERE table_schema = $1 AND table_type = 'BASE TABLE'
	ORDER BY table_name`
	rows, err := dbConn.Query(query, schema)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar tabelas: %w", err)
	}
	defer rows.Close()

	var tables []types.Table
	for rows.Next() {
		var name string
		var comment sql.NullString
		if err := rows.Scan(&name, &comment); err != nil {
			return nil, err
		}
		tables = append(tables, types.Table{
			Name:    name,
			Schema:  schema,
			Comment: comment.String,
		})
	}

	return tables, nil
}

// GetColumns retorna as colunas de uma tabela.
func (d *Driver) GetColumns(dbConn *sql.DB, table string) ([]types.Column, error) {
	query := `SELECT 
		c.column_name,
		c.data_type,
		CASE WHEN c.is_nullable = 'YES' THEN true ELSE false END,
		COALESCE(c.column_default, ''),
		CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN true ELSE false END,
		COALESCE(pgd.description, '')
	FROM information_schema.columns c
	LEFT JOIN information_schema.key_column_usage kcu
		ON c.table_name = kcu.table_name 
		AND c.column_name = kcu.column_name
		AND c.table_schema = kcu.table_schema
	LEFT JOIN information_schema.table_constraints tc
		ON kcu.constraint_name = tc.constraint_name
		AND tc.constraint_type = 'PRIMARY KEY'
	LEFT JOIN pg_catalog.pg_statio_all_tables st
		ON c.table_schema = st.schemaname AND c.table_name = st.relname
	LEFT JOIN pg_catalog.pg_description pgd
		ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
	WHERE c.table_name = $1
	ORDER BY c.ordinal_position`
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
		i.relname AS index_name,
		ARRAY(SELECT attname FROM pg_attribute WHERE attrelid = i.oid AND attnum = ANY(indkey) AND attnum > 0 ORDER BY array_position(indkey, attnum)) AS columns,
		ix.indisunique AS is_unique,
		ix.indisprimary AS is_primary
	FROM pg_class t
	JOIN pg_index ix ON t.oid = ix.indrelid
	JOIN pg_class i ON i.oid = ix.indexrelid
	WHERE t.relname = $1
	ORDER BY i.relname`
	rows, err := dbConn.Query(query, table)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar índices: %w", err)
	}
	defer rows.Close()

	var indexes []types.Index
	for rows.Next() {
		var name string
		var columns []string
		var unique, primary bool

		if err := rows.Scan(&name, &columns, &unique, &primary); err != nil {
			return nil, err
		}

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
		tc.constraint_name,
		kcu.column_name,
		ccu.table_name AS referenced_table,
		ccu.column_name AS referenced_column,
		rc.delete_rule,
		rc.update_rule
	FROM information_schema.table_constraints tc
	JOIN information_schema.key_column_usage kcu
		ON tc.constraint_name = kcu.constraint_name
		AND tc.table_schema = kcu.table_schema
	JOIN information_schema.constraint_column_usage ccu
		ON ccu.constraint_name = tc.constraint_name
		AND ccu.table_schema = tc.table_schema
	JOIN information_schema.referential_constraints rc
		ON rc.constraint_name = tc.constraint_name
		AND rc.constraint_schema = tc.constraint_schema
	WHERE tc.constraint_type = 'FOREIGN KEY'
		AND tc.table_name = $1
	ORDER BY tc.constraint_name`
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
	query := `SELECT 
		'CREATE TABLE ' || quote_ident(t.table_schema) || '.' || quote_ident(t.table_name) || ' (' || E'\n' ||
	STRING_AGG(
		'  ' || quote_ident(c.column_name) || ' ' || c.data_type ||
		CASE WHEN c.character_maximum_length IS NOT NULL 
			|| c.numeric_precision IS NOT NULL 
			THEN '(' || COALESCE(c.character_maximum_length::text, c.numeric_precision::text) || ')' 
			ELSE '' 
		END ||
		CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
		CASE WHEN c.column_default IS NOT NULL THEN ' DEFAULT ' || c.column_default ELSE '' END,
		',' || E'\n' ORDER BY c.ordinal_position
	) || E'\n);' AS create_table
FROM information_schema.tables t
JOIN information_schema.columns c
	ON t.table_name = c.table_name AND t.table_schema = c.table_schema
WHERE t.table_name = $1 AND t.table_type = 'BASE TABLE'
GROUP BY t.table_schema, t.table_name`
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
	case "view":
		query = `SELECT pg_get_viewdef(c.oid, true) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE c.relname = $1 AND c.relkind = 'v'`
	case "procedure":
		query = `SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE p.proname = $1 AND p.prokind = 'p'`
	case "function":
		query = `SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE p.proname = $1 AND p.prokind = 'f'`
	case "trigger":
		query = `SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE t.tgname = $1 AND NOT t.tgisinternal`
	default:
		return d.GetDDL(dbConn, name)
	}
	var def string
	err := dbConn.QueryRow(query, name).Scan(&def)
	if err != nil {
		return "", fmt.Errorf("definition not found: %w", err)
	}
	return def, nil
}

// GetViews retorna as views de um schema.
func (d *Driver) GetViews(dbConn *sql.DB, schema string) ([]types.View, error) {
	if schema == "" {
		schema = "public"
	}

	log.Printf("[postgres] Listando views do schema %s...", schema)
	query := `SELECT table_name, 
		pg_get_viewdef((quote_ident(table_schema) || '.' || quote_ident(table_name))::regclass, true),
		COALESCE(obj_description((quote_ident(table_schema) || '.' || quote_ident(table_name))::regclass), '')
	FROM information_schema.tables
	WHERE table_schema = $1 AND table_type = 'VIEW'
	ORDER BY table_name`
	rows, err := dbConn.Query(query, schema)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar views: %w", err)
	}
	defer rows.Close()

	var views []types.View
	for rows.Next() {
		var name, definition string
		var ns sql.NullString
		if err := rows.Scan(&name, &definition, &ns); err != nil {
			return nil, err
		}
		comment := ""
		if ns.Valid {
			comment = ns.String
		}
		views = append(views, types.View{
			Name:       name,
			Schema:     schema,
			Comment:    comment,
			Definition: definition,
		})
	}

	log.Printf("[postgres] %d views encontradas", len(views))
	return views, nil
}

// GetProcedures retorna as stored procedures de um schema.
func (d *Driver) GetProcedures(dbConn *sql.DB, schema string) ([]types.Procedure, error) {
	if schema == "" {
		schema = "public"
	}

	log.Printf("[postgres] Listando procedures do schema %s...", schema)
	query := `SELECT p.proname AS name,
		pg_get_functiondef(p.oid),
		COALESCE(obj_description(p.oid, 'pg_proc'), '')
	FROM pg_proc p
	JOIN pg_namespace n ON p.pronamespace = n.oid
	WHERE n.nspname = $1 AND p.prokind = 'p'
	ORDER BY p.proname`
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

	log.Printf("[postgres] %d procedures encontradas", len(procedures))
	return procedures, nil
}

// GetFunctions retorna as functions de um schema.
func (d *Driver) GetFunctions(dbConn *sql.DB, schema string) ([]types.DBFunc, error) {
	if schema == "" {
		schema = "public"
	}

	log.Printf("[postgres] Listando functions do schema %s...", schema)
	query := `SELECT p.proname AS name,
		pg_get_functiondef(p.oid),
		pg_catalog.format_type(p.prorettype, NULL) AS return_type,
		COALESCE(obj_description(p.oid, 'pg_proc'), '')
	FROM pg_proc p
	JOIN pg_namespace n ON p.pronamespace = n.oid
	WHERE n.nspname = $1 AND p.prokind IN ('f', 'a')
	ORDER BY p.proname`
	rows, err := dbConn.Query(query, schema)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar functions: %w", err)
	}
	defer rows.Close()

	var functions []types.DBFunc
	for rows.Next() {
		var name, definition, returnType, comment string
		if err := rows.Scan(&name, &definition, &returnType, &comment); err != nil {
			return nil, err
		}
		functions = append(functions, types.DBFunc{
			Name:       name,
			Schema:     schema,
			ReturnType: returnType,
			Comment:    comment,
			Definition: definition,
		})
	}

	log.Printf("[postgres] %d functions encontradas", len(functions))
	return functions, nil
}

// GetTriggers retorna os triggers de um schema.
func (d *Driver) GetTriggers(dbConn *sql.DB, schema string) ([]types.Trigger, error) {
	if schema == "" {
		schema = "public"
	}

	log.Printf("[postgres] Listando triggers do schema %s...", schema)
	query := `SELECT t.tgname AS name,
		c.relname AS table_name,
		pg_get_triggerdef(t.oid),
		COALESCE(obj_description(t.oid, 'pg_trigger'), '')
	FROM pg_trigger t
	JOIN pg_class c ON t.tgrelid = c.oid
	JOIN pg_namespace n ON c.relnamespace = n.oid
	WHERE n.nspname = $1
	AND NOT t.tgisinternal
	ORDER BY t.tgname`
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

	log.Printf("[postgres] %d triggers encontrados", len(triggers))
	return triggers, nil
}

// ExecuteQuery executa uma query e retorna os resultados.
func (d *Driver) ExecuteQuery(dbConn *sql.DB, query string) (*types.QueryResult, error) {
	queryType := strings.TrimSpace(strings.ToUpper(query))
	isSelect := strings.HasPrefix(queryType, "SELECT") ||
		strings.HasPrefix(queryType, "WITH") ||
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
