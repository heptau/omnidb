// Package i18n loads OmniDB's UI translation catalogs and resolves which
// language a given request/user should see. There are three supported
// languages (English, Czech, Spanish) plus a virtual "auto" preference that
// each caller resolves against an Accept-Language header via ResolveLanguage
// — never stored as a catalog itself.
package i18n

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

//go:embed locales/*.json
var localesFS embed.FS

// Catalog is a flat, dot-namespaced key -> template string map (e.g.
// "settings.appearance.theme" -> "Theme"). Template strings may contain
// "{name}"-style placeholders, filled in by T/Tn.
type Catalog map[string]string

// SupportedLanguages are the only concrete (non-"auto") language codes a
// user can pick in Settings or a request can resolve to. English is always
// first: it's both the fallback language and the catalog every other
// language's missing keys fall back to.
var SupportedLanguages = []string{"en", "cs", "es"}

// DefaultLanguage is returned whenever a preference or Accept-Language
// header can't be resolved to a supported language.
const DefaultLanguage = "en"

var catalogs map[string]Catalog

func init() {
	catalogs = make(map[string]Catalog, len(SupportedLanguages))
	for _, lang := range SupportedLanguages {
		data, err := localesFS.ReadFile("locales/" + lang + ".json")
		if err != nil {
			panic("i18n: missing locale file for " + lang + ": " + err.Error())
		}
		var c Catalog
		if err := json.Unmarshal(data, &c); err != nil {
			panic("i18n: invalid locale file for " + lang + ": " + err.Error())
		}
		catalogs[lang] = c
	}
}

// IsSupported reports whether lang (already lowercase, e.g. "cs") is one of
// SupportedLanguages.
func IsSupported(lang string) bool {
	for _, l := range SupportedLanguages {
		if l == lang {
			return true
		}
	}
	return false
}

// ResolveLanguage picks the effective language for a request: storedPref
// wins outright if it's one of SupportedLanguages; otherwise (storedPref is
// "auto", empty, or some stale/invalid value) it's resolved from the
// request's Accept-Language header, falling back to DefaultLanguage if that
// header is empty or names nothing supported.
func ResolveLanguage(storedPref, acceptLanguageHeader string) string {
	if IsSupported(storedPref) {
		return storedPref
	}
	return resolveFromAcceptLanguage(acceptLanguageHeader)
}

// resolveFromAcceptLanguage parses a standard "Accept-Language" header value
// (e.g. "cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7") and returns the
// highest-weighted supported language, or DefaultLanguage if none of the
// offered tags (compared by their base subtag, e.g. "cs-CZ" -> "cs") match.
func resolveFromAcceptLanguage(header string) string {
	type candidate struct {
		lang string
		q    float64
	}
	var candidates []candidate
	for _, part := range strings.Split(header, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		segs := strings.SplitN(part, ";", 2)
		tag := strings.ToLower(strings.TrimSpace(segs[0]))
		q := 1.0
		if len(segs) == 2 {
			if qs := strings.TrimSpace(segs[1]); strings.HasPrefix(qs, "q=") {
				if v, err := strconv.ParseFloat(strings.TrimPrefix(qs, "q="), 64); err == nil {
					q = v
				}
			}
		}
		candidates = append(candidates, candidate{tag, q})
	}
	sort.SliceStable(candidates, func(i, j int) bool { return candidates[i].q > candidates[j].q })
	for _, c := range candidates {
		base := c.lang
		if idx := strings.IndexAny(base, "-_"); idx >= 0 {
			base = base[:idx]
		}
		if IsSupported(base) {
			return base
		}
	}
	return DefaultLanguage
}

// lookup returns the raw (uninterpolated) template for key in lang, falling
// back to English, then to the key itself (a visible, obviously-wrong string
// is far easier to notice and fix than a silently blank UI label).
func lookup(lang, key string) string {
	if c, ok := catalogs[lang]; ok {
		if v, ok := c[key]; ok {
			return v
		}
	}
	if v, ok := catalogs[DefaultLanguage][key]; ok {
		return v
	}
	return key
}

// interpolate replaces every "{name}" placeholder in s with vars["name"].
func interpolate(s string, vars map[string]string) string {
	if len(vars) == 0 {
		return s
	}
	for k, v := range vars {
		s = strings.ReplaceAll(s, "{"+k+"}", v)
	}
	return s
}

