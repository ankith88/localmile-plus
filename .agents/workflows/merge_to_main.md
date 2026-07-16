---
description: # Antigravity Workflow: Merge to Main and Close Issue
---

Act as Git Release Manager. Perform the following Git workflow steps sequentially:
1. Identify the active development branch name (e.g., using `git branch --show-current`).
2. Stash any uncommitted local changes using `git stash` to ensure a clean working directory.
3. Check out the `main` branch using `git checkout main`.
4. Pull the latest updates from the remote repository using `git pull origin main`.
5. Merge the active development branch into `main` using `--no-ff` and a commit message that references the issue to trigger the GitHub closing hook:
   `git merge <development-branch> --no-ff -m "Merge branch '<development-branch>' (closes #{{args.[0]}})"`
6. Push the merged `main` branch to GitHub using `git push origin main`.
7. Delete the local development branch using `git branch -d <development-branch>`.
8. Ensure the local environment is cleanly left on the `main` branch.
