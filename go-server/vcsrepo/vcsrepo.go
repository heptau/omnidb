// Package vcsrepo keeps OmniDB's shareable definitions (snippets, custom
// monitoring units, schedules) in a git repository as plain text files. It
// runs git in-process (go-git) instead of through the git command line: the
// sandboxed macOS app can neither find a git binary on its minimal PATH nor
// hand a child process the folder access its user granted, and an in-process
// implementation needs neither.
package vcsrepo

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// MaxFileBytes is the largest file Read returns; bigger ones are skipped.
const MaxFileBytes = 1 << 20

// managedExts are the file types OmniDB writes (and so may prune).
var managedExts = map[string]bool{".sql": true, ".json": true}

// File is one repository file: Path is slash-separated and relative to the
// repository root.
type File struct {
	Path string `json:"path"`
	Text string `json:"text"`
}

// State describes a repository folder for the UI.
type State struct {
	IsRepo  bool     `json:"is_repo"`
	Branch  string   `json:"branch"`
	Changes []string `json:"changes"`
	Log     []string `json:"log"`
}

// CheckDir validates a folder: absolute and an existing directory.
func CheckDir(dir string) error {
	if !filepath.IsAbs(dir) {
		return errors.New("the folder must be an absolute path")
	}
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return errors.New("the folder does not exist")
	}
	return nil
}

// open opens the repository whose working tree is exactly dir; a folder that
// merely sits inside another repository does not count, because commits
// would land in the outer one.
func open(dir string) (*git.Repository, error) {
	return git.PlainOpenWithOptions(dir, &git.PlainOpenOptions{DetectDotGit: false})
}

// Init makes dir a repository if it is not one already.
func Init(dir string) error {
	if _, err := open(dir); err == nil {
		return nil
	}
	_, err := git.PlainInit(dir, false)
	return err
}

// OuterRepo reports the working tree of a repository that contains dir
// without being dir itself.
func OuterRepo(dir string) (string, bool) {
	repo, err := git.PlainOpenWithOptions(dir, &git.PlainOpenOptions{DetectDotGit: true})
	if err != nil {
		return "", false
	}
	wt, err := repo.Worktree()
	if err != nil {
		return "", false
	}
	root := wt.Filesystem.Root()
	if a, e1 := filepath.EvalSymlinks(root); e1 == nil {
		root = a
	}
	d := dir
	if b, e2 := filepath.EvalSymlinks(dir); e2 == nil {
		d = b
	}
	if filepath.Clean(root) == filepath.Clean(d) {
		return "", false
	}
	return root, true
}

// Status reports the repository state of dir.
func Status(dir string) State {
	st := State{Changes: []string{}, Log: []string{}}
	repo, err := open(dir)
	if err != nil {
		return st
	}
	st.IsRepo = true
	if head, err := repo.Reference(plumbing.HEAD, false); err == nil && head.Type() == plumbing.SymbolicReference {
		st.Branch = head.Target().Short()
	}
	if wt, err := repo.Worktree(); err == nil {
		if status, err := wt.Status(); err == nil {
			for p, s := range status {
				st.Changes = append(st.Changes, fmt.Sprintf("%c%c %s", s.Staging, s.Worktree, p))
			}
			sort.Strings(st.Changes)
		}
	}
	if iter, err := repo.Log(&git.LogOptions{}); err == nil {
		for i := 0; i < 10; i++ {
			c, err := iter.Next()
			if err != nil {
				break
			}
			st.Log = append(st.Log, fmt.Sprintf("%s %s %s", c.Hash.String()[:7], c.Author.When.Format("2006-01-02"), firstLine(c.Message)))
		}
	}
	return st
}

func firstLine(s string) string {
	s, _, _ = strings.Cut(strings.TrimSpace(s), "\n")
	return s
}

// safeRel turns a slash path into one that stays inside dir.
func safeRel(p string) (string, error) {
	clean := path.Clean(p)
	if clean == "." || path.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, "../") || strings.HasPrefix(clean, ".git/") || clean == ".git" {
		return "", fmt.Errorf("invalid path %q", p)
	}
	return filepath.FromSlash(clean), nil
}

