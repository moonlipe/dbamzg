// PostgreSQL driver para The Amzg Db.
package postgres

import (
	"database/sql"
	"_"github.com/jackc/pgx/v5/stdlib"
)

func NewConnection(connStr string) (*sql.DB, error) {
	return sql.Open("pgx", connStr)
}
