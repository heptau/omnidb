package main

import (
	"bufio"
	"bytes"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
	"golang.org/x/text/encoding/htmlindex"
	"golang.org/x/text/transform"
)

// cleanTempFolder mirrors startup.py's clean_temp_folder(p_all_files=False)
// — deletes anything in tempDir older than a day, skipping .gitkeep. Called
// before every export, same as Python's thread_query does.
func cleanTempFolder(tempDir string) {
	entries, err := os.ReadDir(tempDir)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-24 * time.Hour)
	for _, e := range entries {
		if e.Name() == ".gitkeep" {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			_ = os.Remove(filepath.Join(tempDir, e.Name()))
		}
	}
}

// exportExtensions maps a p_cmd_type suffix ("export_<x>") to both the file
// extension written to disk and the download filename extension shown to
// the user — same value for every format here, kept as its own map in case
// that ever needs to diverge.
var exportExtensions = map[string]string{
	"csv":  "csv",
	"tsv":  "tsv",
	"md":   "md",
	"json": "json",
	"xml":  "xml",
	"xlsx": "xlsx",
}

func exportFormatSupported(format string) bool {
	_, ok := exportExtensions[format]
	return ok
}

// exportWriter is implemented by each output format — WriteHeader/WriteRow
// are called once per column-list/row as the query streams in, Close
// flushes and finalizes the file (for xlsx, this is where the workbook is
// actually serialized — see xlsxExportWriter).
type exportWriter interface {
	WriteHeader(cols []string) error
	WriteRow(values []any) error
	Close() error
}

// scanRowNative reads one row keeping native Go types (int64/float64/bool/
// string/[]byte/time.Time/nil) rather than formatting to strings — unlike
// scanRowAsStrings/consoleValueToString (built for the query grid/console,
// which always display text), JSON and XLSX exports are more useful when
// numbers stay numbers and NULL stays null instead of becoming "" or "0".
func scanRowNative(rows *sql.Rows, numCols int) ([]any, error) {
	values := make([]any, numCols)
	ptrs := make([]any, numCols)
	for i := range values {
		ptrs[i] = &values[i]
	}
	if err := rows.Scan(ptrs...); err != nil {
		return nil, err
	}
	return values, nil
}

// exportEncodingAliases maps a handful of common Python codec spellings
// (what the CSV-encoding setting was historically populated from — see
// workspace.html's ~100-entry <select>) to names golang.org/x/text/encoding/
// htmlindex actually resolves. Deliberately not exhaustive: htmlindex covers
// the WHATWG encoding list (every encoding a browser needs), which is
// already most of what anyone exporting a CSV in 2026 would realistically
// pick. Anything not in this table or not resolved by htmlindex falls back
// to plain UTF-8 rather than erroring — a wrong-but-readable file beats a
// failed export over a rarely-used legacy code page.
var exportEncodingAliases = map[string]string{
	"latin-1": "iso-8859-1", "latin1": "iso-8859-1", "cp1252": "windows-1252",
	"shift-jis": "shift_jis", "utf8": "utf-8",
}

// exportEncodingWriter wraps a file writer to transcode UTF-8 text into the
// user's configured CSV encoding, if recognized (see exportEncodingAliases).
func exportEncodingWriter(f *os.File, name string) *bufio.Writer {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" || name == "utf-8" {
		return bufio.NewWriter(f)
	}
	if alias, ok := exportEncodingAliases[name]; ok {
		name = alias
	}
	enc, err := htmlindex.Get(name)
	if err != nil {
		return bufio.NewWriter(f)
	}
	return bufio.NewWriter(transform.NewWriter(f, enc.NewEncoder()))
}

// --- CSV / TSV --------------------------------------------------------

// delimitedExportWriter backs both CSV and TSV — the only difference is the
// delimiter rune (TSV always uses an actual tab, ignoring the user's
// configured CSV delimiter, since that's the entire point of offering it as
// a separate format from "CSV with a custom delimiter").
type delimitedExportWriter struct {
	file *os.File
	buf  *bufio.Writer
	w    *csv.Writer
}

