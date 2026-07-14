# Development Workflow

## Delivery Sequence

1. Product exploration and confirmed decisions.
2. PRD and editable diagrams.
3. PRD readiness review.
4. Vertical-slice issue draft, approval, and publication.
5. Technical feasibility spikes and evaluation design.
6. Architecture decision records.
7. Approved phase roadmap, followed by an issue-level implementation plan after that Issue's blockers resolve.
8. Test-driven development on issue branches.
9. Pull request review and required checks.
10. Release notes, tagged release, and installation verification.

## Branch Model

- main: protected, reviewable, and release-ready.
- feature/<issue>-<slug>: user-visible vertical slice.
- fix/<issue>-<slug>: defect correction.
- spike/<issue>-<slug>: time-boxed technical evidence.
- docs/<issue>-<slug>: documentation-only change.

Long-lived develop branches are intentionally avoided. Integration happens through small pull requests into main.

The V1 phase sequence is maintained in `/plans/ai-collaboration-insights-v1.md`. GitHub Issues own live execution state; the roadmap is updated only when sequencing or durable dependencies change.

## Issue Types

- AFK: sufficiently specified for an agent or contributor to execute and verify independently.
- HITL: requires a human decision, review, credential, platform permission, or product judgment.

Issues should deliver vertical slices. Do not split work into isolated frontend, backend, test, or documentation tickets unless the artifact is independently valuable.

## Definition of Done

An implementation issue is done when:

- Acceptance criteria pass.
- Automated tests and relevant evaluation cases pass.
- Privacy and failure behavior are verified.
- User-visible states are demonstrable.
- Documentation is updated.
- The pull request links verification evidence.

## Releases

- Use semantic versioning after the first installable release.
- Publish release notes with supported log versions and known limitations.
- Verify installation, scheduler behavior, data-source detection, and report generation on a clean macOS environment.
