// Package oracle implementa o driver para Oracle Database.
// Usa github.com/godror/godror (requer Oracle Instant Client).
package oracle

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"amzg-db/internal/types"

	_ "github.com/godror/godror"
)

// Driver implementa a interface types.Driver para Oracle.
type Driver struct{}

// New cria uma nova instância do driver Oracle.
func New() *Driver {
	return &Driver{}
}

// Connect abre uma conexão com o banco Oracle.
func (d *Driver) Connect(config types.ConnectionConfig) (*sql.DB, error) {
	log.Printf("[oracle] Conectando em %s:%d service=%s user=%s", config.Host, config.Port, config.Database, config.User)

	start := time.Now()

	var dsn string

	// Suporte a Oracle Wallet (quando não há usuário/senha)
	if config.User == "" && config.Password == "" {
		// Wallet: usa apenas o TNS alias ou EZ Connect
		if config.Host != "" {
			// EZ Connect com wallet
			dsn = fmt.Sprintf("%s:%d/%s", config.Host, config.Port, config.Database)
		} else {
			// TNS alias (wallet local)
			dsn = config.Database
		}
		log.Printf("[oracle] Conectando com Wallet: %s", dsn)
	} else {
		// Conexão normal com credenciais
		dsn = fmt.Sprintf("%s:%d/%s", config.Host, config.Port, config.Database)
		log.Printf("[oracle] DSN: %s", dsn)
	}

	dbConn, err := sql.Open("godror", dsn)
	if err != nil {
		log.Printf("[oracle] ERRO ao abrir conexao: %v", err)
		return nil, fmt.Errorf("erro ao abrir Oracle: %w", err)
	}

	dbConn.SetMaxOpenConns(5)
	dbConn.SetMaxIdleConns(2)

	// Se tem usuário, configura via parâmetros
	if config.User != "" {
		// O godror aceita user/password no DSN ou via ConnectionParams
		// Para wallet, não precisa de user/password
	}

	// Testa a conexão
	log.Printf("[oracle] Testando conexao (Ping)...")
	if err := dbConn.Ping(); err != nil {
		elapsed := time.Since(start)
		log.Printf("[oracle] ERRO no Ping apos %v: %v", elapsed, err)
		dbConn.Close()
		return nil, fmt.Errorf("erro ao conectar no Oracle: %w", err)
	}

	elapsed := time.Since(start)
	log.Printf("[oracle] Conexao estabelecida com sucesso em %v", elapsed)

	return dbConn, nil
}

// GetDatabases retorna a lista de services disponíveis.
func (d *Driver) GetDatabases(dbConn *sql.DB) ([]string, error) {
	log.Printf("[oracle] Listando services...")
	start := time.Now()

	// Oracle retorna o SERVICE_NAME atual
	var currentService string
	err := dbConn.QueryRow("SELECT SYS_CONTEXT('USERENV', 'DB_NAME') FROM DUAL").Scan(&currentService)
	if err != nil {
		log.Printf("[oracle] ERRO ao listar databases: %v", err)
		return nil, err
	}

	log.Printf("[oracle] 1 database encontrado em %v", time.Since(start))
	return []string{currentService}, nil
}

