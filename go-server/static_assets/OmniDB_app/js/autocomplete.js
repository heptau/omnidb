/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

The MIT License (MIT)

Portions Copyright (c) 2015-2026, The OmniDB Team
Portions Copyright (c) 2017-2026, 2ndQuadrant Limited
Portions Copyright (c) 2025-2026, Zbyněk Vanžura

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

var v_autocomplete_object;
var Range = ace.require("ace/range").Range;

var v_keywords = [
	"ABORT",
	"ABS",
	"ABSOLUTE",
	"ACCESS",
	"ACTION",
	"ADA",
	"ADD",
	"ADMIN",
	"AFTER",
	"AGGREGATE",
	"ALIAS",
	"ALL",
	"ALLOCATE",
	"ALTER",
	"ANALYSE",
	"ANALYZE",
	"AND",
	"ANY",
	"ARE",
	"ARRAY",
	"AS",
	"ASC",
	"ASENSITIVE",
	"ASSERTION",
	"ASSIGNMENT",
	"ASYMMETRIC",
	"AT",
	"ATOMIC",
	"AUTHORIZATION",
	"AVG",
	"BACKWARD",
	"BEFORE",
	"BEGIN",
	"BETWEEN",
	"BIGINT",
	"BINARY",
	"BIT",
	"BITVAR",
	"BIT_LENGTH",
	"BLOB",
	"BOOLEAN",
	"BOTH",
	"BREADTH",
	"BY",
	"C",
	"CACHE",
	"CALL",
	"CALLED",
	"CARDINALITY",
	"CASCADE",
	"CASCADED",
	"CASE",
	"CAST",
	"CATALOG",
	"CATALOG_NAME",
	"CHAIN",
	"CHAR",
	"CHARACTER",
	"CHARACTERISTICS",
	"CHARACTER_LENGTH",
	"CHARACTER_SET_CATALOG",
	"CHARACTER_SET_NAME",
	"CHARACTER_SET_SCHEMA",
	"CHAR_LENGTH",
	"CHECK",
	"CHECKED",
	"CHECKPOINT",
	"CLASS",
	"CLASS_ORIGIN",
	"CLOB",
	"CLOSE",
	"CLUSTER",
	"COALESCE",
	"COBOL",
	"COLLATE",
	"COLLATION",
	"COLLATION_CATALOG",
	"COLLATION_NAME",
	"COLLATION_SCHEMA",
	"COLUMN",
	"COLUMN_NAME",
	"COMMAND_FUNCTION",
	"COMMAND_FUNCTION_CODE",
	"COMMENT",
	"COMMIT",
	"COMMITTED",
	"COMPLETION",
	"CONDITION_NUMBER",
	"CONNECT",
	"CONNECTION",
	"CONNECTION_NAME",
	"CONSTRAINT",
	"CONSTRAINTS",
	"CONSTRAINT_CATALOG",
	"CONSTRAINT_NAME",
	"CONSTRAINT_SCHEMA",
	"CONSTRUCTOR",
	"CONTAINS",
	"CONTINUE",
	"CONVERSION",
	"CONVERT",
	"COPY",
	"CORRESPONDING",
	"COUNT",
	"CREATE",
	"CREATEDB",
	"CREATEUSER",
	"CROSS",
	"CUBE",
	"CURRENT",
	"CURRENT_DATE",
	"CURRENT_PATH",
	"CURRENT_ROLE",
	"CURRENT_TIME",
	"CURRENT_TIMESTAMP",
	"CURRENT_USER",
	"CURSOR",
	"CURSOR_NAME",
	"CYCLE",
	"DATA",
	"DATABASE",
	"DATE",
	"DATETIME_INTERVAL_CODE",
	"DATETIME_INTERVAL_PRECISION",
	"DAY",
	"DEALLOCATE",
	"DEC",
	"DECIMAL",
	"DECLARE",
	"DEFAULT",
	"DEFERRABLE",
	"DEFERRED",
	"DEFINED",
	"DEFINER",
	"DELETE",
	"DELIMITER",
	"DELIMITERS",
	"DEPTH",
	"DEREF",
	"DESC",
	"DESCRIBE",
	"DESCRIPTOR",
	"DESTROY",
	"DESTRUCTOR",
	"DETERMINISTIC",
	"DIAGNOSTICS",
	"DICTIONARY",
	"DISCONNECT",
	"DISPATCH",
	"DISTINCT",
	"DO",
	"DOMAIN",
	"DOUBLE",
	"DROP",
	"DYNAMIC",
	"DYNAMIC_FUNCTION",
	"DYNAMIC_FUNCTION_CODE",
	"EACH",
	"ELSE",
	"ELSIF",
	"ENCODING",
	"ENCRYPTED",
	"END",
	"END-EXEC",
	"EQUALS",
	"ESCAPE",
	"EVERY",
	"EXCEPT",
	"EXCEPTION",
	"EXCLUSIVE",
	"EXEC",
	"EXECUTE",
	"EXISTING",
	"EXISTS",
	"EXPLAIN",
	"EXTERNAL",
	"EXTRACT",
	"FALSE",
	"FETCH",
	"FINAL",
	"FIRST",
	"FLOAT",
	"FOR",
	"FORCE",
	"FOREIGN",
	"FORTRAN",
	"FORWARD",
	"FOUND",
	"FREE",
	"FREEZE",
	"FROM",
	"FULL",
	"FUNCTION",
	"G",
	"GENERAL",
	"GENERATED",
	"GET",
	"GLOBAL",
	"GO",
	"GOTO",
	"GRANT",
	"GRANTED",
	"GROUP",
	"GROUPING",
	"HANDLER",
	"HAVING",
	"HIERARCHY",
	"HOLD",
	"HOST",
	"HOUR",
	"IDENTITY",
	"IGNORE",
	"ILIKE",
	"IMMEDIATE",
	"IMMUTABLE",
	"IMPLEMENTATION",
	"IMPLICIT",
	"IN",
	"INCREMENT",
	"INDEX",
	"INDICATOR",
	"INFIX",
	"INHERITS",
	"INITIALIZE",
	"INITIALLY",
	"INNER",
	"INOUT",
	"INPUT",
	"INSENSITIVE",
	"INSERT",
	"INSTANCE",
	"INSTANTIABLE",
	"INSTEAD",
	"INT",
	"INTEGER",
	"INTERSECT",
	"INTERVAL",
	"INTO",
	"INVOKER",
	"IS",
	"ISNULL",
	"ISOLATION",
	"ITERATE",
	"JOIN",
	"K",
	"KEY",
	"KEY_MEMBER",
	"KEY_TYPE",
	"LANCOMPILER",
	"LANGUAGE",
	"LARGE",
	"LAST",
	"LATERAL",
	"LEADING",
	"LEFT",
	"LENGTH",
	"LESS",
	"LEVEL",
	"LIKE",
	"LIMIT",
	"LISTEN",
	"LOAD",
	"LOCAL",
	"LOCALTIME",
	"LOCALTIMESTAMP",
	"LOCATION",
	"LOCATOR",
	"LOCK",
	"LOWER",
	"M",
	"MAP",
	"MATCH",
	"MAX",
	"MAXVALUE",
	"MESSAGE_LENGTH",
	"MESSAGE_OCTET_LENGTH",
	"MESSAGE_TEXT",
	"METHOD",
	"MIN",
	"MINUTE",
	"MINVALUE",
	"MOD",
	"MODE",
	"MODIFIES",
	"MODIFY",
	"MODULE",
	"MONTH",
	"MORE",
	"MOVE",
	"MUMPS",
	"NAME",
	"NAMES",
	"NATIONAL",
	"NATURAL",
	"NCHAR",
	"NCLOB",
	"NEW",
	"NEXT",
	"NO",
	"NOCREATEDB",
	"NOCREATEUSER",
	"NONE",
	"NOT",
	"NOTHING",
	"NOTIFY",
	"NOTNULL",
	"NULL",
	"NULLABLE",
	"NULLIF",
	"NUMBER",
	"NUMERIC",
	"OBJECT",
	"OCTET_LENGTH",
	"OF",
	"OFF",
	"OFFSET",
	"OIDS",
	"OLD",
	"ON",
	"ONLY",
	"OPEN",
	"OPERATION",
	"OPERATOR",
	"OPTION",
	"OPTIONS",
	"OR",
	"ORDER",
	"ORDINALITY",
	"OUT",
	"OUTER",
	"OUTPUT",
	"OVERLAPS",
	"OVERLAY",
	"OVERRIDING",
	"OWNER",
	"PAD",
	"PARAMETER",
	"PARAMETERS",
	"PARAMETER_MODE",
	"PARAMETER_NAME",
	"PARAMETER_ORDINAL_POSITION",
	"PARAMETER_SPECIFIC_CATALOG",
	"PARAMETER_SPECIFIC_NAME",
	"PARAMETER_SPECIFIC_SCHEMA",
	"PARTIAL",
	"PASCAL",
	"PASSWORD",
	"PATH",
	"PENDANT",
	"PLACING",
	"PLI",
	"POSITION",
	"POSTFIX",
	"PRECISION",
	"PREFIX",
	"PREORDER",
	"PREPARE",
	"PRESERVE",
	"PRIMARY",
	"PRIOR",
	"PRIVILEGES",
	"PROCEDURAL",
	"PROCEDURE",
	"READ",
	"READS",
	"REAL",
	"RECHECK",
	"RECURSIVE",
	"REF",
	"REFERENCES",
	"REFERENCING",
	"REINDEX",
	"RELATIVE",
	"RENAME",
	"REPEATABLE",
	"REPLACE",
	"RESET",
	"RESTRICT",
	"RESULT",
	"RETURN",
	"RETURNED_LENGTH",
	"RETURNED_OCTET_LENGTH",
	"RETURNED_SQLSTATE",
	"RETURNS",
	"REVOKE",
	"RIGHT",
	"ROLE",
	"ROLLBACK",
	"ROLLUP",
	"ROUTINE",
	"ROUTINE_CATALOG",
	"ROUTINE_NAME",
	"ROUTINE_SCHEMA",
	"ROW",
	"ROWS",
	"ROW_COUNT",
	"RULE",
	"SAVEPOINT",
	"SCALE",
	"SCHEMA",
	"SCHEMA_NAME",
	"SCOPE",
	"SCROLL",
	"SEARCH",
	"SECOND",
	"SECTION",
	"SECURITY",
	"SELECT",
	"SELF",
	"SENSITIVE",
	"SEQUENCE",
	"SERIALIZABLE",
	"SERVER_NAME",
	"SESSION",
	"SESSION_USER",
	"SET",
	"SETOF",
	"SETS",
	"SHARE",
	"SHOW",
	"SIMILAR",
	"SIMPLE",
	"SIZE",
	"SMALLINT",
	"SOME",
	"SOURCE",
	"SPACE",
	"SPECIFIC",
	"SPECIFICTYPE",
	"SPECIFIC_NAME",
	"SQL",
	"SQLCODE",
	"SQLERROR",
	"SQLEXCEPTION",
	"SQLSTATE",
	"SQLWARNING",
	"STABLE",
	"START",
	"STATE",
	"STATEMENT",
	"STATIC",
	"STATISTICS",
	"STDIN",
	"STDOUT",
	"STORAGE",
	"STRICT",
	"STRUCTURE",
	"STYLE",
	"SUBCLASS_ORIGIN",
	"SUBLIST",
	"SUBSTRING",
	"SUM",
	"SYMMETRIC",
	"SYSID",
	"SYSTEM",
	"SYSTEM_USER",
	"TABLE",
	"TABLE_NAME",
	"TEMP",
	"TEMPLATE",
	"TEMPORARY",
	"TERMINATE",
	"THAN",
	"THEN",
	"TIME",
	"TIMESTAMP",
	"TIMEZONE_HOUR",
	"TIMEZONE_MINUTE",
	"TO",
	"TOAST",
	"TRAILING",
	"TRANSACTION",
	"TRANSACTIONS_COMMITTED",
	"TRANSACTIONS_ROLLED_BACK",
	"TRANSACTION_ACTIVE",
	"TRANSFORM",
	"TRANSFORMS",
	"TRANSLATE",
	"TRANSLATION",
	"TREAT",
	"TRIGGER",
	"TRIGGER_CATALOG",
	"TRIGGER_NAME",
	"TRIGGER_SCHEMA",
	"TRIM",
	"TRUE",
	"TRUNCATE",
	"TRUSTED",
	"TYPE",
	"UNCOMMITTED",
	"UNDER",
	"UNENCRYPTED",
	"UNION",
	"UNIQUE",
	"UNKNOWN",
	"UNLISTEN",
	"UNNAMED",
	"UNNEST",
	"UNTIL",
	"UPDATE",
	"UPPER",
	"USAGE",
	"USER",
	"USER_DEFINED_TYPE_CATALOG",
	"USER_DEFINED_TYPE_NAME",
	"USER_DEFINED_TYPE_SCHEMA",
	"USING",
	"VACUUM",
	"VALID",
	"VALIDATOR",
	"VALUE",
	"VALUES",
	"VARBIT",
	"VARCHAR",
	"VARIABLE",
	"VARYING",
	"VERBOSE",
	"VERSION",
	"VIEW",
	"VOLATILE",
	"WHEN",
	"WHENEVER",
	"WHERE",
	"WITH",
	"WITHOUT",
	"WORK",
	"WRITE",
	"YEAR",
	"ZONE",
];

