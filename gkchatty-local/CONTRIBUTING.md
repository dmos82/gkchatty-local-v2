# Contributing to GKChatty

Thank you for considering contributing to GKChatty! This document provides guidelines and instructions for contributing to the project.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Workflow](#development-workflow)
4. [Coding Standards](#coding-standards)
5. [Commit Guidelines](#commit-guidelines)
6. [Pull Request Process](#pull-request-process)
7. [Testing](#testing)
8. [Documentation](#documentation)

---

## Code of Conduct

### Our Standards

- **Be Respectful:** Treat everyone with respect and kindness
- **Be Constructive:** Provide helpful feedback and suggestions
- **Be Professional:** Keep discussions focused on technical topics
- **Be Patient:** Remember that everyone was a beginner once

### Unacceptable Behavior

- Harassment or discrimination of any kind
- Trolling, insulting, or derogatory comments
- Publishing others' private information
- Other conduct that would be considered inappropriate in a professional setting

---

## Getting Started

### Prerequisites

Before contributing, ensure you have:

1. **Node.js 18+** installed
2. **MongoDB** running (local or Atlas)
3. **Git** configured with your name and email
4. **Pinecone account** (for vector database)
5. **OpenAI API key** (for LLM functionality)

### Fork and Clone

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/gkchatty-local-v2.git
cd gkchatty-local-v2/gkchatty-local

# 3. Add upstream remote
git remote add upstream https://github.com/dmos82/gkchatty-local-v2.git

# 4. Create a branch
git checkout -b feature/your-feature-name
```

### Set Up Development Environment

```bash
# 1. Install backend dependencies
cd backend
npm install

# 2. Install frontend dependencies
cd ../frontend
npm install

# 3. Set up environment
cd ../backend
cp .env.cloud .env
# Edit .env with your credentials

# 4. Start development servers
# Terminal 1:
cd backend && npm run dev

# Terminal 2:
cd frontend && npm run dev
```

---

## Development Workflow

### Branch Strategy

- **`main`** - Production-ready code (stable)
- **`staging`** - Pre-production testing
- **`local-ollama-dev`** - Active development branch
- **`feature/*`** - New features
- **`fix/*`** - Bug fixes
- **`docs/*`** - Documentation updates

### Creating a Feature

```bash
# 1. Ensure you're on latest main
git checkout main
git pull upstream main

# 2. Create feature branch
git checkout -b feature/add-user-profile

# 3. Make your changes
# Edit files, test locally

# 4. Commit changes
git add .
git commit -m "feat: Add user profile page"

# 5. Push to your fork
git push origin feature/add-user-profile

# 6. Create pull request on GitHub
```

### Keeping Your Fork Updated

```bash
# Fetch upstream changes
git fetch upstream

# Merge into your main branch
git checkout main
git merge upstream/main

# Rebase your feature branch (if needed)
git checkout feature/your-feature
git rebase main
```

---

## Coding Standards

### TypeScript

All code must be written in TypeScript with proper types:

```typescript
// ✅ Good
interface User {
  id: string;
  username: string;
  email: string;
}

function getUser(id: string): Promise<User> {
  // ...
}

// ❌ Bad
function getUser(id: any): any {
  // ...
}
```

### ESLint

Code must pass ESLint checks:

```bash
# Backend
cd backend
npm run lint

# Frontend
cd frontend
npm run lint

# Auto-fix issues
npm run lint -- --fix
```

### Formatting

We use consistent formatting:

- **Indentation:** 2 spaces (not tabs)
- **Quotes:** Single quotes for strings
- **Semicolons:** Required
- **Line length:** Max 100 characters (when reasonable)

### File Structure

```typescript
// File structure for new files:
// 1. Imports (grouped by type)
import { Request, Response } from 'express'; // External
import { User } from '../models/User'; // Internal models
import { logger } from '../utils/logger'; // Internal utils

// 2. Type definitions
interface MyData {
  id: string;
  name: string;
}

// 3. Constants
const MAX_RETRIES = 3;

// 4. Main code
export async function myFunction() {
  // ...
}

// 5. Helper functions
function helperFunction() {
  // ...
}
```

### Naming Conventions

```typescript
// Classes: PascalCase
class UserController {}

// Functions: camelCase
function getUserById() {}

// Constants: UPPER_SNAKE_CASE
const MAX_FILE_SIZE = 10485760;

// Interfaces: PascalCase with 'I' prefix (optional)
interface IUser {}
// OR
interface User {}

// Types: PascalCase
type RequestHandler = (req: Request, res: Response) => void;

// Files: kebab-case
// user-controller.ts
// auth-middleware.ts
```

---

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring (no feature/bug change)
- `test`: Adding or updating tests
- `chore`: Build process, dependencies, etc.

**Examples:**

```bash
# Feature
git commit -m "feat(auth): Add password reset functionality"

# Bug fix
git commit -m "fix(chat): Resolve message duplication issue"

# Documentation
git commit -m "docs(api): Update endpoint documentation"

# Refactoring
git commit -m "refactor(services): Extract RAG logic to separate service"
```

### Good Commit Practices

✅ **Do:**
- Write clear, descriptive commit messages
- Make atomic commits (one logical change per commit)
- Reference issue numbers when applicable
- Keep commits focused and small

❌ **Don't:**
- Commit commented-out code
- Commit console.log statements
- Make massive commits with unrelated changes
- Use vague messages like "fix stuff" or "update"

---

## Pull Request Process

### Before Submitting

1. **Test your changes:**
   ```bash
   # Test backend
   curl http://localhost:4001/health

   # Test your new feature
   # Manual testing or automated tests
   ```

2. **Lint your code:**
   ```bash
   npm run lint
   ```

3. **Update documentation:**
   - Update README if feature is user-facing
   - Update API docs if endpoints changed
   - Add JSDoc comments to new functions

4. **Check for conflicts:**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

### Pull Request Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing functionality to break)
- [ ] Documentation update

## Testing
- [ ] Tested locally on backend
- [ ] Tested locally on frontend
- [ ] Tested authentication flow
- [ ] Tested edge cases
- [ ] Added/updated tests (if applicable)

## Screenshots (if applicable)
Add screenshots for UI changes

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review performed
- [ ] Commented complex code sections
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally
```

### Review Process

1. **Automated Checks:** CI/CD runs linting and tests
2. **Code Review:** Maintainer reviews code
3. **Feedback:** Address review comments
4. **Approval:** Maintainer approves PR
5. **Merge:** PR merged to target branch

### Handling Review Comments

```bash
# Make requested changes
# Edit files

# Commit changes
git add .
git commit -m "fix: Address review comments"

# Push to your branch
git push origin feature/your-feature

# PR automatically updates
```

---

## Testing

### Manual Testing

Before submitting PR, test:

**Backend:**
```bash
# Health check
curl http://localhost:4001/health

# Authentication
curl -X POST http://localhost:4001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'

# Your new feature
# Test relevant endpoints
```

**Frontend:**
```bash
# Open browser
open http://localhost:4003

# Test user flow:
# 1. Login
# 2. Use new feature
# 3. Test edge cases
# 4. Check console for errors
```

### Automated Tests (Future)

```bash
# Run tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- user.test.ts
```

### Test Coverage

Aim for:
- **Unit Tests:** 80%+ coverage
- **Integration Tests:** Cover critical paths
- **E2E Tests:** Cover main user flows

---

## Documentation

### Code Documentation

Use JSDoc comments for functions:

```typescript
/**
 * Retrieves user by ID from database
 * @param userId - The unique user identifier
 * @returns Promise resolving to User object
 * @throws {NotFoundError} When user doesn't exist
 */
async function getUserById(userId: string): Promise<User> {
  // Implementation
}
```

### API Documentation

Document new API endpoints:

```typescript
/**
 * POST /api/users/profile
 * Updates user profile information
 *
 * Request Body:
 * {
 *   username?: string,
 *   email?: string,
 *   bio?: string
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   user: User
 * }
 *
 * Errors:
 * - 400: Invalid input
 * - 401: Unauthorized
 * - 409: Username/email already exists
 */
```

### README Updates

Update relevant READMEs when:
- Adding new features
- Changing API endpoints
- Updating dependencies
- Modifying setup process

---

## Common Contribution Scenarios

### Adding a New API Endpoint

1. **Create route handler:**
   ```typescript
   // backend/src/controllers/userController.ts
   export async function updateProfile(req: Request, res: Response) {
     // Implementation
   }
   ```

2. **Add route:**
   ```typescript
   // backend/src/routes/userRoutes.ts
   router.put('/profile', authenticateJWT, updateProfile);
   ```

3. **Update types:**
   ```typescript
   // backend/src/types/api.ts
   export interface UpdateProfileRequest {
     username?: string;
     email?: string;
   }
   ```

4. **Test endpoint:**
   ```bash
   curl -X PUT http://localhost:4001/api/users/profile \
     -H "Cookie: token=..." \
     -H "Content-Type: application/json" \
     -d '{"username":"newname"}'
   ```

5. **Document in README:**
   ```markdown
   #### PUT /api/users/profile
   Updates user profile information.
   ```

### Adding a Frontend Component

1. **Create component:**
   ```tsx
   // frontend/components/UserProfile.tsx
   export function UserProfile() {
     return <div>Profile</div>;
   }
   ```

2. **Add to page:**
   ```tsx
   // frontend/app/(dashboard)/profile/page.tsx
   import { UserProfile } from '@/components/UserProfile';

   export default function ProfilePage() {
     return <UserProfile />;
   }
   ```

3. **Test in browser:**
   ```
   http://localhost:4003/profile
   ```

### Fixing a Bug

1. **Reproduce the bug** locally
2. **Write test** that fails (if applicable)
3. **Fix the bug**
4. **Verify test passes**
5. **Test manually**
6. **Submit PR** with clear description

---

## Getting Help

### Resources

- **Documentation:** See `/docs` directory
- **Architecture:** `docs/architecture/CURRENT-STACK.md`
- **Development Guide:** `docs/development/LOCAL-DEVELOPMENT.md`

### Questions

- **GitHub Issues:** For bug reports and feature requests
- **GitHub Discussions:** For questions and general discussion
- **Pull Request Comments:** For PR-specific questions

### Contact

- **Maintainer:** David Morin
- **Repository:** https://github.com/dmos82/gkchatty-local-v2

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

## Recognition

Contributors will be recognized in:
- Project README (Contributors section)
- Release notes (for significant contributions)
- Git commit history (always)

---

## Thank You!

Every contribution, no matter how small, helps improve GKChatty. Thank you for taking the time to contribute!

---

**Last Updated:** 2025-11-14
**Version:** 1.0.0
