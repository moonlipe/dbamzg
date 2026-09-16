// Package sqlvariables fornece funcionalidades de variáveis SQL.
// Suporta variáveis no formato ${nome} ou :nome.
package sqlvariables

import (
	"regexp"
	"strings"
	"sync"
)

// Variable representa uma variável SQL.
type Variable struct {
	Name         string   `json:"name"`
	Value        string   `json:"value"`
	History      []string `json:"history"`
	DefaultValue string   `json:"default_value,omitempty"`
}

// VariableManager gerencia variáveis SQL.
type VariableManager struct {
	mu        sync.RWMutex
	variables map[string]*Variable
}

// NewVariableManager cria uma nova instância do gerenciador.
func NewVariableManager() *VariableManager {
	return &VariableManager{
		variables: make(map[string]*Variable),
	}
}

// ExtractVariables extrai variáveis de uma query SQL.
func (vm *VariableManager) ExtractVariables(query string) []Variable {
	vm.mu.RLock()
	defer vm.mu.RUnlock()

	var vars []Variable
	seen := make(map[string]bool)

	// Padrão ${nome}
	pattern1 := regexp.MustCompile(`\$\{([^}]+)\}`)
	matches1 := pattern1.FindAllStringSubmatch(query, -1)
	for _, match := range matches1 {
		if len(match) > 1 {
			name := match[1]
			if !seen[name] {
				seen[name] = true
				v := vm.getOrCreateVariable(name)
				vars = append(vars, *v)
			}
		}
	}

	// Padrão :nome (mas não ::nome que é PostgreSQL cast)
	pattern2 := regexp.MustCompile(`(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)`)
	matches2 := pattern2.FindAllStringSubmatch(query, -1)
	for _, match := range matches2 {
		if len(match) > 1 {
			name := match[1]
			// Ignora palavras SQL comuns
			if !isSQLKeyword(name) && !seen[name] {
				seen[name] = true
				v := vm.getOrCreateVariable(name)
				vars = append(vars, *v)
			}
		}
	}

	return vars
}

// ReplaceVariables substitui variáveis na query pelos valores fornecidos.
func (vm *VariableManager) ReplaceVariables(query string, values map[string]string) string {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	result := query

	// Substitui ${nome}
	for name, value := range values {
		pattern := regexp.MustCompile(`\$\{` + regexp.QuoteMeta(name) + `\}`)
		result = pattern.ReplaceAllString(result, value)

		// Salva no histórico
		if v, ok := vm.variables[name]; ok {
			v.Value = value
			vm.addToHistory(v, value)
		}
	}

	// Substitui :nome
	for name, value := range values {
		pattern := regexp.MustCompile(`(?<!:):` + regexp.QuoteMeta(name) + `\b`)
		result = pattern.ReplaceAllString(result, value)

		// Salva no histórico
		if v, ok := vm.variables[name]; ok {
			v.Value = value
			vm.addToHistory(v, value)
		}
	}

	return result
}

// GetVariable retorna uma variável pelo nome.
func (vm *VariableManager) GetVariable(name string) *Variable {
	vm.mu.RLock()
	defer vm.mu.RUnlock()

	if v, ok := vm.variables[name]; ok {
		return v
	}
	return nil
}

// SetVariable define o valor de uma variável.
func (vm *VariableManager) SetVariable(name, value string) {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	v := vm.getOrCreateVariable(name)
	v.Value = value
	vm.addToHistory(v, value)
}

// GetAll retorna todas as variáveis.
func (vm *VariableManager) GetAll() map[string]*Variable {
	vm.mu.RLock()
	defer vm.mu.RUnlock()

	result := make(map[string]*Variable)
	for k, v := range vm.variables {
		result[k] = v
	}
	return result
}

// getOrCreateVariable obtém ou cria uma variável.
func (vm *VariableManager) getOrCreateVariable(name string) *Variable {
	if v, ok := vm.variables[name]; ok {
		return v
	}
	v := &Variable{
		Name:     name,
		History:  []string{},
	}
	vm.variables[name] = v
	return v
}

// addToHistory adiciona um valor ao histórico da variável.
func (vm *VariableManager) addToHistory(v *Variable, value string) {
	// Não duplica se já existe
	for _, h := range v.History {
		if h == value {
			return
		}
	}

	// Mantém apenas os últimos 20 valores
	if len(v.History) >= 20 {
		v.History = v.History[1:]
	}
	v.History = append(v.History, value)
}

// isSQLKeyword verifica se um nome é uma palavra-chave SQL comum.
func isSQLKeyword(name string) bool {
	keywords := map[string]bool{
		"SELECT": true, "FROM": true, "WHERE": true, "AND": true, "OR": true,
		"INSERT": true, "INTO": true, "VALUES": true, "UPDATE": true, "SET": true,
		"DELETE": true, "CREATE": true, "ALTER": true, "DROP": true, "TABLE": true,
		"INDEX": true, "VIEW": true, "DATABASE": true, "SCHEMA": true, "USER": true,
		"ORDER": true, "BY": true, "GROUP": true, "HAVING": true, "LIMIT": true,
		"OFFSET": true, "JOIN": true, "LEFT": true, "RIGHT": true, "INNER": true,
		"OUTER": true, "ON": true, "AS": true, "IN": true, "NOT": true, "NULL": true,
		"IS": true, "LIKE": true, "BETWEEN": true, "EXISTS": true, "CASE": true,
		"WHEN": true, "THEN": true, "ELSE": true, "END": true, "TRUE": true, "FALSE": true,
	}
	return keywords[strings.ToUpper(name)]
}
