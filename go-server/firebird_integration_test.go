package main

import (
	"context"
	"database/sql"
	"net"
	"os"
	"sort"
	"strings"
	"testing"
	"time"
)

// Integration tests against a real Firebird server. These are skipped unless
// a live instance is reachable, so `go test ./...` stays green for anyone
// without Docker/Firebird set up.
//
// To run these tests locally, start a Firebird 4.x container and point the
// tests at it:
//
//	docker run -d --name omnidb-firebird-test \
//	  -p 3050:3050 \
//	  -e ISC_PASSWORD=masterkey \
//	  -e FIREBIRD_DATABASE=testdb.fdb \
//	  -e FIREBIRD_USER=testuser \
//	  -e FIREBIRD_PASSWORD=testpass \
//	  jacobalberty/firebird:v4.0
//
// then either set FIREBIRD_TEST_DSN to the full nakagami/firebirdsql DSN
// (e.g. "SYSDBA:masterkey@127.0.0.1:3050//firebird/data/testdb.fdb") or just
// leave it unset — the test falls back to that exact default when it can
// dial localhost:3050. The schema this test needs (tables, views, a
// procedure, a function, a trigger with POST_EVENT) is created by the test
// itself the first time it runs against a fresh database, and is safe to
// re-run (every DDL statement is CREATE OR ALTER / guarded by existence
// checks).
//
// Every test in this file runs fine against the plain `docker run -p
// 3050:3050 ...` setup above, except TestFirebirdIntegrationNotify's actual
// event delivery, which additionally needs the Firebird server's aux event
// connection address (see that test's own comment) to be reachable — not
// just the main port. On a Linux Docker host that's often already true; on
// Docker Desktop for Mac/Windows it typically isn't, and that one test skips
// itself with an explanation rather than hanging. To exercise it for real
// anywhere, run the test binary attached to the same Docker network as the
// container instead of on the host:
//
//	docker network create fbtest
//	docker network connect fbtest omnidb-firebird-test
//	docker run --rm --network fbtest \
//	  -v "$(pwd)/..":/repo -v "$(go env GOMODCACHE)":/go/pkg/mod \
//	  -w /repo/go-server \
//	  -e FIREBIRD_TEST_DSN="SYSDBA:masterkey@omnidb-firebird-test:3050//firebird/data/testdb.fdb" \
//	  golang:1.25 go test -run TestFirebirdIntegration -v ./...
//
// Tear down when done: docker rm -f omnidb-firebird-test

const firebirdTestDefaultDSN = "SYSDBA:masterkey@127.0.0.1:3050//firebird/data/testdb.fdb"

func firebirdIntegrationDSN(t *testing.T) string {
	t.Helper()
	if dsn := os.Getenv("FIREBIRD_TEST_DSN"); dsn != "" {
		return dsn
	}
	conn, err := net.DialTimeout("tcp", "127.0.0.1:3050", 500*time.Millisecond)
	if err != nil {
		t.Skipf("no Firebird reachable at localhost:3050 and FIREBIRD_TEST_DSN not set, skipping: %v", err)
	}
	conn.Close()
	return firebirdTestDefaultDSN
}

func firebirdTestDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := firebirdIntegrationDSN(t)
	db, err := sql.Open("firebirdsql", dsn)
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Skipf("could not ping Firebird at %q, skipping: %v", dsn, err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// firebirdTestConnInfo mirrors the discrete-field DSN path (firebirdDSN),
// derived from the same default DSN firebirdTestDB uses, for tests that need
// a *ConnectionInfo instead of a raw *sql.DB (openFirebirdTarget, the Notify
// backend).
func firebirdTestConnInfo(t *testing.T) *ConnectionInfo {
	t.Helper()
	dsn := firebirdIntegrationDSN(t)
	// dsn is "user:pass@host:port/path" (no scheme) — reverse-engineer the
	// discrete fields firebirdDSN would recombine, since the test constants
	// above are already in that shape.
	at := strings.LastIndex(dsn, "@")
	if at < 0 {
		t.Fatalf("unexpected DSN shape %q", dsn)
	}
	userPass := dsn[:at]
	rest := dsn[at+1:]
	slash := strings.Index(rest, "/")
	if slash < 0 {
		t.Fatalf("unexpected DSN shape %q", dsn)
	}
	hostPort := rest[:slash]
	dbPath := rest[slash:]
	colon := strings.Index(userPass, ":")
	user, pass := userPass, ""
	if colon >= 0 {
		user, pass = userPass[:colon], userPass[colon+1:]
	}
	hcolon := strings.LastIndex(hostPort, ":")
	host, port := hostPort, "3050"
	if hcolon >= 0 {
		host, port = hostPort[:hcolon], hostPort[hcolon+1:]
	}
	return &ConnectionInfo{
		Technology: "firebird",
		Server:     host,
		Port:       port,
		Database:   dbPath,
		Username:   user,
		Password:   pass,
	}
}

// setupFirebirdSchema creates the tables/view/procedure/function/trigger
// this test suite exercises. Every statement is idempotent (guarded by an
// existence check or CREATE OR ALTER) so re-running the test against an
// already-seeded database is safe.
func setupFirebirdSchema(t *testing.T, db *sql.DB) {
	t.Helper()
	ctx := context.Background()

	execIgnoreExists := func(sqlText string) {
		if _, err := db.ExecContext(ctx, sqlText); err != nil {
			// -204/-607 family: object already exists / metadata update
			// error. Fine on a re-run against a previously seeded database.
			if strings.Contains(err.Error(), "already exists") || strings.Contains(strings.ToLower(err.Error()), "already exist") {
				return
			}
			t.Fatalf("exec %q: %v", sqlText, err)
		}
	}

	execIgnoreExists(`CREATE TABLE it_departments (
		id INTEGER NOT NULL,
		name VARCHAR(100) NOT NULL,
		budget NUMERIC(12,2) DEFAULT 0,
		CONSTRAINT pk_it_departments PRIMARY KEY (id)
	)`)

	execIgnoreExists(`CREATE TABLE it_employees (
		id INTEGER NOT NULL,
		dept_id INTEGER,
		first_name VARCHAR(50) NOT NULL,
		last_name VARCHAR(50) NOT NULL,
		email VARCHAR(150),
		hire_date DATE DEFAULT CURRENT_DATE,
		salary DECIMAL(10,2),
		notes BLOB SUB_TYPE TEXT,
		CONSTRAINT pk_it_employees PRIMARY KEY (id),
		CONSTRAINT uq_it_employees_email UNIQUE (email),
		CONSTRAINT fk_it_employees_dept FOREIGN KEY (dept_id) REFERENCES it_departments (id) ON DELETE SET NULL ON UPDATE CASCADE
	)`)

	execIgnoreExists(`CREATE INDEX idx_it_employees_lastname ON it_employees (last_name)`)

	execIgnoreExists(`CREATE TABLE it_dept_locations (
		dept_id INTEGER NOT NULL,
		location_code VARCHAR(10) NOT NULL,
		address VARCHAR(200),
		CONSTRAINT pk_it_dept_locations PRIMARY KEY (dept_id, location_code)
	)`)

	execIgnoreExists(`CREATE TABLE it_shipments (
		id INTEGER NOT NULL,
		dept_id INTEGER NOT NULL,
		location_code VARCHAR(10) NOT NULL,
		qty INTEGER,
		CONSTRAINT pk_it_shipments PRIMARY KEY (id),
		CONSTRAINT fk_it_shipments_loc FOREIGN KEY (dept_id, location_code) REFERENCES it_dept_locations (dept_id, location_code)
	)`)

	execIgnoreExists(`CREATE VIEW it_active_employees AS
		SELECT id, first_name, last_name, dept_id FROM it_employees`)

	execIgnoreExists(`CREATE OR ALTER PROCEDURE it_get_employee_count (
		p_dept_id INTEGER
	)
	RETURNS (
		emp_count INTEGER
	)
	AS
	BEGIN
		SELECT COUNT(*) FROM it_employees WHERE dept_id = :p_dept_id INTO :emp_count;
		SUSPEND;
	END`)

	execIgnoreExists(`CREATE OR ALTER FUNCTION it_calc_bonus (
		p_salary DECIMAL(10,2),
		p_pct INTEGER
	)
	RETURNS DECIMAL(10,2)
	AS
	BEGIN
		RETURN p_salary * p_pct / 100;
	END`)

	execIgnoreExists(`CREATE OR ALTER TRIGGER it_trg_employees_notify FOR it_employees
		AFTER INSERT OR UPDATE
		AS
		BEGIN
			POST_EVENT 'it_employee_channel';
		END`)

	// Seed some rows (best-effort; ignore duplicate-PK errors on re-run).
	seed := []string{
		`INSERT INTO it_departments (id, name, budget) VALUES (1, 'Engineering', 100000)`,
		`INSERT INTO it_departments (id, name, budget) VALUES (2, 'Sales', 50000)`,
		`INSERT INTO it_dept_locations (dept_id, location_code, address) VALUES (1, 'HQ', '123 Main St')`,
		`INSERT INTO it_employees (id, dept_id, first_name, last_name, email, salary) VALUES (1, 1, 'Alice', 'Smith', 'alice@it.example', 90000)`,
		`INSERT INTO it_employees (id, dept_id, first_name, last_name, email, salary) VALUES (2, 1, 'Bob', 'Jones', 'bob@it.example', 85000)`,
		`INSERT INTO it_employees (id, dept_id, first_name, last_name, email, salary) VALUES (3, 2, 'Carol', 'Lee', 'carol@it.example', 70000)`,
		`INSERT INTO it_shipments (id, dept_id, location_code, qty) VALUES (1, 1, 'HQ', 42)`,
	}
	for _, s := range seed {
		if _, err := db.ExecContext(ctx, s); err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "violation of primary") {
				continue
			}
			t.Fatalf("seed %q: %v", s, err)
		}
	}
}

func containsTable(tables []firebirdTable, name string) bool {
	for _, t := range tables {
		if t.Name == name {
			return true
		}
	}
	return false
}

