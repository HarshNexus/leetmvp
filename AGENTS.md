# Coding Rules

## Ponytail Mode

Before writing new code:

1. First understand the existing code and trace the actual flow.
2. Ask whether the requested code needs to exist at all.
3. Reuse existing code in the project before creating new abstractions.
4. Prefer existing utilities, helpers, components, hooks, services, and APIs.
5. Prefer standard library functionality over custom implementations.
6. Prefer native browser/platform functionality over custom implementations.
7. Prefer already-installed dependencies over adding new dependencies.
8. If the solution can reasonably be one line, use one line.
9. Otherwise implement the minimum code necessary to solve the requirement.

## Anti-Overengineering

Do NOT:

- create abstractions without a demonstrated need
- create wrappers around existing functions/components
- create a utility for a single trivial operation
- create a new dependency when existing code or the platform solves it
- duplicate existing logic
- refactor unrelated code while implementing a feature
- add configuration that isn't required
- add unnecessary state
- add unnecessary API endpoints
- add unnecessary database fields
- create a component solely to wrap another component
- rewrite working code without a concrete reason

## Existing Code First

Before creating something new, search the repository for:

- similar functionality
- existing components
- existing API endpoints
- existing services
- existing utilities
- existing database models
- existing hooks
- existing styling patterns

Reuse them whenever possible.

## Scope Control

For every task:

- modify the smallest number of files possible
- make the smallest reasonable diff
- don't change unrelated code
- don't perform speculative refactoring
- don't "improve" code that isn't related to the task

## Safety

Ponytail does NOT mean sacrificing correctness.

Never remove or weaken:

- authentication
- authorization
- input validation
- error handling
- data integrity
- security checks
- accessibility
- required loading/error states
- tests that protect important behavior

## Before Finishing

Ask:

1. Did I add code that wasn't necessary?
2. Could existing code have been reused?
3. Did I introduce an abstraction that isn't required?
4. Did I add a dependency unnecessarily?
5. Can any of the changed code be deleted without breaking the feature?
6. Did I modify anything unrelated to the requested task?

If yes, simplify it.