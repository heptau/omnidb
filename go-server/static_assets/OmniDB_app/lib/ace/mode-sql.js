define("ace/mode/sql_highlight_rules", ["require", "exports", "module", "ace/lib/oop", "ace/mode/text_highlight_rules"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var SqlHighlightRules = function() {
    var keywords = (
        "select|insert|update|delete|from|where|and|or|group|by|order|limit|offset|having|as|case|when|then|else|end|" +
        "type|left|right|join|on|outer|desc|asc|union|create|table|primary|key|if|foreign|not|references|default|null|" +
        "inner|cross|natural|database|drop|grant|distinct|is|in|all|alter|any|array|at|authorization|between|both|cast|" +
        "check|collate|column|commit|constraint|cube|current|current_date|current_time|current_timestamp|current_user|" +
        "describe|escape|except|exists|external|extract|fetch|filter|for|full|function|global|grouping|intersect|" +
        "interval|into|leading|like|local|no|of|only|out|overlaps|partition|position|range|revoke|rollback|rollup|row|" +
        "rows|session_user|set|some|start|tablesample|time|to|trailing|truncate|unique|unknown|user|using|values|window|with"
    );

    var builtinConstants = "true|false";

    var builtinFunctions = (
        "avg|count|first|last|max|min|sum|ucase|lcase|mid|len|round|rank|now|format|coalesce|ifnull|isnull|nvl"
    );

    var dataTypes = (
        "int|numeric|decimal|date|varchar|char|bigint|float|double|bit|binary|text|set|timestamp|money|real|number|" +
        "integer|string"
    );

    var keywordMapper = this.createKeywordMapper({
        "support.function": builtinFunctions,
        "keyword": keywords,
        "constant.language": builtinConstants,
        "storage.type": dataTypes
    }, "identifier", true);

    this.$rules = {
        start: [
            { token: "comment", regex: "--.*$" },
            { token: "comment", start: "/\\*", end: "\\*/" },
            { token: "string", regex: '".*?"' },
            { token: "string", regex: "'.*?'" },
            { token: "string", regex: "`.*?`" },
            { token: "constant.numeric", regex: "[+-]?\\d+(?:(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)?\\b" },
            { token: keywordMapper, regex: "[a-zA-Z_$][a-zA-Z0-9_$]*\\b" },
            { token: "keyword.operator", regex: "\\+|\\-|\\/|\\/\\/|%|<@>|@>|<@|&|\\^|~|<|>|<=|=>|==|!=|<>|=" },
            { token: "paren.lparen", regex: "[\\(]" },
            { token: "paren.rparen", regex: "[\\)]" },
            { token: "text", regex: "\\s+" }
        ]
    };
    this.normalizeRules();
};

oop.inherits(SqlHighlightRules, TextHighlightRules);

exports.SqlHighlightRules = SqlHighlightRules;

});