func TestFirebirdIntegrationSchemaAndColumns(t *testing.T) {
	db := firebirdTestDB(t)
	setupFirebirdSchema(t, db)

	tables, err := firebirdTables(db)
	if err != nil {
		t.Fatalf("firebirdTables: %v", err)
	}
	for _, want := range []string{"IT_DEPARTMENTS", "IT_EMPLOYEES", "IT_DEPT_LOCATIONS", "IT_SHIPMENTS"} {
		if !containsTable(tables, want) {
			t.Errorf("expected table %s in firebirdTables() result, got %+v", want, tables)
		}
	}
	// the view must NOT show up in firebirdTables (rdb$view_blr is not null)
	if containsTable(tables, "IT_ACTIVE_EMPLOYEES") {
		t.Errorf("firebirdTables() should not include views, got view IT_ACTIVE_EMPLOYEES in %+v", tables)
	}

	views, err := firebirdViews(db)
	if err != nil {
		t.Fatalf("firebirdViews: %v", err)
	}
	foundView := false
	for _, v := range views {
		if v.Name == "IT_ACTIVE_EMPLOYEES" {
			foundView = true
		}
	}
	if !foundView {
		t.Errorf("expected view IT_ACTIVE_EMPLOYEES in firebirdViews() result, got %+v", views)
	}

	cols, err := firebirdColumns(db, "IT_EMPLOYEES")
	if err != nil {
		t.Fatalf("firebirdColumns: %v", err)
	}
	byName := map[string]firebirdColumn{}
	for _, c := range cols {
		byName[c.Name] = c
	}
	if len(cols) != 8 {
		t.Errorf("expected 8 columns on IT_EMPLOYEES, got %d: %+v", len(cols), cols)
	}
	if c, ok := byName["ID"]; !ok || c.DataType != "INTEGER" {
		t.Errorf("expected ID INTEGER, got %+v (present=%v)", c, ok)
	}
	if c, ok := byName["FIRST_NAME"]; !ok || c.DataType != "VARCHAR" || c.Length != 50 || c.Nullable != "NO" {
		t.Errorf("expected FIRST_NAME VARCHAR(50) NOT NULL, got %+v", c)
	}
	if c, ok := byName["EMAIL"]; !ok || c.Nullable != "YES" {
		t.Errorf("expected EMAIL nullable, got %+v", c)
	}
	if c, ok := byName["SALARY"]; !ok || c.DataType != "DECIMAL" || c.Precision != 10 || c.Scale != -2 {
		t.Errorf("expected SALARY DECIMAL(10,2) (scale stored as -2), got %+v", c)
	}
	if c, ok := byName["NOTES"]; !ok || c.DataType != "BLOB SUB_TYPE TEXT" {
		t.Errorf("expected NOTES BLOB SUB_TYPE TEXT, got %+v", c)
	}
	if c, ok := byName["HIRE_DATE"]; !ok || !c.DefaultValue.Valid || !strings.Contains(strings.ToUpper(c.DefaultValue.String), "CURRENT_DATE") {
		t.Errorf("expected HIRE_DATE default referencing CURRENT_DATE, got %+v", c)
	}

	viewCols, err := firebirdViewColumns(db, "IT_ACTIVE_EMPLOYEES")
	if err != nil {
		t.Fatalf("firebirdViewColumns: %v", err)
	}
	if len(viewCols) != 4 {
		t.Errorf("expected 4 columns on IT_ACTIVE_EMPLOYEES view, got %d: %+v", len(viewCols), viewCols)
	}
}

func TestFirebirdIntegrationConstraints(t *testing.T) {
	db := firebirdTestDB(t)
	setupFirebirdSchema(t, db)

	// Primary key
	pks, err := firebirdPrimaryKeys(db, "IT_EMPLOYEES")
	if err != nil {
		t.Fatalf("firebirdPrimaryKeys: %v", err)
	}
	if len(pks) != 1 {
		t.Fatalf("expected exactly 1 PK constraint on IT_EMPLOYEES, got %+v", pks)
	}
	pkCols, err := firebirdPrimaryKeyColumns(db, "IT_EMPLOYEES", pks[0])
	if err != nil {
		t.Fatalf("firebirdPrimaryKeyColumns: %v", err)
	}
	if len(pkCols) != 1 || pkCols[0] != "ID" {
		t.Errorf("expected PK column [ID], got %+v", pkCols)
	}

	// Composite PK
	pks2, err := firebirdPrimaryKeys(db, "IT_DEPT_LOCATIONS")
	if err != nil {
		t.Fatalf("firebirdPrimaryKeys(IT_DEPT_LOCATIONS): %v", err)
	}
	if len(pks2) != 1 {
		t.Fatalf("expected 1 PK constraint on IT_DEPT_LOCATIONS, got %+v", pks2)
	}
	pkCols2, err := firebirdPrimaryKeyColumns(db, "IT_DEPT_LOCATIONS", pks2[0])
	if err != nil {
		t.Fatalf("firebirdPrimaryKeyColumns(IT_DEPT_LOCATIONS): %v", err)
	}
	if len(pkCols2) != 2 || pkCols2[0] != "DEPT_ID" || pkCols2[1] != "LOCATION_CODE" {
		t.Errorf("expected composite PK [DEPT_ID LOCATION_CODE] in order, got %+v", pkCols2)
	}

	// Unique
	uqs, err := firebirdUniques(db, "IT_EMPLOYEES")
	if err != nil {
		t.Fatalf("firebirdUniques: %v", err)
	}
	if len(uqs) != 1 {
		t.Fatalf("expected 1 unique constraint on IT_EMPLOYEES, got %+v", uqs)
	}
	uqCols, err := firebirdUniqueColumns(db, "IT_EMPLOYEES", uqs[0])
	if err != nil {
		t.Fatalf("firebirdUniqueColumns: %v", err)
	}
	if len(uqCols) != 1 || uqCols[0] != "EMAIL" {
		t.Errorf("expected unique column [EMAIL], got %+v", uqCols)
	}

	// Foreign key (simple)
	fks, err := firebirdForeignKeys(db, "IT_EMPLOYEES")
	if err != nil {
		t.Fatalf("firebirdForeignKeys: %v", err)
	}
	if len(fks) != 1 {
		t.Fatalf("expected 1 FK on IT_EMPLOYEES, got %+v", fks)
	}
	if fks[0].RTableName != "IT_DEPARTMENTS" {
		t.Errorf("expected FK target IT_DEPARTMENTS, got %+v", fks[0])
	}
	if fks[0].DeleteRule != "SET NULL" {
		t.Errorf("expected delete rule SET NULL, got %q", fks[0].DeleteRule)
	}
	if fks[0].UpdateRule != "CASCADE" {
		t.Errorf("expected update rule CASCADE, got %q", fks[0].UpdateRule)
	}
	fkCols, err := firebirdForeignKeyColumns(db, "IT_EMPLOYEES", fks[0].ConstraintName)
	if err != nil {
		t.Fatalf("firebirdForeignKeyColumns: %v", err)
	}
	if len(fkCols) != 1 || fkCols[0].ColumnName != "DEPT_ID" || fkCols[0].RColumnName != "ID" {
		t.Errorf("expected FK column DEPT_ID -> ID, got %+v", fkCols)
	}

	// Composite FK
	fks2, err := firebirdForeignKeys(db, "IT_SHIPMENTS")
	if err != nil {
		t.Fatalf("firebirdForeignKeys(IT_SHIPMENTS): %v", err)
	}
	if len(fks2) != 1 {
		t.Fatalf("expected 1 FK on IT_SHIPMENTS, got %+v", fks2)
	}
	fkCols2, err := firebirdForeignKeyColumns(db, "IT_SHIPMENTS", fks2[0].ConstraintName)
	if err != nil {
		t.Fatalf("firebirdForeignKeyColumns(IT_SHIPMENTS): %v", err)
	}
	if len(fkCols2) != 2 {
		t.Fatalf("expected 2-column composite FK on IT_SHIPMENTS, got %+v", fkCols2)
	}
	gotPairs := map[string]string{}
	for _, c := range fkCols2 {
		gotPairs[c.ColumnName] = c.RColumnName
	}
	if gotPairs["DEPT_ID"] != "DEPT_ID" || gotPairs["LOCATION_CODE"] != "LOCATION_CODE" {
		t.Errorf("expected composite FK to pair DEPT_ID->DEPT_ID and LOCATION_CODE->LOCATION_CODE, got %+v", gotPairs)
	}

	// Index (non-PK/unique)
	idxs, err := firebirdIndexes(db, "IT_EMPLOYEES")
	if err != nil {
		t.Fatalf("firebirdIndexes: %v", err)
	}
	foundIdx := false
	for _, idx := range idxs {
		if idx.Name == "IDX_IT_EMPLOYEES_LASTNAME" {
			foundIdx = true
			if idx.Uniqueness != "NONUNIQUE" {
				t.Errorf("expected NONUNIQUE, got %q", idx.Uniqueness)
			}
		}
		// The PK/unique-backed indexes must be excluded.
		if idx.Name == "PK_IT_EMPLOYEES" || idx.Name == "UQ_IT_EMPLOYEES_EMAIL" {
			t.Errorf("firebirdIndexes should exclude PK/unique-backed index %s, got %+v", idx.Name, idxs)
		}
	}
	if !foundIdx {
		t.Errorf("expected index IDX_IT_EMPLOYEES_LASTNAME, got %+v", idxs)
	}
	idxCols, err := firebirdIndexColumns(db, "IT_EMPLOYEES", "IDX_IT_EMPLOYEES_LASTNAME")
	if err != nil {
		t.Fatalf("firebirdIndexColumns: %v", err)
	}
	if len(idxCols) != 1 || idxCols[0] != "LAST_NAME" {
		t.Errorf("expected index column [LAST_NAME], got %+v", idxCols)
	}
}

