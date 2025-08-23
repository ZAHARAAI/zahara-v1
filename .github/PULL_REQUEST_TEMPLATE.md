# Pull Request

## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Infrastructure/DevOps change
- [ ] Code quality improvement

## Sprint Deliverable
Which deliverable(s) does this PR address?
- [ ] A. Monorepo setup
- [ ] B. Brand hooks
- [ ] C. Docker Compose stack
- [ ] D. Router enhancement
- [ ] E. API features
- [ ] F. Agents & Vector
- [ ] G. Tests & CI
- [ ] H. Flowise integration
- [ ] I. Handoff documentation

## Testing
- [ ] Added/updated unit tests
- [ ] Added/updated integration tests
- [ ] Manual testing completed
- [ ] All existing tests pass
- [ ] Health checks pass (`make -C infra test`)

## Checklist
- [ ] Code follows project style guidelines (ruff check passes)
- [ ] Self-review of code completed
- [ ] No secrets committed
- [ ] Documentation updated if needed
- [ ] Breaking changes documented
- [ ] Environment variables added to `.env.example` if needed

## How to Test
1. Pull this branch
2. Run `make -C infra init && make -C infra up`
3. Test specific endpoints/features:
   ```bash
   # Add specific test commands here
   curl http://localhost:8000/health/
   ```

## Screenshots (if applicable)
Add screenshots or GIFs demonstrating the changes.

## Additional Notes
Any additional information, concerns, or context for reviewers.
