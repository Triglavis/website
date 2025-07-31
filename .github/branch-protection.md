# GitHub Branch Protection Setup

## Quick Setup Commands

```bash
# Using GitHub CLI (recommended)
gh auth login

# Set branch protection for main
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":[]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

## Manual Setup (GitHub Web UI)

1. Go to **Settings** → **Branches**
2. Click **Add rule**
3. Branch name pattern: `main`

### Enable These Settings:

#### ✅ Require a pull request before merging
- [x] Require approvals: **1**
- [x] Dismiss stale pull request approvals when new commits are pushed
- [x] Require review from CODEOWNERS
- [x] Require approval of the most recent reviewable push

#### ✅ Require status checks to pass before merging
- [x] Require branches to be up to date before merging
- Add status checks:
  - `pre-commit`
  - `build`
  - `test` (if applicable)

#### ✅ Require conversation resolution before merging

#### ✅ Require signed commits (optional but recommended)

#### ✅ Include administrators
- Even admins must follow the rules

#### ✅ Restrict who can push to matching branches
- Add specific users/teams if needed

#### ❌ Do NOT enable:
- Allow force pushes
- Allow deletions

## Additional Protections

### Tag Protection
```bash
# Protect version tags
gh api repos/:owner/:repo/tags/protection \
  --method POST \
  --field pattern='v*'
```

### Other Branch Patterns
Create rules for:
- `release/*` - More strict, require 2 reviewers
- `hotfix/*` - Allow admin override for emergencies
- `develop` - If using git-flow

## Automation Rules

### Auto-delete head branches
1. Settings → General
2. Check "Automatically delete head branches"

### Suggested Reviewers
1. Create `.github/CODEOWNERS` file:
```
# Global owners
* @username

# Frontend
*.js @frontend-team
*.css @frontend-team
*.html @frontend-team

# Documentation
*.md @docs-team
README.md @username
```

## Emergency Override

If you absolutely must bypass (NOT RECOMMENDED):
```bash
# Temporarily disable protection
gh api repos/:owner/:repo/branches/main/protection \
  --method DELETE

# Make changes
git push origin main

# Re-enable immediately
# Run the protection setup command again
```

## Monitoring

Check protection status:
```bash
gh api repos/:owner/:repo/branches/main/protection
```

View recent rule bypasses:
```bash
gh api repos/:owner/:repo/branches/main/protection/enforce_admins
```

## Best Practices

1. **Never disable for convenience** - Fix the underlying issue
2. **Use PRs even for "simple" changes** - They often aren't
3. **Set up CODEOWNERS** - Automatic reviewer assignment
4. **Enable status checks** - Catch issues before merge
5. **Require up-to-date branches** - Avoid integration surprises

Remember: These rules protect you from yourself!