func TestFirebirdIntegrationDDL(t *testing.T) {
	db := firebirdTestDB(t)
	setupFirebirdSchema(t, db)

	ddl, err := firebirdTableDDL(db, "IT_EMPLOYEES")
	if err != nil {
		t.Fatalf("firebirdTableDDL: %v", err)
	}
	t.Logf("IT_EMPLOYEES DDL:\n%s", ddl)
	for _, want := range []string{
		`CREATE TABLE "IT_EMPLOYEES"`,
		`"FIRST_NAME" VARCHAR(50) NOT NULL`,
		`"SALARY" DECIMAL(10,2)`,
		`CONSTRAINT "PK_IT_EMPLOYEES" PRIMARY KEY ("ID")`,
		`FOREIGN KEY ("DEPT_ID") REFERENCES "IT_DEPARTMENTS" ("ID")`,
		"ON DELETE SET NULL",
		"ON UPDATE CASCADE",
	} {
		if !strings.Contains(ddl, want) {
			t.Errorf("expected table DDL to contain %q, full DDL:\n%s", want, ddl)
		}
	}

	// Validate the reconstructed DDL is actually valid Firebird SQL by
	// running it for real against a throwaway table name.
	replayDDL := strings.Replace(ddl, `"IT_EMPLOYEES"`, `"IT_EMPLOYEES_REPLAY"`, 1)
	replayDDL = strings.ReplaceAll(replayDDL, `"PK_IT_EMPLOYEES"`, `"PK_IT_EMPLOYEES_REPLAY"`)
	replayDDL = strings.ReplaceAll(replayDDL, `"FK_IT_EMPLOYEES_DEPT"`, `"FK_IT_EMPLOYEES_DEPT_REPLAY"`)
	if _, err := db.Exec(`DROP TABLE "IT_EMPLOYEES_REPLAY"`); err != nil {
		// fine if it doesn't exist yet
	}
	if _, err := db.Exec(replayDDL); err != nil {
		t.Errorf("reconstructed DDL is not valid Firebird SQL: %v\nDDL was:\n%s", err, replayDDL)
	} else {
		db.Exec(`DROP TABLE "IT_EMPLOYEES_REPLAY"`)
	}

	viewDDL, err := firebirdViewDDL(db, "IT_ACTIVE_EMPLOYEES")
	if err != nil {
		t.Fatalf("firebirdViewDDL: %v", err)
	}
	t.Logf("IT_ACTIVE_EMPLOYEES DDL:\n%s", viewDDL)
	if !strings.Contains(viewDDL, `CREATE VIEW "IT_ACTIVE_EMPLOYEES"`) || !strings.Contains(strings.ToUpper(viewDDL), "SELECT") {
		t.Errorf("expected view DDL header + body, got:\n%s", viewDDL)
	}

	procDDL, err := firebirdProcedureDDL(db, "IT_GET_EMPLOYEE_COUNT")
	if err != nil {
		t.Fatalf("firebirdProcedureDDL: %v", err)
	}
	t.Logf("IT_GET_EMPLOYEE_COUNT DDL:\n%s", procDDL)
	for _, want := range []string{
		`CREATE OR ALTER PROCEDURE "IT_GET_EMPLOYEE_COUNT"`,
		`"P_DEPT_ID" INTEGER`,
		`RETURNS ("EMP_COUNT" INTEGER)`,
	} {
		if !strings.Contains(procDDL, want) {
			t.Errorf("expected procedure DDL to contain %q, full DDL:\n%s", want, procDDL)
		}
	}

	funcDDL, err := firebirdFunctionDDL(db, "IT_CALC_BONUS")
	if err != nil {
		t.Fatalf("firebirdFunctionDDL: %v", err)
	}
	t.Logf("IT_CALC_BONUS DDL:\n%s", funcDDL)
	for _, want := range []string{
		`CREATE OR ALTER FUNCTION "IT_CALC_BONUS"`,
		`"P_SALARY" DECIMAL(10,2)`,
		`"P_PCT" INTEGER`,
		`RETURNS DECIMAL(10,2)`,
	} {
		if !strings.Contains(funcDDL, want) {
			t.Errorf("expected function DDL to contain %q, full DDL:\n%s", want, funcDDL)
		}
	}

	idxDDL, err := firebirdIndexDDL(db, "IT_EMPLOYEES", "IDX_IT_EMPLOYEES_LASTNAME")
	if err != nil {
		t.Fatalf("firebirdIndexDDL: %v", err)
	}
	if idxDDL != `CREATE INDEX "IDX_IT_EMPLOYEES_LASTNAME" ON "IT_EMPLOYEES" ("LAST_NAME")` {
		t.Errorf("unexpected index DDL: %s", idxDDL)
	}
}

