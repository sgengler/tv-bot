---
name: commit-deploy
description: Use when committing changes and deploying to the Raspberry Pi for this project.
trigger: /commit-deploy
---

# commit-deploy

Commit local changes, push to GitHub, and deploy to the Raspberry Pi at `housedashboard`.

## Pi Connection

```
Host: housedashboard
User: pi
Password: raspberry (from .env: SSH_PASSWORD)
sudo password: same (raspberry)
```

SSH requires password auth — always use `sshpass`:
```bash
sshpass -p raspberry ssh -o StrictHostKeyChecking=no pi@housedashboard "<command>"
```

`sudo` over SSH doesn't get a TTY — always pass password via stdin:
```bash
echo raspberry | sudo -S systemctl restart tv-bot
```

## Steps

### 1. Commit

```bash
git add <changed files>
git commit -m "$(cat <<'EOF'
<message>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
git push
```

### 2. Sync .env to Pi

The Pi's `.env` must have every variable that the local `.env` has. Missing vars are a common failure. Check and append any missing ones:

```bash
# For each KEY=VALUE in local .env, check if KEY exists on Pi and append if not
while IFS='=' read -r key _; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  sshpass -p raspberry ssh -o StrictHostKeyChecking=no pi@housedashboard \
    "grep -q '^${key}=' ~/tv-bot/.env || echo '${key}=<value>' >> ~/tv-bot/.env"
done < .env
```

Or more directly — read local .env and push any missing keys:
```bash
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  sshpass -p raspberry ssh -o StrictHostKeyChecking=no pi@housedashboard \
    "grep -q '^${key}=' ~/tv-bot/.env || echo '${key}=${value}' >> ~/tv-bot/.env"
done < .env
```

### 3. Pull, build, restart

```bash
sshpass -p raspberry ssh -o StrictHostKeyChecking=no pi@housedashboard \
  "cd ~/tv-bot && git pull && npm install && npm run build && echo raspberry | sudo -S systemctl restart tv-bot"
```

### 4. Verify

```bash
sshpass -p raspberry ssh -o StrictHostKeyChecking=no pi@housedashboard \
  "sudo systemctl status tv-bot --no-pager"
```

Service should show `active (running)`.

## Common Mistakes

| Problem | Fix |
|---|---|
| `Permission denied` on SSH | Use `sshpass -p raspberry` |
| `sudo: a terminal is required` | Use `echo raspberry | sudo -S` |
| API returns error after deploy | Check Pi `.env` has all vars — run step 2 |
| Build uses stale dist | `npm run build` is always required after `git pull` |