define("ace/mode/folding/cstyle", ["require", "exports", "module", "ace/lib/oop", "ace/range", "ace/mode/folding/fold_mode"], function(require, exports, module) {
"use strict";

var oop = require("../../lib/oop");
var Range = require("../../range").Range;
var BaseFoldMode = require("./fold_mode").FoldMode;

var FoldMode = exports.FoldMode = function(commentRegex) {
    if (commentRegex) {
        this.foldingStartMarker = new RegExp(
            this.foldingStartMarker.source.replace(/\|[^|]*?$/, "|" + commentRegex.start)
        );
        this.foldingStopMarker = new RegExp(
            this.foldingStopMarker.source.replace(/\|[^|]*?$/, "|" + commentRegex.end)
        );
    }
};
oop.inherits(FoldMode, BaseFoldMode);

(function() {

    this.foldingStartMarker = /([\{\[\(])[^\}\]\)]*$|^\s*(\/\*)/;
    this.foldingStopMarker = /^[^\[\{\(]*([\}\]\)])|^[\s\*]*(\*\/)/;
    this.singleLineBlockCommentRe = /^\s*(\/\*).*\*\/\s*$/;
    this.tripleStarBlockCommentRe = /^\s*(\/\*\*\*).*\*\/\s*$/;
    this.startRegionRe = /^\s*(\/\*|\/\/)#?region\b/;

    this._getFoldWidgetBase = this.getFoldWidget;
    this.getFoldWidget = function(session, foldStyle, row) {
        var line = session.getLine(row);

        if (this.singleLineBlockCommentRe.test(line) && !this.startRegionRe.test(line) && !this.tripleStarBlockCommentRe.test(line))
            return "";

        var fw = this._getFoldWidgetBase(session, foldStyle, row);

        if (!fw && this.startRegionRe.test(line))
            return "start";

        return fw;
    };

    this.getFoldWidgetRange = function(session, foldStyle, row, forceMultiline) {
        var line = session.getLine(row);

        if (this.startRegionRe.test(line))
            return this.getCommentRegionBlock(session, line, row);

        var match = line.match(this.foldingStartMarker);
        if (match) {
            var i = match.index;

            if (match[1])
                return this.openingBracketBlock(session, match[1], row, i);

            var range = session.getCommentFoldRange(row, i + match[0].length, 1);

            if (range && !range.isMultiLine()) {
                if (forceMultiline)
                    range = this.getSectionRange(session, row);
                else if (foldStyle != "all")
                    range = null;
            }

            return range;
        }

        if (foldStyle === "markbegin")
            return;

        var match = line.match(this.foldingStopMarker);
        if (match) {
            var i = match.index + match[0].length;

            if (match[1])
                return this.closingBracketBlock(session, match[1], row, i);

            return session.getCommentFoldRange(row, i, -1);
        }
    };

    this.getSectionRange = function(session, row) {
        var line = session.getLine(row);
        var startIndent = line.search(/\S/);
        var startRow = row;
        var startColumn = line.length;
        row = row + 1;
        var endRow = row;
        var maxRow = session.getLength();
        while (++row < maxRow) {
            line = session.getLine(row);
            var indent = line.search(/\S/);
            if (indent === -1)
                continue;
            if (startIndent > indent)
                break;
            var subRange = this.getFoldWidgetRange(session, "all", row);
            if (subRange) {
                if (subRange.start.row <= startRow)
                    break;
                if (subRange.isMultiLine())
                    row = subRange.end.row;
                else if (startIndent == indent)
                    break;
            }
            endRow = row;
        }
        return new Range(startRow, startColumn, endRow, session.getLine(endRow).length);
    };

    this.getCommentRegionBlock = function(session, line, row) {
        var startColumn = line.search(/\s*$/);
        var maxRow = session.getLength();
        var startRow = row;
        var re = /^\s*(?:\/\*|\/\/|--)#?(end)?region\b/;
        var depth = 1;
        while (++row < maxRow) {
            line = session.getLine(row);
            var m = re.exec(line);
            if (!m) continue;
            if (m[1]) depth--;
            else depth++;
            if (!depth) break;
        }

        var endRow = row;
        if (endRow > startRow)
            return new Range(startRow, startColumn, endRow, line.length);
    };

}).call(FoldMode.prototype);

});