func TestFirebirdIntegrationRoutinesAndViews(t *testing.T) {
	db := firebirdTestDB(t)
	setupFirebirdSchema(t, db)

	procs, err := firebirdProcedures(db)
	if err != nil {
		t.Fatalf("firebirdProcedures: %v", err)
	}
	foundProc := false
	for _, p := range procs {
		if p.Name == "IT_GET_EMPLOYEE_COUNT" {
			foundProc = true
		}
	}
	if !foundProc {
		t.Errorf("expected IT_GET_EMPLOYEE_COUNT in firebirdProcedures(), got %+v", procs)
	}

	funcs, err := firebirdFunctions(db)
	if err != nil {
		t.Fatalf("firebirdFunctions: %v", err)
	}
	foundFunc := false
	for _, f := range funcs {
		if f.Name == "IT_CALC_BONUS" {
			foundFunc = true
		}
	}
	if !foundFunc {
		t.Errorf("expected IT_CALC_BONUS in firebirdFunctions(), got %+v", funcs)
	}

	procFields, err := firebirdProcedureFields(db, "IT_GET_EMPLOYEE_COUNT")
	if err != nil {
		t.Fatalf("firebirdProcedureFields: %v", err)
	}
	if len(procFields) != 2 {
		t.Fatalf("expected 2 fields (1 in, 1 out) on IT_GET_EMPLOYEE_COUNT, got %+v", procFields)
	}
	names := []string{procFields[0].Name, procFields[1].Name}
	sort.Strings(names)
	if names[0] != "EMP_COUNT" || names[1] != "P_DEPT_ID" {
		t.Errorf("expected fields P_DEPT_ID and EMP_COUNT, got %+v", procFields)
	}

	funcFields, err := firebirdFunctionFields(db, "IT_CALC_BONUS")
	if err != nil {
		t.Fatalf("firebirdFunctionFields: %v", err)
	}
	if len(funcFields) != 2 || funcFields[0].Name != "P_SALARY" || funcFields[1].Name != "P_PCT" {
		t.Errorf("expected ordered fields [P_SALARY P_PCT], got %+v", funcFields)
	}

	retType, err := firebirdFunctionReturnType(db, "IT_CALC_BONUS")
	if err != nil {
		t.Fatalf("firebirdFunctionReturnType: %v", err)
	}
	if retType != "DECIMAL(10,2)" {
		t.Errorf("expected return type DECIMAL(10,2), got %q", retType)
	}

	procSource, err := firebirdProcedureDefinition(db, "IT_GET_EMPLOYEE_COUNT")
	if err != nil {
		t.Fatalf("firebirdProcedureDefinition: %v", err)
	}
	if !strings.Contains(strings.ToUpper(procSource), "SUSPEND") {
		t.Errorf("expected procedure body containing SUSPEND, got:\n%s", procSource)
	}

	funcSource, err := firebirdFunctionDefinition(db, "IT_CALC_BONUS")
	if err != nil {
		t.Fatalf("firebirdFunctionDefinition: %v", err)
	}
	if !strings.Contains(strings.ToUpper(funcSource), "RETURN") {
		t.Errorf("expected function body containing RETURN, got:\n%s", funcSource)
	}

	viewSource, err := firebirdViewDefinition(db, "IT_ACTIVE_EMPLOYEES")
	if err != nil {
		t.Fatalf("firebirdViewDefinition: %v", err)
	}
	if !strings.Contains(strings.ToUpper(viewSource), "SELECT") {
		t.Errorf("expected view source containing SELECT, got:\n%s", viewSource)
	}
}

