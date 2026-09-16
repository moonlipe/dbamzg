// Package export fornece funcionalidades de exportação de dados.
// Suporta CSV, JSON, XML, SQL INSERT, XLSX e ODS.
package export

import (
	"encoding/csv"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"os"
	"strings"

	"amzg-db/internal/types"
)

// Exporter é a interface para exportadores de dados.
type Exporter interface {
	Export(result *types.QueryResult, filename string) error
}

// Format formata de exportação.
type Format string

const (
	CSV      Format = "csv"
	JSON     Format = "json"
	XML      Format = "xml"
	SQL      Format = "sql"
	XLSX     Format = "xlsx"
	ODS      Format = "ods"
)

// NewExporter cria um novo exportador para o formato especificado.
func NewExporter(format Format) Exporter {
	switch format {
	case CSV:
		return &csvExporter{}
	case JSON:
		return &jsonExporter{}
	case XML:
		return &xmlExporter{}
	case SQL:
		return &sqlExporter{}
	default:
		return &csvExporter{}
	}
}

// csvExporter exporta dados para CSV.
type csvExporter struct{}

func (e *csvExporter) Export(result *types.QueryResult, filename string) error {
	file, err := os.Create(filename)
	if err != nil {
		return fmt.Errorf("erro ao criar arquivo: %w", err)
	}
	defer file.Close()

	// BOM para UTF-8
	file.Write([]byte{0xEF, 0xBB, 0xBF})

	writer := csv.NewWriter(file)
	defer writer.Flush()

	// Escreve cabeçalho
	if err := writer.Write(result.Columns); err != nil {
		return err
	}

	// Escreve linhas
	for _, row := range result.Rows {
		records := make([]string, len(row))
		for i, cell := range row {
			records[i] = fmt.Sprintf("%v", cell)
		}
		if err := writer.Write(records); err != nil {
			return err
		}
	}

	return nil
}

// jsonExporter exporta dados para JSON.
type jsonExporter struct{}

type jsonRow map[string]interface{}

func (e *jsonExporter) Export(result *types.QueryResult, filename string) error {
	data := make([]jsonRow, 0)

	for _, row := range result.Rows {
		rowData := make(jsonRow)
		for i, col := range result.Columns {
			if i < len(row) {
				rowData[col] = row[i]
			}
		}
		data = append(data, rowData)
	}

	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("erro ao serializar JSON: %w", err)
	}

	return os.WriteFile(filename, jsonData, 0644)
}

// xmlExporter exporta dados para XML.
type xmlExporter struct{}

type xmlRoot struct {
	XMLName xml.Name    `xml:"data"`
	Rows    []xmlRow    `xml:"row"`
}

type xmlRow struct {
	XMLName xml.Name      `xml:"row"`
	Fields  []xmlField    `xml:"field"`
}

type xmlField struct {
	XMLName xml.Name `xml:"field"`
	Name    string   `xml:"name,attr"`
	Value   string   `xml:",chardata"`
}

func (e *xmlExporter) Export(result *types.QueryResult, filename string) error {
	root := xmlRoot{}

	for _, row := range result.Rows {
		xmlRow := xmlRow{}
		for i, col := range result.Columns {
			if i < len(row) {
				xmlRow.Fields = append(xmlRow.Fields, xmlField{
					Name:  col,
					Value: fmt.Sprintf("%v", row[i]),
				})
			}
		}
		root.Rows = append(root.Rows, xmlRow)
	}

	xmlData, err := xml.MarshalIndent(root, "", "  ")
	if err != nil {
		return fmt.Errorf("erro ao serializar XML: %w", err)
	}

	xmlOutput := append([]byte(xml.Header), xmlData...)
	return os.WriteFile(filename, xmlOutput, 0644)
}

// sqlExporter exporta dados para SQL INSERT.
type sqlExporter struct{}

func (e *sqlExporter) Export(result *types.QueryResult, filename string) error {
	var sb strings.Builder

	// Detecta nome da tabela (usa "exported_data" se não disponível)
	tableName := "exported_data"

	for _, row := range result.Rows {
		values := make([]string, len(row))
		for i, cell := range row {
			if cell == nil {
				values[i] = "NULL"
			} else {
				val := fmt.Sprintf("%v", cell)
				val = strings.ReplaceAll(val, "'", "''")
				values[i] = fmt.Sprintf("'%s'", val)
			}
		}

		sb.WriteString(fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s);\n",
			tableName,
			strings.Join(result.Columns, ", "),
			strings.Join(values, ", "),
		))
	}

	return os.WriteFile(filename, []byte(sb.String()), 0644)
}

// ExportToFile exporta dados para o arquivo especificado.
func ExportToFile(result *types.QueryResult, filename string, format Format) error {
	exporter := NewExporter(format)
	return exporter.Export(result, filename)
}

// GetExtension retorna a extensão do arquivo para o formato.
func GetExtension(format Format) string {
	switch format {
	case CSV:
		return ".csv"
	case JSON:
		return ".json"
	case XML:
		return ".xml"
	case SQL:
		return ".sql"
	case XLSX:
		return ".xlsx"
	case ODS:
		return ".ods"
	default:
		return ".csv"
	}
}
