// Package config gerencia a configuração do aplicativo.
// Salva projetos e conexões em arquivo JSON no diretório do usuário.
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
	Projects     []types.Project        `json:"projects"`
	Connections  []types.ConnectionConfig `json:"connections"` // Conexões avulsas (sem projeto)
	SavedQueries []types.SavedQuery     `json:"saved_queries"`
}

// Manager gerencia a configuração do app.
type Manager struct {
	configDir  string
	configFile string
	Config     *Config
}

// NewManager cria um novo gerenciador de configuração.
func NewManager() (*Manager, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("erro ao obter diretorio de config: %w", err)
	}

	appDir := filepath.Join(configDir, "amzg-db")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return nil, fmt.Errorf("erro ao criar diretorio de config: %w", err)
	}

	configFile := filepath.Join(appDir, "config.json")

	m := &Manager{
		configDir:  appDir,
		configFile: configFile,
		Config:     &Config{},
	}

	if err := m.Load(); err != nil {
		if !os.IsNotExist(err) {
			return nil, err
		}
	}

	// Deduplica: remove conexoes avulsas que ja existem em projetos
	m.deduplicateConnections()

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

// deduplicateConnections remove conexoes avulsas que ja existem dentro de projetos.
func (m *Manager) deduplicateConnections() {
	// Coleta nomes de conexoes que ja existem em projetos
	inProject := make(map[string]bool)
	for _, p := range m.Config.Projects {
		for _, c := range p.Connections {
			inProject[c.Name] = true
		}
	}

	// Remove avulsas duplicadas
	var filtered []types.ConnectionConfig
	for _, c := range m.Config.Connections {
		if !inProject[c.Name] {
			filtered = append(filtered, c)
		}
	}

	if len(filtered) != len(m.Config.Connections) {
		m.Config.Connections = filtered
		m.Save()
	}
}

// --- Projetos ---

// AddProject adiciona ou atualiza um projeto.
func (m *Manager) AddProject(project types.Project) error {
	for i, p := range m.Config.Projects {
		if p.Name == project.Name {
			m.Config.Projects[i] = project
			return m.Save()
		}
	}

	m.Config.Projects = append(m.Config.Projects, project)
	return m.Save()
}

// RemoveProject remove um projeto pelo nome.
func (m *Manager) RemoveProject(name string) error {
	for i, p := range m.Config.Projects {
		if p.Name == name {
			m.Config.Projects = append(m.Config.Projects[:i], m.Config.Projects[i+1:]...)
			return m.Save()
		}
	}

	return fmt.Errorf("projeto '%s' nao encontrado", name)
}

// GetProject retorna um projeto pelo nome.
func (m *Manager) GetProject(name string) (*types.Project, error) {
	for _, p := range m.Config.Projects {
		if p.Name == name {
			return &p, nil
		}
	}

	return nil, fmt.Errorf("projeto '%s' nao encontrado", name)
}

// ListProjects retorna todos os projetos.
func (m *Manager) ListProjects() []types.Project {
	return m.Config.Projects
}

// --- Conexões (avulsas, sem projeto) ---

// AddConnection adiciona ou atualiza uma conexão avulsa.
func (m *Manager) AddConnection(config types.ConnectionConfig) error {
	for i, c := range m.Config.Connections {
		if c.Name == config.Name {
			m.Config.Connections[i] = config
			return m.Save()
		}
	}

	m.Config.Connections = append(m.Config.Connections, config)
	return m.Save()
}

// RemoveConnection remove uma conexão avulsa pelo nome.
func (m *Manager) RemoveConnection(name string) error {
	for i, c := range m.Config.Connections {
		if c.Name == name {
			m.Config.Connections = append(m.Config.Connections[:i], m.Config.Connections[i+1:]...)
			return m.Save()
		}
	}

	return fmt.Errorf("conexao '%s' nao encontrada", name)
}

// GetConnection retorna uma conexão avulsa pelo nome.
func (m *Manager) GetConnection(name string) (*types.ConnectionConfig, error) {
	for _, c := range m.Config.Connections {
		if c.Name == name {
			return &c, nil
		}
	}

	return nil, fmt.Errorf("conexao '%s' nao encontrada", name)
}

// ListConnections retorna todas as conexões avulsas.
func (m *Manager) ListConnections() []types.ConnectionConfig {
	return m.Config.Connections
}

// GetAllConnections retorna todas as conexões (de projetos + avulsas).
func (m *Manager) GetAllConnections() []types.ConnectionConfig {
	var all []types.ConnectionConfig

	// Conexões de projetos
	for _, p := range m.Config.Projects {
		all = append(all, p.Connections...)
	}

	// Conexões avulsas
	all = append(all, m.Config.Connections...)

	return all
}

// --- Queries Salvas ---

// AddSavedQuery adiciona ou atualiza uma query salva (pelo nome).
func (m *Manager) AddSavedQuery(q types.SavedQuery) error {
	for i, sq := range m.Config.SavedQueries {
		if sq.Name == q.Name {
			m.Config.SavedQueries[i] = q
			return m.Save()
		}
	}

	m.Config.SavedQueries = append(m.Config.SavedQueries, q)
	return m.Save()
}

// RemoveSavedQuery remove uma query salva pelo nome.
func (m *Manager) RemoveSavedQuery(name string) error {
	for i, sq := range m.Config.SavedQueries {
		if sq.Name == name {
			m.Config.SavedQueries = append(m.Config.SavedQueries[:i], m.Config.SavedQueries[i+1:]...)
			return m.Save()
		}
	}

	return fmt.Errorf("query salva '%s' nao encontrada", name)
}

// ListSavedQueries retorna todas as queries salvas.
func (m *Manager) ListSavedQueries() []types.SavedQuery {
	return m.Config.SavedQueries
}