func TestFirebirdIntegrationConsoleMeta(t *testing.T) {
	db := firebirdTestDB(t)
	setupFirebirdSchema(t, db)
	ctx := context.Background()
	conn, err := db.Conn(ctx)
	if err != nil {
		t.Fatalf("db.Conn: %v", err)
	}
	defer conn.Close()
	s := &consoleSession{conn: conn, technology: "firebird"}

	out, err := s.consoleMetaTables(ctx)
	if err != nil {
		t.Fatalf("\\dt: %v", err)
	}
	if !strings.Contains(out, "IT_EMPLOYEES") {
		t.Errorf("expected \\dt output to list IT_EMPLOYEES, got:\n%s", out)
	}

	out, err = s.consoleMetaRelations(ctx)
	if err != nil {
		t.Fatalf("\\d: %v", err)
	}
	if !strings.Contains(out, "IT_ACTIVE_EMPLOYEES") || !strings.Contains(out, "view") {
		t.Errorf("expected \\d output to list the view with type 'view', got:\n%s", out)
	}

	out, err = s.consoleMetaDescribe(ctx, "IT_EMPLOYEES")
	if err != nil {
		t.Fatalf("\\d IT_EMPLOYEES: %v", err)
	}
	if !strings.Contains(out, "FIRST_NAME") || !strings.Contains(out, "VARCHAR") {
		t.Errorf("expected \\d IT_EMPLOYEES to show FIRST_NAME/VARCHAR, got:\n%s", out)
	}

	out, err = s.consoleMetaFunctions(ctx)
	if err != nil {
		t.Fatalf("\\df: %v", err)
	}
	if !strings.Contains(out, "IT_GET_EMPLOYEE_COUNT") || !strings.Contains(out, "IT_CALC_BONUS") {
		t.Errorf("expected \\df to list both the procedure and function, got:\n%s", out)
	}

	// \du against sec$users (Firebird 3+) — best effort per its own comment,
	// just confirm it doesn't error and returns something.
	out, err = s.consoleMetaRoles(ctx)
	if err != nil {
		t.Fatalf("\\du: %v", err)
	}
	if out == "" {
		t.Errorf("expected non-empty \\du output")
	}

	out, err = s.consoleMetaDatabases(ctx)
	if err != nil {
		t.Fatalf("\\l: %v", err)
	}
	if !strings.Contains(out, "single-database") {
		t.Errorf("expected \\l to report single-database for Firebird, got:\n%s", out)
	}
}

func TestFirebirdIntegrationEditDataPaginationAndBinds(t *testing.T) {
	db := firebirdTestDB(t)
	setupFirebirdSchema(t, db)

	tableRef, err := editDataTableRef(db, "firebird", "", "IT_EMPLOYEES")
	if err != nil {
		t.Fatalf("editDataTableRef: %v", err)
	}
	if tableRef != `"IT_EMPLOYEES"` {
		t.Errorf("expected quoted table ref, got %q", tableRef)
	}

	cols := []editDataColumnRef{{VColumn: "ID", VType: "int"}, {VColumn: "FIRST_NAME", VType: "string"}, {VColumn: "LAST_NAME", VType: "string"}}
	pk := []editDataColumnRef{{VColumn: "ID", VType: "int"}}

	// Pagination: count=2 should use "FIRST 2" and return exactly 2 rows.
	rows, rowPKs, queryInfo, err := fetchEditDataRows(db, "firebird", "", "IT_EMPLOYEES", "", 2, pk, cols)
	if err != nil {
		t.Fatalf("fetchEditDataRows(count=2): %v", err)
	}
	if len(rows) != 2 {
		t.Errorf("expected FIRST 2 to return exactly 2 rows, got %d (queryInfo=%s)", len(rows), queryInfo)
	}
	if len(rowPKs) != 2 || rowPKs[0][0]["v_column"] != "ID" {
		t.Errorf("expected 2 row-PK entries keyed on ID, got %+v", rowPKs)
	}

	// count=-1 should return all 3 seeded rows, unpaginated.
	rowsAll, _, _, err := fetchEditDataRows(db, "firebird", "", "IT_EMPLOYEES", "", -1, pk, cols)
	if err != nil {
		t.Fatalf("fetchEditDataRows(count=-1): %v", err)
	}
	if len(rowsAll) != 3 {
		t.Errorf("expected 3 total rows with no limit, got %d", len(rowsAll))
	}

	// Round-trip insert/update/delete through the "?" bind-placeholder path.
	insCols := []editDataColumnRef{{VColumn: "ID", VType: "int"}, {VColumn: "DEPT_ID", VType: "int"}, {VColumn: "FIRST_NAME", VType: "string"}, {VColumn: "LAST_NAME", VType: "string"}, {VColumn: "EMAIL", VType: "string"}}
	dataRow := []*string{nil, strPtr("999"), strPtr("1"), strPtr("Zed"), strPtr("Zephyr"), strPtr("zed@it.example")}
	results, err := saveEditDataRows(db, "firebird", "", "IT_EMPLOYEES", [][]*string{dataRow}, []editDataRowInfo{{Mode: 2, Index: 0}}, insCols)
	if err != nil {
		t.Fatalf("saveEditDataRows(insert): %v", err)
	}
	if len(results) != 1 || results[0].Error {
		t.Fatalf("expected successful insert, got %+v", results)
	}

	var gotName string
	if err := db.QueryRow(`select first_name from it_employees where id = 999`).Scan(&gotName); err != nil {
		t.Fatalf("verify insert: %v", err)
	}
	if gotName != "Zed" {
		t.Errorf("expected inserted row FIRST_NAME=Zed, got %q", gotName)
	}

	updDataRow := []*string{nil, strPtr("999"), strPtr("1"), strPtr("Zedd"), strPtr("Zephyr"), strPtr("zed@it.example")}
	updResults, err := saveEditDataRows(db, "firebird", "", "IT_EMPLOYEES", [][]*string{updDataRow}, []editDataRowInfo{{Mode: 1, Index: 0, PK: []editDataPKValue{{VColumn: "ID", VType: "int", VValue: "999"}}, ChangedCols: []int{2}}}, insCols)
	if err != nil {
		t.Fatalf("saveEditDataRows(update): %v", err)
	}
	if len(updResults) != 1 || updResults[0].Error {
		t.Fatalf("expected successful update, got %+v", updResults)
	}
	if err := db.QueryRow(`select first_name from it_employees where id = 999`).Scan(&gotName); err != nil {
		t.Fatalf("verify update: %v", err)
	}
	if gotName != "Zedd" {
		t.Errorf("expected updated row FIRST_NAME=Zedd, got %q", gotName)
	}

	delResults, err := saveEditDataRows(db, "firebird", "", "IT_EMPLOYEES", [][]*string{nil}, []editDataRowInfo{{Mode: -1, Index: 0, PK: []editDataPKValue{{VColumn: "ID", VType: "int", VValue: "999"}}}}, insCols)
	if err != nil {
		t.Fatalf("saveEditDataRows(delete): %v", err)
	}
	if len(delResults) != 1 || delResults[0].Error {
		t.Fatalf("expected successful delete, got %+v", delResults)
	}
	var count int
	if err := db.QueryRow(`select count(*) from it_employees where id = 999`).Scan(&count); err != nil {
		t.Fatalf("verify delete: %v", err)
	}
	if count != 0 {
		t.Errorf("expected row 999 deleted, still found %d rows", count)
	}
}