func newDelimitedExportWriter(outPath string, delimiter rune, encodingName string) (*delimitedExportWriter, error) {
	f, err := os.Create(outPath)
	if err != nil {
		return nil, err
	}
	buf := exportEncodingWriter(f, encodingName)
	w := csv.NewWriter(buf)
	w.Comma = delimiter
	return &delimitedExportWriter{file: f, buf: buf, w: w}, nil
}

func (d *delimitedExportWriter) WriteHeader(cols []string) error { return d.w.Write(cols) }

func (d *delimitedExportWriter) WriteRow(values []any) error {
	row := make([]string, len(values))
	for i, v := range values {
		row[i] = formatSQLValue(v)
	}
	return d.w.Write(row)
}

func (d *delimitedExportWriter) Close() error {
	d.w.Flush()
	if err := d.w.Error(); err != nil {
		d.file.Close()
		return err
	}
	if err := d.buf.Flush(); err != nil {
		d.file.Close()
		return err
	}
	return d.file.Close()
}

// --- Markdown -----------------------------------------------------------

type markdownExportWriter struct {
	file *os.File
	buf  *bufio.Writer
}

func newMarkdownExportWriter(outPath string) (*markdownExportWriter, error) {
	f, err := os.Create(outPath)
	if err != nil {
		return nil, err
	}
	return &markdownExportWriter{file: f, buf: bufio.NewWriter(f)}, nil
}

// mdEscape keeps a cell value from breaking the table's row/column
// structure: a literal "|" would otherwise start a new column, and a
// literal newline would otherwise start a new row.
func mdEscape(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "|", "\\|")
	s = strings.ReplaceAll(s, "\r\n", "<br>")
	s = strings.ReplaceAll(s, "\n", "<br>")
	return s
}

func writeMarkdownRow(w *bufio.Writer, cells []string) {
	w.WriteString("|")
	for _, c := range cells {
		w.WriteString(" ")
		w.WriteString(c)
		w.WriteString(" |")
	}
	w.WriteString("\n")
}

func (m *markdownExportWriter) WriteHeader(cols []string) error {
	escaped := make([]string, len(cols))
	sep := make([]string, len(cols))
	for i, c := range cols {
		escaped[i] = mdEscape(c)
		sep[i] = "---"
	}
	writeMarkdownRow(m.buf, escaped)
	writeMarkdownRow(m.buf, sep)
	return nil
}

func (m *markdownExportWriter) WriteRow(values []any) error {
	cells := make([]string, len(values))
	for i, v := range values {
		cells[i] = mdEscape(formatSQLValue(v))
	}
	writeMarkdownRow(m.buf, cells)
	return nil
}

func (m *markdownExportWriter) Close() error {
	if err := m.buf.Flush(); err != nil {
		m.file.Close()
		return err
	}
	return m.file.Close()
}

// --- JSON -----------------------------------------------------------------

// jsonExportWriter streams a JSON array of row objects (`[{"col":val,...},
// ...]`) rather than building the whole result set in memory first — column
// order is preserved (unlike marshaling a plain Go map, which encoding/json
// always sorts alphabetically by key).
type jsonExportWriter struct {
	file     *os.File
	buf      *bufio.Writer
	cols     []string
	rowCount int
}

func newJSONExportWriter(outPath string) (*jsonExportWriter, error) {
	f, err := os.Create(outPath)
	if err != nil {
		return nil, err
	}
	return &jsonExportWriter{file: f, buf: bufio.NewWriter(f)}, nil
}

func (j *jsonExportWriter) WriteHeader(cols []string) error {
	j.cols = cols
	_, err := j.buf.WriteString("[")
	return err
}

// jsonSafeValue mirrors formatSQLValue's []byte handling (some drivers hand
// back text/blob columns as []byte) but otherwise keeps native types so
// numbers/booleans/null round-trip as real JSON types, not strings.
func jsonSafeValue(v any) any {
	if b, ok := v.([]byte); ok {
		return string(b)
	}
	return v
}

func (j *jsonExportWriter) WriteRow(values []any) error {
	if j.rowCount > 0 {
		j.buf.WriteString(",")
	}
	j.buf.WriteString("{")
	for i, v := range values {
		if i > 0 {
			j.buf.WriteString(",")
		}
		keyBytes, err := json.Marshal(j.cols[i])
		if err != nil {
			return err
		}
		j.buf.Write(keyBytes)
		j.buf.WriteString(":")
		valBytes, err := json.Marshal(jsonSafeValue(v))
		if err != nil {
			return err
		}
		j.buf.Write(valBytes)
	}
	j.buf.WriteString("}")
	j.rowCount++
	return nil
}

