// Package db fornece gerenciamento de conexões e execução de queries.
package db

import (
	"database/sql"
	"fmt"
	"sync"

	"amzg-db/internal/types"
)

// ConnectionManager gerencia conexões ativas e configurações salvas.
type ConnectionManager struct {
	mu      sync.RWMutex
	drivers map[string]types.Driver
	conns   map[string]*ActiveConnection // chave: nome da conexão
	configs []types.ConnectionConfig     // configurações salvas
}

// ActiveConnection representa uma conexão ativa com o banco.
type ActiveConnection struct {
	Config types.ConnectionConfig
	DB     *sql.DB
	Driver types.Driver
}

// NewConnectionManager cria um novo gerenciador de conexões.
func NewConnectionManager() *ConnectionManager {
	return &ConnectionManager{
		drivers: make(map[string]types.Driver),
		conns:   make(map[string]*ActiveConnection),
	}
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

	// Verifica se já existe uma conexão ativa com esse nome
	if _, exists := cm.conns[config.Name]; exists {
		return nil, fmt.Errorf("conexão '%s' já está ativa", config.Name)
	}

	// Busca o driver correspondente
	driver, ok := cm.drivers[config.Type]
	if !ok {
		return nil, fmt.Errorf("driver não encontrado para o tipo: %s", config.Type)
	}

	// Abre a conexão
	dbConn, err := driver.Connect(config)
	if err != nil {
		return nil, fmt.Errorf("erro ao conectar: %w", err)
	}

	// Armazena a conexão ativa
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
		return fmt.Errorf("conexão '%s' não encontrada", name)
	}

	if err := conn.DB.Close(); err != nil {
		return fmt.Errorf("erro ao fechar conexão: %w", err)
	}

	delete(cm.conns, name)
	return nil
}

// GetConnection retorna uma conexão ativa pelo nome.
func (cm *ConnectionManager) GetConnection(name string) (*ActiveConnection, error) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	conn, exists := cm.conns[name]
	if !exists {
		return nil, fmt.Errorf("conexão '%s' não encontrada", name)
	}

	return conn, nil
}

// ListConnections retorna todas as conexões ativas.
func (cm *ConnectionManager) ListConnections() []*ActiveConnection {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	var conns []*ActiveConnection
	for _, conn := range cm.conns {
		conns = append(conns, conn)
	}
	return conns
}

// TestConnection testa se uma conexão pode ser estabelecida.
func (cm *ConnectionManager) TestConnection(config types.ConnectionConfig) error {
	driver, ok := cm.drivers[config.Type]
	if !ok {
		return fmt.Errorf("driver não encontrado para o tipo: %s", config.Type)
	}

	dbConn, err := driver.Connect(config)
	if err != nil {
		return err
	}
	defer dbConn.Close()

	return nil
}

// SaveConnection salva uma configuração de conexão.
func (cm *ConnectionManager) SaveConnection(config types.ConnectionConfig) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	// Verifica se já existe uma conexão com esse nome
	for i, c := range cm.configs {
		if c.Name == config.Name {
			// Atualiza a existente
			cm.configs[i] = config
			return nil
		}
	}

	// Adiciona nova
	cm.configs = append(cm.configs, config)
	return nil
}

// RemoveConnection remove uma configuração de conexão.
func (cm *ConnectionManager) RemoveConnection(name string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	for i, c := range cm.configs {
		if c.Name == name {
			cm.configs = append(cm.configs[:i], cm.configs[i+1:]...)
			return nil
		}
	}

	return fmt.Errorf("conexão '%s' não encontrada", name)
}

// GetSavedConnections retorna todas as conexões salvas.
func (cm *ConnectionManager) GetSavedConnections() []types.ConnectionConfig {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	return cm.configs
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
