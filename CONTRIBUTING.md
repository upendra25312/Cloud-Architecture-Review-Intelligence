# Contributing

Thank you for your interest in contributing to Cloud Architecture Review Intelligence.

We welcome contributions that improve the platform’s architecture quality, engineering rigor, documentation, usability, deployment maturity, and operational readiness.

## Contribution principles

This repository is intended to evolve as a professional, enterprise-oriented solution accelerator. Contributions should align to the following principles:

- keep changes focused and well-scoped
- prioritize clarity, maintainability, and operational quality
- avoid introducing unverified claims in documentation
- prefer secure, Azure-native patterns where applicable
- preserve alignment between implementation, architecture, and documentation
- validate changes with appropriate tests whenever possible

## Recommended contribution areas

We especially welcome contributions in the following areas:

- architecture review workflows
- deterministic rules and governance rubrics
- frontend usability and accessibility
- backend reliability and observability
- infrastructure automation and deployment consistency
- testing depth and validation coverage
- documentation quality and onboarding experience

## Development workflow

A recommended workflow for contributions is:

1. Fork the repository or create a feature branch.
2. Keep changes limited to a clear, single purpose where possible.
3. Update relevant documentation alongside implementation changes.
4. Run the appropriate validation steps before submitting changes.
5. Open a pull request with a concise summary of the problem, approach, and validation performed.

## Branching guidance

Use clear branch names that reflect the purpose of the change. Examples:

- `feature/add-review-rule-coverage`
- `fix/frontend-validation-bug`
- `docs/improve-architecture-readme`
- `infra/update-deployment-config`

## Pull request expectations

Please include the following in pull requests where applicable:

- **Problem statement** — what issue, gap, or improvement is being addressed
- **Solution summary** — what changed and why
- **Validation** — tests run, manual checks performed, or screenshots if relevant
- **Impact** — any notable effects on deployment, security, architecture, or user experience

## Code quality expectations

Contributors should aim for:

- readable, maintainable code
- minimal unnecessary complexity
- appropriate comments where logic is non-obvious
- consistency with existing repository structure and style
- secure handling of configuration and secrets

## Documentation expectations

Documentation contributions should:

- be clear and professional
- avoid overstating features not yet implemented
- reflect the current state of the repository
- improve discoverability and onboarding for future contributors

## Testing guidance

Before submitting changes, run the relevant tests where applicable.

Examples based on the current repository structure:

### Frontend
```bash
cd frontend
npm run test:unit
npm run test:e2e
```

### API
```bash
cd api
npm test
```

Additional targeted validation may be appropriate for:
- accessibility
- visual regression
- architecture review flows
- deployment configuration
- documentation accuracy

## Security and secrets

Please do not commit:
- secrets
- credentials
- API keys
- connection strings
- production configuration values

Use secure configuration patterns and environment-specific settings. If a change has security implications, document them clearly in the pull request.

## Communication

If a proposed change is large, architectural, or cross-cutting, consider opening an issue or discussion first so the direction can be reviewed before implementation effort increases.

## Code of collaboration

Please engage respectfully and constructively. High-quality technical collaboration is expected across architecture, engineering, documentation, and operations topics.

## License

This repository uses the MIT License. See [`LICENSE`](./LICENSE) for details.
