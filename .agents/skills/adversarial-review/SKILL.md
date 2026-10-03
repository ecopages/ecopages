---
name: adversarial-review
description: A second review of a finished change by a different agent harness and model (Claude Code, Codex, Cursor or OpenCode, set in the project's .env, or your own harness on another model when none is set), read-only, after your own review. At most two rounds, one to find real defects and one to check the fixes. Use for an adversarial review, a review by another model or agent, a cross-model second opinion on a diff, or as final-review's last step.
allowed-tools: Bash(node --experimental-strip-types *run-review.mts *)
---

# Adversarial review

A different harness and model reviews the change after you have reviewed it yourself. It catches what the authoring model is blind to. It is a pragmatic second opinion, not an opponent: a clean result is a good result, and the reviewer is told it does not have to find anything. The reviewer follows [references/brief.md](references/brief.md).

## Configure

Add the harness and model to the `.env` file at the repository root, or set them in the environment. Pick a model from a different family than the one that wrote the change: that difference is the point of the review. When nothing is set, the review still runs, on your own harness with another model (see Run).

- `ADVERSARIAL_REVIEW_MODEL` is required once the harness is set. Reviews never run on a fast variant: the script refuses an id containing `fast`, and switches off Claude Code's fast mode, which is a setting rather than an id, so Claude Code's aliases such as `opus` and `sonnet` are safe. In the other harnesses, use an exact id rather than a bare alias, since a bare alias can map to a fast variant. In Cursor, `grok-4.7` means the account's current default, such as `grok-4.7-high-fast`.
- `ADVERSARIAL_REVIEW_API_KEY` is optional. It is an API key for the reviewer's harness, used instead of that CLI's login. The script passes it as `CURSOR_API_KEY`, `ANTHROPIC_API_KEY` or `CODEX_API_KEY`, so the key the coding agent runs on is left alone. OpenCode keeps a key per provider; log in with `opencode auth login` instead.

Claude Code takes an alias or a full model id:

```sh
ADVERSARIAL_REVIEW_HARNESS=claude
# or: fable, sonnet, claude-opus-5-5, claude-sonnet-5-5, claude-fable-5-1
ADVERSARIAL_REVIEW_MODEL=opus
```

Codex:

```sh
ADVERSARIAL_REVIEW_HARNESS=codex
# or: gpt-6-astra, gpt-6-luna
ADVERSARIAL_REVIEW_MODEL=gpt-6.1-sol
```

Cursor names the reasoning effort in the id, and pairs most ids with a `-fast` twin:

```sh
ADVERSARIAL_REVIEW_HARNESS=cursor
# or: grok-4.7-high, grok-4.6-high, composer-2.5, gemini-3.8-flash, kimi-k3, glm-5.3
ADVERSARIAL_REVIEW_MODEL=grok-4.7-high
ADVERSARIAL_REVIEW_API_KEY=key_...
```

OpenCode takes `provider/model`:

```sh
ADVERSARIAL_REVIEW_HARNESS=opencode
# or: opencode-go/grok-4.7, opencode-go/glm-5.3, opencode-go/deepseek-v4-pro, github-copilot/gpt-6.1-sol
ADVERSARIAL_REVIEW_MODEL=opencode-go/kimi-k3
```

Model ids change often, and each account sees its own list. Check the current ids with the command in the last column below.

The harness CLI must be installed and logged in. Each one runs headless and read-only:

| Harness    | Command           | Read-only through                                             | Current model ids                                |
| ---------- | ----------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| `claude`   | `claude -p`       | `--permission-mode dontAsk`, only Read, Grep and Glob allowed | `claude --help`, under `--model`                 |
| `codex`    | `codex exec`      | `--sandbox read-only`                                         | the model picker in `codex`, or the Codex docs   |
| `cursor`   | `cursor-agent -p` | `--mode ask`                                                  | `cursor-agent --list-models`                     |
| `opencode` | `opencode run`    | `--agent plan`                                                | `opencode models`                                |

## Run

```sh
node --experimental-strip-types <this skill's folder>/scripts/run-review.mts --base <ref> --notes <file> [--round 1|2]
```

The coding agent runs this itself; the user never has to. Run it from inside the repository, in the background: a review takes minutes. `<ref>` is the base the change targets, such as `origin/<integration branch>`, or, for a stacked PR, the branch below it. The script sends the brief, the round, your notes, the diff from the merge base to the working tree, and the paths of untracked files, then prints the reviewer's findings.

- Exit code 2 means no harness is configured. Run it again on your own harness, adding `--harness <claude|codex|cursor|opencode> --model <id>`, with a model you pick this way:
  - not the one you are running on, and from a different family when your harness offers one;
  - not the harness's most expensive frontier model, such as Fable in Claude Code or Astra in Codex. In Claude Code, Opus and Sonnet review each other: on Opus, pass `--harness claude --model sonnet`. In Codex, Sol and Luna do;
  - never a fast variant, and an exact id outside Claude Code, as in Configure.

  These rules are only for a model you pick. When `.env` sets the harness, use it as set, whatever the model's tier. `ADVERSARIAL_REVIEW_API_KEY` is not used here. Skip the review, and say so in one line, only when your harness is none of these four.
- Invoke this skill by name rather than only reading this file. Its `allowed-tools` pre-approves the command above, so a harness that blocks one agent from starting another lets it run. A harness that ignores `allowed-tools` needs the same rule in its own settings.
- A change too large for one prompt fails with a message. Review it in parts with a nearer `--base`.

## Rounds

There are at most two rounds per change. The script refuses a third.

1. **Review it yourself first**, with [final-review](../final-review/SKILL.md) or the project's own gate. The checks must be green.
2. **Round 1.** Write notes to a scratch file outside the repository: what your review found, what you fixed, and what you deliberately left, with a reason for each. The reviewer treats those points as settled. Run `--round 1`.
3. **Show the review.** As soon as the script returns, show the user the reviewer's output in full, unedited, before acting on it. Show every round, including one that finds nothing.
4. **Verify each finding** against the code: reproduce the scenario or trace it through. The other model is a reviewer, not an authority. Fix the findings that hold and are `easy`, then run the checks again. Reject the ones that do not hold, with a one-line reason.
5. **Round 2, only if round 1 led to a code change.** Write new notes that list each round 1 finding with what you did: fixed at `file:line`, or rejected and why. Run `--round 2`. The reviewer checks only those fixes and what they touch. It does not look for new issues.
6. **Stop.** Do not ask again because you disagree with a result or because round 2 raised something. Verify what round 2 reports, fix what is `easy` and holds, and list the rest as open findings for the user to decide.