// Extra text appended after a keyword is selected, for keywords whose next
// token is unambiguous:
//  - a function/operator that's always immediately followed by "(" (its
//    arguments);
//  - a two-word phrase that's always completed the same specific way (e.g.
//    GROUP is only ever "GROUP BY", never "GROUP" alone or "GROUP" followed
//    by anything else);
//  - any other clause-starting word that's never the last token of a valid
//    statement - it always needs a space and more after it, even though what
//    that "more" is varies (e.g. TABLE: "CREATE TABLE ", "ALTER TABLE ",
//    "DROP TABLE " and bare "TABLE " all need a name next; unlike, say,
//    DEFAULT, which is sometimes the last word in a VALUES list - "(1,
//    DEFAULT)" - and sometimes followed by an expression, so it's genuinely
//    ambiguous and gets no suffix).
// Every keyword not listed here is left alone, same as before - guessing
// wrong would be more annoying than not guessing at all, so this is
// deliberately not exhaustive over the full ~500-keyword list.
var v_keyword_suffixes = {
	// Functions/operators - always "NAME(...)".
	ABS: "(",
	AVG: "(",
	BIT_LENGTH: "(",
	CAST: "(",
	CHAR_LENGTH: "(",
	CHARACTER_LENGTH: "(",
	CHECK: "(",
	COALESCE: "(",
	CONVERT: "(",
	COUNT: "(",
	EXISTS: "(",
	EXTRACT: "(",
	LENGTH: "(",
	LOWER: "(",
	MAX: "(",
	MIN: "(",
	MOD: "(",
	NULLIF: "(",
	OCTET_LENGTH: "(",
	OVERLAY: "(",
	POSITION: "(",
	SUBSTRING: "(",
	SUM: "(",
	TRANSLATE: "(",
	TREAT: "(",
	TRIM: "(",
	UNNEST: "(",
	UPPER: "(",
	// Always-the-same two-word phrases.
	FOREIGN: " KEY",
	GROUP: " BY",
	INSERT: " INTO",
	ORDER: " BY",
	PRIMARY: " KEY",
	SIMILAR: " TO",
	// Clause-starting keywords - always followed by more of the statement,
	// even though what follows isn't a single fixed word.
	ADD: " ",
	ALTER: " ",
	AND: " ",
	BETWEEN: " ",
	CREATE: " ",
	CROSS: " ",
	DELETE: " FROM",
	DISTINCT: " ",
	DROP: " ",
	EXCEPT: " ",
	FROM: " ",
	FULL: " ",
	GRANT: " ",
	HAVING: " ",
	ILIKE: " ",
	INNER: " ",
	INTERSECT: " ",
	INTO: " ",
	IS: " ",
	JOIN: " ",
	LATERAL: " ",
	LEFT: " ",
	LIKE: " ",
	LIMIT: " ",
	NATURAL: " ",
	NOT: " ",
	OFFSET: " ",
	ON: " ",
	OR: " ",
	RECURSIVE: " ",
	REFERENCES: " ",
	RETURNING: " ",
	REVOKE: " ",
	RIGHT: " ",
	SELECT: " ",
	SET: " ",
	TABLE: " ",
	TRUNCATE: " ",
	UNION: " ",
	UPDATE: " ",
	USING: " ",
	VALUES: " ",
	WHERE: " ",
	WITH: " ",
};

