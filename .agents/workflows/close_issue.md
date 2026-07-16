---
description: # Antigravity Workflow: Stage, Commit, and Push with Issue Closer
---

Act as Git Automator. Perform the following Git workflow steps sequentially:
1. Stage all modified and untracked changes in the repository using `git add -A`.
2. Commit the staged changes cleanly with a message that combines the custom description and references the issue to close it:
   `git commit -m "{{args.[1]}} (closes #{{args.[0]}})"`
3. Identify the active development branch name (e.g., using `git branch --show-current`).
4. Push the active local branch to the remote repository using `git push origin <current-branch>`.