// kvToVars turns T/Tn's variadic (name, value, name, value, ...) argument
// list into a placeholder map, formatting each value with fmt.Sprint.
func kvToVars(kv []any) map[string]string {
	if len(kv) == 0 {
		return nil
	}
	vars := make(map[string]string, len(kv)/2)
	for i := 0; i+1 < len(kv); i += 2 {
		name, _ := kv[i].(string)
		vars[name] = fmt.Sprint(kv[i+1])
	}
	return vars
}

// T translates key into lang, interpolating any "{name}" placeholders from
// the given name/value pairs, e.g. T("cs", "errors.role_not_found", "role", roleName).
func T(lang, key string, kv ...any) string {
	return interpolate(lookup(lang, key), kvToVars(kv))
}

// pluralSuffix implements just enough CLDR plural-category logic for the
// three supported languages, restricted to non-negative integer counts
// (every Tn call site in this app counts rows/results/connections, never
// fractional quantities, so the CLDR "many" category — reserved for
// fractional forms in most languages including Czech — never applies here).
func pluralSuffix(lang string, n int) string {
	switch lang {
	case "cs":
		switch {
		case n == 1:
			return "one"
		case n >= 2 && n <= 4:
			return "few"
		default:
			return "other"
		}
	default: // en, es, and any future language default to the common one/other split.
		if n == 1 {
			return "one"
		}
		return "other"
	}
}

// Tn translates a plural-bearing key, choosing the "{key}.one" / "{key}.few"
// / "{key}.other" sub-key for n according to lang's plural rules (see
// pluralSuffix) and interpolating "{n}" automatically alongside any extra
// name/value pairs given. Every plural catalog entry must define at least
// "{key}.other" — falls back to it if the language-specific form (e.g.
// ".few") is itself missing from lang's catalog (still preferring lang's
// own ".other" over jumping straight to English, since lookup already
// handles the English fallback one level down).
func Tn(lang, key string, n int, kv ...any) string {
	vars := kvToVars(kv)
	if vars == nil {
		vars = map[string]string{}
	}
	vars["n"] = strconv.Itoa(n)

	suffix := pluralSuffix(lang, n)
	fullKey := key + "." + suffix
	if c, ok := catalogs[lang]; ok {
		if _, ok := c[fullKey]; !ok {
			fullKey = key + ".other"
		}
	}
	return interpolate(lookup(lang, fullKey), vars)
}

// CatalogFor returns the complete translation dictionary for lang, with
// every key present in the English catalog but missing from lang filled in
// from English — this is what gets embedded whole into the per-request
// bootstrap JSON so the frontend never needs a round trip for a missing key,
// and console.warn in i18n.js only fires for a key that's missing from
// *both* catalogs (a real authoring bug), not just untranslated so far.
func CatalogFor(lang string) map[string]string {
	base := catalogs[DefaultLanguage]
	out := make(map[string]string, len(base))
	for k, v := range base {
		out[k] = v
	}
	for k, v := range catalogs[lang] {
		out[k] = v
	}
	return out
}

// Error is a translatable error: Key/Args carry enough information to render
// the message in any supported language at the point it's finally shown to a
// user (typically an HTTP handler that knows the request's resolved
// language), while Error() itself renders English so it stays a sensible
// message wherever it's logged or type-asserted away entirely (e.g. by
// errors.Is/errors.As chains elsewhere that don't care about localization).
type Error struct {
	Key  string
	Args []any // alternating name/value pairs, same shape as T's kv
}

// NewError builds a translatable error. args are alternating name/value
// pairs, e.g. NewError("errors.table_missing", "table", tableName).
func NewError(key string, args ...any) *Error {
	return &Error{Key: key, Args: args}
}

func (e *Error) Error() string {
	return T(DefaultLanguage, e.Key, e.Args...)
}

// Localize renders e's message in lang instead of the English default
// Error() always uses.
func (e *Error) Localize(lang string) string {
	return T(lang, e.Key, e.Args...)
}

// Localize renders any error in lang: a *i18n.Error (including one wrapped
// by fmt.Errorf("...: %w", err)) renders in the target language; anything
// else (an unexpected/internal error never meant to be user-facing
// vocabulary) falls back to err.Error() as-is, same untranslated text this
// app always showed for such cases.
func Localize(err error, lang string) string {
	if err == nil {
		return ""
	}
	var le *Error
	if errors.As(err, &le) {
		return le.Localize(lang)
	}
	return err.Error()
}
