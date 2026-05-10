# Security Policy

## Overview

Cloud Architecture Review Intelligence is intended to support enterprise architecture review workflows and Azure-native deployment patterns. Security is therefore a first-class concern across application design, deployment, configuration, and operations.

This document provides high-level guidance for reporting vulnerabilities and maintaining secure contribution practices.

## Reporting a vulnerability

If you discover a security vulnerability, please do **not** open a public issue with sensitive details.

Instead, report the issue privately to the repository owner through an appropriate private communication channel. Include:

- a concise description of the issue
- affected component(s)
- reproduction steps if available
- potential impact
- suggested remediation if known

Please provide enough detail to allow the issue to be validated and prioritized.

## What to report

Examples of security-relevant findings include:

- exposed secrets or credentials
- insecure authentication or authorization flows
- privilege escalation paths
- insecure storage of sensitive data
- injection vulnerabilities
- unsafe handling of uploaded files or documents
- insecure configuration defaults
- Azure resource misconfiguration with security impact
- cross-site scripting, request forgery, or similar web vulnerabilities

## Security expectations for contributors

Contributors should follow these minimum practices:

- never commit secrets, credentials, or connection strings
- use environment-specific configuration
- prefer managed identity and secure secret storage patterns
- apply least-privilege principles
- avoid logging sensitive information
- document security implications of architectural or configuration changes

## Recommended secure design practices

For this repository, the preferred secure engineering posture includes:

- **Azure Key Vault** for secret management
- **Managed Identity** where supported
- **Role-based access control** with least privilege
- **Environment separation** across local, test, and production
- **Centralized observability** with appropriate data hygiene
- **Secure handling of uploaded files and extracted content**
- **Controlled AI grounding patterns** to reduce risk from unsupported outputs

## Dependencies

Keep dependencies current and review dependency changes carefully, especially for packages involved in:

- authentication
- storage access
- document processing
- frontend rendering
- server-side request handling
- Azure SDK integration

When updating dependencies:
- prefer targeted updates over unnecessary churn
- review changelogs for breaking or security-relevant changes
- validate that the application still behaves as expected

## Secrets and configuration

Do not store sensitive production values in:
- source files
- committed configuration files
- documentation examples that resemble real credentials
- test fixtures that contain live secrets

Use sample settings files only for placeholders and non-sensitive examples.

## Operational considerations

The repository documentation indicates an intended Azure-native operational model involving services such as Azure Functions, Storage, Key Vault, AI services, and observability tooling. Secure operation should include:

- auditability of deployments and access
- monitoring for failures and anomalous behavior
- controlled access to production environments
- explicit review of service permissions and identities
- periodic review of secrets, keys, and resource exposure

## Supported versions

A formal support matrix is not currently defined in this repository. Until one is published, security fixes should be evaluated against the active mainline codebase and any environments currently in operational use.

## Disclosure guidance

Please allow reasonable time for validation and remediation before public disclosure of any confirmed vulnerability.
