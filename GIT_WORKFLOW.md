# Git Workflow Guide

## 🚨 STOP BEFORE YOU COMMIT 🚨

### Pre-commit Checklist
- [ ] Am I on a feature branch? (NOT main)
- [ ] Are all files production-ready?
- [ ] Have I removed all test/experimental files?
- [ ] Is my commit message descriptive?
- [ ] Did I run the app to verify changes work?

## Branch Naming Convention

```bash
feature/description    # New features
bugfix/description     # Bug fixes
hotfix/description     # Urgent production fixes
release/version        # Release preparation
```

### Examples:
- `feature/add-privacy-policy`
- `bugfix/footer-spacing`
- `hotfix/security-patch`
- `release/v1.2.0`

## Workflow Rules

### 1. ALWAYS Create a Feature Branch
```bash
# WRONG - Working directly on main
git add .
git commit -m "stuff"

# CORRECT - Create feature branch first
git checkout -b feature/my-feature
git add .
git commit -m "feat: add specific feature"
```

### 2. Keep Experimental Work Separate
```bash
# Test files should NEVER be in main/feature branches
# Instead, create a separate experimental branch:
git checkout -b experimental/car-game-tests

# Or use .gitignore patterns:
test-*.html
*-experimental.js
```

### 3. One Feature Per Branch
```bash
# WRONG - Multiple unrelated changes
git checkout -b feature/everything
# adds privacy policy
# adds new game
# fixes footer
# updates styles

# CORRECT - Separate branches
git checkout -b feature/privacy-policy
# only privacy related changes

git checkout -b feature/car-game
# only game related changes
```

### 4. Clean Commits
```bash
# WRONG
git add .  # Adds EVERYTHING including test files

# CORRECT
git add privacy.html index.html styles.css  # Add specific files
git status  # Verify what's being committed
git commit -m "feat: add privacy policy page"
```

## Setup Instructions

### 1. Install Pre-commit Hooks
```bash
# Install pre-commit
pip install pre-commit

# Install hooks in this repo
pre-commit install

# Test hooks
pre-commit run --all-files
```

### 2. Configure Git
```bash
# Set commit message template
git config commit.template .gitmessage

# Set default branch name
git config init.defaultBranch main

# Require fast-forward only for main
git config branch.main.mergeoptions "--ff-only"
```

### 3. Set Up Branch Protection (GitHub)
1. Go to Settings → Branches
2. Add rule for `main`
3. Enable:
   - Require pull request reviews
   - Dismiss stale PR approvals
   - Require status checks (CI/CD)
   - Require branches to be up to date
   - Include administrators

## Common Scenarios

### Starting New Work
```bash
git checkout main
git pull origin main
git checkout -b feature/new-feature
# work on feature
git add specific-files.html
git commit -m "feat: descriptive message"
git push -u origin feature/new-feature
# Create PR on GitHub
```

### Fixing Accidental Commits
```bash
# If you committed to wrong branch
git reset --soft HEAD~1  # Undo last commit, keep changes
git stash               # Save changes
git checkout -b feature/proper-branch
git stash pop          # Restore changes
git add .
git commit -m "feat: proper message"
```

### Cleaning Up Test Files
```bash
# Remove untracked test files
git clean -fd --dry-run  # Preview what will be deleted
git clean -fd           # Actually delete

# Remove tracked test files
git rm test-*.html
git rm -r experimental/
git commit -m "chore: remove test files"
```

## Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, missing semicolons, etc
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

### Examples:
```bash
feat: add privacy policy page

- Create comprehensive privacy policy
- Add footer links to all pages
- Include SMS consent for Twilio

Closes #42
```

## Emergency Procedures

### Revert a Bad Merge
```bash
git revert -m 1 <merge-commit-hash>
git push origin main
```

### Fix Exposed Secrets
```bash
# Install git-filter-repo
pip install git-filter-repo

# Remove file from history
git filter-repo --path secrets.env --invert-paths

# Force push (coordinate with team!)
git push origin --force --all
```

## Tools & Aliases

### Useful Git Aliases
```bash
# Add to ~/.gitconfig
[alias]
    st = status
    co = checkout
    br = branch
    unstage = reset HEAD --
    last = log -1 HEAD
    visual = !gitk
    branches = branch -a
    undo = reset --soft HEAD~1
```

### VS Code Settings
```json
{
  "git.enableSmartCommit": false,
  "git.confirmSync": true,
  "git.requireGitUserConfig": true,
  "files.exclude": {
    "**/test-*.html": true,
    "**/experimental/**": true
  }
}
```

## Remember

1. **Feature branches** for everything
2. **Test locally** before committing
3. **Small, focused** commits
4. **Descriptive messages**
5. **No experiments** in production branches
6. **Review before merge**

When in doubt, create a new branch!