// Data-type keywords offered after a Postgres "::" type-cast operator (see
// autocomplete_type_cast_filter/autocomplete_start_type_cast below) - a
// curated subset of v_keywords, since most of its ~500 entries aren't types.
// No entries here get a v_keyword_suffixes "(" - VARCHAR(50)/NUMERIC(10,2)
// take an optional precision, but plenty of others (INTEGER, BOOLEAN, DATE)
// never do, so guessing would be wrong as often as right.
var v_data_type_keywords = [
	"BIGINT",
	"BINARY",
	"BIT",
	"BITVAR",
	"BLOB",
	"BOOLEAN",
	"CHAR",
	"CHARACTER",
	"CLOB",
	"DATE",
	"DEC",
	"DECIMAL",
	"DOUBLE",
	"FLOAT",
	"INT",
	"INTEGER",
	"INTERVAL",
	"NATIONAL",
	"NCHAR",
	"NCLOB",
	"NUMERIC",
	"REAL",
	"SMALLINT",
	"TIME",
	"TIMESTAMP",
	"VARBIT",
	"VARCHAR",
	"VARYING",
];

// Group types whose backend "complement" value is always an empty string
// (see postgresqlAutocompleteValues in go-server/postgresql_autocomplete.go) -
// used to skip rendering a permanently-blank second column for them.
var v_autocomplete_single_column_types = {
	database: true,
	tablespace: true,
	role: true,
	extension: true,
	schema: true,
};