func strPtr(s string) *string { return &s }

func TestFirebirdIntegrationIdentifierQuoting(t *testing.T) {
	db := firebirdTestDB(t)
	setupFirebirdSchema(t, db)

	name, err := firebirdVerifiedTableName(db, "IT_EMPLOYEES")
	if err != nil {
		t.Fatalf("firebirdVerifiedTableName: %v", err)
	}
	if name != "IT_EMPLOYEES" {
		t.Errorf("expected verified name IT_EMPLOYEES, got %q", name)
	}

	// A nonexistent table must verify to empty, not error.
	name2, err := firebirdVerifiedTableName(db, "NO_SUCH_TABLE_XYZ")
	if err != nil {
		t.Fatalf("firebirdVerifiedTableName(missing): %v", err)
	}
	if name2 != "" {
		t.Errorf("expected empty result for nonexistent table, got %q", name2)
	}

	quoted := quoteFirebirdIdent(`WEIRD"NAME`)
	if quoted != `"WEIRD""NAME"` {
		t.Errorf("expected doubled embedded quote, got %q", quoted)
	}

	ref := quotedSchemaTableRef("firebird", "", "IT_EMPLOYEES")
	if ref != `"IT_EMPLOYEES"` {
		t.Errorf("expected bare quoted table ref for firebird (no schema), got %q", ref)
	}
}

func TestFirebirdIntegrationVersionAndSuper(t *testing.T) {
	db := firebirdTestDB(t)

	version, err := firebirdVersion(db)
	if err != nil {
		t.Fatalf("firebirdVersion: %v", err)
	}
	if !strings.HasPrefix(version, "Firebird ") {
		t.Errorf("expected version string prefixed with 'Firebird ', got %q", version)
	}
	t.Logf("firebirdVersion() = %q", version)

	// This connects as SYSDBA in the default test DSN.
	if !firebirdUserSuper(db) {
		t.Errorf("expected firebirdUserSuper() true when connected as SYSDBA")
	}
}

func TestFirebirdIntegrationOpenTarget(t *testing.T) {
	firebirdIntegrationDSN(t) // ensures skip logic runs before we try a real connect
	info := firebirdTestConnInfo(t)

	db, err := openFirebirdTarget(info)
	if err != nil {
		t.Fatalf("openFirebirdTarget with correct credentials: %v", err)
	}
	db.Close()

	bad := *info
	bad.Password = "definitely-wrong-password"
	if _, err := openFirebirdTarget(&bad); err == nil {
		t.Errorf("expected openFirebirdTarget to fail with a wrong password, got nil error")
	}
}

// TestFirebirdIntegrationTestConnectionHandler is a minimal HTTP-adjacent
// smoke test for the /test_connection/ route's actual Firebird wiring —
// runTestConnection (test_connection.go), which is what
// handleTestConnection calls after it has already done cookie/session
// auth and resolved stored secrets. Reproducing that auth/session/appDB
// plumbing here just to reach this one call isn't worth it (per this
// task's own guidance) — this instead confirms the exact function the HTTP
// handler calls end-to-end still resolves "firebird" all the way down to
// openFirebirdTarget/testGenericPingMessage correctly, for both a working
// and a wrong-password connection.
func TestFirebirdIntegrationTestConnectionHandler(t *testing.T) {
	firebirdIntegrationDSN(t)
	info := firebirdTestConnInfo(t)

	req := &testConnectionRequest{
		ID:       -1,
		Type:     "firebird",
		Server:   info.Server,
		Port:     info.Port,
		Database: info.Database,
		User:     info.Username,
	}
	message, isError := runTestConnection(req, info.Password, "", "")
	if isError {
		t.Fatalf("expected successful test_connection, got error message %q", message)
	}
	if message != "Connection successful." {
		t.Errorf("expected \"Connection successful.\", got %q", message)
	}

	message, isError = runTestConnection(req, "definitely-wrong-password", "", "")
	if !isError {
		t.Errorf("expected test_connection to report an error with a wrong password, got success message %q", message)
	}
}