// GetSchemas retorna os schemas (usuários) de um banco.
func (d *Driver) GetSchemas(dbConn *sql.DB, database string) ([]string, error) {
	log.Printf("[oracle] Listando schemas...")
	start := time.Now()

	query := `SELECT username FROM dba_users 
	WHERE account_status = 'OPEN' 
	AND username NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'XDB', 'APEX_PUBLIC_USER', 'FLOWS_FILES', 'APEX_030200', 'APEX_PUBLIC_USER')
	ORDER BY username`
	rows, err := dbConn.Query(query)
	if err != nil {
		log.Printf("[oracle] ERRO ao listar schemas: %v", err)
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

	log.Printf("[oracle] %d schemas encontrados em %v", len(schemas), time.Since(start))
	return schemas, nil
}

// GetTables retorna as tabelas de um schema.
func (d *Driver) GetTables(dbConn *sql.DB, schema string) ([]types.Table, error) {
	if schema == "" {
		schema = strings.ToUpper(d.getCurrentUser(dbConn))
	}

	log.Printf("[oracle] Listando tabelas do schema %s...", schema)
	start := time.Now()

	query := `SELECT table_name, comments 
	FROM all_tab_comments 
	WHERE owner = :1 AND table_type = 'TABLE'
	ORDER BY table_name`
	rows, err := dbConn.Query(query, schema)
	if err != nil {
		log.Printf("[oracle] ERRO ao listar tabelas: %v", err)
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

	log.Printf("[oracle] %d tabelas encontradas em %v", len(tables), time.Since(start))
	return tables, nil
}

// GetColumns retorna as colunas de uma tabela.
func (d *Driver) GetColumns(dbConn *sql.DB, table string) ([]types.Column, error) {
	query := `SELECT 
		COLUMN_NAME,
		DATA_TYPE,
		CASE WHEN NULLABLE = 'Y' THEN 1 ELSE 0 END,
		COALESCE(DATA_DEFAULT, ''),
		CASE WHEN CONSTRAINT_TYPE = 'P' THEN 1 ELSE 0 END,
		COALESCE(COMMENTS, '')
	FROM all_tab_columns tc
	LEFT JOIN (
		SELECT acc.column_name, ac.constraint_type
		FROM all_constraints ac
		JOIN all_cons_columns acc ON ac.constraint_name = acc.constraint_name AND ac.owner = acc.owner
		WHERE ac.constraint_type = 'P' AND ac.owner = :1 AND acc.table_name = :2
	) pk ON tc.column_name = pk.column_name
	LEFT JOIN all_col_comments cc ON tc.owner = cc.owner AND tc.table_name = cc.table_name AND tc.column_name = cc.column_name
	WHERE tc.owner = :1 AND tc.table_name = :2
	ORDER BY tc.column_id`

	rows, err := dbConn.Query(query, strings.ToUpper(d.getCurrentUser(dbConn)), table)
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
		i.index_name,
		 LISTAGG(c.column_name, ',') WITHIN GROUP (ORDER BY c.column_position) AS columns,
		CASE WHEN i.uniqueness = 'UNIQUE' THEN 1 ELSE 0 END,
		CASE WHEN ic.constraint_type = 'P' THEN 1 ELSE 0 END
	FROM all_indexes i
	JOIN all_ind_columns c ON i.index_name = c.index_name AND i.owner = c.index_owner
	LEFT JOIN (
		SELECT ac.constraint_name, ac.constraint_type
		FROM all_constraints ac
		WHERE ac.constraint_type = 'P' AND ac.owner = :1
	) ic ON i.index_name = ic.constraint_name
	WHERE i.table_owner = :1 AND i.table_name = :2
	GROUP BY i.index_name, i.uniqueness, ic.constraint_type
	ORDER BY i.index_name`

	rows, err := dbConn.Query(query, strings.ToUpper(d.getCurrentUser(dbConn)), table)
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
		fk.constraint_name,
		fk_cols.column_name,
		fk_pk.table_name AS referenced_table,
		fk_pk_cols.column_name AS referenced_column,
		fk.delete_rule,
		fk.update_rule
	FROM all_constraints fk
	JOIN all_cons_columns fk_cols ON fk.constraint_name = fk_cols.constraint_name AND fk.owner = fk_cols.owner
	JOIN all_constraints fk_pk ON fk.r_constraint_name = fk_pk.constraint_name AND fk.r_owner = fk_pk.owner
	JOIN all_cons_columns fk_pk_cols ON fk_pk.constraint_name = fk_pk_cols.constraint_name AND fk_pk.owner = fk_pk_cols.owner
	WHERE fk.constraint_type = 'R' AND fk.owner = :1 AND fk.table_name = :2
	ORDER BY fk.constraint_name, fk_cols.position`

	rows, err := dbConn.Query(query, strings.ToUpper(d.getCurrentUser(dbConn)), table)
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
	query := `SELECT 'CREATE TABLE ' || owner || '.' || table_name || ' (' || 
	 LISTAGG(
		COLUMN_NAME || ' ' || DATA_TYPE || 
		CASE WHEN DATA_LENGTH IS NOT NULL THEN '(' || DATA_LENGTH || ')' ELSE '' END ||
		CASE WHEN NULLABLE = 'N' THEN ' NOT NULL' ELSE '' END,
		',' || CHR(10) || '  '
	) WITHIN GROUP (ORDER BY column_id) || ');'
FROM all_tab_columns
WHERE owner = :1 AND table_name = :2
GROUP BY owner, table_name`

	var ddl string
	err := dbConn.QueryRow(query, strings.ToUpper(d.getCurrentUser(dbConn)), table).Scan(&ddl)
	if err != nil {
		return "", fmt.Errorf("erro ao obter DDL: %w", err)
	}
	return ddl, nil
}

// GetViews retorna as views de um schema.
func (d *Driver) GetViews(dbConn *sql.DB, schema string) ([]types.View, error) {
	if schema == "" {
		schema = strings.ToUpper(d.getCurrentUser(dbConn))
	}

	log.Printf("[oracle] Listando views do schema %s...", schema)
	query := `SELECT view_name, text, NVL(comments, '') AS comment
	FROM all_views v
	LEFT JOIN all_tab_comments tc ON v.view_name = tc.table_name AND v.owner = tc.owner
	WHERE v.owner = :1
	ORDER BY v.view_name`
	rows, err := dbConn.Query(query, schema)
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

	log.Printf("[oracle] %d views encontradas", len(views))
	return views, nil
}

// GetProcedures retorna as stored procedures de um schema.
func (d *Driver) GetProcedures(dbConn *sql.DB, schema string) ([]types.Procedure, error) {
	if schema == "" {
		schema = strings.ToUpper(d.getCurrentUser(dbConn))
	}

	log.Printf("[oracle] Listando procedures do schema %s...", schema)
	query := `SELECT procedure_name, NVL(comments, '') AS comment
	FROM all_procedures p
	LEFT JOIN all_tab_comments tc ON p.object_name = tc.table_name AND p.owner = tc.owner
	WHERE p.owner = :1 AND p.object_type = 'PROCEDURE'
	ORDER BY p.procedure_name`
	rows, err := dbConn.Query(query, schema)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar procedures: %w", err)
	}
	defer rows.Close()

	var procedures []types.Procedure
	for rows.Next() {
		var name, comment string
		if err := rows.Scan(&name, &comment); err != nil {
			return nil, err
		}
		procedures = append(procedures, types.Procedure{
			Name:    name,
			Schema:  schema,
			Comment: comment,
		})
	}

	log.Printf("[oracle] %d procedures encontradas", len(procedures))
	return procedures, nil
}

// GetFunctions retorna as functions de um schema.
func (d *Driver) GetFunctions(dbConn *sql.DB, schema string) ([]types.DBFunc, error) {
	if schema == "" {
		schema = strings.ToUpper(d.getCurrentUser(dbConn))
	}

	log.Printf("[oracle] Listando functions do schema %s...", schema)
	query := `SELECT object_name AS name, 'FUNCTION' AS return_type, NVL(comments, '') AS comment
	FROM all_objects o
	LEFT JOIN all_tab_comments tc ON o.object_name = tc.table_name AND o.owner = tc.owner
	WHERE o.owner = :1 AND o.object_type = 'FUNCTION'
	ORDER BY o.object_name`
	rows, err := dbConn.Query(query, schema)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar functions: %w", err)
	}
	defer rows.Close()

	var functions []types.DBFunc
	for rows.Next() {
		var name, returnType, comment string
		if err := rows.Scan(&name, &returnType, &comment); err != nil {
			return nil, err
		}
		functions = append(functions, types.DBFunc{
			Name:       name,
			Schema:     schema,
			ReturnType: returnType,
			Comment:    comment,
		})
	}

	log.Printf("[oracle] %d functions encontradas", len(functions))
	return functions, nil
}

