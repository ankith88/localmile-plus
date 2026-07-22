---
description: Safe Checkout and Stash Resumption Macro
---

This workflow stashes active changes, switches context back to a specified development branch, and automatically restores previously stashed edits.

## Parameters
- **Target Branch Name:** {{args.[0]}} (Fail validation if this argument is empty)

## Automated Actions Sequence
1. **Preserve Current Context Flag:**
   Before leaving the current workspace view, safely tuck away any draft edits out of the way so the checkout transition isn't blocked by conflicting unstaged files:
   ```bash
   git stash save "temp_auto_stash_before_switch"
   ```
