# Solution package

Exported solution files go here, so a release can be imported into an environment without
running the provisioning script.

They are not committed yet, because a solution export includes the code app, which has to be
published from a real environment first. After you follow [DEPLOY.md](../docs/DEPLOY.md):

1. In Power Apps, open **Solutions** > **Connector Risk Framework** > **Export solution**.
2. Raise the version (for example 1.0.0.1) when asked.
3. Export both **Managed** (for test and production) and **Unmanaged** (to keep developing).
4. Save them here as `ConnectorRiskFramework_<version>_managed.zip` and
   `ConnectorRiskFramework_<version>_unmanaged.zip`, and commit them with a CHANGELOG entry.

To import: **Solutions** > **Import solution** in the target environment, then load data with
`node powerplatform/sync/cli.mjs sync --full`, or point the Dataverse sync workflow at it.
