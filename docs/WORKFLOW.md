# Workflow

## Branch strategy

- `main`: production-ready code only
- `develop`: optional integration branch for batching larger changes
- `feature/<topic>`: new capabilities
- `fix/<topic>`: normal bug fixes
- `hotfix/<topic>`: urgent fixes that should land quickly
- `release/<version>`: stabilization branch for an upcoming release

## Everyday flow

1. Branch from `main` or `develop`.
2. Make the change and keep `npm run test` plus `npm run build` green.
3. Open a pull request into `main` for small direct releases, or into `develop` when batching work.
4. Wait for GitHub Actions CI to pass.
5. Merge with a clean history policy that matches the hosting platform settings.

## Release flow

1. Update `package.json` version.
2. Create a release tag in the format `vX.Y.Z`.
3. Push the tag.
4. GitHub Actions runs the Windows packaging workflow and attaches the installer plus blockmap to the GitHub Release.

## Notes

- CI validates tests and production builds on every push and pull request.
- The release workflow is intentionally tag-driven so normal feature work does not build installers on every commit.
- If code signing is added later, extend the release workflow with the required signing secrets rather than changing the local developer flow.
