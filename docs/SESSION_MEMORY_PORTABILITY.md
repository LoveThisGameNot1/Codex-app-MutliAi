# Session And Memory Portability

CodexApp can export saved sessions and project memory into a single JSON continuity backup.

## Export

Use `Memory -> Continuity Backup -> Export JSON`.

The exported file contains:

- saved session payloads
- current workspace instructions
- current workspace project memory
- export metadata such as app version, source workspace root, and timestamp

API keys, provider secrets, package caches, temporary task clones, and build artifacts are not included.

## Import

Use `Memory -> Continuity Backup -> Import Merge` or `Import Replace`.

`Import Merge` preserves local data:

- newer imported sessions are added or update older matching sessions
- older duplicate sessions are skipped
- imported memory entries are added or update older matching entries
- imported instructions are appended below existing instructions instead of overwriting them

`Import Replace` is destructive for local continuity data:

- saved sessions are replaced by the imported sessions
- current workspace instructions are replaced
- current workspace memory entries are replaced

## Workspace Mapping

Memory entries are always remapped to the currently open workspace during import. This makes a backup portable across machines, paths, and cloned repositories.

## Format

Continuity backups use `format: "codexapp-continuity-export"` and `version: 1`. Invalid or unrelated JSON files are rejected before any local data is changed.
