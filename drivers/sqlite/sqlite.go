// Package sqlite implementa o driver SQLite para The Amzg Db.
// Usa modernc.org/sqlite (pure Go, sem CGO).
package sqlite

import (
	"database/sql"

	_ "modernc.org/sqlite"
)

// NewConnection cria uma nova conexão SQLite.
func NewConnection(path string) (*sql.DB, error) {
	return sql.Open("sqlite", path)
}
