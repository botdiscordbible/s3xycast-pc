// S3XYCast edition, 2026-11-14: the owner secret read from a file
// (MW_RDV_OWNER_SECRET_FILE). See ownerSecret in main.go.
package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const fileSecret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func writeSecret(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestSecretFileIsReadWithoutWhatSurroundsIt(t *testing.T) {
	for name, content := range map[string]string{
		"bare":            fileSecret,
		"unix line":       fileSecret + "\n",
		"windows line":    fileSecret + "\r\n",
		"spaces":          "  " + fileSecret + " \t\n",
		"byte order mark": "\xef\xbb\xbf" + fileSecret + "\r\n",
	} {
		got, err := readSecretFile(writeSecret(t, content))
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if string(got) != fileSecret {
			t.Fatalf("%s: read %q, want the secret alone", name, got)
		}
	}
}

func TestSecretFileCutShortIsRefused(t *testing.T) {
	// A copy that lost its end, or an empty file, must not become the key.
	for _, content := range []string{"", "\r\n", fileSecret[:minSecretFileBytes-1]} {
		if got, err := readSecretFile(writeSecret(t, content)); err == nil {
			t.Fatalf("a %d-byte file gave the secret %q", len(content), got)
		}
	}
	if _, err := readSecretFile(writeSecret(t, fileSecret[:minSecretFileBytes])); err != nil {
		t.Fatalf("the shortest secret allowed was refused: %v", err)
	}
}

func TestSecretFileMissingIsAnErrorThatNamesIt(t *testing.T) {
	path := filepath.Join(t.TempDir(), "absent.txt")
	_, err := readSecretFile(path)
	if err == nil || !strings.Contains(err.Error(), "absent.txt") {
		t.Fatalf("want an error naming the file, got %v", err)
	}
}

func TestOwnerSecretComesFromTheFileWhenTheVariableIsEmpty(t *testing.T) {
	t.Setenv("MW_RDV_OWNER_SECRET", "")
	t.Setenv("MW_RDV_OWNER_SECRET_FILE", writeSecret(t, fileSecret+"\r\n"))
	if got := string(ownerSecret()); got != fileSecret {
		t.Fatalf("read %q from the file, want the secret", got)
	}
}

func TestOwnerSecretVariableWinsOverTheFile(t *testing.T) {
	// A deployment that already sets the variable is not changed by a file
	// appearing beside it: the claims it holds were signed with that key.
	t.Setenv("MW_RDV_OWNER_SECRET", "the-variable")
	t.Setenv("MW_RDV_OWNER_SECRET_FILE", writeSecret(t, fileSecret))
	if got := string(ownerSecret()); got != "the-variable" {
		t.Fatalf("read %q, want the variable's value", got)
	}
}

func TestClaimsOutliveARestartWithTheSecretInAFile(t *testing.T) {
	// The file gives the same key twice, so an identifier claimed before a
	// restart still belongs to its owner after it.
	t.Setenv("MW_RDV_OWNER_SECRET", "")
	t.Setenv("MW_RDV_OWNER_SECRET_FILE", writeSecret(t, fileSecret))
	store := filepath.Join(t.TempDir(), "rendezvous.json")
	first, err := newClaimStore(store, ownerSecret())
	if err != nil {
		t.Fatal(err)
	}
	second, err := newClaimStore(store, ownerSecret())
	if err != nil {
		t.Fatal(err)
	}
	if first.count() != 0 || second.count() != 0 {
		t.Fatalf("a new store holds %d then %d claims", first.count(), second.count())
	}
}