func (j *jsonExportWriter) Close() error {
	j.buf.WriteString("]")
	if err := j.buf.Flush(); err != nil {
		j.file.Close()
		return err
	}
	return j.file.Close()
}

// --- XML ------------------------------------------------------------------

// xmlExportWriter emits <rows><row><field name="col">value</field>...
// </row>...</rows> — deliberately not using the column name as the element
// name itself (e.g. <col>value</col>), since column names aren't guaranteed
// to be valid XML element names (can start with a digit, contain spaces,
// etc.); putting it in a "name" attribute instead sidesteps that entirely.
type xmlExportWriter struct {
	file *os.File
	buf  *bufio.Writer
	cols []string
}

func newXMLExportWriter(outPath string) (*xmlExportWriter, error) {
	f, err := os.Create(outPath)
	if err != nil {
		return nil, err
	}
	return &xmlExportWriter{file: f, buf: bufio.NewWriter(f)}, nil
}

func xmlEscapeString(s string) string {
	var buf bytes.Buffer
	_ = xml.EscapeText(&buf, []byte(s))
	return buf.String()
}

func (x *xmlExportWriter) WriteHeader(cols []string) error {
	x.cols = cols
	_, err := x.buf.WriteString(xml.Header + "<rows>\n")
	return err
}

func (x *xmlExportWriter) WriteRow(values []any) error {
	x.buf.WriteString("  <row>\n")
	for i, v := range values {
		fmt.Fprintf(x.buf, "    <field name=\"%s\">%s</field>\n",
			xmlEscapeString(x.cols[i]), xmlEscapeString(formatSQLValue(v)))
	}
	x.buf.WriteString("  </row>\n")
	return nil
}

func (x *xmlExportWriter) Close() error {
	x.buf.WriteString("</rows>\n")
	if err := x.buf.Flush(); err != nil {
		x.file.Close()
		return err
	}
	return x.file.Close()
}

// --- XLSX -------------------------------------------------------------

// xlsxExportWriter builds the whole workbook in memory via excelize's plain
// API and serializes it once, in Close/SaveAs — unlike the other formats,
// which stream straight to disk. excelize does offer a StreamWriter for
// very large sheets, but it requires managing styles/row buffering
// explicitly; the plain API is far simpler and correct for the query result
// sizes this feature is realistically used for (matches Python's own
// openpyxl write_only workbook only in spirit, not in memory profile — a
// deliberate, documented simplification, not an oversight).
type xlsxExportWriter struct {
	f       *excelize.File
	sheet   string
	row     int
	outPath string
}

func newXLSXExportWriter(outPath string) *xlsxExportWriter {
	f := excelize.NewFile()
	return &xlsxExportWriter{f: f, sheet: f.GetSheetName(0), row: 1, outPath: outPath}
}

func xlsxSafeValue(v any) any {
	if b, ok := v.([]byte); ok {
		return string(b)
	}
	if t, ok := v.(time.Time); ok {
		return t
	}
	return v
}

func (x *xlsxExportWriter) WriteHeader(cols []string) error {
	for i, c := range cols {
		cell, err := excelize.CoordinatesToCellName(i+1, x.row)
		if err != nil {
			return err
		}
		if err := x.f.SetCellValue(x.sheet, cell, c); err != nil {
			return err
		}
	}
	x.row++
	return nil
}

func (x *xlsxExportWriter) WriteRow(values []any) error {
	for i, v := range values {
		cell, err := excelize.CoordinatesToCellName(i+1, x.row)
		if err != nil {
			return err
		}
		if err := x.f.SetCellValue(x.sheet, cell, xlsxSafeValue(v)); err != nil {
			return err
		}
	}
	x.row++
	return nil
}

func (x *xlsxExportWriter) Close() error {
	return x.f.SaveAs(x.outPath)
}

// --- Orchestration ------------------------------------------------------

