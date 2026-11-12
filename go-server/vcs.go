package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"omnidb-server/vcsrepo"
)

// Version control of OmniDB's shareable definitions: snippets, custom
// monitoring units and scheduled queries are written to a git repository as
// plain files (see vcsrepo) and read back from one. Each kind owns one
// top-level directory of the repository; importing never deletes anything.
//
// In the desktop app the repository folder is chosen and held by the shell
// (wails-app/vcsfolder.go), because the sandboxed macOS build can only reach a
// folder its user picked in a native dialog, and only the shell process holds
// that grant -- so there the shell also does all the file and git work, and
// this process only turns definitions into files and back. Without a shell
// (the multi-user server) the folder is typed in and this process does it.

// vcsKind is one kind of definition that can be versioned.
type vcsKind struct {
	Name string
	Root string
	// Export lists the user's definitions as files under Root.
	Export func(db *sql.DB, userID int64) ([]vcsrepo.File, error)
	// Import applies files (paths relative to Root) to the user's data.
	Import func(db *sql.DB, userID int64, files []vcsrepo.File) (vcsImportResult, error)
}

type vcsImportResult struct {
	Created   int `json:"created"`
	Updated   int `json:"updated"`
	Unchanged int `json:"unchanged"`
	Skipped   int `json:"skipped"`
}

var vcsKinds = []vcsKind{
	{Name: "snippets", Root: "snippets", Export: exportSnippetFiles, Import: importSnippetFiles},
	{Name: "monitoring", Root: "monitoring", Export: exportMonitoringFiles, Import: importMonitoringFiles},
	{Name: "schedules", Root: "schedules", Export: exportScheduleFiles, Import: importScheduleFiles},
}

// selectedVCSKinds resolves the requested kind names (all when none).
func selectedVCSKinds(names []string) ([]vcsKind, error) {
	if len(names) == 0 {
		return vcsKinds, nil
	}
	var out []vcsKind
	for _, n := range names {
		found := false
		for _, k := range vcsKinds {
			if k.Name == n {
				out = append(out, k)
				found = true
			}
		}
		if !found {
			return nil, fmt.Errorf("unknown kind %q", n)
		}
	}
	return out, nil
}

func prefixed(root string, files []vcsrepo.File) []vcsrepo.File {
	out := make([]vcsrepo.File, len(files))
	for i, f := range files {
		out[i] = vcsrepo.File{Path: root + "/" + f.Path, Text: f.Text}
	}
	return out
}

func under(root string, files []vcsrepo.File) []vcsrepo.File {
	var out []vcsrepo.File
	for _, f := range files {
		if rel, ok := strings.CutPrefix(f.Path, root+"/"); ok {
			out = append(out, vcsrepo.File{Path: rel, Text: f.Text})
		}
	}
	return out
}

// uniquePath appends " (n)" before the extension until path is unused
// (case-insensitively, as most filesystems are).
func uniquePath(used map[string]bool, path, ext string) string {
	base := strings.TrimSuffix(path, ext)
	for n := 2; used[strings.ToLower(path)]; n++ {
		path = fmt.Sprintf("%s (%d)%s", base, n, ext)
	}
	used[strings.ToLower(path)] = true
	return path
}

// --- snippets ---

func exportSnippetFiles(db *sql.DB, userID int64) ([]vcsrepo.File, error) {
	entries, err := snippetExportEntries(db, userID)
	if err != nil {
		return nil, err
	}
	files := make([]vcsrepo.File, len(entries))
	for i, e := range entries {
		files[i] = vcsrepo.File{Path: e.Path, Text: e.Text}
	}
	return prefixed("snippets", files), nil
}

