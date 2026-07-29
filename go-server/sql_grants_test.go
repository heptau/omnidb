package main

import "testing"

func TestGroupGrantEntriesGroupsByGranteeAndOrdersPrivileges(t *testing.T) {
	// Deliberately shuffled: alphabetically INSERT precedes SELECT and
	// ddl_grantee precedes PUBLIC, neither of which is the wanted order.
	groups := groupGrantEntries([]grantEntry{
		{grantee: "ddl_grantee", privilege: "INSERT"},
		{grantee: "PUBLIC", privilege: "SELECT"},
		{grantee: "ddl_grantee", privilege: "SELECT"},
	})

	if len(groups) != 2 {
		t.Fatalf("want 2 groups (one per grantee), got %d: %+v", len(groups), groups)
	}
	if groups[0].grantee != "PUBLIC" {
		t.Errorf("PUBLIC must come first, got %q", groups[0].grantee)
	}
	if got := groups[1].privileges; len(got) != 2 || got[0] != "SELECT" || got[1] != "INSERT" {
		t.Errorf("privileges must follow GRANT's own order (SELECT before INSERT), got %v", got)
	}
}

func TestGroupGrantEntriesSeparatesGrantOptionAndColumns(t *testing.T) {
	groups := groupGrantEntries([]grantEntry{
		{grantee: "bob", privilege: "UPDATE", column: "name"},
		{grantee: "bob", privilege: "SELECT"},
		{grantee: "bob", privilege: "INSERT", grantable: true},
	})

	if len(groups) != 3 {
		t.Fatalf("a column-level and a WITH GRANT OPTION privilege each need their own statement, got %d: %+v", len(groups), groups)
	}
	// Object-level groups first, plain before grantable, columns last.
	if groups[0].privileges[0] != "SELECT" || groups[0].grantable || groups[0].column != "" {
		t.Errorf("first group should be the plain object-level SELECT, got %+v", groups[0])
	}
	if groups[1].privileges[0] != "INSERT" || !groups[1].grantable {
		t.Errorf("second group should be the grantable INSERT, got %+v", groups[1])
	}
	if groups[2].column != "name" || groups[2].privileges[0] != "UPDATE" {
		t.Errorf("third group should be the column-level UPDATE, got %+v", groups[2])
	}
}

func TestGroupGrantEntriesSortsUnknownPrivilegesLast(t *testing.T) {
	// A privilege from a newer server than privilegeOrder knows about must
	// still come out in a stable place rather than shuffling with the rest.
	groups := groupGrantEntries([]grantEntry{
		{grantee: "bob", privilege: "TIME TRAVEL"},
		{grantee: "bob", privilege: "SELECT"},
		{grantee: "bob", privilege: "FLASHBACK"},
	})

	if len(groups) != 1 {
		t.Fatalf("want a single group, got %d", len(groups))
	}
	want := []string{"SELECT", "FLASHBACK", "TIME TRAVEL"}
	for i, privilege := range want {
		if groups[0].privileges[i] != privilege {
			t.Fatalf("want %v, got %v", want, groups[0].privileges)
		}
	}
}

func TestGroupGrantEntriesEmpty(t *testing.T) {
	if groups := groupGrantEntries(nil); len(groups) != 0 {
		t.Errorf("no entries must yield no groups, got %+v", groups)
	}
}

func TestPgFormatGrantsStatements(t *testing.T) {
	got := pgFormatGrants("SCHEMA", "app", []grantEntry{
		{grantee: "ddl_grantee", privilege: "USAGE"},
		{grantee: "ddl_grantee", privilege: "CREATE"},
	})
	want := "GRANT CREATE, USAGE ON SCHEMA app TO ddl_grantee;"
	if len(got) != 1 || got[0] != want {
		t.Errorf("want [%q], got %q", want, got)
	}
}

func TestPgFormatGrantsColumnAndGrantOption(t *testing.T) {
	got := pgFormatGrants("TABLE", "app.mv1", []grantEntry{
		{grantee: "bob", privilege: "UPDATE", column: `"Name"`, grantable: true},
	})
	want := `GRANT UPDATE ("Name") ON TABLE app.mv1 TO bob WITH GRANT OPTION;`
	if len(got) != 1 || got[0] != want {
		t.Errorf("want [%q], got %q", want, got)
	}
}

func TestMysqlFormatGrantsUsesNoKindKeywordForTables(t *testing.T) {
	got := mysqlFormatGrants("", "`app`.`t1`", []grantEntry{
		{grantee: "'ddl_grantee'@'%'", privilege: "SELECT"},
	})
	want := "GRANT SELECT ON `app`.`t1` TO 'ddl_grantee'@'%';"
	if len(got) != 1 || got[0] != want {
		t.Errorf("want [%q], got %q", want, got)
	}
}

func TestMysqlFormatGrantsRoutineKeyword(t *testing.T) {
	got := mysqlFormatGrants("FUNCTION", "`app`.`f1`", []grantEntry{
		{grantee: "'bob'@'localhost'", privilege: "EXECUTE"},
		{grantee: "'bob'@'localhost'", privilege: "ALTER ROUTINE"},
	})
	want := "GRANT EXECUTE, ALTER ROUTINE ON FUNCTION `app`.`f1` TO 'bob'@'localhost';"
	if len(got) != 1 || got[0] != want {
		t.Errorf("want [%q], got %q", want, got)
	}
}

func TestOracleFormatGrants(t *testing.T) {
	got := oracleFormatGrants("APP", "T1", []grantEntry{
		{grantee: "DDL_GRANTEE", privilege: "SELECT"},
		{grantee: "DDL_GRANTEE", privilege: "UPDATE", column: "NAME", grantable: true},
	})
	want := []string{
		"GRANT SELECT ON APP.T1 TO DDL_GRANTEE;",
		"GRANT UPDATE (NAME) ON APP.T1 TO DDL_GRANTEE WITH GRANT OPTION;",
	}
	if len(got) != len(want) {
		t.Fatalf("want %v, got %v", want, got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("want %q, got %q", want[i], got[i])
		}
	}
}

func TestOracleQuoteLiteralDoublesQuotes(t *testing.T) {
	if got := oracleQuoteLiteral("it's"); got != "'it''s'" {
		t.Errorf("want 'it''s', got %s", got)
	}
}

func TestPgJoinDDLExtrasSeparatesCommentsFromGrants(t *testing.T) {
	got := pgJoinDDLExtras([]string{
		"COMMENT ON SCHEMA app IS 'x';",
		"COMMENT ON COLUMN app.mv1.a IS 'y';",
		"GRANT USAGE ON SCHEMA app TO bob;",
		"GRANT CREATE ON SCHEMA app TO eve;",
	})
	want := "\n\nCOMMENT ON SCHEMA app IS 'x';\nCOMMENT ON COLUMN app.mv1.a IS 'y';" +
		"\n\nGRANT USAGE ON SCHEMA app TO bob;\nGRANT CREATE ON SCHEMA app TO eve;\n"
	if got != want {
		t.Errorf("want %q, got %q", want, got)
	}
}

func TestPgJoinDDLExtrasEmpty(t *testing.T) {
	if got := pgJoinDDLExtras(nil); got != "" {
		t.Errorf("no statements must append nothing, got %q", got)
	}
}
