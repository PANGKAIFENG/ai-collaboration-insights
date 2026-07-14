# Security Policy

## Supported Versions

There is no released version yet. Security fixes will target the main branch until the first release.

## Reporting a Vulnerability

Do not open a public issue for vulnerabilities involving credential exposure, local file access, log parsing, model API transmission, or report data leakage.

Use GitHub private vulnerability reporting for this repository. Include:

- Affected component and version or commit.
- Reproduction steps.
- Expected and observed behavior.
- Potential impact.
- Suggested mitigation, if known.

Do not include real user logs, credentials, or private project content in the report.

## Security Boundaries

- Source AI logs are read-only.
- API keys must not be stored in report data or exported artifacts.
- Standard analysis minimizes content before transmission.
- Deep analysis requires explicit per-run confirmation.
- V1 does not include product telemetry or a central upload service.
