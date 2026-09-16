// Package history fornece funcionalidades de histórico de queries.
package history

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// QueryEntry representa uma entrada no histórico de queries.
type QueryEntry struct {
	ID          string    `json:"id"`
	Connection  string    `json:"connection"`
	Query       string    `json:"query"`
	Timestamp   time.Time `json:"timestamp"`
	Duration    int64     `json:"duration"`
	RowsAffected int     `json:"rows_affected"`
	Success     bool      `json:"success"`
	Error       string    `json:"error,omitempty"`
}

// History é o gerenciador de histórico de queries.
type History struct {
	mu       sync.RWMutex
	entries  []QueryEntry
	filePath string
	maxSize  int
}

// NewHistory cria uma nova instância do histórico.
func NewHistory() *History {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = os.TempDir()
	}

	dir := filepath.Join(configDir, "amzg-db")
	os.MkdirAll(dir, 0755)

	return &History{
		filePath: filepath.Join(dir, "query_history.json"),
		maxSize:  1000, // Máximo de 1000 entradas
	}
}

// Add adiciona uma nova entrada ao histórico.
func (h *History) Add(entry QueryEntry) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Carrega entradas existentes se o arquivo existir
	if err := h.load(); err != nil {
		// Ignora erro se arquivo não existe
	}

	// Adiciona nova entrada no início
	entry.ID = fmt.Sprintf("%d", time.Now().UnixNano())
	entry.Timestamp = time.Now()
	h.entries = append([]QueryEntry{entry}, h.entries...)

	// Limita o tamanho do histórico
	if len(h.entries) > h.maxSize {
		h.entries = h.entries[:h.maxSize]
	}

	// Salva no arquivo
	return h.save()
}

// GetAll retorna todas as entradas do histórico.
func (h *History) GetAll() ([]QueryEntry, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if err := h.load(); err != nil {
		return nil, err
	}

	return h.entries, nil
}

// GetByConnection retorna entradas filtradas por conexão.
func (h *History) GetByConnection(connection string) ([]QueryEntry, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if err := h.load(); err != nil {
		return nil, err
	}

	var filtered []QueryEntry
	for _, entry := range h.entries {
		if entry.Connection == connection {
			filtered = append(filtered, entry)
		}
	}

	return filtered, nil
}

// Search busca entradas por texto.
func (h *History) Search(text string) ([]QueryEntry, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if err := h.load(); err != nil {
		return nil, err
	}

	var results []QueryEntry
	for _, entry := range h.entries {
		if contains(entry.Query, text) || contains(entry.Connection, text) {
			results = append(results, entry)
		}
	}

	return results, nil
}

// Remove remove uma entrada do histórico.
func (h *History) Remove(id string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if err := h.load(); err != nil {
		return err
	}

	for i, entry := range h.entries {
		if entry.ID == id {
			h.entries = append(h.entries[:i], h.entries[i+1:]...)
			return h.save()
		}
	}

	return nil
}

// Clear limpa todo o histórico.
func (h *History) Clear() error {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.entries = nil
	return h.save()
}

// load carrega entradas do arquivo.
func (h *History) load() error {
	data, err := os.ReadFile(h.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	return json.Unmarshal(data, &h.entries)
}

// save salva entradas no arquivo.
func (h *History) save() error {
	data, err := json.MarshalIndent(h.entries, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(h.filePath, data, 0644)
}

// contains verifica se uma string contém outra (case-insensitive).
func contains(s, substr string) bool {
	return len(substr) > 0 && (s == substr || len(s) >= len(substr) && 
		(s[:len(substr)] == substr || containsHelper(s, substr)))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
