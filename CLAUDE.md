# Contributor instructions

Read and follow [AGENTS.md](AGENTS.md). It is the single source of repository
instructions for all automated contributors, including Claude.

Implement real engine behavior, not decorative text or stubs. Preserve existing
behavior and report limitations honestly. Do not run battle or map simulations,
stress/soak suites, or tests unless the user explicitly asks. Run only the
requested scope; follow the verification restrictions in AGENTS.md.

Keep completed-feature notes and changelogs out of agent instruction files.
