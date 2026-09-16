// Package config gerencia a configuração do aplicativo.
// Salva conexões e preferências em arquivo JSON no diretório do usuário.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"amzg-db/internal/types"
)

// Config representa a configuração do aplicativo.
type Config struct {
	Connections []types.ConnectionConfig `json:"connections"`
}

// Manager gerencia a configuração do app.
type Manager struct {
	configDir  string
	configFile string
	Config     *Config
}

// NewManager cria um novo gerenciador de configuração.
func NewManager() (*Manager, error) {
	// Obtém o diretório de config do usuário
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("erro ao obter diretório de config: %w", err)
	}

	// Cria o diretório do app se não existir
	appDir := filepath.Join(configDir, "amzg-db")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return nil, fmt.Errorf("erro ao criar diretório de config: %w", err)
	}

	configFile := filepath.Join(appDir, "config.json")

	m := &Manager{
		configDir:  appDir,
		configFile: configFile,
		Config:     &Config{},
	}

	// Tenta carregar config existente
	if err := m.Load(); err != nil {
		// Se não existe, cria uma config vazia
		if !os.IsNotExist(err) {
			return nil, err
		}
	}

	return m, nil
}

// Load carrega a configuração do arquivo.
func (m *Manager) Load() error {
	data, err := os.ReadFile(m.configFile)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, m.Config)
}

// Save salva a configuração no arquivo.
func (m *Manager) Save() error {
	data, err := json.MarshalIndent(m.Config, "", "  ")
	if err != nil {
		return fmt.Errorf("erro ao serializar config: %w", err)
	}

	return os.WriteFile(m.configFile, data, 0644)
}

// AddConnection adiciona uma nova conexão à configuração.
func (m *Manager) AddConnection(config types.ConnectionConfig) error {
	// Verifica se já existe uma conexão com esse nome
	for i, c := range m.Config.Connections {
		if c.Name == config.Name {
			// Atualiza a existente
			m.Config.Connections[i] = config
			return m.Save()
		}
	}

	// Adiciona nova
	m.Config.Connections = append(m.Config.Connections, config)
	return m.Save()
}

// RemoveConnection remove uma conexão pelo nome.
func (m *Manager) RemoveConnection(name string) error {
	for i, c := range m.Config.Connections {
		if c.Name == name {
			m.Config.Connections = append(m.Config.Connections[:i], m.Config.Connections[i+1:]...)
			return m.Save()
		}
	}

	return fmt.Errorf("conexão '%s' não encontrada", name)
}

// GetConnection retorna uma conexão pelo nome.
func (m *Manager) GetConnection(name string) (*types.ConnectionConfig, error) {
	for _, c := range m.Config.Connections {
		if c.Name == name {
			return &c, nil
		}
	}

	return nil, fmt.Errorf("conexão '%s' não encontrada", name)
}

// ListConnections retorna todas as conexões salvas.
func (m *Manager) ListConnections() []types.ConnectionConfig {
	return m.Config.Connections
}
