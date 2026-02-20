# intercom-standup 📋

> **Async P2P Daily Standup for Dev Teams**  
> Submission untuk **Intercom Vibe Competition** — Trac Network / Hyperswarm

[![Node ≥ 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Pear Runtime](https://img.shields.io/badge/pear-compatible-blue)](https://pears.com)
[![Termux Ready](https://img.shields.io/badge/termux-ready-orange)](https://termux.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)

---

## Apa Itu intercom-standup?

Gantikan meeting standup harian dengan sistem async P2P. Setiap anggota tim posting update kapan saja — semua peer menerima update real-time tanpa server, tanpa Slack, tanpa Notion.

```
budi (laptop)          siti (HP / Termux)       reza (desktop)
      │                       │                       │
      │── /standup ──────────>│── update masuk ──────>│
      │                       │                       │
      │<─ siti update ────────│                       │
      │<─ reza update ────────────────────────────────│
      │                                               │
      └──────── /digest ── ringkasan semua ───────────┘
                    Hyperswarm P2P · Noise encrypted
```

---

## Fitur

- **Wizard 4 langkah**: Did · Do · Blockers · Notes
- **Async**: post kapan saja, peer terima langsung
- **Daily digest**: semua update tim dalam satu tampilan
- **Auto-reminder**: notif setiap 4 jam jika belum standup
- **Export .md**: satu file Markdown per hari
- **Streak counter**: leaderboard berapa hari berturut-turut
- **Sync on connect**: peer baru langsung dapat data hari ini
- **Zero server**: murni P2P via Hyperswarm DHT

---

## Instalasi

```bash
git clone https://github.com/USERNAME/intercom-standup.git
cd intercom-standup
npm install
node index.js --alias namaKamu
```

### Termux (Android)

```bash
pkg update && pkg upgrade -y && pkg install nodejs git -y
git clone https://github.com/USERNAME/intercom-standup.git
cd intercom-standup && npm install
node index.js --alias namaKamu --channel nama-tim
```

---

## Cara Pakai

```bash
# Semua anggota tim join channel yang sama
node index.js --alias budi --channel dev-team

# Posting standup harian
> /standup

# Lihat semua update hari ini
> /digest

# Kirim reminder ke yang belum standup
> /remind

# Export ke Markdown
> /export

# Lihat streak leaderboard
> /streak
```

---

## Perintah Lengkap

| Perintah | Keterangan |
|---|---|
| `/standup` | Wizard standup 4 langkah |
| `/edit` | Edit standup hari ini |
| `/cancel` | Batalkan draft |
| `/digest [tgl]` | Digest hari ini atau tanggal tertentu |
| `/remind` | Kirim reminder ke semua peer |
| `/export [tgl]` | Export ke .md |
| `/streak` | Leaderboard streak |
| `/peers` | Peer terhubung |
| `/alias <nama>` | Ganti nama |
| `/help` | Menu lengkap |
| `/exit` | Keluar |

---

## File yang Dihasilkan

- `standup-log.json` — semua standup tersimpan lokal
- `standup-exports/standup-YYYY-MM-DD.md` — export Markdown per hari

---

## Lisensi

MIT — lihat [LICENSE](LICENSE)

---
## Trac Address

```
trac1a7kv8u4muy89pufmxyvv3m4hxjrzs2frara9yqp9fq02m3ez72eqj552cj
```


*Dibangun dengan ♥ untuk Intercom Vibe Competition — Trac Network*