/// <summary>
/// Startup function.
/// </summary>
$(function () {
	v_autocomplete_object = {
		active: false,
		ready: false,
		selected: null,
		type_cast_mode: false,
		alt_shift_meta_pressed: false,
		//label: document.getElementById('div_autocomplete_label'),
		active_input: null,
		div: document.getElementById("div_autocomplete"),
		test_length: document.getElementById("div_test_length"),
		scroll: document.getElementById("div_autocomplete_scroll"),
		no_results: document.getElementById("div_autocomplete_noresults"),
		searching: document.getElementById("div_autocomplete_searching"),
		loading: document.getElementById("div_autocomplete_loading"),
		elements: [
			{
				type: "keyword",
				container: document.getElementById("autocomplete_grid_keyword"),
				count_div: document.getElementById("autocomplete_count_keyword"),
				elements: [],
				num_visible: 0,
			},
			{
				type: "database",
				container: document.getElementById("autocomplete_grid_database"),
				count_div: document.getElementById("autocomplete_count_database"),
				elements: [],
				num_visible: 0,
			},
			{
				type: "role",
				container: document.getElementById("autocomplete_grid_role"),
				count_div: document.getElementById("autocomplete_count_role"),
				elements: [],
				num_visible: 0,
			},
			{
				type: "tablespace",
				container: document.getElementById("autocomplete_grid_tablespace"),
				count_div: document.getElementById("autocomplete_count_tablespace"),
				elements: [],
				num_visible: 0,
			},
			{
				type: "schema",
				container: document.getElementById("autocomplete_grid_schema"),
				count_div: document.getElementById("autocomplete_count_schema"),
				elements: [],
				num_visible: 0,
			},
			{
				type: "extension",
				container: document.getElementById("autocomplete_grid_extension"),
				count_div: document.getElementById("autocomplete_count_extension"),
				elements: [],
				num_visible: 0,
			},
			{
				type: "table",
				container: document.getElementById("autocomplete_grid_table"),
				count_div: document.getElementById("autocomplete_count_table"),
				elements: [],
				num_visible: 0,
			},
			{
				type: "view",
				container: document.getElementById("autocomplete_grid_view"),
				count_div: document.getElementById("autocomplete_count_view"),
				elements: [],
				num_visible: 0,
			},
			{
				type: "column",
				container: document.getElementById("autocomplete_grid_column"),
				count_div: document.getElementById("autocomplete_count_column"),
				elements: [],
				num_visible: 0,
			},
			{
				type: "function",
				container: document.getElementById("autocomplete_grid_function"),
				count_div: document.getElementById("autocomplete_count_function"),
				elements: [],
				num_visible: 0,
			},
			{
				type: "index",
				container: document.getElementById("autocomplete_grid_index"),
				count_div: document.getElementById("autocomplete_count_index"),
				elements: [],
				num_visible: 0,
			},
		],
	};

	for (var i = 0; i < v_autocomplete_object.elements.length; i++) {
		if (v_autocomplete_object.elements[i].type != "keyword") {
			var columnProperties = [];

			var col = new Object();
			col.title = "";
			col.readOnly = true;
			col.renderer = "html";
			columnProperties.push(col);

			// database/tablespace/role/extension/schema never have anything in their
			// second ("complement") column - postgresqlAutocompleteValues always sends
			// '' for these types - so there's nothing to show there. table/view/column/
			// function/index do use it (schema qualifier or data type).
			if (!v_autocomplete_single_column_types[v_autocomplete_object.elements[i].type]) {
				var col = new Object();
				col.title = "";
				col.readOnly = true;
				col.renderer = "html";
				columnProperties.push(col);
			}

			v_autocomplete_object.elements[i].grid = new Handsontable(v_autocomplete_object.elements[i].container, {
				licenseKey: "non-commercial-and-evaluation",
				data: [],
				columns: columnProperties,
				colHeaders: false,
				manualColumnResize: true,
				fillHandle: false,
				disableVisualSelection: true,
				// This popup only ever needs the editor to hold real keyboard focus - see
				// AgGridAdapter's suppressCellFocus comment for why this must be set here.
				suppressCellFocus: true,
				stretchH: "last",
				afterRender: function () {
					if (v_autocomplete_object.selected_grid == this) {
						var v_cell = this.getCell(v_autocomplete_object.selected_grid_row, 0);
						if (v_cell != null) {
							this.getCell(v_autocomplete_object.selected_grid_row, 0).parentNode.classList.add(
								"omnidb__autocomplete__data-row--selected",
							);
						}
					}
				},
				cells: function (row, col, prop) {
					var cellProperties = {};
					cellProperties.renderer = whiteHtmlRenderer;
					if (col == 1) cellProperties.renderer = whiteRightHtmlRenderer;
					return cellProperties;
				},
				cell: [{ col: 0, className: "htRight" }],
			});

			v_autocomplete_object.elements[i].container.onclick = (function (group) {
				return function (event) {
					event.preventDefault();
					event.stopPropagation();
					var v_sel = group.grid.getSelected();
					if (!v_sel || v_sel.length === 0) return;
					// group.grid.getSelected() is a row index into whatever is currently
					// displayed (filtered by the typed text), NOT group.elements (every
					// match, unfiltered) - see displayed_elements' comment above.
					var v_clicked = group.displayed_elements && group.displayed_elements[v_sel[0][0]];
					if (!v_clicked) return;
					close_autocomplete(v_clicked.select_value);
				};
			})(v_autocomplete_object.elements[i]);
		}
	}
});

function build_autocomplete_elements(p_data, p_value) {
	var v_previous_element = null;
	var v_next_element = null;
	var v_first_element = null;
	var v_last_element = null;
	v_autocomplete_object.selected = null;

	//hiding nodes
	for (var k = 0; k < v_autocomplete_object.elements.length; k++) {
		v_autocomplete_object.elements[k].container.parentNode.style.display = "none";
		if (v_autocomplete_object.elements[k].type == "keyword") {
			v_autocomplete_object.elements[k].container.parentNode.scrollTop = 0;
			v_autocomplete_object.elements[k].container.innerHTML = "";
		}
		v_autocomplete_object.elements[k].elements = [];
	}

	var v_num_results = 0;
	for (var i = 0; i < p_data.length; i++) {
		var v_local_group = p_data[i];
		var v_global_group;

		//looking for group and hiding nodes
		for (var k = 0; k < v_autocomplete_object.elements.length; k++) {
			if (v_autocomplete_object.elements[k].type == v_local_group.type) {
				v_global_group = v_autocomplete_object.elements[k];
				break;
			}
		}

		v_global_group.container.parentNode.style.display = "block";
		v_global_group.num_visible = v_local_group.elements.length;
		v_global_group.count_div.innerHTML = v_local_group.elements.length + " results";

		var v_list = [];
		var v_list_render = [];
		var v_displayed = [];
		for (var j = 0; j < v_local_group.elements.length; j++) {
			v_num_results++;
			var v_element;

			var div = document.createElement("div");
			if (v_local_group.type == "keyword") {
				div.className = "omnidb__autocomplete__data-word";
				var v_safe_val = document.createElement("span");
				v_safe_val.textContent = v_local_group.elements[j].value;
				var v_safe_p = document.createElement("span");
				v_safe_p.textContent = p_value;
				div.innerHTML = v_safe_val.innerHTML.replace(v_safe_p.innerHTML, "<b>" + v_safe_p.innerHTML + "</b>");
				var v_element = {
					value: v_local_group.elements[j].value,
					select_value: v_local_group.elements[j].select_value,
					complement: v_local_group.elements[j].complement,
					container: div,
					visible: true,
					group_reference: v_global_group,
				};
				v_global_group.container.appendChild(div);

				div.onclick = (function (v_value) {
					return function (event) {
						event.preventDefault();
						event.stopPropagation();
						close_autocomplete(v_value);
					};
				})(v_element.select_value);
			} else {
				v_list.push([v_local_group.elements[j].value, v_local_group.elements[j].complement]);
				v_list_render.push([
					v_local_group.elements[j].value.replace(p_value, "<b>" + p_value + "</b>"),
					v_local_group.elements[j].complement,
				]);
				var v_element = {
					value: v_local_group.elements[j].value,
					select_value: v_local_group.elements[j].select_value,
					complement: v_local_group.elements[j].complement,
					visible: true,
					index: j,
					visible_index: j,
					grid_reference: v_global_group.grid,
					group_reference: v_global_group,
				};
				v_displayed.push(v_element);
			}

			if (v_first_element == null) v_first_element = v_element;
			if (i == p_data.length - 1 && j == v_local_group.elements.length - 1) v_last_element = v_element;

			v_global_group.elements.push(v_element);

			if (v_previous_element != null) v_previous_element.next = v_element;
			v_element.previous = v_previous_element;
			v_previous_element = v_element;
		}
		if (v_global_group.type != "keyword") {
			v_global_group.grid_data = v_list;
			// Row index -> element lookup for mouse clicks (see the click handler
			// below): grid.getSelected() returns a row index into whatever was last
			// passed to loadData(), which is NOT the same as v_global_group.elements
			// once renew_autocomplete() has narrowed it down to a filtered subset.
			v_global_group.displayed_elements = v_displayed;
			v_global_group.grid.loadData(v_list_render);
		}
	}

	//adjusting first and last elements links
	if (v_first_element != null) {
		v_autocomplete_object.first_element = v_first_element;
		v_first_element.previous = v_last_element;
	}
	if (v_last_element != null) {
		v_autocomplete_object.last_element = v_last_element;
		v_last_element.next = v_first_element;
	}

	if (v_num_results > 0) {
		v_autocomplete_object.no_results.style.display = "none";
	} else {
		v_autocomplete_object.no_results.style.display = "block";
	}

	//refreshing grids
	for (var k = 0; k < v_autocomplete_object.elements.length; k++) {
		if (v_autocomplete_object.elements[k].type != "keyword") {
			v_autocomplete_object.elements[k].grid.render();
			v_autocomplete_object.elements[k].grid.selectCell(0, 0);
			v_autocomplete_object.elements[k].grid.deselectCell();
		}
	}
	v_autocomplete_object.editor.focus();
}

