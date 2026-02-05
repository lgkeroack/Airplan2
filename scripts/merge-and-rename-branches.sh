#!/bin/bash
# Script to merge all branches and rename main to Prime
# This script should be run with appropriate Git credentials

set -e  # Exit on error

echo "=== Branch Merge and Rename Script ==="
echo ""

# Navigate to repository root
cd "$(git rev-parse --show-toplevel)"

echo "Current branches:"
git branch -a
echo ""

# Fetch all branches
echo "Fetching all branches..."
git fetch --all
echo ""

# Checkout main branch
echo "Checking out main branch..."
git checkout main
git pull origin main
echo ""

# Merge all feature branches (if not already merged)
echo "Checking which branches need to be merged..."

# Get list of all remote branches except main
branches=$(git branch -r | grep -v 'HEAD' | grep -v 'main' | sed 's/origin\///' | tr '\n' ' ')

for branch in $branches; do
    # Check if branch is already merged into main
    # Note: We exclude 'main' from the merge loop to avoid self-merging.
    # After rename, this ensures we're only merging feature branches.
    if git merge-base --is-ancestor "origin/$branch" HEAD; then
        echo "Branch $branch is already merged"
    else
        echo "Merging $branch..."
        # WARNING: Using '-X theirs' strategy will automatically accept all incoming changes
        # in case of conflicts, prioritizing the latest updates per requirements.
        # This means any conflicts will be resolved by taking the changes from the branch
        # being merged, not the current branch. Review carefully if you have uncommitted work.
        git merge "origin/$branch" -X theirs -m "Merge branch '$branch' (prioritizing latest updates)"
    fi
done
echo ""

# Rename main to Prime
echo "Renaming main branch to Prime..."
git branch -m main Prime
echo ""

# Push Prime branch
echo "Pushing Prime branch to remote..."
git push -u origin Prime
echo ""

# Delete old branches from remote
echo "Deleting old branches from remote..."
for branch in $branches; do
    echo "Deleting remote branch $branch..."
    git push origin --delete "$branch" || echo "Could not delete $branch (may already be deleted)"
done

# Delete main branch from remote
echo "Deleting remote main branch..."
git push origin --delete main || echo "Could not delete main (may need to change default branch first)"
echo ""

echo "=== Important Next Steps ==="
echo "1. Go to GitHub repository Settings → Branches"
echo "2. Change the default branch from 'main' to 'Prime'"
echo "3. After changing default branch, run: git push origin --delete main"
echo ""
echo "Local repository is now on the 'Prime' branch with all changes merged."
