---
description: # Antigravity Workflow: Checkout New Branch
---

Act as Git Branch Manager. Perform the following Git workflow steps sequentially:
1. Stash any current uncommitted local changes using `git stash`.
2. Check out the production `main` branch using `git checkout main`.
3. Pull down the latest code from the remote repository using `git pull`.
4. Create and switch to a new branch named `{{args.[0]}}` using `git checkout -b {{args.[0]}}`.