function renew_autocomplete(p_new_value) {
	var v_search_regex = null;

	v_search_regex = new RegExp("^(" + p_new_value + ")", "i");

	//v_search_regex = new RegExp('^' + p_new_value.split('').join('.*'), 'i');

	var v_num_results = 0;
	for (var i = v_autocomplete_object.elements.length - 1; i >= 0; i--) {
		var v_group = v_autocomplete_object.elements[i];
		v_group.num_visible = 0;
		if (v_group.type == "keyword") {
			for (var j = v_group.elements.length - 1; j >= 0; j--) {
				var v_element = v_group.elements[j];
				//doesn't match, hide
				if (!v_search_regex.test(v_element.value)) {
					v_element.container.style.display = "none";
					v_element.visible = false;
				} else {
					var v_match_text = v_search_regex.exec(v_element.value)[0];
					v_num_results++;
					v_element.container.style.display = "inline-block";
					v_element.visible = true;
					var v_safe_el = document.createElement("span");
					v_safe_el.textContent = v_element.value;
					var v_safe_mt = document.createElement("span");
					v_safe_mt.textContent = v_match_text;
					v_element.container.innerHTML = v_safe_el.innerHTML.replace(
						v_safe_mt.innerHTML,
						"<b>" + v_safe_mt.innerHTML + "</b>",
					);
					v_group.num_visible++;
				}
			}
		}
		//grid type
		else {
			var v_new_data = [];
			var v_new_displayed = [];
			for (var j = 0; j < v_group.elements.length; j++) {
				var v_element = v_group.elements[j];
				//doesn't match, hide
				if (!v_search_regex.test(v_element.value)) {
					v_element.visible = false;
				} else {
					var v_match_text = v_search_regex.exec(v_element.value)[0];
					v_num_results++;
					v_element.visible = true;
					v_element.visible_index = v_group.num_visible;
					v_new_data.push([
						v_group.grid_data[j][0].replace(v_match_text, "<b>" + v_match_text + "</b>"),
						v_group.grid_data[j][1],
					]);
					v_new_displayed.push(v_element);
					v_group.num_visible++;
				}
			}
			// See build_autocomplete_elements' displayed_elements comment - this is the
			// filtered-order counterpart the click handler needs once typing has narrowed
			// the list down from the full, unfiltered v_group.elements order.
			v_group.displayed_elements = v_new_displayed;
			v_group.grid.loadData(v_new_data);
		}

		//no more elements, hide div and group
		v_group.count_div.innerHTML = v_group.num_visible + " results";
		if (v_group.num_visible == 0) {
			v_group.container.parentNode.style.display = "none";
		} else {
			v_group.container.parentNode.style.display = "block";
		}
	}

	if (v_num_results > 0) {
		v_autocomplete_object.no_results.style.display = "none";
	} else {
		v_autocomplete_object.no_results.style.display = "block";
	}

	//refreshing grids
	for (var k = 0; k < v_autocomplete_object.elements.length; k++) {
		if (v_autocomplete_object.elements[k].type != "keyword") {
			v_autocomplete_object.elements[k].grid.render();
			v_autocomplete_object.elements[k].grid.selectCell(0, 0);
			v_autocomplete_object.elements[k].grid.deselectCell();
		}
	}

	var v_new_selected = null;

	//select first visible element if null
	if (v_autocomplete_object.selected == null) {
		v_new_selected = find_next_visible_element(v_autocomplete_object.first_element);
	} else {
		v_new_selected = find_element_by_value(v_autocomplete_object.first_element, v_autocomplete_object.selected.value);

		// Currently selected doesn`t exist anymore, get the first
		if (v_new_selected == null) {
			v_new_selected = find_next_visible_element(v_autocomplete_object.first_element);
		}
	}

	autocomplete_deselect_element();

	if (v_new_selected) {
		autocomplete_select_element(v_new_selected);
	}

	v_autocomplete_object.editor.focus();
}

// autocompleteTypeEnabled checks a group "type" (keyword, database, role,
// tablespace, schema, extension, table, view, column, function, index)
// against the user's "Autocomplete Suggestions" setting (Options tab of
// modal_config, saved as v_autocomplete_disabled_types - a comma-separated
// list of disabled types, empty by default so every existing user keeps
// seeing everything).
function autocompleteTypeEnabled(p_type) {
	return (typeof v_autocomplete_disabled_types !== "undefined" ? v_autocomplete_disabled_types : "")
		.split(",")
		.indexOf(p_type) === -1;
}

