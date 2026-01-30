ace.define("ace/theme/sqlserver_dark-css",["require","exports","module"],function(e,t,n){n.exports = `
.ace-sqlserver-dark .ace_gutter {
	background: #1e1e1e;
	color: #9aa0a6;
	overflow: hidden;
}

.ace-sqlserver-dark .ace_print-margin {
	width: 1px;
	background: #2a2a2a;
}

.ace-sqlserver-dark {
	background-color: #000000;
	color: #DCDDDE;
}

/* Keep SQL Server token colors where possible, adapted for dark bg */
.ace-sqlserver-dark .ace_identifier {
	color: #DCDDDE;
}

.ace-sqlserver-dark .ace_keyword {
	color: #4EA3FF; /* softer blue for keywords on dark */
}

.ace-sqlserver-dark .ace_numeric {
	color: #DCDDDE;
}

.ace-sqlserver-dark .ace_storage {
	color: #61D6D9; /* teal-ish like original but brighter */
}

.ace-sqlserver-dark .ace_keyword.ace_operator,
.ace-sqlserver-dark .ace_lparen,
.ace-sqlserver-dark .ace_rparen,
.ace-sqlserver-dark .ace_punctuation {
	color: #9aa0a6;
}

.ace-sqlserver-dark .ace_set.ace_statement {
	color: #4EA3FF;
	text-decoration: underline;
}

.ace-sqlserver-dark .ace_cursor {
	color: #DCDDDE;
}

.ace-sqlserver-dark .ace_invisible {
	color: #555555;
}

.ace-sqlserver-dark .ace_constant.ace_buildin {
	color: #b390ff;
}

.ace-sqlserver-dark .ace_constant.ace_language {
	color: #9aa0a6;
}

.ace-sqlserver-dark .ace_constant.ace_library {
	color: #8de08c;
}

.ace-sqlserver-dark .ace_invalid {
	background-color: #8b0000;
	color: #ffffff;
}

.ace-sqlserver-dark .ace_support.ace_function {
	color: #ff77ff;
}

.ace-sqlserver-dark .ace_support.ace_constant {
	color: #8de08c;
}

.ace-sqlserver-dark .ace_class {
	color: #4fc1ff;
}

.ace-sqlserver-dark .ace_support.ace_other {
	color: #9aa0ff;
}

.ace-sqlserver-dark .ace_variable.ace_parameter {
	font-style: italic;
    color: #ffb86b;
}

.ace-sqlserver-dark .ace_comment {
	color: #6a9955; /* green-ish comment similar to original but readable on dark */
}

.ace-sqlserver-dark .ace_constant.ace_numeric {
	color: #DCDDDE;
}

.ace-sqlserver-dark .ace_variable {
	color: #3ad0d6;
}

.ace-sqlserver-dark .ace_xml-pe {
	color: #9a8f7a;
}

.ace-sqlserver-dark .ace_support.ace_storedprocedure {
	color: #c96a6a;
}

.ace-sqlserver-dark .ace_heading {
	color: #7fb1ff;
}

.ace-sqlserver-dark .ace_list {
	color: #ff6ad1;
}

/* Selections/highlights */
.ace-sqlserver-dark .ace_marker-layer .ace_selection {
	background: rgba(78,163,255,0.15);
}

.ace-sqlserver-dark .ace_marker-layer .ace_step {
	background: rgba(252,255,0,0.14);
}

.ace-sqlserver-dark .ace_marker-layer .ace_stack {
	background: rgba(164,229,101,0.12);
}

.ace-sqlserver-dark .ace_marker-layer .ace_bracket {
	margin: -1px 0 0 -1px;
    border: 1px solid rgba(255,255,255,0.06);
}

.ace-sqlserver-dark .ace_marker-layer .ace_active-line {
	background: rgba(255,255,255,0.02);
}

.ace-sqlserver-dark .ace_gutter-active-line {
	background-color: #191919;
}

.ace-sqlserver-dark .ace_marker-layer .ace_selected-word {
	background: rgba(250,250,255,0.02);
	border: 1px solid rgba(200,200,250,0.04);
}

.ace-sqlserver-dark .ace_meta.ace_tag {
	color: #4EA3FF;
}

.ace-sqlserver-dark .ace_string.ace_regex {
	color: #ff7070;
}

.ace-sqlserver-dark .ace_string {
	color: #ff7070; /* keep strings reddish but visible on black */
}

.ace-sqlserver-dark .ace_entity.ace_other.ace_attribute-name {
	color: #d48943;
}

/* indent guides */
.ace-sqlserver-dark .ace_indent-guide {
	background: none;
	border-right: 1px solid #1a1a1a;
}
.ace-sqlserver-dark .ace_indent-guide-active {
	background: none;
	border-right: 1px solid #333333;
}

.ace-sqlserver-dark .ace_indent-guide-active {
	background: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAACZgbYnAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAIGNIUk0AAHolAACAgwAA+f8AAIDpAAB1MAAA6mAAADqYAAAXb5JfxUYAAAAZSURBVHjaYvj///9/hivKyv8BAAAA//8DACLqBhbvk+/eAAAAAElFTkSuQmCC") right repeat-y;
}
`;});ace.define("ace/theme/sqlserver_dark",["require","exports","module","ace/theme/sqlserver_dark-css","ace/lib/dom"],function(e,t,n){t.isDark=true;t.cssClass="ace-sqlserver-dark";t.cssText=e("./sqlserver_dark-css");var r=e("../lib/dom");r.importCssString(t.cssText,t.cssClass,!1)});(function(){ace.require(["ace/theme/sqlserver_dark"],function(m){if(typeof module=="object"&&typeof exports=="object"&&module){module.exports=m}})})();
