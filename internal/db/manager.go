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
	Config types.ConnectionConfig
	DB     *sql.DB
	Driver types.Driver
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

// GetSavedConnections retorna todas as conexões salvas (senhas criptografadas).
func (cm *ConnectionManager) GetSavedConnections() []types.ConnectionConfig {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	return cm.configMgr.ListConnections()
}

// DisconnectAll fecha todas as conexões ativas.
func (cm *ConnectionManager) DisconnectAll() {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	for name, conn := range cm.conns {
		conn.DB.Close()
		delete(cm.conns, name)
	}
}