func importSnippetFiles(db *sql.DB, userID int64, files []vcsrepo.File) (vcsImportResult, error) {
	var res vcsImportResult
	tx, err := db.Begin()
	if err != nil {
		return res, err
	}
	defer tx.Rollback()
	now := time.Now().UTC()

	folderID := func(parent *int64, name string) (*int64, error) {
		var id int64
		err := tx.QueryRow(`select id from OmniDB_app_snippetfolder where user_id = ? and name = ? and parent_id is ?`,
			userID, name, nullableInt64(parent)).Scan(&id)
		if err == sql.ErrNoRows {
			r, err := tx.Exec(`insert into OmniDB_app_snippetfolder (user_id, parent_id, name, create_date, modify_date) values (?, ?, ?, ?, ?)`,
				userID, nullableInt64(parent), name, now, now)
			if err != nil {
				return nil, err
			}
			if id, err = r.LastInsertId(); err != nil {
				return nil, err
			}
		} else if err != nil {
			return nil, err
		}
		return &id, nil
	}

	for _, f := range files {
		if !strings.EqualFold(fileExt(f.Path), ".sql") {
			res.Skipped++
			continue
		}
		parts := strings.Split(f.Path, "/")
		name := strings.TrimSuffix(parts[len(parts)-1], fileExt(f.Path))
		var parent *int64
		for _, seg := range parts[:len(parts)-1] {
			if parent, err = folderID(parent, seg); err != nil {
				return res, err
			}
		}
		var id int64
		var current string
		err = sql.ErrNoRows
		type candidate struct {
			id         int64
			name, text string
		}
		var candidates []candidate
		rows, qerr := tx.Query(`select id, name, text from OmniDB_app_snippetfile where user_id = ? and parent_id is ? order by id`,
			userID, nullableInt64(parent))
		if qerr != nil {
			return res, qerr
		}
		for rows.Next() {
			var c candidate
			if err := rows.Scan(&c.id, &c.name, &c.text); err != nil {
				rows.Close()
				return res, err
			}
			candidates = append(candidates, c)
		}
		rows.Close()
		// A snippet matches by its name, or by the file name its name was
		// exported under (characters a path cannot hold become "_"), or by
		// that name plus the " (n)" an export adds to tell two apart.
		match := func(want string, nth int) *candidate {
			seen := 0
			for i := range candidates {
				if candidates[i].name == want || safePathElement(candidates[i].name) == want {
					seen++
					if seen == nth {
						return &candidates[i]
					}
				}
			}
			return nil
		}
		found := match(name, 1)
		if found == nil {
			if m := dedupeSuffix.FindStringSubmatch(name); m != nil {
				n, _ := strconv.Atoi(m[2])
				found = match(m[1], n)
			}
		}
		if found != nil {
			id, current, err = found.id, found.text, nil
		}
		switch {
		case err == sql.ErrNoRows:
			if _, err := tx.Exec(`insert into OmniDB_app_snippetfile (user_id, parent_id, name, create_date, modify_date, text) values (?, ?, ?, ?, ?, ?)`,
				userID, nullableInt64(parent), name, now, now, f.Text); err != nil {
				return res, err
			}
			res.Created++
		case err != nil:
			return res, err
		case current == f.Text:
			res.Unchanged++
		default:
			if _, err := tx.Exec(`update OmniDB_app_snippetfile set text = ?, modify_date = ? where id = ?`, f.Text, now, id); err != nil {
				return res, err
			}
			res.Updated++
		}
	}
	return res, tx.Commit()
}

// dedupeSuffix matches the " (n)" uniquePath adds to a repeated file name.
var dedupeSuffix = regexp.MustCompile(`^(.*) \((\d+)\)$`)

func fileExt(path string) string {
	if i := strings.LastIndex(path, "."); i > strings.LastIndex(path, "/") {
		return path[i:]
	}
	return ""
}

// --- custom monitoring units ---

type monitoringFile struct {
	Title       string `json:"title"`
	Type        string `json:"type"`
	Interval    int    `json:"interval"`
	ScriptChart string `json:"script_chart"`
	ScriptData  string `json:"script_data"`
}

func marshalFile(v any) (string, error) {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return "", err
	}
	return b.String(), nil
}

