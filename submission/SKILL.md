# StandupMesh — SKILL.md

> Agent instructions for the **Intercom Vibe Competition** submission.
> This file describes how StandupMesh operates, what it can do, and how other Intercom agents can interact with it.

---

## What is StandupMesh?

**StandupMesh** is a decentralized, serverless daily standup bot built on **Hyperswarm** P2P networking.

It allows any number of team members — each running a Node.js instance on any machine, including Android via Termux — to:

1. **Submit** their daily standup update (yesterday / today / blocker)
2. **Receive** other peers' updates in real-time
3. **View** an aggregated team summary at any time
4. **Export** the summary to a local log file

There is no central server, no database, no authentication, and no cloud dependency. All data is ephemeral and lives only in connected peers' memory for the duration of the session.

---

## Runtime Requirements

| Requirement | Version |
|---|---|
| Node.js | ≥ 18.0.0 |
| npm | ≥ 8.0.0 |
| OS | Linux, macOS, Windows, Android (Termux) |

---

## Setup

```bash
# 1. Clone the repository
git clone https://github.com/[YOUR_GITHUB_USERNAME]/standupmesh
cd standupmesh

# 2. Install dependencies
npm install

# 3. Run
node index.js
```

---

## CLI Flags

| Flag | Default | Description |
|---|---|---|
| `--name "Alice"` | `Peer-XXXX` | Your display name in the standup |
| `--mode listen` | `interactive` | Receive-only mode, no prompts |
| `--topic <hex64>` | derived | Join a specific team's topic key |
| `--reminder 09:00` | none | Schedule a daily standup reminder |
| `--export` | false | Auto-export summary to `standup.log` on each received update |

---

## Interactive Commands

Once running, type these commands at the prompt:

| Command | Description |
|---|---|
| `/standup` | Start guided standup input (3 fields) |
| `/summary` | Print today's aggregated team summary |
| `/peers` | Show number of live P2P connections |
| `/export` | Export today's summary to `standup.log` |
| `/topic` | Display the topic key to share with teammates |
| `/clear` | Clear the terminal |
| `/help` | Show all commands |
| `/quit` | Disconnect and exit |

---

## Message Protocol

StandupMesh uses a lightweight JSON protocol over raw Hyperswarm connections.

### Standup Message

```json
{
  "v": 1,
  "type": "standup",
  "name": "Alice",
  "yesterday": "Reviewed PR #42, fixed login bug",
  "today": "Implement caching layer for API responses",
  "blocker": "Waiting for design review on modal component",
  "ts": 1718000000000
}
```

### Ping / Pong (presence detection)

```json
{ "v": 1, "type": "ping", "name": "Alice", "ts": 1718000000000 }
{ "v": 1, "type": "pong", "name": "Alice", "ts": 1718000000001 }
```

---

## How Other Intercom Agents Can Interact

### Joining the default topic

Any Intercom-compatible agent can connect to the StandupMesh default topic by hashing the seed:

```js
const crypto  = require('hypercore-crypto');
const b4a     = require('b4a');
const seed    = b4a.from('standupmesh-intercom-vibe-2025');
const topic   = crypto.hash(seed); // 32-byte Buffer
```

Join this topic in Hyperswarm with `{ server: true, client: true }`.

### Sending a standup from another agent

Write a JSON-encoded standup message (see protocol above) to any open connection on the topic. StandupMesh instances will parse it, display it, and store it in their local summary.

### Receiving standups in another agent

Listen for `data` events on connections joined to the same topic. Parse JSON, check `msg.type === 'standup'`, and handle the `name`, `yesterday`, `today`, `blocker`, and `ts` fields.

### Requesting a summary

There is no server-side summary endpoint. Each peer maintains its own aggregated store locally. If you need a summary, subscribe to the topic and accumulate incoming `standup` messages for the session.

---

## Privacy & Data Model

- All messages are **ephemeral** — nothing is written to disk unless `--export` is used.
- No personal data is stored on any server.
- The topic key acts as the "room" — only peers who know the key can join.
- Display names are self-assigned and not verified.

---

## Trac Address

```
[INSERT_YOUR_TRAC_ADDRESS_HERE]
```

---

## License

MIT
