package main

import (
	"os"
	"strings"
)

// menuLangs holds the native macOS menu bar's own translation catalogs — a
// small subset of go-server/i18n's languages/keys, duplicated rather than
// imported: wails-app and go-server are separate Go modules running as
// separate OS processes (see backend.go/savedialog.go's comments on why),
// so there's no in-process way to call into go-server/i18n at all.
//
// Keys are the same set for every language; menuText falls back to English
// for a missing key, same fallback semantics as go-server/i18n.T.
var menuLangs = map[string]map[string]string{
	"en": {
		"about":           "About OmniDB",
		"settings":        "Settings...",
		"import_legacy":   "Import Data from Previous Installation...",
		"quit":            "Quit OmniDB",
		"view_menu":       "View",
		"welcome":         "Welcome",
		"connections":     "Connections",
		"database":        "Database",
		"snippets":        "Snippets",
		"toggle_tree":     "Toggle Database Tree",
		"toggle_props":    "Toggle Properties/DDL Panel",
		"help_menu":       "Help",
		"getting_started": "Getting Started",
		"shortcuts":       "Keyboard Shortcuts",
		"visit_website":   "Visit omnidb.net",
		"github_repo":     "GitHub Repository",
	},
	"cs": {
		"about":           "O aplikaci OmniDB",
		"settings":        "Nastavení…",
		"import_legacy":   "Importovat data z předchozí instalace…",
		"quit":            "Ukončit OmniDB",
		"view_menu":       "Zobrazit",
		"welcome":         "Úvod",
		"connections":     "Připojení",
		"database":        "Databáze",
		"snippets":        "Úryvky",
		"toggle_tree":     "Přepnout strom databáze",
		"toggle_props":    "Přepnout panel vlastností/DDL",
		"help_menu":       "Nápověda",
		"getting_started": "Začínáme",
		"shortcuts":       "Klávesové zkratky",
		"visit_website":   "Navštívit omnidb.net",
		"github_repo":     "Repozitář na GitHubu",
	},
	"es": {
		"about":           "Acerca de OmniDB",
		"settings":        "Preferencias…",
		"import_legacy":   "Importar datos de la instalación anterior…",
		"quit":            "Salir de OmniDB",
		"view_menu":       "Ver",
		"welcome":         "Bienvenida",
		"connections":     "Conexiones",
		"database":        "Base de datos",
		"snippets":        "Fragmentos",
		"toggle_tree":     "Mostrar/ocultar árbol de la base de datos",
		"toggle_props":    "Mostrar/ocultar panel de propiedades/DDL",
		"help_menu":       "Ayuda",
		"getting_started": "Primeros pasos",
		"shortcuts":       "Atajos de teclado",
		"visit_website":   "Visitar omnidb.net",
		"github_repo":     "Repositorio en GitHub",
	},
	"pt": {
		"about":           "Sobre o OmniDB",
		"settings":        "Preferências…",
		"import_legacy":   "Importar dados da instalação anterior…",
		"quit":            "Sair do OmniDB",
		"view_menu":       "Visualizar",
		"welcome":         "Bem-vindo",
		"connections":     "Conexões",
		"database":        "Banco de Dados",
		"snippets":        "Trechos",
		"toggle_tree":     "Alternar árvore do banco de dados",
		"toggle_props":    "Alternar painel de propriedades/DDL",
		"help_menu":       "Ajuda",
		"getting_started": "Primeiros Passos",
		"shortcuts":       "Atalhos de Teclado",
		"visit_website":   "Visitar omnidb.net",
		"github_repo":     "Repositório no GitHub",
	},
	"de": {
		"about":           "Über OmniDB",
		"settings":        "Einstellungen…",
		"import_legacy":   "Daten aus vorheriger Installation importieren…",
		"quit":            "OmniDB beenden",
		"view_menu":       "Ansicht",
		"welcome":         "Willkommen",
		"connections":     "Verbindungen",
		"database":        "Datenbank",
		"snippets":        "Snippets",
		"toggle_tree":     "Datenbankbaum ein-/ausblenden",
		"toggle_props":    "Eigenschaften/DDL-Bereich ein-/ausblenden",
		"help_menu":       "Hilfe",
		"getting_started": "Erste Schritte",
		"shortcuts":       "Tastenkombinationen",
		"visit_website":   "omnidb.net besuchen",
		"github_repo":     "GitHub-Repository",
	},
	"fr": {
		"about":           "À propos d'OmniDB",
		"settings":        "Préférences…",
		"import_legacy":   "Importer les données de l'installation précédente…",
		"quit":            "Quitter OmniDB",
		"view_menu":       "Affichage",
		"welcome":         "Accueil",
		"connections":     "Connexions",
		"database":        "Base de données",
		"snippets":        "Extraits",
		"toggle_tree":     "Afficher/masquer l'arborescence de la base de données",
		"toggle_props":    "Afficher/masquer le panneau propriétés/DDL",
		"help_menu":       "Aide",
		"getting_started": "Prise en main",
		"shortcuts":       "Raccourcis clavier",
		"visit_website":   "Visiter omnidb.net",
		"github_repo":     "Dépôt GitHub",
	},
	"it": {
		"about":           "Informazioni su OmniDB",
		"settings":        "Preferenze…",
		"import_legacy":   "Importa dati dall'installazione precedente…",
		"quit":            "Esci da OmniDB",
		"view_menu":       "Vista",
		"welcome":         "Benvenuto",
		"connections":     "Connessioni",
		"database":        "Database",
		"snippets":        "Snippet",
		"toggle_tree":     "Attiva/disattiva albero del database",
		"toggle_props":    "Attiva/disattiva pannello proprietà/DDL",
		"help_menu":       "Aiuto",
		"getting_started": "Per iniziare",
		"shortcuts":       "Scorciatoie da tastiera",
		"visit_website":   "Visita omnidb.net",
		"github_repo":     "Repository GitHub",
	},
}