define("ace/mode/folding/sql", ["require", "exports", "module", "ace/lib/oop", "ace/range", "ace/mode/folding/cstyle"], function(require, exports, module) {
"use strict";

var oop = require("../../lib/oop");
var Range = require("../../range").Range;
var CstyleFoldMode = require("./cstyle").FoldMode;

var SqlFoldMode = exports.FoldMode = function() {};
oop.inherits(SqlFoldMode, CstyleFoldMode);

(function() {

    // $$ ... $$ or $tag$ ... $tag$ (dollar-quoted strings/function bodies).
    this.dollarQuoteRe = /\$([a-zA-Z_][a-zA-Z0-9_]*)?\$/;

    this.ifStartRe = /\bif\b/i;
    this.ifEndRe = /\bend\s+if\b/i;

    this.caseStartRe = /\bcase\b/i;
    this.caseEndRe = /\bend\s+case\b/i;

    // Removes comments and string/identifier literals from a line so keyword
    // matching below doesn't trigger on text that only looks like SQL keywords.
    this.$stripNonCode = function(line) {
        return line
            .replace(/--.*$/, "")
            .replace(/'(?:[^']|'')*'/g, "")
            .replace(/"(?:[^"]|"")*"/g, "")
            .replace(/`[^`]*`/g, "");
    };

    this.$opensIf = function(stripped) {
        return this.ifStartRe.test(stripped) && !this.ifEndRe.test(stripped);
    };
    this.$closesIf = function(stripped) {
        return this.ifEndRe.test(stripped);
    };

    this.$opensCase = function(stripped) {
        return this.caseStartRe.test(stripped) && !this.caseEndRe.test(stripped);
    };
    this.$closesCase = function(stripped) {
        return this.caseEndRe.test(stripped);
    };

    // Generic nested keyword-pair scanner (e.g. IF/END IF, CASE/END CASE):
    // walks forward from `row`, tracking nesting depth, until the matching
    // close is found. Returns the matching row, or null if unterminated.
    this.$findMatchingEnd = function(session, row, opensTest, closesTest) {
        var depth = 1;
        var maxRow = session.getLength();
        for (var i = row + 1; i < maxRow; i++) {
            var stripped = this.$stripNonCode(session.getLine(i));
            if (closesTest.call(this, stripped)) {
                depth--;
                if (depth === 0)
                    return i;
            } else if (opensTest.call(this, stripped)) {
                depth++;
            }
        }
        return null;
    };

    // Finds the row of the closing dollar-quote tag matching the one opened
    // on `row`, if any. Returns null if the tag also closes on the same line
    // (nothing to fold) or is never closed.
    this.$dollarQuoteRange = function(session, row) {
        var line = this.$stripNonCode(session.getLine(row));
        var match = this.dollarQuoteRe.exec(line);
        if (!match)
            return null;

        var tag = match[0];
        var restOfLine = line.slice(match.index + tag.length);
        if (restOfLine.indexOf(tag) !== -1)
            return null;

        var maxRow = session.getLength();
        for (var i = row + 1; i < maxRow; i++) {
            if (session.getLine(i).indexOf(tag) !== -1)
                return { tag: tag, endRow: i };
        }
        return null;
    };

    // Indentation-based fallback folding: a line becomes a fold start when
    // the next non-blank line is indented further than it is. Useful for
    // blocks without explicit delimiters, e.g. a SELECT with many indented
    // output columns.
    this.$indentFoldWidget = function(session, row) {
        var line = session.getLine(row);
        if (line.search(/\S/) === -1)
            return "";

        var indent = line.search(/\S/);
        var nextLine = session.getLine(row + 1);
        if (nextLine == null)
            return "";

        var nextIndent = nextLine.search(/\S/);
        if (nextIndent === -1)
            return "";

        return nextIndent > indent ? "start" : "";
    };

    this.$indentFoldRange = function(session, row) {
        var line = session.getLine(row);
        var indent = line.search(/\S/);
        var startRow = row;
        var endRow = row;
        var maxRow = session.getLength();

        for (var i = row + 1; i < maxRow; i++) {
            var nextLine = session.getLine(i);
            if (nextLine.search(/\S/) === -1)
                continue;

            var nextIndent = nextLine.search(/\S/);
            if (nextIndent <= indent)
                break;

            endRow = i;
        }

        if (endRow === startRow)
            return null;

        return new Range(startRow, line.length, endRow, session.getLine(endRow).length);
    };

    this.getFoldWidget = function(session, foldStyle, row) {
        if (this.$dollarQuoteRange(session, row))
            return "start";

        var stripped = this.$stripNonCode(session.getLine(row));

        if (this.$opensIf(stripped) && this.$findMatchingEnd(session, row, this.$opensIf, this.$closesIf) != null)
            return "start";

        if (this.$opensCase(stripped) && this.$findMatchingEnd(session, row, this.$opensCase, this.$closesCase) != null)
            return "start";

        var base = CstyleFoldMode.prototype.getFoldWidget.call(this, session, foldStyle, row);
        if (base)
            return base;

        return this.$indentFoldWidget(session, row);
    };

    this.getFoldWidgetRange = function(session, foldStyle, row) {
        var line = session.getLine(row);

        var dq = this.$dollarQuoteRange(session, row);
        if (dq)
            return new Range(row, line.length, dq.endRow, session.getLine(dq.endRow).length);

        var stripped = this.$stripNonCode(line);

        if (this.$opensIf(stripped)) {
            var endRow = this.$findMatchingEnd(session, row, this.$opensIf, this.$closesIf);
            if (endRow != null)
                return new Range(row, line.length, endRow, session.getLine(endRow).length);
        }

        if (this.$opensCase(stripped)) {
            var endRow = this.$findMatchingEnd(session, row, this.$opensCase, this.$closesCase);
            if (endRow != null)
                return new Range(row, line.length, endRow, session.getLine(endRow).length);
        }

        var base = CstyleFoldMode.prototype.getFoldWidgetRange.call(this, session, foldStyle, row);
        if (base)
            return base;

        return this.$indentFoldRange(session, row);
    };

}).call(SqlFoldMode.prototype);

});

define("ace/mode/sql", ["require", "exports", "module", "ace/lib/oop", "ace/mode/text", "ace/mode/sql_highlight_rules", "ace/mode/folding/sql"], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextMode = require("./text").Mode;
var SqlHighlightRules = require("./sql_highlight_rules").SqlHighlightRules;
var SqlFoldMode = require("./folding/sql").FoldMode;

var Mode = function() {
    this.HighlightRules = SqlHighlightRules;
    this.foldingRules = new SqlFoldMode();
    this.$behaviour = this.$defaultBehaviour;
};
oop.inherits(Mode, TextMode);

(function() {
    this.lineCommentStart = "--";
    this.blockComment = { start: "/*", end: "*/" };
    this.$id = "ace/mode/sql";
    this.snippetFileId = "ace/snippets/sql";
}).call(Mode.prototype);

exports.Mode = Mode;

});
                (function() {
                    window.require(["ace/mode/sql"], function(m) {
                        if (typeof module == "object" && typeof exports == "object" && module) {
                            module.exports = m;
                        }
                    });
                })();
