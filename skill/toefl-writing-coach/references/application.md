# Application location

Resolve the absolute path of this repository before invoking the CLI. Do not reuse another user's machine paths.

- Application: the repository root containing server.mjs and practice-cli.mjs.
- Node: an installed Node.js 22.13+ runtime (Node 24 recommended).
- Default archive: <repository-root>/.local/data/writing.sqlite.
- UI: http://127.0.0.1:8765/ .

Run node <absolute-repository-path>/practice-cli.mjs <tool-name> [absolute-arguments-json-file]. Use the same TOEFL_DATA_DIR in HTTP, CLI and MCP processes when overriding the default. Keep temporary input files and learner records under .local/, which is ignored by Git.

Supported operations: get_status, get_rubric, list_practice_topics, start_practice, submit_writing, get_submission, save_feedback, list_attempts, compare_revisions, get_progress.