function autocomplete_get_results(p_sql, p_value, p_pos) {
	v_autocomplete_object.div.style.width = "500px";

	var v_data = [
		{
			type: "keyword",
			elements: [],
		},
	];

	if (autocompleteTypeEnabled("keyword")) {
		for (var i = 0; i < v_keywords.length; i++) {
			var v_keyword_with_suffix = v_keywords[i] + (v_keyword_suffixes[v_keywords[i]] || "");
			v_data[0].elements.push({
				value: v_keyword_with_suffix,
				select_value: v_keyword_with_suffix,
			});
		}
	}

	build_autocomplete_elements(v_data, p_value);

	renew_autocomplete(p_value);
	v_autocomplete_object.ready = true;

	v_autocomplete_object.searching.style.display = "block";

	execAjax(
		"/get_autocomplete_results/",
		JSON.stringify({
			p_database_index: v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
			p_tab_id: v_connTabControl.selectedTab.id,
			p_sql: p_sql,
			p_value: p_value,
			p_pos: p_pos,
		}),
		function (p_return) {
			v_autocomplete_object.searching.style.display = "none";

			// Check that the autocomplete is still active
			if (v_autocomplete_object.active) {
				v_autocomplete_object.test_length.textContent = p_return.v_data.max_result_word;
				var v_new_width_result = v_autocomplete_object.test_length.clientWidth;
				v_autocomplete_object.test_length.textContent = p_return.v_data.max_complement_word;
				var v_new_width_complement = v_autocomplete_object.test_length.clientWidth;
				if (v_autocomplete_object.mode == 0)
					v_autocomplete_object.scroll.style["max-height"] =
						window.innerHeight - $(v_autocomplete_object.div).offset().top - 50 + "px";
				else v_autocomplete_object.scroll.style["max-height"] = $(v_autocomplete_object.div).offset().top - 20 + "px";
				var v_new_width = v_new_width_result + v_new_width_complement + 160;
				if (v_new_width < 500) v_new_width = 500;

				v_autocomplete_object.div.style.width = v_new_width + "px";

				//adjust grid columns widths
				for (var i = 0; i < v_autocomplete_object.elements.length; i++) {
					if (v_autocomplete_object.elements[i].type != "keyword") {
						var v_columns = v_autocomplete_object.elements[i].grid.getSettings().columns;
						v_columns[0].width = v_new_width_result + 30;
						v_autocomplete_object.elements[i].grid.updateSettings({ columns: v_columns });
					}
				}

				v_data = v_data.concat(p_return.v_data.data.filter(function (p_group) {
					return autocompleteTypeEnabled(p_group.type);
				}));

				build_autocomplete_elements(v_data, p_value);

				// Note: build_autocomplete_elements() already resets v_autocomplete_object.selected
				// to null and marks every element visible again. renew_autocomplete() below re-applies
				// the current filter text and picks the right selection for it - there's no need (and
				// it's actively wrong) to try to restore the pre-rebuild selection here, since at this
				// point nothing has been filtered yet and any lookup would just match the first element.
				renew_autocomplete(get_editor_last_word(v_autocomplete_object.editor).last_word);
				v_autocomplete_object.ready = true;
			}
		},
		function (p_return) {
			if (p_return.v_data.password_timeout) {
				showPasswordPrompt(
					v_connTabControl.selectedTab.tag.selectedDatabaseIndex,
					function () {
						autocomplete_get_results(p_sql, p_value, p_pos);
					},
					null,
					p_return.v_data.message,
				);
			}
		},
		"box",
		false,
		true,
	);
}

function autocomplete_keyup(p_event) {
	if (
		p_event.keyCode != 27 &&
		p_event.keyCode != 40 &&
		p_event.keyCode != 38 &&
		p_event.keyCode != 13 &&
		p_event.keyCode != 16 &&
		p_event.keyCode != 17 &&
		p_event.keyCode != 18
	) {
		if (v_autocomplete_object.ready) {
			var v_last_word = get_editor_last_word(v_autocomplete_object.editor).last_word;
			var v_filter = v_last_word;

			if (v_autocomplete_object.type_cast_mode) {
				var v_type_filter = autocomplete_type_cast_filter(v_last_word);
				// Typed (or deleted) past the "::" itself - not a data type lookup anymore.
				if (v_type_filter === null) {
					close_autocomplete();
					return;
				}
				v_filter = v_type_filter;
				autocomplete_narrow_range_to_type_filter(v_type_filter);
			}

			if (v_filter.length < v_autocomplete_object.search_base.length) close_autocomplete();
			else renew_autocomplete(v_filter);
		}
	}
}

function autocomplete_keydown(p_editor, p_event) {
	if (event.ctrlKey == true || event.altKey == true || event.metaKey == true) {
		v_autocomplete_object.alt_shift_meta_pressed = true;
	} else {
		v_autocomplete_object.alt_shift_meta_pressed = false;
	}

	if (v_autocomplete_object.active) {
		//esc
		if (p_event.keyCode === 27) {
			p_event.stopPropagation();
			p_event.preventDefault();
			close_autocomplete();
		}
		//space
		if (p_event.keyCode === 32) {
			close_autocomplete();
		}
		//enter or tab
		if (p_event.keyCode === 13 || p_event.keyCode === 9) {
			p_event.stopPropagation();
			p_event.preventDefault();
			//get remaining string to include in editor
			if (v_autocomplete_object.selected)
				//close_autocomplete(v_autocomplete_object.selected.value.substring(v_autocomplete_object.search_base.length));
				close_autocomplete(v_autocomplete_object.selected.select_value);
			else close_autocomplete();
		}
		// up or down arrow
		else if (p_event.keyCode === 40 || p_event.keyCode === 38) {
			p_event.stopPropagation();
			p_event.preventDefault();
			var v_new_selected = null;
			//select first visible element if null
			if (v_autocomplete_object.selected == null) {
				if (p_event.keyCode === 40 && v_autocomplete_object.first_element != null) {
					v_new_selected = find_next_visible_element(v_autocomplete_object.first_element);
				} else if (p_event.keyCode === 38 && v_autocomplete_object.last_element != null) {
					v_new_selected = find_previous_visible_element(v_autocomplete_object.last_element);
				}
			} else {
				if (p_event.keyCode === 40) v_new_selected = find_next_visible_element(v_autocomplete_object.selected.next);
				else if (p_event.keyCode === 38)
					v_new_selected = find_previous_visible_element(v_autocomplete_object.selected.previous);
			}

			if (v_new_selected) {
				autocomplete_select_element(v_new_selected);
			}
		}
	} else {
		autocomplete_update_editor_cursor(p_editor, p_event);
	}
}

function autocomplete_update_editor_cursor(p_editor, p_event) {
	// Handle UP or DOWN if autocomplete is not enbled, just move cursor position
	if (!p_event.shiftKey && !p_event.altKey && !p_event.ctrlKey && !p_event.metaKey) {
		if (p_event.keyCode === 40 || p_event.keyCode === 38) {
			var v_cursor_pos = p_editor.getCursorPosition();

			//p_editor.moveCursorTo(p_editor.getCursorPosition().row+1,p_editor.getCursorPosition().column);
			let v_target_row;
			if (p_event.keyCode === 40) {
				v_target_row = v_cursor_pos.row + 1;
			} else {
				v_target_row = v_cursor_pos.row - 1;
			}
			p_editor.moveCursorTo(v_target_row, v_cursor_pos.column);
			p_editor.clearSelection();
			p_editor.renderer.scrollCursorIntoView({ row: v_target_row });
		}
		// Handle TAB if autocomplete is not enbled
		if (p_event.keyCode === 9) {
			// Ace's own "Tab" command is unbound for this editor (see the
			// bindKey("Tab", null) calls in inner_query_tab.js etc.), so nothing
			// else stops the browser's native default for Tab - moving focus to
			// the next focusable element - which otherwise happens right after
			// this handler runs, undoing the p_editor.focus() below.
			p_event.preventDefault();
			p_event.stopPropagation();
			var v_cursor_range = p_editor.getSelectionRange();
			p_editor.indent();
			p_editor.focus();
		}
	}
	// Enter
	if (p_event.keyCode === 13) {
		if (v_connTabControl.selectedTab.tag.tabControl.selectedTab.tag.mode == "console") {
			consoleSQL();
		}
	}
}

