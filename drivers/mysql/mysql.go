// MySQL driver para The Amzg Db.
package mysql

import (
	"database/sql"
	"_"github.com/go-sql-driver/mysql"
)

func NewConnection(connStr string) (*sql.DB, error) {
	return sql.Open("mysql", connStr)
}
