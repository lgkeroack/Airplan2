# Branch Consolidation Plan

## Overview

This document outlines the completed analysis and provides a script to consolidate all branches in the lgkeroack/Airplan2 repository.

## Current Branch Status

### Branches Identified:
1. **main** (default branch)
   - Latest commit: Feb 5, 2026, 00:41:56
   - Status: Contains most recent merged work
   
2. **claude/fix-thermal-mobile-controls-zEdEt**
   - Latest commit: Feb 5, 2026, 06:40:55
   - Status: Already merged into main via PR #13
   
3. **copilot/merge-all-branches-and-cleanup**
   - Latest commit: Feb 5, 2026, 20:37:42
   - Status: One commit ahead of main ("Initial plan")

## Analysis

All feature branches have been either:
- Merged into main (claude branch via PR #13)
- Are minimal commits ahead of main (copilot branch with just initial plan)

The repository is in good shape with:
- No unmerged work that could be lost
- Clear commit history
- No actual merge conflicts

## Consolidation Steps

### Option 1: Automated Script

Run the provided script with Git credentials:

```bash
cd /path/to/Airplan2
./scripts/merge-and-rename-branches.sh
```

This script will:
1. Fetch all branches
2. Merge any unmerged branches into main (prioritizing latest updates)
3. Rename main to Prime
4. Push Prime branch
5. Delete old branches
6. Provide instructions for changing the default branch on GitHub

### Option 2: Manual Steps

If you prefer to do it manually:

```bash
# 1. Ensure you have all branches
git fetch --all

# 2. Checkout and update main
git checkout main
git pull origin main

# 3. Merge any remaining branches (using 'theirs' strategy for conflicts)
git merge origin/copilot/merge-all-branches-and-cleanup -X theirs --no-edit

# 4. Rename main to Prime
git branch -m main Prime

# 5. Push Prime branch
git push -u origin Prime

# 6. Change default branch on GitHub
# Go to Settings → Branches → Change default branch to 'Prime'

# 7. Delete old branches (after changing default branch)
git push origin --delete main
git push origin --delete copilot/merge-all-branches-and-cleanup
git push origin --delete claude/fix-thermal-mobile-controls-zEdEt
```

## Important Notes

1. **Default Branch**: After pushing Prime, you MUST change the default branch on GitHub to "Prime" before deleting the main branch.
   
2. **Merge Strategy**: The script uses the `-X theirs` strategy, which prioritizes the incoming changes in case of conflicts. This aligns with the requirement to "give priority to the latest update when conflicts arise."

3. **Backup**: Consider creating a backup or tag of the current state before proceeding:
   ```bash
   git tag backup-before-consolidation
   git push origin backup-before-consolidation
   ```

4. **Protected Branches**: If 'main' is a protected branch on GitHub, you'll need to adjust branch protection rules before deleting it.

## Post-Consolidation

After completing these steps:
- Prime will be the single source of truth
- All historical commits are preserved
- Old feature branches will be removed
- The repository will have a cleaner branch structure

## Verification

To verify the consolidation was successful:

```bash
# Check current branch
git branch

# Should show: * Prime

# Check remote branches
git branch -r

# Should only show: origin/Prime (and possibly origin/HEAD)

# Verify all commits are present
git log --oneline --graph --all -20
```

## Questions or Issues?

If you encounter any problems during the consolidation:
1. Check that you have push access to the repository
2. Verify that no branch protection rules are blocking the changes
3. Ensure no one else is actively pushing to these branches during the consolidation