function find_next_visible_element(p_element) {
	//avoid infinite loop
	var v_element = p_element;
	var v_first = p_element;
	if (v_element.visible == true) return v_element;
	if (v_element.next == p_element) return null;
	while (v_element.next.visible == false) {
		v_element = v_element.next;
		//searched all, avoid infinite
		if (v_element == v_first) return null;
	}
	return v_element.next;
}

function find_element_by_value(p_first_element, p_value) {
	if (p_first_element == null) return null;
	var v_element = p_first_element;
	var v_first = p_first_element;
	do {
		if (v_element.visible == true && v_element.value == p_value) return v_element;
		v_element = v_element.next;
		//searched all, avoid infinite loop
	} while (v_element != null && v_element != v_first);
	return null;
}

function find_previous_visible_element(p_element) {
	//avoid infinite loop
	var v_element = p_element;
	var v_first = p_element;
	if (v_element.visible == true) return v_element;
	if (v_element.previous == p_element) return null;
	while (v_element.previous.visible == false) {
		v_element = v_element.previous;
		//searched all, avoid infinite
		if (v_element == v_first) return null;
	}
	return v_element.previous;
}

function autocomplete_select_element(p_element) {
	autocomplete_deselect_element();

	var v_parent_block = p_element.group_reference.container.parentNode;
	if (v_parent_block.offsetTop < v_parent_block.parentNode.scrollTop)
		v_parent_block.parentNode.scrollTop = v_parent_block.offsetTop;
	else {
		var v_value =
			v_parent_block.offsetTop + 80 - v_parent_block.parentNode.offsetHeight - v_parent_block.parentNode.scrollTop;
		if (v_value > 0) {
			v_parent_block.parentNode.scrollTop += v_value;
		}
	}

	//keyword element
	if (p_element.visible_index == null) {
		p_element.container.classList.add("omnidb__autocomplete__data-row--selected");

		if (p_element.container.offsetTop < p_element.container.parentNode.scrollTop)
			p_element.container.parentNode.scrollTop = p_element.container.offsetTop;
		else {
			var v_value = p_element.container.offsetTop + 22 - 80 - 2 - p_element.container.parentNode.scrollTop;
			if (v_value > 0) {
				p_element.container.parentNode.scrollTop += v_value;
			}
		}
	}
	//grid element
	else {
		p_element.grid_reference.selectCell(p_element.visible_index, 0);
		p_element.grid_reference.deselectCell();
		v_autocomplete_object.selected_grid = p_element.grid_reference;
		v_autocomplete_object.selected_grid_row = p_element.visible_index;

		update_selected_grid_row_position(p_element.grid_reference.getCell(p_element.visible_index, 0));
		v_autocomplete_object.editor.focus();
	}

	v_autocomplete_object.selected = p_element;
}

function autocomplete_deselect_element() {
	//removing selection of old row
	if (v_autocomplete_object.selected) {
		var v_previous = v_autocomplete_object.selected;
		if (v_previous.visible_index == null) v_previous.container.classList.remove("omnidb__autocomplete__data-row--selected");
		else {
			var v_cell = v_previous.grid_reference.getCell(v_previous.visible_index, 0);
			if (v_cell != null) {
				v_previous.grid_reference
					.getCell(v_previous.visible_index, 0)
					.parentNode.classList.remove("omnidb__autocomplete__data-row--selected");
			}
			v_autocomplete_object.selected_grid = null;
			v_autocomplete_object.selected_grid_row = null;
		}
	}
	v_autocomplete_object.selected = null;
}

function update_selected_grid_row_position(p_cell) {
	// AG Grid virtualizes rows: right after a fresh loadData(), the target row may not be
	// rendered into the DOM yet, so getCell() (the caller) can return null here.
	if (p_cell == null) return;
	p_cell.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.scrollTop =
		p_cell.offsetTop + parseInt(p_cell.parentNode.parentNode.parentNode.parentNode.style.top, 10);
	p_cell.parentNode.classList.add("omnidb__autocomplete__data-row--selected");
}

function close_autocomplete(p_additional_text) {
	v_autocomplete_object.active = false;
	v_autocomplete_object.ready = false;
	v_autocomplete_object.type_cast_mode = false;
	v_autocomplete_object.selected_grid = null;
	v_autocomplete_object.selected_grid_row = null;
	//hiding nodes
	for (var k = 0; k < v_autocomplete_object.elements.length; k++) {
		v_autocomplete_object.elements[k].container.parentNode.style.display = "none";
		if (v_autocomplete_object.elements[k].type == "keyword") v_autocomplete_object.elements[k].container.innerHTML = "";
		v_autocomplete_object.elements[k].elements = [];
	}
	v_autocomplete_object.div.style.display = "none";
	v_autocomplete_object.close_div.parentNode.removeChild(v_autocomplete_object.close_div);

	var v_editor = v_autocomplete_object.editor;
	if (p_additional_text) {
		v_editor.session.replace(v_autocomplete_object.range, p_additional_text);
	}
	v_editor.focus();
	v_autocomplete_object.no_results.style.display = "none";
}

// Returns the (possibly empty) text typed after the last "::" in
// p_last_word, or null if it has no Postgres "::" type-cast operator at all
// - used to switch the popup into "data types only" mode (see
// autocomplete_start_type_cast) instead of the normal keyword/table/column
// search.
function autocomplete_type_cast_filter(p_last_word) {
	var v_idx = p_last_word.lastIndexOf("::");
	if (v_idx === -1) return null;
	return p_last_word.substring(v_idx + 2);
}

// get_editor_last_word() always sets v_autocomplete_object.range to span the
// WHOLE last word (e.g. "amount::varc", prefix included), since that's what
// the normal keyword/table/column popup needs to replace. In type-cast mode
// only the part after "::" should be replaced when a type gets selected -
// otherwise selecting VARCHAR from "amount::varc" would wipe out "amount::"
// too - so narrow the range down to just that trailing portion.
function autocomplete_narrow_range_to_type_filter(p_type_filter) {
	var v_range = v_autocomplete_object.range;
	v_autocomplete_object.range = new Range(
		v_range.end.row,
		v_range.end.column - p_type_filter.length,
		v_range.end.row,
		v_range.end.column,
	);
}

