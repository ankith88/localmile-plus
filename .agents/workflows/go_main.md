---
description: Safe Checkout to Main Branch
---

This workflow stashes any uncommitted feature edits and safely switches the active branch back to main.

## Parameters
- None

## Automated Actions Sequence
1. **Safety Stash Intercept:**
   Execute a workspace stash save so that any local changes on the current active feature or bugfix branch are safely stored away rather than breaking checkout checks:
   ```bash
   git stash
   ```
