#!/bin/bash
# Git Safety Setup Script

echo "🔒 Setting up Git safety measures..."

# Check if pre-commit is installed
if ! command -v pre-commit &> /dev/null; then
    echo "📦 Installing pre-commit..."
    pip install pre-commit
fi

# Install pre-commit hooks
echo "🪝 Installing pre-commit hooks..."
pre-commit install
pre-commit install --hook-type commit-msg

# Configure git
echo "⚙️ Configuring Git..."
git config commit.template .gitmessage
git config branch.main.mergeoptions "--ff-only"

# Create experimental branch for test files
echo "🧪 Creating experimental branch..."
git checkout -b experimental/playground 2>/dev/null || echo "Experimental branch already exists"
git checkout main

# Set up helpful aliases
echo "🚀 Setting up Git aliases..."
git config alias.unstage "reset HEAD --"
git config alias.last "log -1 HEAD"
git config alias.undo "reset --soft HEAD~1"
git config alias.branches "branch -a"
git config alias.visual "!gitk"

# Run pre-commit on all files to check
echo "✅ Testing pre-commit hooks..."
pre-commit run --all-files || true

echo "
✨ Git safety setup complete!

Next steps:
1. Review GIT_WORKFLOW.md for best practices
2. Set up branch protection on GitHub (see .github/branch-protection.md)
3. Move any test files to experimental branches
4. Always create feature branches for new work

Quick commands:
- Create feature branch: git checkout -b feature/name
- Check what will be committed: git status
- Run pre-commit checks: pre-commit run --all-files
"

# Check for existing test files
echo "🔍 Checking for test files that should be moved..."
find . -name "test-*.html" -o -name "test-*.js" -o -name "*.backup.js" -o -name "DEVELOPMENT_NOTES.md" 2>/dev/null | grep -v node_modules | head -10