// Write stores files under dir and removes the managed (.sql/.json) files
// under each of roots that are not among them. Anything else, the .git
// directory included, is left alone.
func Write(dir string, roots []string, files []File) error {
	keep := map[string]bool{}
	for _, f := range files {
		rel, err := safeRel(f.Path)
		if err != nil {
			return err
		}
		full := filepath.Join(dir, rel)
		keep[full] = true
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			return err
		}
		if existing, err := os.ReadFile(full); err == nil && string(existing) == f.Text {
			continue
		}
		if err := os.WriteFile(full, []byte(f.Text), 0o644); err != nil {
			return err
		}
	}
	for _, root := range roots {
		rel, err := safeRel(root)
		if err != nil {
			return err
		}
		start := filepath.Join(dir, rel)
		if _, err := os.Stat(start); err != nil {
			continue
		}
		err = filepath.WalkDir(start, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.Type().IsRegular() && managedExts[strings.ToLower(filepath.Ext(p))] && !keep[p] {
				return os.Remove(p)
			}
			return nil
		})
		if err != nil {
			return err
		}
	}
	return nil
}

// Read returns the managed files under each of roots (symlinks and files over
// MaxFileBytes are skipped), sorted by path.
func Read(dir string, roots []string) ([]File, error) {
	var out []File
	for _, root := range roots {
		rel, err := safeRel(root)
		if err != nil {
			return nil, err
		}
		start := filepath.Join(dir, rel)
		if _, err := os.Stat(start); err != nil {
			continue
		}
		err = filepath.WalkDir(start, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if !d.Type().IsRegular() || !managedExts[strings.ToLower(filepath.Ext(p))] {
				return nil
			}
			if info, err := d.Info(); err != nil || info.Size() > MaxFileBytes {
				return nil
			}
			data, err := os.ReadFile(p)
			if err != nil {
				return nil
			}
			r, _ := filepath.Rel(dir, p)
			out = append(out, File{Path: filepath.ToSlash(r), Text: string(data)})
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out, nil
}

// NothingToCommit is Commit's result when the files did not change.
const NothingToCommit = "nothing to commit"

// Commit writes files (see Write), stages everything and commits it. The
// result is "<short hash> <message>", or NothingToCommit.
func Commit(dir string, roots []string, files []File, message string) (string, error) {
	repo, err := open(dir)
	if err != nil {
		// Committing into a folder the user chose is a clear enough request to
		// make it a repository -- unless it already belongs to another one,
		// where a second, nested repository would be a surprise.
		if outer, ok := OuterRepo(dir); ok {
			return "", fmt.Errorf("the folder is inside another git repository (%s): choose that repository's root or a folder outside it", outer)
		}
		if err := Init(dir); err != nil {
			return "", err
		}
		if repo, err = open(dir); err != nil {
			return "", err
		}
	}
	if err := Write(dir, roots, files); err != nil {
		return "", err
	}
	wt, err := repo.Worktree()
	if err != nil {
		return "", err
	}
	if err := wt.AddWithOptions(&git.AddOptions{All: true}); err != nil {
		return "", err
	}
	status, err := wt.Status()
	if err != nil {
		return "", err
	}
	if status.IsClean() {
		return NothingToCommit, nil
	}
	message = strings.TrimSpace(message)
	if message == "" {
		message = "Update OmniDB definitions"
	}
	hash, err := wt.Commit(message, &git.CommitOptions{Author: signature(repo)})
	if err != nil {
		return "", err
	}
	return hash.String()[:7] + " " + firstLine(message), nil
}

// signature is the configured author, or a generic one when git has no
// identity configured (always the case in the sandboxed app).
func signature(repo *git.Repository) *object.Signature {
	name, email := "OmniDB", "omnidb@localhost"
	if cfg, err := repo.ConfigScoped(config.GlobalScope); err == nil && cfg.User.Name != "" {
		name, email = cfg.User.Name, cfg.User.Email
	}
	return &object.Signature{Name: name, Email: email, When: time.Now()}
}