func exportMonitoringFiles(db *sql.DB, userID int64) ([]vcsrepo.File, error) {
	rows, err := db.Query(`select t.name, u.title, u.type, u.interval, u.script_chart, u.script_data
		from OmniDB_app_monunits u join OmniDB_app_technology t on t.id = u.technology_id
		where u.user_id = ? order by t.name, u.title, u.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	used := map[string]bool{}
	var files []vcsrepo.File
	for rows.Next() {
		var tech string
		var m monitoringFile
		if err := rows.Scan(&tech, &m.Title, &m.Type, &m.Interval, &m.ScriptChart, &m.ScriptData); err != nil {
			return nil, err
		}
		text, err := marshalFile(m)
		if err != nil {
			return nil, err
		}
		path := uniquePath(used, safePathElement(tech)+"/"+safePathElement(m.Title)+".json", ".json")
		files = append(files, vcsrepo.File{Path: path, Text: text})
	}
	return prefixed("monitoring", files), rows.Err()
}

func importMonitoringFiles(db *sql.DB, userID int64, files []vcsrepo.File) (vcsImportResult, error) {
	var res vcsImportResult
	for _, f := range files {
		tech, _, ok := strings.Cut(f.Path, "/")
		var m monitoringFile
		if !ok || !strings.EqualFold(fileExt(f.Path), ".json") || json.Unmarshal([]byte(f.Text), &m) != nil || strings.TrimSpace(m.Title) == "" {
			res.Skipped++
			continue
		}
		if _, err := technologyID(db, tech); err != nil {
			res.Skipped++
			continue
		}
		var id int64
		var cur monitoringFile
		err := db.QueryRow(`select u.id, u.type, u.interval, u.script_chart, u.script_data
			from OmniDB_app_monunits u join OmniDB_app_technology t on t.id = u.technology_id
			where u.user_id = ? and t.name = ? and u.title = ? order by u.id limit 1`, userID, tech, m.Title).
			Scan(&id, &cur.Type, &cur.Interval, &cur.ScriptChart, &cur.ScriptData)
		switch {
		case err == sql.ErrNoRows:
			if _, err := saveCustomMonitorUnit(db, userID, nil, tech, m.Title, m.Type, m.Interval, m.ScriptChart, m.ScriptData); err != nil {
				return res, err
			}
			res.Created++
		case err != nil:
			return res, err
		case cur.Type == m.Type && cur.Interval == m.Interval && cur.ScriptChart == m.ScriptChart && cur.ScriptData == m.ScriptData:
			res.Unchanged++
		default:
			if _, err := saveCustomMonitorUnit(db, userID, &id, tech, m.Title, m.Type, m.Interval, m.ScriptChart, m.ScriptData); err != nil {
				return res, err
			}
			res.Updated++
		}
	}
	return res, nil
}

// --- scheduled queries ---

type scheduleFile struct {
	Name     string `json:"name"`
	SQL      string `json:"sql"`
	Interval int    `json:"interval_minutes"`
}

// exportScheduleFiles writes the user's schedules grouped by the alias of the
// connection they run on (never its address or credentials).
func exportScheduleFiles(db *sql.DB, userID int64) ([]vcsrepo.File, error) {
	list, err := fetchSchedules(db, userID)
	if err != nil {
		return nil, err
	}
	used := map[string]bool{}
	var files []vcsrepo.File
	for _, s := range list {
		text, err := marshalFile(scheduleFile{Name: s.Name, SQL: s.SQL, Interval: s.Interval})
		if err != nil {
			return nil, err
		}
		path := uniquePath(used, safePathElement(s.Alias)+"/"+safePathElement(s.Name)+".json", ".json")
		files = append(files, vcsrepo.File{Path: path, Text: text})
	}
	return prefixed("schedules", files), nil
}

// importScheduleFiles creates or updates schedules on the connection whose
// alias is the file's directory. A schedule that did not exist is created
// paused: pulling SQL from a repository must never start running it against a
// database unattended -- review it, then resume it.
func importScheduleFiles(db *sql.DB, userID int64, files []vcsrepo.File) (vcsImportResult, error) {
	var res vcsImportResult
	for _, f := range files {
		alias, _, ok := strings.Cut(f.Path, "/")
		var s scheduleFile
		if !ok || !strings.EqualFold(fileExt(f.Path), ".json") || json.Unmarshal([]byte(f.Text), &s) != nil ||
			strings.TrimSpace(s.Name) == "" || len(scriptStatements(s.SQL)) == 0 ||
			s.Interval < minScheduleInterval || s.Interval > maxScheduleInterval {
			res.Skipped++
			continue
		}
		connID, ok := scheduleConnectionByAlias(db, userID, alias)
		if !ok {
			res.Skipped++
			continue
		}
		var id int64
		var curSQL string
		var curInterval int
		err := db.QueryRow(`select id, sql, interval_minutes from OmniDB_app_schedule where user_id = ? and connection_id = ? and name = ? order by id limit 1`,
			userID, connID, s.Name).Scan(&id, &curSQL, &curInterval)
		switch {
		case err == sql.ErrNoRows:
			newID, err := addSchedule(db, userID, connID, s.Name, s.SQL, s.Interval, time.Now())
			if err != nil {
				res.Skipped++
				continue
			}
			if _, err := db.Exec(`update OmniDB_app_schedule set enabled = 0 where id = ?`, newID); err != nil {
				return res, err
			}
			res.Created++
		case err != nil:
			return res, err
		case curSQL == s.SQL && curInterval == s.Interval:
			res.Unchanged++
		default:
			// Paused like a newly created one: changed SQL from a repository
			// must not start running unattended either.
			if _, err := db.Exec(`update OmniDB_app_schedule set sql = ?, interval_minutes = ?, enabled = 0 where id = ?`, s.SQL, s.Interval, id); err != nil {
				return res, err
			}
			res.Updated++
		}
	}
	return res, nil
}

// scheduleConnectionByAlias finds a schedulable connection the user can see
// whose alias safePathElement-matches name (the user's own first).
func scheduleConnectionByAlias(db *sql.DB, userID int64, name string) (int64, bool) {
	conns, err := fetchConnectionsForUser(db, userID)
	if err != nil {
		return 0, false
	}
	sort.SliceStable(conns, func(i, j int) bool { return conns[i].OwnerID == userID && conns[j].OwnerID != userID })
	for i := range conns {
		if safePathElement(conns[i].Alias) == name && checkSchedulable(&conns[i]) == nil {
			return conns[i].ID, true
		}
	}
	return 0, false
}

// --- repository backends ---

// vcsBackend does the file and git work on the chosen folder.
type vcsBackend interface {
	Status() (vcsrepo.State, error)
	Init() error
	Commit(roots []string, files []vcsrepo.File, message string) (string, error)
	Read(roots []string) ([]vcsrepo.File, error)
}

// localBackend works on a folder this process can reach itself.
type localBackend struct{ dir string }

func (b localBackend) Status() (vcsrepo.State, error) { return vcsrepo.Status(b.dir), nil }
func (b localBackend) Init() error                    { return vcsrepo.Init(b.dir) }
func (b localBackend) Commit(roots []string, files []vcsrepo.File, message string) (string, error) {
	return vcsrepo.Commit(b.dir, roots, files, message)
}
func (b localBackend) Read(roots []string) ([]vcsrepo.File, error) { return vcsrepo.Read(b.dir, roots) }

// omnidbVCSURLEnv is set by wails-app/backend.go: the shell's repository relay.
const omnidbVCSURLEnv = "OMNIDB_VCS_URL"

// shellRequest/shellResponse mirror wails-app/vcsfolder.go's own types.
type shellRequest struct {
	Action  string         `json:"action"`
	Roots   []string       `json:"roots,omitempty"`
	Files   []vcsrepo.File `json:"files,omitempty"`
	Message string         `json:"message,omitempty"`
}

type shellResponse struct {
	Error     string         `json:"error"`
	Cancelled bool           `json:"cancelled"`
	Granted   bool           `json:"granted"`
	Needed    bool           `json:"needed"`
	Default   bool           `json:"default"`
	Path      string         `json:"path"`
	State     vcsrepo.State  `json:"state"`
	Result    string         `json:"result"`
	Files     []vcsrepo.File `json:"files"`
}

func callShell(req shellRequest) (shellResponse, error) {
	var out shellResponse
	payload, err := json.Marshal(req)
	if err != nil {
		return out, err
	}
	timeout := 2 * time.Minute
	if req.Action == "choose" {
		// The shell answers only once the native folder picker is closed.
		timeout = time.Hour
	}
	resp, err := postToShell(&http.Client{Timeout: timeout}, os.Getenv(omnidbVCSURLEnv), bytes.NewReader(payload))
	if err != nil {
		return out, fmt.Errorf("could not reach the desktop app: %w", err)
	}
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return out, errors.New("unexpected response from the desktop app")
	}
	if out.Error != "" {
		return out, errors.New(out.Error)
	}
	return out, nil
}

// shellBackend has the desktop shell, which holds the folder grant, do it.
type shellBackend struct{}

func (shellBackend) Status() (vcsrepo.State, error) {
	r, err := callShell(shellRequest{Action: "status"})
	return r.State, err
}
func (shellBackend) Init() error {
	_, err := callShell(shellRequest{Action: "init"})
	return err
}
func (shellBackend) Commit(roots []string, files []vcsrepo.File, message string) (string, error) {
	r, err := callShell(shellRequest{Action: "commit", Roots: roots, Files: files, Message: message})
	return r.Result, err
}
func (shellBackend) Read(roots []string) ([]vcsrepo.File, error) {
	r, err := callShell(shellRequest{Action: "read", Roots: roots})
	return r.Files, err
}

// --- HTTP ---

type vcsRequest struct {
	Action  string   `json:"p_action"`
	Dir     string   `json:"p_dir"`
	Kinds   []string `json:"p_kinds"`
	Message string   `json:"p_message"`
}

// vcsAllowed: without the shell this process touches its own filesystem, so
// outside the single-user desktop app only a superuser may.
func vcsAllowed(who *WhoAmI) bool {
	return appToken != "" || who.SuperUser
}

func handleVCS(upstream *url.URL) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := readFormData(r)
		if err != nil || raw == "" {
			writeBadRequest(w)
			return
		}
		var req vcsRequest
		if err := json.Unmarshal([]byte(raw), &req); err != nil {
			writeBadRequest(w)
			return
		}
		db, who, ok := resolveAppDBRequest(w, r, upstream)
		if !ok {
			return
		}
		defer db.Close()
		fail := func(err error) { writeEnvelope(w, err.Error(), true, -1) }
		if !vcsAllowed(who) {
			fail(errors.New("version control is limited to superusers on a multi-user OmniDB server"))
			return
		}
		viaShell := os.Getenv(omnidbVCSURLEnv) != ""

		// Folder questions are answered by the shell, which owns the folder.
		switch req.Action {
		case "folder":
			if !viaShell {
				writeEnvelope(w, map[string]any{"managed": false}, false, -1)
				return
			}
			r, err := callShell(shellRequest{Action: "folder"})
			if err != nil {
				fail(err)
				return
			}
			writeEnvelope(w, map[string]any{"managed": true, "granted": r.Granted, "default": r.Default, "path": r.Path}, false, -1)
			return
		case "choose_folder":
			if !viaShell {
				fail(errors.New("the folder picker is only available in the OmniDB desktop app"))
				return
			}
			r, err := callShell(shellRequest{Action: "choose"})
			if err != nil {
				fail(err)
				return
			}
			writeEnvelope(w, map[string]any{"managed": true, "granted": r.Granted, "path": r.Path, "cancelled": r.Cancelled}, false, -1)
			return
		}

		var backend vcsBackend = shellBackend{}
		if !viaShell {
			req.Dir = strings.TrimSpace(req.Dir)
			if err := vcsrepo.CheckDir(req.Dir); err != nil {
				fail(err)
				return
			}
			backend = localBackend{dir: req.Dir}
		}
		kinds, err := selectedVCSKinds(req.Kinds)
		if err != nil {
			fail(err)
			return
		}
		roots := make([]string, len(kinds))
		for i, k := range kinds {
			roots[i] = k.Root
		}
		userID := int64(who.UserID)

		switch req.Action {
		case "status":
			st, err := backend.Status()
			if err != nil {
				fail(err)
				return
			}
			writeEnvelope(w, st, false, -1)
		case "init":
			if err := backend.Init(); err != nil {
				fail(err)
				return
			}
			st, err := backend.Status()
			if err != nil {
				fail(err)
				return
			}
			writeEnvelope(w, st, false, -1)
		case "commit":
			var files []vcsrepo.File
			for _, k := range kinds {
				fs, err := k.Export(db, userID)
				if err != nil {
					fail(err)
					return
				}
				files = append(files, fs...)
			}
			result, err := backend.Commit(roots, files, req.Message)
			if err != nil {
				fail(err)
				return
			}
			st, _ := backend.Status()
			writeEnvelope(w, map[string]any{"result": result, "state": st}, false, -1)
		case "import":
			files, err := backend.Read(roots)
			if err != nil {
				fail(err)
				return
			}
			out := map[string]vcsImportResult{}
			for _, k := range kinds {
				res, err := k.Import(db, userID, under(k.Root, files))
				if err != nil {
					fail(fmt.Errorf("%s: %w", k.Name, err))
					return
				}
				out[k.Name] = res
			}
			writeEnvelope(w, out, false, -1)
		default:
			writeBadRequest(w)
		}
	}
}
