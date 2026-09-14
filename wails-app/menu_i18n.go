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
		"notify":          "Notify",
		"connected_users": "Connected Users",
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
		"notify":          "Oznámení",
		"connected_users": "Připojení uživatelé",
		"snippets":        "Snippety",
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
		"notify":          "Notificaciones",
		"connected_users": "Usuarios conectados",
		"snippets":        "Snippets",
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
		"notify":          "Notificações",
		"connected_users": "Utilizadores ligados",
		"snippets":        "Snippets",
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
		"notify":          "Benachrichtigungen",
		"connected_users": "Verbundene Benutzer",
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
		"notify":          "Notifications",
		"connected_users": "Utilisateurs connectés",
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
		"notify":          "Notifiche",
		"connected_users": "Utenti connessi",
		"snippets":        "Snippet",
		"toggle_tree":     "Attiva/disattiva albero del database",
		"toggle_props":    "Attiva/disattiva pannello proprietà/DDL",
		"help_menu":       "Aiuto",
		"getting_started": "Per iniziare",
		"shortcuts":       "Scorciatoie da tastiera",
		"visit_website":   "Visita omnidb.net",
		"github_repo":     "Repository GitHub",
	},
	"ja": {
		"about":           "OmniDBについて",
		"settings":        "設定…",
		"import_legacy":   "以前のインストールからデータをインポート…",
		"quit":            "OmniDBを終了",
		"view_menu":       "表示",
		"welcome":         "ようこそ",
		"connections":     "接続",
		"database":        "データベース",
		"notify":          "通知",
		"connected_users": "接続中のユーザー",
		"snippets":        "スニペット",
		"toggle_tree":     "データベースツリーの表示切替",
		"toggle_props":    "プロパティ/DDLパネルの表示切替",
		"help_menu":       "ヘルプ",
		"getting_started": "はじめに",
		"shortcuts":       "キーボードショートカット",
		"visit_website":   "omnidb.netにアクセス",
		"github_repo":     "GitHubリポジトリ",
	},
	"ko": {
		"about":           "OmniDB 정보",
		"settings":        "설정…",
		"import_legacy":   "이전 설치에서 데이터 가져오기…",
		"quit":            "OmniDB 종료",
		"view_menu":       "보기",
		"welcome":         "환영합니다",
		"connections":     "연결",
		"database":        "데이터베이스",
		"notify":          "알림",
		"connected_users": "연결된 사용자",
		"snippets":        "스니펫",
		"toggle_tree":     "데이터베이스 트리 표시 전환",
		"toggle_props":    "속성/DDL 패널 표시 전환",
		"help_menu":       "도움말",
		"getting_started": "시작하기",
		"shortcuts":       "키보드 단축키",
		"visit_website":   "omnidb.net 방문",
		"github_repo":     "GitHub 저장소",
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