// newExportWriter opens the right writer for the given format ("csv",
// "tsv", "md", "json", "xml", "xlsx" — the p_cmd_type suffix after
// "export_"). csvDelimiter/csvEncoding only affect the "csv" format (see
// delimitedExportWriter's doc comment for why "tsv" ignores them).
func newExportWriter(format, outPath, csvDelimiter, csvEncoding string) (exportWriter, error) {
	switch format {
	case "csv":
		delim := ';'
		if csvDelimiter != "" {
			delim = rune(csvDelimiter[0])
		}
		return newDelimitedExportWriter(outPath, delim, csvEncoding)
	case "tsv":
		return newDelimitedExportWriter(outPath, '\t', csvEncoding)
	case "md":
		return newMarkdownExportWriter(outPath)
	case "json":
		return newJSONExportWriter(outPath)
	case "xml":
		return newXMLExportWriter(outPath)
	case "xlsx":
		return newXLSXExportWriter(outPath), nil
	default:
		return nil, fmt.Errorf("unsupported export format %q", format)
	}
}

// runExportQuery mirrors thread_query's export_csv/export_xlsx branch —
// fetches the whole result set (no row cap, same as Python's QueryBlock
// loop) and writes it straight to outPath in the requested format.
func runExportQuery(db *sql.DB, sqlText, format, outPath, csvDelimiter, csvEncoding string) error {
	rows, err := db.Query(sqlText)
	if err != nil {
		return err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return err
	}

	writer, err := newExportWriter(format, outPath, csvDelimiter, csvEncoding)
	if err != nil {
		return err
	}
	if err := writer.WriteHeader(cols); err != nil {
		writer.Close()
		return err
	}

	for rows.Next() {
		values, err := scanRowNative(rows, len(cols))
		if err != nil {
			writer.Close()
			return err
		}
		if err := writer.WriteRow(values); err != nil {
			writer.Close()
			return err
		}
	}
	if err := rows.Err(); err != nil {
		writer.Close()
		return err
	}

	return writer.Close()
}

// runQueryExport mirrors thread_query's export_csv/export_xlsx branch (now
// generalized to export_tsv/export_md/export_json/export_xml too) —
// delivered through the same Django long-polling queue as every other
// native query route, with the same response shape Python returns
// (v_filename/v_downloadname point at Django's own static/temp serving,
// which this doesn't need to reimplement — see resolveTempDir's comment).
func runQueryExport(upstream *url.URL, cookie string, q queryRequestData, format string, contextCode int, info *ConnectionInfo, who *WhoAmI) {
	start := time.Now()

	sqlText := q.VSQLCmd
	if len(sqlText) > 0 && sqlText[len(sqlText)-1] == ';' {
		sqlText = sqlText[:len(sqlText)-1]
	}

	tempDir, err := resolveTempDir(upstream)
	if err != nil {
		queueQueryError(upstream, cookie, contextCode, err)
		return
	}
	cleanTempFolder(tempDir.TempDir)
	if err := os.MkdirAll(tempDir.TempDir, 0o755); err != nil {
		queueQueryError(upstream, cookie, contextCode, err)
		return
	}

	db, err := openNativeQueryTarget(info)
	if err != nil {
		queueQueryError(upstream, cookie, contextCode, err)
		return
	}
	defer db.Close()

	ext := exportExtensions[format]
	now := time.Now()
	fileName := fmt.Sprintf("%d_%06d.%s", now.Unix(), now.Nanosecond()/1000, ext)
	outPath := filepath.Join(tempDir.TempDir, fileName)

	csvEncoding := who.CSVEncoding
	if csvEncoding == "" {
		csvEncoding = "utf-8"
	}
	csvDelimiter := who.CSVDelimiter
	if csvDelimiter == "" {
		csvDelimiter = ";"
	}

	if err := runExportQuery(db, sqlText, format, outPath, csvDelimiter, csvEncoding); err != nil {
		queueQueryError(upstream, cookie, contextCode, err)
		return
	}

	queueNativeResponse(cookie, map[string]any{
		"v_code":         responseQueryResult,
		"v_context_code": contextCode,
		"v_error":        false,
		"v_data": map[string]any{
			"v_filename":     tempDir.Path + "/static/temp/" + fileName,
			"v_downloadname": "omnidb_exported." + ext,
			"v_duration":     formatDuration(time.Since(start)),
			"v_inserted_id":  nil,
			"v_con_status":   1,
			"v_chunks":       false,
		},
	})
}