// Positions the popup at the cursor and makes it visible - shared by the
// normal DB-search popup and the "::" data-type popup below. Removes any
// still-open close_div from a previous open rather than requiring the
// caller to have gone through close_autocomplete() first, since both the
// dot and colon re-triggers (see autocomplete_start) can fire while a
// popup is already open.
function autocomplete_position_and_open(editor, mode) {
	v_autocomplete_object.editor = editor;
	v_autocomplete_object.active = true;
	v_autocomplete_object.mode = mode;

	var v_pixel_position = editor.renderer.$cursorLayer.getPixelPosition();
	var v_editor_position = editor.container.getBoundingClientRect();
	var v_pos = {
		left: v_editor_position.left + v_pixel_position.left,
		top: v_editor_position.top + v_pixel_position.top + 25,
	};

	var v_top_pos = v_pos.top - editor.renderer.scrollTop;

	var v_autocomplete_div = v_autocomplete_object.div;
	v_autocomplete_div.style.left = v_pos.left + editor.renderer.gutterWidth + "px";

	if (mode == 0) {
		v_autocomplete_div.style.top = v_top_pos - 4 + "px";
		v_autocomplete_div.style.bottom = "unset";
	} else {
		v_autocomplete_div.style.top = "unset";
		v_autocomplete_div.style.bottom = window.innerHeight - v_top_pos + 30 + "px";
	}
	v_autocomplete_div.style.display = "block";

	if (v_autocomplete_object.close_div && v_autocomplete_object.close_div.parentNode) {
		v_autocomplete_object.close_div.parentNode.removeChild(v_autocomplete_object.close_div);
	}

	var v_closediv = document.createElement("div");
	v_autocomplete_object.close_div = v_closediv;
	v_closediv.className = "div_close_cm";
	v_closediv.onmousedown = function () {
		close_autocomplete();
	};
	document.body.appendChild(v_closediv);
}

// Opens (or refreshes) the popup restricted to v_data_type_keywords, for a
// Postgres "::" type-cast operator - see autocomplete_type_cast_filter.
// Purely client-side (no server round-trip): the list of built-in type
// names doesn't depend on the connected database.
function autocomplete_start_type_cast(editor, mode, p_type_filter) {
	autocomplete_position_and_open(editor, mode);
	v_autocomplete_object.type_cast_mode = true;
	v_autocomplete_object.search_base = p_type_filter;

	var v_data = [
		{
			type: "keyword",
			elements: v_data_type_keywords.map(function (p_type) {
				return { value: p_type, select_value: p_type };
			}),
		},
	];
	build_autocomplete_elements(v_data, p_type_filter);
	renew_autocomplete(p_type_filter);
	v_autocomplete_object.ready = true;
}

function autocomplete_start(editor, mode, event, force = null) {
	// Autocomplete doesn't start nor filters with the following keys:
	// 32 = SPACE
	// 27 = ESC
	// 13 = ENTER
	// 39 = RIGHT
	// 37 = LEFT
	// 40 = DOWN
	// 38 = UP

	// 16 = SHIFT
	// 17 = CTRL
	// 18 = ALT
	// 91 = META
	if (
		(event.keyCode != 32 &&
			event.keyCode != 27 &&
			event.keyCode != 39 &&
			event.keyCode != 37 &&
			event.keyCode != 40 &&
			event.keyCode != 38 &&
			event.keyCode != 13 &&
			event.keyCode != 16 &&
			event.keyCode != 17 &&
			event.keyCode != 18 &&
			event.keyCode != 91) ||
		force
	) {
		// A dot always starts a fresh server round-trip, even while the popup is already
		// active: it marks a new qualifier (alias./table./schema.) whose completions (e.g.
		// a table's columns) were never fetched for the word typed so far, since the popup
		// only calls the server when it transitions from closed to open.
		var v_is_dot = event.keyCode == 190 && !v_autocomplete_object.alt_shift_meta_pressed;
		// 186 is also plain ";" (same physical key, no Shift) - handled separately below
		// so a statement-ending semicolon can never pop the popup open on its own; only
		// completing an actual "::" (checked via autocomplete_type_cast_filter) does.
		var v_is_colon = event.keyCode == 186 && !v_autocomplete_object.alt_shift_meta_pressed;
		if (!v_autocomplete_object.active || v_is_dot || v_is_colon) {
			// autocomplete starts only with characters from A to Z or NUMBERS or dot or dash
			if (
				(((event.keyCode >= 65 && event.keyCode < 90) ||
					event.keyCode == 189 ||
					(event.keyCode >= 48 && event.keyCode < 57 && event.shiftKey != true) ||
					event.keyCode == 190 ||
					event.keyCode == 186) &&
					!v_autocomplete_object.alt_shift_meta_pressed) ||
				force
			) {
				//get editor word before cursor
				var v_last_word_object = get_editor_last_word(editor);
				var v_last_word = v_last_word_object.last_word;
				var v_character_position = v_last_word_object.character_position;
				var v_type_filter = autocomplete_type_cast_filter(v_last_word);

				if (v_type_filter !== null) {
					autocomplete_narrow_range_to_type_filter(v_type_filter);
					autocomplete_start_type_cast(editor, mode, v_type_filter);
				} else if (event.keyCode != 186 && v_last_word != "" && v_last_word[0] != "'") {
					autocomplete_position_and_open(editor, mode);
					v_autocomplete_object.search_base = v_last_word;
					autocomplete_get_results(editor.getValue(), v_last_word, v_character_position);
				}
			}
		} else {
			autocomplete_keyup(event);
		}
	}
}

function get_editor_last_word(p_editor) {
	var v_cursor = p_editor.selection.getCursor();
	var v_character_position = p_editor.session.doc.positionToIndex(v_cursor);
	var v_prefix_pos = p_editor.session.doc.positionToIndex(v_cursor) - 1;
	var v_editor_text = p_editor.getValue();
	//v_editor_text = v_editor_text.substring(0,v_prefix_pos);
	var v_pos_iterator = v_prefix_pos;
	var v_word_length = 0;

	while (
		v_editor_text[v_pos_iterator] != " " &&
		v_editor_text[v_pos_iterator] != "\n" &&
		v_editor_text[v_pos_iterator] != "'" &&
		v_editor_text[v_pos_iterator] != "(" &&
		v_editor_text[v_pos_iterator] != ")" &&
		v_editor_text[v_pos_iterator] != "," &&
		v_pos_iterator >= 0
	) {
		v_pos_iterator--;
		v_word_length++;
	}

	if (v_pos_iterator >= 0) {
		v_pos_iterator++;
		v_autocomplete_object.range = new Range(v_cursor.row, v_cursor.column - v_word_length, v_cursor.row, v_cursor.column);
		var v_last_word = v_editor_text.substring(v_pos_iterator, v_pos_iterator + v_word_length);
	} else {
		v_autocomplete_object.range = new Range(v_cursor.row, v_cursor.column - v_word_length - 1, v_cursor.row, v_cursor.column);
		var v_last_word = v_editor_text.substring(v_pos_iterator, v_pos_iterator + v_word_length + 1);
	}

	return {
		last_word: v_last_word,
		character_position: v_character_position,
	};
}