const defaultMenuLang = "en"

// isSupportedMenuLang reports whether lang (already lowercase) has its own
// catalog above.
func isSupportedMenuLang(lang string) bool {
	_, ok := menuLangs[lang]
	return ok
}

// normalizeMenuLang lowercases lang and falls back to defaultMenuLang for
// anything not in menuLangs (including "auto", empty, or a stale/unknown
// value from a version skew between this binary and go-server's own
// i18n.SupportedLanguages).
func normalizeMenuLang(lang string) string {
	lang = strings.ToLower(strings.TrimSpace(lang))
	if isSupportedMenuLang(lang) {
		return lang
	}
	return defaultMenuLang
}

// menuText returns key's translation in lang, falling back to English for a
// key missing from lang's catalog (there shouldn't be any -- every language
// above defines the same key set -- but this keeps a typo from ever showing
// up as a blank menu label).
func menuText(lang, key string) string {
	if c, ok := menuLangs[lang]; ok {
		if v, ok := c[key]; ok {
			return v
		}
	}
	return menuLangs[defaultMenuLang][key]
}

// detectOSLanguage makes a best-effort guess at the OS's language from the
// standard POSIX locale environment variables, for the very first menu built
// -- before go-server has started, logged anyone in, or had a chance to
// report the signed-in user's actual language preference (see
// savedialog.go's /notify-language handler for how that later, authoritative
// update arrives). Checked in the same precedence order as native gettext:
// LC_ALL, then LC_MESSAGES, then LANG.
func detectOSLanguage() string {
	for _, envVar := range []string{"LC_ALL", "LC_MESSAGES", "LANG"} {
		v := strings.ToLower(os.Getenv(envVar))
		if v == "" {
			continue
		}
		if idx := strings.IndexAny(v, "_.-"); idx >= 0 {
			v = v[:idx]
		}
		if isSupportedMenuLang(v) {
			return v
		}
	}
	return defaultMenuLang
}
