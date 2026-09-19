// Package types contém os tipos compartilhados entre packages.
package types

import "database/sql"

// Project representa um projeto que contém múltiplas conexões.
type Project struct {
	Name        string             // Nome do projeto
	Description string             // Descrição do projeto
	Color       string             // Cor para identificação visual
	Connections []ConnectionConfig // Conexões do projeto
}

// ConnectionConfig armazena configurações de conexão com o banco.
type ConnectionConfig struct {
	Name         string // Nome da conexão (ex: "Meu PostgreSQL")
	Type         string // Tipo do banco: "sqlite", "postgres", "mysql", "sqlserver", "oracle", "custom"
	Host         string // Host do banco (não usado para SQLite)
	Port         int    // Porta do banco (não usado para SQLite)
	User         string // Usuário de conexão
	Password     string // Senha de conexão
	Database     string // Nome do banco de dados ou caminho do arquivo (SQLite)
	SSLMode      string // Modo SSL: "disable", "require", "verify-ca", "verify-full"
	Color        string // Cor para identificação visual (ex: "#FF5733")
	ProjectID    string // ID do projeto ao qual pertence
	DriverPath   string // Caminho para driver personalizado (tipo "custom")
	ExtraOptions string // Opções extras do driver (formato: key1=value1;key2=value2)
}

// TransactionMode define o modo de transação.
type TransactionMode string

const (
	Autocommit  TransactionMode = "autocommit"  // Cada query é uma transação separada
	SmartCommit TransactionMode = "smartcommit" // Commit automático apenas para DML
	Manual      TransactionMode = "manual"      // Commit/Rollback manual
)

// Table representa uma tabela do banco de dados.
type Table struct {
	Name    string // Nome da tabela
	Schema  string // Schema ao qual pertence
	Comment string // Comentário/descrição da tabela
}

// Column representa uma coluna de uma tabela.
type Column struct {
	Name         string // Nome da coluna
	DataType     string // Tipo de dado (ex: "varchar", "integer")
	Nullable     bool   // Se aceita NULL
	DefaultValue string // Valor padrão
	IsPrimaryKey bool   // Se é parte da chave primária
	Comment      string // Comentário/descrição
}

// Index representa um índice de uma tabela.
type Index struct {
	Name      string   // Nome do índice
	Columns   []string // Colunas que compõem o índice
	Unique    bool     // Se é único
	IsPrimary bool     // Se é índice primário
}

// ForeignKey representa uma chave estrangeira.
type ForeignKey struct {
	Name             string // Nome da constraint
	Column           string // Coluna local
	ReferencedTable  string // Tabela referenciada
	ReferencedColumn string // Coluna referenciada
	OnDelete         string // Ação ao deletar (CASCADE, SET NULL, etc.)
	OnUpdate         string // Ação ao atualizar
}

// View representa uma view do banco de dados.
type View struct {
	Name       string // Nome da view
	Schema     string // Schema ao qual pertence
	Comment    string // Comentário/descrição
	Definition string // Definição SQL da view
}

// Procedure representa uma stored procedure do banco de dados.
type Procedure struct {
	Name       string // Nome da procedure
	Schema     string // Schema ao qual pertence
	Comment    string // Comentário/descrição
	Definition string // Definição SQL da procedure
}

// DBFunc representa uma function do banco de dados.
type DBFunc struct {
	Name       string // Nome da function
	Schema     string // Schema ao qual pertence
	ReturnType string // Tipo de retorno
	Comment    string // Comentário/descrição
	Definition string // Definição SQL da function
}

// Trigger representa um trigger do banco de dados.
type Trigger struct {
	Name       string // Nome do trigger
	Table      string // Tabela associada
	Comment    string // Comentário/descrição
	Definition string // Definição SQL do trigger
}

// SavedQuery representa uma query salva pelo usuário.
type SavedQuery struct {
	Name       string `json:"Name"`
	Query      string `json:"Query"`
	Connection string `json:"Connection"`
}

// QueryResult armazena o resultado de uma query executada.
type QueryResult struct {
	Columns     []string        // Nomes das colunas
	ColumnTypes []string        // Tipos das colunas
	Rows        [][]interface{} // Dados das linhas
	RowCount    int             // Número de linhas afetadas/retornadas
	Message     string          // Mensagem de retorno (ex: "5 rows affected")
	Duration    int64           // Duração da execução em milissegundos
}

// Driver é a interface que todos os drivers de banco devem implementar.
type Driver interface {
	// Connect abre uma conexão com o banco de dados
	Connect(config ConnectionConfig) (*sql.DB, error)

	// GetDatabases retorna a lista de bancos de dados disponíveis
	GetDatabases(db *sql.DB) ([]string, error)

	// GetSchemas retorna a lista de schemas de um banco
	GetSchemas(db *sql.DB, database string) ([]string, error)

	// GetTables retorna a lista de tabelas de um schema
	GetTables(db *sql.DB, schema string) ([]Table, error)

	// GetColumns retorna as colunas de uma tabela
	GetColumns(db *sql.DB, table string) ([]Column, error)

	// GetIndexes retorna os índices de uma tabela
	GetIndexes(db *sql.DB, table string) ([]Index, error)

	// GetForeignKeys retorna as chaves estrangeiras de uma tabela
	GetForeignKeys(db *sql.DB, table string) ([]ForeignKey, error)

	// GetDDL retorna o DDL (CREATE TABLE) de uma tabela
	GetDDL(db *sql.DB, table string) (string, error)

	// GetViews retorna as views de um schema
	GetViews(db *sql.DB, schema string) ([]View, error)

	// GetProcedures retorna as stored procedures de um schema
	GetProcedures(db *sql.DB, schema string) ([]Procedure, error)

	// GetFunctions retorna as functions de um schema
	GetFunctions(db *sql.DB, schema string) ([]DBFunc, error)

	// GetTriggers retorna os triggers de um schema
	GetTriggers(db *sql.DB, schema string) ([]Trigger, error)

	// ExecuteQuery executa uma query e retorna os resultados
	ExecuteQuery(db *sql.DB, query string) (*QueryResult, error)
}
