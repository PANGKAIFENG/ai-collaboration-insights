# Contributing

AI Collaboration Insights is currently in product definition and technical validation.

## Before Starting

1. Check existing issues and discussions.
2. Confirm the task is not blocked by an unresolved product or architecture decision.
3. Comment on the issue before starting substantial work.

## Branches

- feature/<issue>-<slug>
- fix/<issue>-<slug>
- docs/<issue>-<slug>
- spike/<issue>-<slug>

The main branch is release-ready. Changes reach main through pull requests.

## Pull Requests

- Reference the issue.
- Explain the user-visible behavior delivered.
- Include tests or verification evidence.
- Describe privacy impact and data handling changes.
- Keep unrelated refactors out of the pull request.

## Test Data

Only synthetic or irreversibly redacted fixtures are allowed. Never commit:

- Real prompts, responses, or tool outputs.
- Local project paths or repository names.
- API keys, tokens, cookies, or model service credentials.
- Generated personal reports or local databases.

## Commit Style

Use Conventional Commits where practical:

- feat: new user-visible capability
- fix: bug fix
- docs: documentation only
- test: tests or evaluation fixtures
- refactor: internal behavior-preserving change
- chore: repository maintenance
