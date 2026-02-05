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
    # Check if branch is already merged
    if git branch --merged | grep -q "$branch"; then
        echo "Branch $branch is already merged"
    else
        echo "Merging $branch..."
        # Use the latest version in case of conflicts (theirs strategy)
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
