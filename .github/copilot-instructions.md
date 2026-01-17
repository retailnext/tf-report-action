# Copilot Instructions

This GitHub Action is written in TypeScript and transpiled to JavaScript. Both
the TypeScript sources and the **generated** JavaScript code are contained in
this repository. The TypeScript sources are contained in the `src` directory and
the JavaScript code is contained in the `dist` directory. A GitHub Actions
workflow checks that the JavaScript code in `dist` is up-to-date. Therefore, you
should not review any changes to the contents of the `dist` folder and it is
expected that the JavaScript code in `dist` closely mirrors the TypeScript code
it is generated from.

## Repository Structure

| Path                 | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `.github/`           | GitHub Configuration (workflows, copilot instructions)   |
| `dist/`              | Generated JavaScript Code (committed to repository)      |
| `src/`               | TypeScript Source Code                                   |
| `action.yml`         | GitHub Action Metadata                                   |
| `package.json`       | NPM Package Configuration                                |
| `README.md`          | Project Documentation                                    |
| `tsconfig.json`      | TypeScript Configuration                                 |
| `.gitignore`         | Git Ignore Configuration                                 |

## Environment Setup

Install dependencies by running:

```bash
npm install
```

This project uses minimal dependencies (only TypeScript and Node.js types for development).

## Testing

Ensure all unit tests pass by running:

```bash
npm test
```

Unit tests should exist in the `src/test.ts` file. They use Node.js's built-in test runner
(no external test framework). The compiled tests are in `dist/test.js`.

## Building

Any time files in the `src` directory are changed, you should run the following
command to compile the TypeScript code into JavaScript:

```bash
npm run build
```

This will transpile all TypeScript files in `src/` to JavaScript in `dist/`.

## General Coding Guidelines

- Follow standard TypeScript and JavaScript coding conventions and best practices
- Changes should maintain consistency with existing patterns and style
- Document changes clearly and thoroughly, including updates to existing comments when appropriate
- Do not include basic, unnecessary comments that simply restate what the code is doing (focus on explaining _why_, not _what_)
- Use consistent error handling patterns throughout the codebase
- Use TypeScript's type system to ensure type safety and clarity
- Keep functions focused and manageable
- Use descriptive variable and function names that clearly convey their purpose
- Export testable functions for unit testing
- After doing any refactoring, ensure to run `npm test` to ensure that all tests still pass
- When suggesting code changes, always opt for the most maintainable approach. Try your best to keep the code clean and follow "Don't Repeat Yourself" (DRY) principles
- Avoid unnecessary complexity and always consider the long-term maintainability of the code
- When writing unit tests, try to consider edge cases as well as the main path of success. This will help ensure that the code is robust and can handle unexpected inputs or situations
- Use `console.log()` for informational logging and `console.error()` with `::error::` prefix for error messages to ensure compatibility with GitHub Actions logging features

### Dependencies

This project intentionally avoids external runtime dependencies to keep the action lightweight. Only add dependencies if absolutely necessary and document the reason.

### Versioning

GitHub Actions are versioned using branch and tag names. Please ensure the version in the project's `package.json` is updated to reflect the changes made in the codebase. The version should follow [Semantic Versioning](https://semver.org/) principles.

## Linting and Formatting

This project does not currently use linters like ESLint or formatters like Prettier. When making changes:

- Follow TypeScript compiler's built-in checking (strict mode is enabled)
- Maintain consistent code style with existing files
- Use 2-space indentation
- Use single quotes for strings (except when necessary)
- Add semicolons at the end of statements
- Keep lines reasonably short (aim for ~100 characters)

If adding linting/formatting tools in the future, ensure they are run as part of the CI workflow.

## Pull Request Guidelines

When creating a pull request (PR), please ensure that:

- Keep changes focused and minimal (avoid large changes, or consider breaking them into separate, smaller PRs)
- TypeScript compilation succeeds (`npm run build`)
- Unit tests pass (`npm test`)
- The action has been transpiled to JavaScript and the `dist` directory is up-to-date with the latest changes in the `src` directory
- If necessary, the `README.md` file is updated to reflect any changes in functionality or usage

The body of the PR should include:

- A summary of the changes
- A special note of any changes to dependencies
- A link to any relevant issues or discussions
- Any additional context that may be helpful for reviewers

## Code Review Guidelines

When performing a code review, please follow these guidelines:

- If there are changes that modify the functionality/usage of the action, validate that there are changes in the `README.md` file that document the new or modified functionality
- Verify that the `dist/` directory has been updated after changes to `src/`
- Check that tests cover the new or modified functionality
- Ensure TypeScript types are used appropriately and type safety is maintained
- Look for opportunities to simplify code while maintaining functionality
- Verify error handling is appropriate and informative

## Action-Specific Guidelines

### GitHub API Interactions

- Use native Node.js `https` module for API calls (no external HTTP libraries)
- Use `Bearer` token authentication (recommended by GitHub)
- Use `application/vnd.github+json` Accept header
- Handle API errors gracefully with descriptive messages

### Comment Generation

- Be mindful of GitHub's comment size limit (65,536 characters)
- Truncate outputs intelligently to stay within limits
- Use collapsible `<details>` sections for large outputs
- Include HTML comment markers for workspace identification

### Size Limits

- Keep the main action bundle small (target <15KB)
- Truncate step outputs to ~20KB each
- Truncate entire comments to ~60KB if needed
- Always account for truncation message length when calculating sizes

### Testing

- Test with various step states (success, failure, skipped, cancelled)
- Test with and without step outputs
- Test truncation logic with large outputs
- Test workspace marker uniqueness
- Test input parsing edge cases
