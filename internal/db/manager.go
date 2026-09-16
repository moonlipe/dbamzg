// Package db fornece gerenciamento de conexões e execução de queries.
package db

import (
	"database/sql"
	"fmt"
	"log"
	"sync"

	"amzg-db/internal/config"
	"amzg-db/internal/crypto"
	"amzg-db/internal/types"
)

// ConnectionManager gerencia conexões ativas e configurações salvas.
type ConnectionManager struct {
	mu         sync.RWMutex
	drivers    map[string]types.Driver
	conns      map[string]*ActiveConnection // chave: nome da conexão
	configMgr  *config.Manager
}

// ActiveConnection representa uma conexão ativa com o banco.
type ActiveConnection struct {
	Config      types.ConnectionConfig
	DB          *sql.DB
	Driver      types.Driver
	Tx          *sql.Tx            // Transação ativa (nil se autocommit)
	TxMode      types.TransactionMode // Modo de transação
}

// NewConnectionManager cria um novo gerenciador de conexões.
func NewConnectionManager() (*ConnectionManager, error) {
	configMgr, err := config.NewManager()
	if err != nil {
		return nil, fmt.Errorf("erro ao criar gerenciador de config: %w", err)
	}

	return &ConnectionManager{
		drivers:   make(map[string]types.Driver),
		conns:     make(map[string]*ActiveConnection),
		configMgr: configMgr,
	}, nil
}

// RegisterDriver registra um driver para um tipo de banco.
func (cm *ConnectionManager) RegisterDriver(dbType string, driver types.Driver) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.drivers[dbType] = driver
}

// Connect abre uma nova conexão com o banco.
func (cm *ConnectionManager) Connect(config types.ConnectionConfig) (*ActiveConnection, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	log.Printf("[manager] Conectando a '%s' (tipo=%s)", config.Name, config.Type)

	// Verifica se já existe uma conexão ativa com esse nome
	if _, exists := cm.conns[config.Name]; exists {
		return nil, fmt.Errorf("conexao '%s' ja esta ativa", config.Name)
	}

	// Busca o driver correspondente
	driver, ok := cm.drivers[config.Type]
	if !ok {
		return nil, fmt.Errorf("driver nao encontrado para o tipo: %s", config.Type)
	}

	// Descriptografa a senha antes de conectar
	password := config.Password
	if decrypted, err := crypto.Decrypt(password); err == nil {
		password = decrypted
	}

	// Cria uma cópia com a senha descriptografada para o driver
	connectConfig := config
	connectConfig.Password = password

	// Abre a conexão
	dbConn, err := driver.Connect(connectConfig)
	if err != nil {
		log.Printf("[manager] ERRO ao conectar '%s': %v", config.Name, err)
		return nil, fmt.Errorf("erro ao conectar: %w", err)
	}

	log.Printf("[manager] Conexao '%s' estabelecida com sucesso", config.Name)

	// Armazena a conexão ativa (com senha criptografada no config)
	activeConn := &ActiveConnection{
		Config: config,
		DB:     dbConn,
		Driver: driver,
	}
	cm.conns[config.Name] = activeConn

	return activeConn, nil
}

// Disconnect fecha uma conexão ativa.
func (cm *ConnectionManager) Disconnect(name string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	conn, exists := cm.conns[name]
	if !exists {
		return fmt.Errorf("conexao '%s' nao encontrada", name)
	}

	if err := conn.DB.Close(); err != nil {
		return fmt.Errorf("erro ao fechar conexao: %w", err)
	}

	delete(cm.conns, name)
	log.Printf("[manager] Conexao '%s' fechada", name)
	return nil
}

// GetConnection retorna uma conexão ativa pelo nome.
func (cm *ConnectionManager) GetConnection(name string) (*ActiveConnection, error) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	conn, exists := cm.conns[name]
	if !exists {
		return nil, fmt.Errorf("conexao '%s' nao encontrada", name)
	}

	return conn, nil
}

// TestConnection testa se uma conexão pode ser estabelecida.
func (cm *ConnectionManager) TestConnection(config types.ConnectionConfig) error {
	driver, ok := cm.drivers[config.Type]
	if !ok {
		return fmt.Errorf("driver nao encontrado para o tipo: %s", config.Type)
	}

	// Descriptografa a senha antes de conectar
	password := config.Password
	if decrypted, err := crypto.Decrypt(password); err == nil {
		password = decrypted
	}

	connectConfig := config
	connectConfig.Password = password

	dbConn, err := driver.Connect(connectConfig)
	if err != nil {
		return err
	}
	defer dbConn.Close()

	return nil
}

// SaveConnection salva uma configuração de conexão (com senha criptografada).
func (cm *ConnectionManager) SaveConnection(config types.ConnectionConfig) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	// Criptografa a senha antes de salvar
	encryptedPassword, err := crypto.Encrypt(config.Password)
	if err != nil {
		return fmt.Errorf("erro ao criptografar senha: %w", err)
	}

	config.Password = encryptedPassword

	if err := cm.configMgr.AddConnection(config); err != nil {
		return fmt.Errorf("erro ao salvar conexao: %w", err)
	}

	log.Printf("[manager] Conexao '%s' salva em disco", config.Name)
	return nil
}

