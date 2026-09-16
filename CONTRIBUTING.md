# Contributing to The Amzg DB

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help create a welcoming environment for all contributors

## Getting Started

### Prerequisites

- Go 1.22+
- Node.js 18+
- Wails CLI v3
- Git

### Setup

1. Fork the repository on GitHub

2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/amzg-db.git
   cd amzg-db
   ```

3. Add upstream remote:
   ```bash
   git remote add upstream https://github.com/amzg/amzg-db.git
   ```

4. Install dependencies:
   ```bash
   wails mod tidy
   ```

5. Start development:
   ```bash
   wails dev
   ```

## Development Workflow

### Branching Strategy

- `main` - Stable release branch
- `develop` - Integration branch for next release
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation changes

### Creating a Branch

```bash
# Sync with upstream
git fetch upstream
git checkout develop
git merge upstream/develop

# Create feature branch
git checkout -b feature/my-feature
```

### Making Changes

1. Make your changes in small, focused commits
2. Write clear commit messages
3. Add tests for new functionality
4. Update documentation if needed

### Commit Messages

Use conventional commits format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting (no code change)
- `refactor` - Code restructuring
- `test` - Adding tests
- `chore` - Build process or auxiliary tools

Examples:
```
feat(drivers): add PostgreSQL driver implementation
fix(ui): correct table alignment in data grid
docs(readme): update installation instructions
```

### Code Style

#### Go

- Follow [Effective Go](https://go.dev/doc/effective_go) guidelines
- Use `gofmt` and `goimports`
- Run linters:
  ```bash
  golangci-lint run
  ```

#### TypeScript/React

- Use TypeScript strict mode
- Follow ESLint rules
- Use functional components with hooks
- Run linters:
  ```bash
  cd frontend
  npm run lint
  ```

### Testing

- Write unit tests for new functions
- Test database drivers with actual connections when possible
- Ensure cross-platform compatibility

```bash
# Go tests
go test ./...

# Frontend tests
cd frontend && npm test
```

## Pull Request Process

### Before Submitting

1. Ensure your code follows style guidelines
2. Run all tests
3. Update documentation if needed
4. Rebase on latest `develop` branch

### Submitting a PR

1. Push your branch to your fork
2. Create a Pull Request against `develop` branch
3. Fill out the PR template
4. Link any related issues

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe tests you ran

## Checklist
- [ ] Code follows project style
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

### Review Process

- All PRs require at least one review
- Address feedback promptly
- Squash commits before merging

## Project Structure

```
amzg-db/
├── main.go                 # Entry point
├── app.go                  # Wails app
├── internal/               # Go backend
│   ├── db/                 # Database layer
│   ├── drivers/            # DB drivers
│   ├── export/             # Export functionality
│   └── config/             # Configuration
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── hooks/          # React hooks
│   │   ├── store/          # State management
│   │   └── lib/            # Utilities
│   └── wailsjs/            # Generated bindings
└── build/                  # Build assets
```

## Adding a New Database Driver

1. Create `internal/drivers/newdb.go`

2. Implement the `Driver` interface:
   ```go
   type Driver interface {
       Connect(config ConnectionConfig) (*sql.DB, error)
       GetDatabases(db *sql.DB) ([]string, error)
       GetSchemas(db *sql.DB, database string) ([]string, error)
       GetTables(db *sql.DB, schema string) ([]Table, error)
       GetColumns(db *sql.DB, table string) ([]Column, error)
       GetIndexes(db *sql.DB, table string) ([]Index, error)
       GetForeignKeys(db *sql.DB, table string) ([]ForeignKey, error)
       GetDDL(db *sql.DB, table string) (string, error)
       ExecuteQuery(db *sql.DB, query string) (*QueryResult, error)
   }
   ```

3. Register the driver in `internal/db/manager.go`

4. Add connection UI in `frontend/src/components/ConnectionDialog.tsx`

5. Write tests in `internal/drivers/newdb_test.go`

6. Update documentation

## Reporting Issues

### Bug Reports

Include:
- Operating system and version
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots if applicable

### Feature Requests

Include:
- Use case description
- Proposed solution
- Alternatives considered

## Communication

- GitHub Issues - Bug reports and feature requests
- GitHub Discussions - Questions and ideas

## License

By contributing, you agree that your contributions will be licensed under the GPL-3.0 License.
