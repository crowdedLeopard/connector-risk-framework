# Deploying to Power Platform

This guide puts the Connector Risk Framework into a Power Platform environment: Dataverse tables,
a weekly sync from this repository, and the code app. Each step says who can do it and how to check
it worked. Commands run from the repository root unless a step says otherwise.

Allow about 45 minutes the first time. After that, the GitHub Action keeps the data current with no
manual work, and a new app version is one `npm run build` and `pa app push`.

## Before you start

| You need | Why |
| --- | --- |
| A Power Platform environment with Dataverse | The tables live there. A developer or sandbox environment is right for a first deployment. |
| System Administrator or System Customizer in that environment | To create the tables and the application user. |
| Permission to create an app registration in Microsoft Entra ID, or someone who can | The sync signs in as an application, never as a person. |
| Node.js 22 or later | For the sync and for building the app. |
| Power Apps Premium licences for the people who will use the app | Code apps need them. Makers who only build and publish need one too. |

Facts in this guide were checked against Microsoft Learn in November 2026. Links to each source are
at the end.

## 1. Turn on code apps for the environment

In the [Power Platform admin center](https://admin.powerplatform.microsoft.com), open the environment,
then **Settings** > **Product** > **Features**, and turn on **Power Apps code apps**. Save.

Check: the setting shows as on after a refresh of the page.

## 2. Create the app registration and application user

The sync writes to Dataverse as a service principal.

1. In the [Microsoft Entra admin center](https://entra.microsoft.com), go to **App registrations** >
   **New registration**. Name it `Connector Risk Framework sync`, single tenant. No redirect URI.
2. Copy the **Application (client) ID** and **Directory (tenant) ID**.
3. Give it a credential. Choose one:
   - **Federated credential (recommended for GitHub Actions, no secret to rotate).** Under
     **Certificates & secrets** > **Federated credentials** > **Add credential**, choose
     **GitHub Actions deploying Azure resources**, organisation `crowdedLeopard`, repository
     `connector-risk-framework`, entity type **Environment**, environment name `dataverse`.
   - **Client secret (needed to run the sync from your own computer).** Under
     **Certificates & secrets** > **New client secret**. Copy the value now; it is shown once.
4. In the admin center, open the environment, then **Settings** > **Users + permissions** >
   **Application users** > **New app user**. Pick the app registration, your business unit, and the
   security role **System Customizer**. The first provisioning creates tables, which needs it.
   After that you can replace it with a custom role that has create, read, write and delete on the
   `crf_` tables only.

Check: the application user appears in the list with status **Active**.

## 3. Create the tables

From the repository root:

```bash
export DATAVERSE_URL=https://<your-org>.crm.dynamics.com
export AZURE_TENANT_ID=<directory tenant id>
export AZURE_CLIENT_ID=<application client id>
export AZURE_CLIENT_SECRET=<client secret>   # only when running locally

node powerplatform/sync/cli.mjs provision
```

This creates the publisher `connectorriskframework` (prefix `crf`), the solution
`ConnectorRiskFramework`, ten global choices, nine tables, their relationships and alternate keys,
then publishes customisations. It is safe to run again: it only adds what is missing. It takes a few
minutes, most of it waiting for the alternate key index.

Check: in [Power Apps](https://make.powerapps.com), **Solutions** shows **Connector Risk Framework**
with nine tables. [DATA-MODEL.md](DATA-MODEL.md) lists every table and column.

## 4. Load the data

```bash
node powerplatform/sync/cli.mjs sync --full
```

The first sync writes about 1,600 connectors and 23,000 operations, in batches of 200 with four
batches in flight. Expect 5 to 15 minutes, depending on the environment's service protection limits.
Throttled requests are retried after the wait Dataverse asks for. Later syncs only touch connectors
whose data changed that week, so they take a minute or two.

To see what would be written without connecting, run `node powerplatform/sync/cli.mjs plan`.

Check: the command ends with `Done. No requests failed.` The **Connectors** table has a row per
connector, and **Refreshes** has one row for this run.

## 5. Keep it current with GitHub Actions

The workflow [`.github/workflows/dataverse-sync.yml`](../../.github/workflows/dataverse-sync.yml)
runs after every successful weekly refresh, and on demand. It is off until you configure it.

1. In GitHub, go to **Settings** > **Environments** > **New environment**, name it `dataverse`.
   Optionally add yourself as a required reviewer.
2. In that environment, add **variables** `DATAVERSE_URL`, `AZURE_TENANT_ID` and `AZURE_CLIENT_ID`.
   Add the **secret** `AZURE_CLIENT_SECRET` only if you chose a client secret in step 2. Without it,
   the job signs in with the federated credential.
3. Run it once by hand: **Actions** > **Dataverse sync** > **Run workflow**, mode `sync`.

Check: the run is green and its log ends with `Done. No requests failed.`

## 6. Publish the code app

The first publish must be done by a person, because it creates the app. Run these from
`powerplatform/app`:

```bash
npm install --global @microsoft/power-apps-cli
npm ci

pa auth login
pa app init --display-name "Connector Risk" --environment-id <environment id>
```

`pa app init` writes `power.config.json` for your environment. It is ignored by git, because it
belongs to one environment.

Add the eight tables the app reads as data sources. Native Dataverse takes one table per command:

```bash
for t in crf_connector crf_operation crf_connectortrait crf_change crf_refresh crf_fact crf_profile crf_decision; do
  pa app add data-source --connector dataverse --table "$t" --org-url "$DATAVERSE_URL"
done
```

The ninth table, `crf_trait`, holds the trait definitions for reports. The app takes them from the engine it shares with the public site, so it does not need it as a data source.

Try it locally, then build and publish into the solution so it travels with the tables:

```bash
pa app run          # open the "Local Play" link in the browser profile you use for Power Platform
npm run build
pa app push --solution-id <solution id>
```

Find the solution ID in Power Apps under **Solutions**: open **Connector Risk Framework**, and the
URL contains it. `pa app push` prints the link to the app.

Check: the app opens, the overview shows the catalogue size, and the footer says when the data was
refreshed.

## 7. Share it

Share the app with the people who govern connectors, from Power Apps or with `pa app share`. Give
them a security role that can read the `crf_` tables, and write `crf_profile` and `crf_decision`
if they should change the criteria or record decisions. Auditing is on for every table, so with
auditing turned on for the environment (**Settings** > **Audit and logs**), each change shows who
made it.

## 8. Export the solution for other environments

In Power Apps, open **Solutions** > **Connector Risk Framework** > **Export solution**. Export
**managed** for test and production, and **unmanaged** to keep working on it. Import into each
environment, then run step 4 (or point the GitHub Action at it) to load data. See
[`../solution/README.md`](../solution/README.md).

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `401` from the sync | The app registration is not an application user in this environment, or the tenant ID is wrong. |
| `403` when provisioning | The application user's role cannot create tables. Use System Customizer for provisioning. |
| Provisioning waits on keys for a long time | Dataverse builds the alternate key index in the background. The command waits up to five minutes and is safe to run again. |
| Many `429` responses in the log | Service protection limits. The sync waits and retries. If it persists, run with `--concurrency=2`. |
| The app says it cannot reach Dataverse | Data sources were not added for this environment, or the user has no role that can read the tables. |
| `pa app push` asks you to sign in | Expected on the first push. Later pushes can run as a service principal, after `pa app share` gives it edit access. |

## Sources

- [Power Apps CLI quickstart](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/npm-quickstart)
- [Power Apps CLI command reference](https://learn.microsoft.com/power-apps/developer/code-apps/reference/cli)
- [Connect a code app to Dataverse](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/connect-to-dataverse)
- [Power Apps CLI environment variables](https://learn.microsoft.com/power-apps/developer/code-apps/reference/environment-variables)
- [Create tables with the Web API](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api)
- [Upsert a table row](https://learn.microsoft.com/power-apps/developer/data-platform/use-upsert-insert-update-record)
- [Batch operations](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/execute-batch-operations-using-web-api)
- [Service protection API limits](https://learn.microsoft.com/power-apps/developer/data-platform/api-limits)
- [Manage application users](https://learn.microsoft.com/power-platform/admin/manage-application-users)
