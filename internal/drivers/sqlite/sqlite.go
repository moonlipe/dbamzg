// Package sqlite implementa o driver para SQLite.
// Usa modernc.org/sqlite (pure Go, sem CGO).
package sqlite

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"amzg-db/internal/types"
	_ "modernc.org/sqlite"
)

// Driver implementa a interface types.Driver para SQLite.
type Driver struct{}

// New cria uma nova instância do driver SQLite.
func New() *Driver {
	return &Driver{}
}

// Connect abre uma conexão com o banco SQLite.
// O campo Database do config deve conter o caminho do arquivo .db.
func (d *Driver) Connect(config types.ConnectionConfig) (*sql.DB, error) {
	log.Printf("[sqlite] Conectando em %s", config.Database)

	start := time.Now()

	if config.Database == "" {
		return nil, fmt.Errorf("caminho do arquivo SQLite e obrigatorio")
	}

	// Abre a conexão com WAL mode e busy timeout
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", config.Database)
	dbConn, err := sql.Open("sqlite", dsn)
	if err != nil {
		log.Printf("[sqlite] ERRO ao abrir conexao: %v", err)
		return nil, fmt.Errorf("erro ao abrir SQLite: %w", err)
	}

	dbConn.SetMaxOpenConns(1)

	// Testa a conexão
	log.Printf("[sqlite] Testando conexao (Ping)...")
	if err := dbConn.Ping(); err != nil {
		elapsed := time.Since(start)
		log.Printf("[sqlite] ERRO no Ping apos %v: %v", elapsed, err)
		dbConn.Close()
		return nil, fmt.Errorf("erro ao conectar no SQLite: %w", err)
	}

	elapsed := time.Since(start)
	log.Printf("[sqlite] Conexao estabelecida com sucesso em %v", elapsed)

	return dbConn, nil
}

// GetDatabases retorna uma lista com o nome do arquivo como único "banco".
func (d *Driver) GetDatabases(dbConn *sql.DB) ([]string, error) {
	// SQLite não tem conceito de múltiplos bancos, retorna "main"
	return []string{"main"}, nil
}

// GetSchemas retorna os schemas do SQLite.
// SQLite usa "main", "temp" e schemas de extensões.
func (d *Driver) GetSchemas(dbConn *sql.DB, database string) ([]string, error) {
	query := `SELECT name FROM pragma_database_list ORDER BY name`
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
		schema = "main"
	}

	query := fmt.Sprintf(`SELECT name FROM "%s".sqlite_master WHERE type='table' ORDER BY name`, schema)
	rows, err := dbConn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar tabelas: %w", err)
	}
	defer rows.Close()

	var tables []types.Table
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		tables = append(tables, types.Table{
			Name:   name,
			Schema: schema,
		})
	}

	return tables, nil
}

// GetColumns retorna as colunas de uma tabela usando PRAGMA table_info.
func (d *Driver) GetColumns(dbConn *sql.DB, table string) ([]types.Column, error) {
	query := fmt.Sprintf(`PRAGMA table_info("%s")`, table)
	rows, err := dbConn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar colunas: %w", err)
	}
	defer rows.Close()

	var columns []types.Column
	for rows.Next() {
		var cid int
		var name, dataType string
		var notNull int
		var dfltValue sql.NullString
		var pk int

		if err := rows.Scan(&cid, &name, &dataType, &notNull, &dfltValue, &pk); err != nil {
			return nil, err
		}

		columns = append(columns, types.Column{
			Name:         name,
			DataType:     dataType,
			Nullable:     notNull == 0,
			DefaultValue: dfltValue.String,
			IsPrimaryKey: pk > 0,
		})
	}

	return columns, nil
}

// GetIndexes retorna os índices de uma tabela.
func (d *Driver) GetIndexes(dbConn *sql.DB, table string) ([]types.Index, error) {
	// Primeiro, obtém os nomes dos índices
	query := fmt.Sprintf(`SELECT name FROM "%s".sqlite_master WHERE type='index' AND tbl_name='%s'`, "main", table)
	rows, err := dbConn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar índices: %w", err)
	}
	defer rows.Close()

	var indexes []types.Index
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}

		// Para cada índice, obtém as colunas
		idxQuery := fmt.Sprintf(`PRAGMA index_info("%s")`, name)
		idxRows, err := dbConn.Query(idxQuery)
		if err != nil {
			continue
		}

		var columns []string
		for idxRows.Next() {
			var seqno, cid int
			var colName string
			if err := idxRows.Scan(&seqno, &cid, &colName); err != nil {
				continue
			}
			columns = append(columns, colName)
		}
		idxRows.Close()

		// Verifica se é único
		uniqueQuery := fmt.Sprintf(`SELECT "unique" FROM "%s".sqlite_master WHERE type='index' AND name='%s'`, "main", name)
		var unique int
		dbConn.QueryRow(uniqueQuery).Scan(&unique)

		indexes = append(indexes, types.Index{
			Name:    name,
			Columns: columns,
			Unique:  unique == 1,
		})
	}

	return indexes, nil
}