// RemoveConnection remove uma configuração de conexão.
func (cm *ConnectionManager) RemoveConnection(name string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	// Desconecta se estiver ativa
	if conn, exists := cm.conns[name]; exists {
		conn.DB.Close()
		delete(cm.conns, name)
	}

	if err := cm.configMgr.RemoveConnection(name); err != nil {
		return fmt.Errorf("erro ao remover conexao: %w", err)
	}

	log.Printf("[manager] Conexao '%s' removida do disco", name)
	return nil
}

// SaveProject salva um projeto.
func (cm *ConnectionManager) SaveProject(project types.Project) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	// Criptografa senhas das conexões do projeto
	for i := range project.Connections {
		encryptedPassword, err := crypto.Encrypt(project.Connections[i].Password)
		if err != nil {
			return fmt.Errorf("erro ao criptografar senha: %w", err)
		}
		project.Connections[i].Password = encryptedPassword
	}

	if err := cm.configMgr.AddProject(project); err != nil {
		return fmt.Errorf("erro ao salvar projeto: %w", err)
	}

	log.Printf("[manager] Projeto '%s' salvo em disco", project.Name)
	return nil
}

// RemoveProject remove um projeto.
func (cm *ConnectionManager) RemoveProject(name string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if err := cm.configMgr.RemoveProject(name); err != nil {
		return fmt.Errorf("erro ao remover projeto: %w", err)
	}

	log.Printf("[manager] Projeto '%s' removido do disco", name)
	return nil
}

// GetProjects retorna todos os projetos.
func (cm *ConnectionManager) GetProjects() []types.Project {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	return cm.configMgr.ListProjects()
}

// GetProject retorna um projeto pelo nome.
func (cm *ConnectionManager) GetProject(name string) (*types.Project, error) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	return cm.configMgr.GetProject(name)
}

// GetSavedConnections retorna todas as conexões salvas (avulsas).
func (cm *ConnectionManager) GetSavedConnections() []types.ConnectionConfig {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	return cm.configMgr.ListConnections()
}

// GetAllConnections retorna todas as conexões (projetos + avulsas).
func (cm *ConnectionManager) GetAllConnections() []types.ConnectionConfig {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	return cm.configMgr.GetAllConnections()
}

// DisconnectAll fecha todas as conexões ativas.
func (cm *ConnectionManager) DisconnectAll() {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	for name, conn := range cm.conns {
		// Rollback transação pendente se existir
		if conn.Tx != nil {
			conn.Tx.Rollback()
		}
		conn.DB.Close()
		delete(cm.conns, name)
	}
}

// BeginTransaction inicia uma transação manual.
func (cm *ConnectionManager) BeginTransaction(name string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	conn, exists := cm.conns[name]
	if !exists {
		return fmt.Errorf("conexao '%s' nao encontrada", name)
	}

	if conn.Tx != nil {
		return fmt.Errorf("transacao ja esta ativa em '%s'", name)
	}

	tx, err := conn.DB.Begin()
	if err != nil {
		return fmt.Errorf("erro ao iniciar transacao: %w", err)
	}

	conn.Tx = tx
	conn.TxMode = types.Manual
	log.Printf("[manager] Transacao iniciada em '%s'", name)
	return nil
}

// Commit confirma a transação ativa.
func (cm *ConnectionManager) Commit(name string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	conn, exists := cm.conns[name]
	if !exists {
		return fmt.Errorf("conexao '%s' nao encontrada", name)
	}

	if conn.Tx == nil {
		return fmt.Errorf("nenhuma transacao ativa em '%s'", name)
	}

	if err := conn.Tx.Commit(); err != nil {
		return fmt.Errorf("erro ao fazer commit: %w", err)
	}

	conn.Tx = nil
	conn.TxMode = types.Autocommit
	log.Printf("[manager] Commit realizado em '%s'", name)
	return nil
}

// Rollback desfaz a transação ativa.
func (cm *ConnectionManager) Rollback(name string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	conn, exists := cm.conns[name]
	if !exists {
		return fmt.Errorf("conexao '%s' nao encontrada", name)
	}

	if conn.Tx == nil {
		return fmt.Errorf("nenhuma transacao ativa em '%s'", name)
	}

	if err := conn.Tx.Rollback(); err != nil {
		return fmt.Errorf("erro ao fazer rollback: %w", err)
	}

	conn.Tx = nil
	conn.TxMode = types.Autocommit
	log.Printf("[manager] Rollback realizado em '%s'", name)
	return nil
}

// SetTransactionMode define o modo de transação.
func (cm *ConnectionManager) SetTransactionMode(name string, mode types.TransactionMode) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	conn, exists := cm.conns[name]
	if !exists {
		return fmt.Errorf("conexao '%s' nao encontrada", name)
	}

	// Se mudando de manual para autocommit, faz commit automático
	if conn.TxMode == types.Manual && mode == types.Autocommit && conn.Tx != nil {
		if err := conn.Tx.Commit(); err != nil {
			return fmt.Errorf("erro ao fazer commit automatico: %w", err)
		}
		conn.Tx = nil
	}

	conn.TxMode = mode
	log.Printf("[manager] Modo de transacao alterado para '%s' em '%s'", mode, name)
	return nil
}

// GetTransactionMode retorna o modo de transação atual.
func (cm *ConnectionManager) GetTransactionMode(name string) (types.TransactionMode, error) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	conn, exists := cm.conns[name]
	if !exists {
		return "", fmt.Errorf("conexao '%s' nao encontrada", name)
	}

	return conn.TxMode, nil
}
