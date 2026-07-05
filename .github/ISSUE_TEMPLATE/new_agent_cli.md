---
name: Add support for another agent CLI
about: Request or contribute support for a new agent CLI transcript format
title: "[NEW AGENT] Add support for <AgentName>"
labels: enhancement, new-agent
assignees: ""
---

## Which agent CLI?

Name and link: [e.g. Codex CLI — https://github.com/openai/codex]

## Transcript format

Where does this agent store its session transcripts?

- **Path**: e.g. `~/.codex/sessions/*.jsonl`
- **Format**: JSONL / JSON / SQLite / other

Paste an **example transcript snippet** (redact any secrets/API keys):

```json

```

## Fields available

List the fields that are present in the transcript that map to agentburn concepts:

| agentburn concept | Field name in this format |
|---|---|
| input tokens | e.g. `usage.prompt_tokens` |
| output tokens | e.g. `usage.completion_tokens` |
| cache tokens | N/A |
| tool name | e.g. `tool.name` |
| tool input/path | e.g. `tool.arguments.path` |
| timestamp | e.g. `created_at` |

## Are you willing to submit a PR?

- [ ] Yes, I can implement this
- [ ] I can provide test fixtures (sample JSONL files) but need help with the implementation
- [ ] I just want to request it

## Additional context

Any other information that would help implement support.