// GetTriggers retorna os triggers de um schema.
func (d *Driver) GetTriggers(dbConn *sql.DB, schema string) ([]types.Trigger, error) {
	if schema == "" {
		schema = strings.ToUpper(d.getCurrentUser(dbConn))
	}

	log.Printf("[oracle] Listando triggers do schema %s...", schema)
	query := `SELECT trigger_name, table_name, NVL(description, '') AS comment
	FROM all_triggers
	WHERE owner = :1
	ORDER BY trigger_name`
	rows, err := dbConn.Query(query, schema)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar triggers: %w", err)
	}
	defer rows.Close()

	var triggers []types.Trigger
	for rows.Next() {
		var name, tableName, comment string
		if err := rows.Scan(&name, &tableName, &comment); err != nil {
			return nil, err
		}
		triggers = append(triggers, types.Trigger{
			Name:    name,
			Table:   tableName,
			Comment: comment,
		})
	}

	log.Printf("[oracle] %d triggers encontrados", len(triggers))
	return triggers, nil
}

// ExecuteQuery executa uma query e retorna os resultados.
func (d *Driver) ExecuteQuery(dbConn *sql.DB, query string) (*types.QueryResult, error) {
	log.Printf("[oracle] Executando query: %s", truncate(query, 200))
	start := time.Now()

	queryType := strings.TrimSpace(strings.ToUpper(query))
	isSelect := strings.HasPrefix(queryType, "SELECT") ||
		strings.HasPrefix(queryType, "WITH") ||
		strings.HasPrefix(queryType, "EXPLAIN")

	var result *types.QueryResult
	var err error

	if isSelect {
		result, err = d.executeQuerySelect(dbConn, query)
	} else {
		result, err = d.executeNonQuery(dbConn, query)
	}

	if err != nil {
		log.Printf("[oracle] ERRO ao executar query apos %v: %v", time.Since(start), err)
	} else {
		log.Printf("[oracle] Query executada com sucesso em %v: %s", time.Since(start), result.Message)
	}

	return result, err
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
		Message:     fmt.Sprintf("%d rows returned", len(result)),
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

// getCurrentUser retorna o usuário atual da conexão.
func (d *Driver) getCurrentUser(dbConn *sql.DB) string {
	var user string
	err := dbConn.QueryRow("SELECT USER FROM DUAL").Scan(&user)
	if err != nil {
		return "UNKNOWN"
	}
	return user
}

// truncate trunca uma string para debug.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
