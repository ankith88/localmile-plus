---
description: Sequential Batch Branch Merge to Main
---

This workflow automates the collection of multiple feature and bugfix branches, merging them sequentially into the main production line before pushing up to GitHub.

## Parameters
- **Branch List Array String:** {{args.[0]}} (Fail if empty or missing arguments)

## Automated Actions Sequence
1. **Enforce Main Branch Baseline Target:**
   Ensure the local repository is sitting on a fully updated main context line:
   ```bash
   git stash
   git checkout main
   git pull origin main
   ```