// GetForeignKeys retorna as chaves estrangeiras de uma tabela.
func (d *Driver) GetForeignKeys(dbConn *sql.DB, table string) ([]types.ForeignKey, error) {
	query := fmt.Sprintf(`PRAGMA foreign_key_list("%s")`, table)
	rows, err := dbConn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar foreign keys: %w", err)
	}
	defer rows.Close()

	var fks []types.ForeignKey
	for rows.Next() {
		var id, seq int
		var table, from, to, onUpdate, onDelete string
		var match string

		if err := rows.Scan(&id, &seq, &table, &from, &to, &onUpdate, &onDelete, &match); err != nil {
			return nil, err
		}

		fks = append(fks, types.ForeignKey{
			Name:             fmt.Sprintf("fk_%s_%s", table, from),
			Column:           from,
			ReferencedTable:  table,
			ReferencedColumn: to,
			OnDelete:         onDelete,
			OnUpdate:         onUpdate,
		})
	}

	return fks, nil
}

// GetDDL retorna o CREATE TABLE de uma tabela.
func (d *Driver) GetDDL(dbConn *sql.DB, table string) (string, error) {
	query := fmt.Sprintf(`SELECT sql FROM "%s".sqlite_master WHERE type='table' AND name='%s'`, "main", table)
	var ddl string
	err := dbConn.QueryRow(query).Scan(&ddl)
	if err != nil {
		return "", fmt.Errorf("erro ao obter DDL: %w", err)
	}
	return ddl, nil
}

func (d *Driver) GetDefinition(dbConn *sql.DB, objectType string, name string) (string, error) {
	sqliteType := objectType
	switch objectType {
	case "view":
		sqliteType = "view"
	case "procedure", "function", "trigger":
		sqliteType = objectType
	default:
		sqliteType = "table"
	}
	query := `SELECT sql FROM main.sqlite_master WHERE type=? AND name=?`
	var ddl string
	err := dbConn.QueryRow(query, sqliteType, name).Scan(&ddl)
	if err != nil {
		return "", fmt.Errorf("definition not found: %w", err)
	}
	return ddl, nil
}

// GetViews retorna as views de um schema.
func (d *Driver) GetViews(dbConn *sql.DB, schema string) ([]types.View, error) {
	log.Printf("[sqlite] Listando views...")
	query := `SELECT name, sql FROM sqlite_master WHERE type='view' ORDER BY name`
	rows, err := dbConn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar views: %w", err)
	}
	defer rows.Close()

	var views []types.View
	for rows.Next() {
		var name, definition string
		if err := rows.Scan(&name, &definition); err != nil {
			return nil, err
		}
		views = append(views, types.View{
			Name:       name,
			Schema:     "main",
			Definition: definition,
		})
	}

	log.Printf("[sqlite] %d views encontradas", len(views))
	return views, nil
}

// GetProcedures retorna as stored procedures de um schema.
// SQLite não suporta stored procedures.
func (d *Driver) GetProcedures(dbConn *sql.DB, schema string) ([]types.Procedure, error) {
	return []types.Procedure{}, nil
}

// GetFunctions retorna as functions de um schema.
// SQLite não suporta user-defined functions no schema tradicional.
func (d *Driver) GetFunctions(dbConn *sql.DB, schema string) ([]types.DBFunc, error) {
	return []types.DBFunc{}, nil
}

// GetTriggers retorna os triggers de um schema.
func (d *Driver) GetTriggers(dbConn *sql.DB, schema string) ([]types.Trigger, error) {
	log.Printf("[sqlite] Listando triggers...")
	query := `SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name`
	rows, err := dbConn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar triggers: %w", err)
	}
	defer rows.Close()

	var triggers []types.Trigger
	for rows.Next() {
		var name, tableName, definition string
		if err := rows.Scan(&name, &tableName, &definition); err != nil {
			return nil, err
		}
		triggers = append(triggers, types.Trigger{
			Name:       name,
			Table:      tableName,
			Definition: definition,
		})
	}

	log.Printf("[sqlite] %d triggers encontrados", len(triggers))
	return triggers, nil
}

// ExecuteQuery executa uma query e retorna os resultados.
func (d *Driver) ExecuteQuery(dbConn *sql.DB, query string) (*types.QueryResult, error) {
	// Detecta se é SELECT ou outro tipo de statement
	queryType := strings.TrimSpace(strings.ToUpper(query))
	isSelect := strings.HasPrefix(queryType, "SELECT") ||
		strings.HasPrefix(queryType, "WITH") ||
		strings.HasPrefix(queryType, "PRAGMA")

	if isSelect {
		return d.executeQuerySelect(dbConn, query)
	}
	return d.executeNonQuery(dbConn, query)
}

// executeQuerySelect executa queries SELECT e retorna as linhas.
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

		// Converte []byte para string para melhor serialização JSON
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
