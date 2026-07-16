---
description: # Antigravity Workflow: Version Control Manager Push Automation
---

# Workflow: Version Control Manager Push Automation

This workflow automates the standard sequence of staging, structuring a descriptive commit message based on code modifications, and pushing to the remote branch.

## Parameters
- None (This workflow dynamically computes commit scopes based on the active git diff status)

## Automated Actions Sequence
1. **Stage Active Workspace Modifications:**
   Execute a global stage tracking update across all created, modified, or deleted files:
   ```bash
   git add .
   ```

2. **Generate Commit Message and Commit:**
   Analyze the staged changes using `git diff --cached` to generate an intelligent, descriptive commit message representing the code modifications, and commit the staged changes:
   ```bash
   git commit -m "<commit_message>"
   ```

3. **Push to Remote Target:**
   Identify the active branch tracking target and push the committed modifications upstream to the remote repository:
   ```bash
   git push origin <branch_name>
   ```