// TestFirebirdIntegrationNotify exercises the full Notify round trip: listen
// on a channel, fire the trigger's POST_EVENT from a second connection,
// confirm delivery; then unlisten and confirm a resubscribe with a
// different channel set still works (the exact "tear down and rebuild"
// path notifyFirebirdBackend.resubscribeLocked documents as risky).
func TestFirebirdIntegrationNotify(t *testing.T) {
	info := firebirdTestConnInfo(t)
	// Establish skip-if-unreachable behavior consistently with the other
	// tests (firebirdTestConnInfo alone doesn't ping).
	firebirdTestDB(t)

	session, err := newFirebirdNotifySession(info)
	if err != nil {
		t.Fatalf("newFirebirdNotifySession: %v", err)
	}
	backend := session.backend.(*notifyFirebirdBackend)
	// backend.close() is deferred only once listen() below actually
	// succeeds (see that block) rather than unconditionally here: close()
	// takes backend.mu, and a listen() call stuck inside the OS-level TCP
	// connect (the whole reason for the select/timeout below) holds that
	// same mutex for as long as the connect takes to time out -- deferring
	// close() unconditionally would make the skip path just as slow as the
	// hang it's meant to avoid, since it'd block waiting for that same lock.

	setupDB := firebirdTestDB(t)
	setupFirebirdSchema(t, setupDB)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Firebird's event protocol has the *server* tell the client an address
	// to dial back for the aux event connection (see
	// (*firebirdsql.Subscription).connAuxRequest) -- typically the server's
	// own container-internal IP when Firebird runs in Docker. That address
	// is unreachable through simple `-p 3050:3050` port publishing (only
	// reachable if the test binary shares the container's Docker network, or
	// on a Linux host where the bridge IP is directly routable), and neither
	// backend.listen's ctx nor any timeout here can abort the underlying raw
	// TCP connect — it's a plain net.Dial with no context, so a black-holed
	// address blocks for the OS's own TCP connect timeout (75s+ on macOS)
	// before failing. Race listen() against a short timer instead of just
	// calling it, so an environment where that address isn't reachable skips
	// promptly with a clear explanation rather than hanging the whole test
	// binary for over a minute. See this file's own doc comment for how to
	// run this test somewhere that address *is* reachable (e.g. `docker run
	// --network <network-shared-with-the-firebird-container>` around `go
	// test`, which is how this suite was actually validated).
	listenErr := make(chan error, 1)
	go func() { listenErr <- backend.listen(ctx, "it_employee_channel") }()
	select {
	case err := <-listenErr:
		if err != nil {
			t.Fatalf("listen: %v", err)
		}
		defer backend.close()
	case <-time.After(5 * time.Second):
		t.Skip("Firebird's event aux-connection address is not reachable from this test binary " +
			"(likely Docker Desktop NAT hiding the container's internal IP) -- skipping rather than " +
			"blocking on the OS TCP connect timeout. Run this test with the test binary attached to " +
			"the same Docker network as the Firebird container to exercise it for real, e.g.:\n" +
			"  docker network create fbtest && docker network connect fbtest omnidb-firebird-test\n" +
			"  docker run --rm --network fbtest -v $PWD/..:/repo -v $(go env GOMODCACHE):/go/pkg/mod \\\n" +
			"    -w /repo/go-server -e FIREBIRD_TEST_DSN=SYSDBA:masterkey@omnidb-firebird-test:3050//firebird/data/testdb.fdb \\\n" +
			"    golang:1.25 go test -run TestFirebirdIntegrationNotify -v ./...")
	}

	// Fire the trigger from a separate connection (a real client wouldn't
	// see its own transaction's events reliably before commit either).
	fireDB := firebirdTestDB(t)
	if _, err := fireDB.Exec(`insert into it_employees (id, dept_id, first_name, last_name, email, salary) values (?, ?, ?, ?, ?, ?)`,
		12345, 1, "Notify", "Test", "notify-test@it.example", 1000); err != nil {
		t.Fatalf("insert to fire trigger: %v", err)
	}
	// Clean up the row so repeated runs don't collide on the PK.
	defer fireDB.Exec(`delete from it_employees where id = 12345`)

	waitCtx, waitCancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer waitCancel()
	channel, payload, err := backend.waitForMessage(waitCtx)
	if err != nil {
		t.Fatalf("waitForMessage: %v (event delivery from POST_EVENT may not be working)", err)
	}
	if channel != "it_employee_channel" {
		t.Errorf("expected channel 'it_employee_channel', got %q (payload=%q)", channel, payload)
	}
	t.Logf("received Firebird event: channel=%q payload=%q", channel, payload)

	// unlisten, then relisten on a *different* channel set — exercises the
	// resubscribe-tears-down-and-rebuilds path with a nonempty starting
	// state, not just the initial empty->one-channel case above.
	if err := backend.unlisten(ctx, "it_employee_channel"); err != nil {
		t.Fatalf("unlisten: %v", err)
	}
	if err := backend.listen(ctx, "some_other_channel"); err != nil {
		t.Fatalf("listen(some_other_channel) after unlisten: %v", err)
	}

	// Firing the (now-unsubscribed) employee channel must NOT be delivered.
	if _, err := fireDB.Exec(`insert into it_employees (id, dept_id, first_name, last_name, email, salary) values (?, ?, ?, ?, ?, ?)`,
		12346, 1, "Notify2", "Test2", "notify-test2@it.example", 1000); err != nil {
		t.Fatalf("insert to fire trigger (2nd time): %v", err)
	}
	defer fireDB.Exec(`delete from it_employees where id = 12346`)

	quietCtx, quietCancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer quietCancel()
	if ch, pl, err := backend.waitForMessage(quietCtx); err == nil {
		t.Errorf("expected no event after unlistening 'it_employee_channel', got channel=%q payload=%q", ch, pl)
	}
}
