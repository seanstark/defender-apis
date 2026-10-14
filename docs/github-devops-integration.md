# Connecting this repo to Defender for Cloud's DevOps Security pane

This step is **manual and one-time per GitHub organization/repository** — there is no ARM/Bicep/CLI
resource type for a GitHub environment connector in Defender for Cloud, so it is intentionally not
automated by `infra/`.

## What this gives you

Once connected, Defender for Cloud's **DevOps Security** pane shows:

- Code and IaC scanning findings from this repo (including the results produced by
  [`security-devops.yml`](../.github/workflows/security-devops.yml), plus GitHub's own
  Dependabot/code-scanning alerts if enabled).
- Repository posture/inventory alongside your Azure resource inventory, so you can see which
  GitHub repos feed which Azure environments.
- (Where the underlying data supports it) correlation into Cloud Security Explorer queries that
  span "code" and "cloud" — note the specific **IaC template mapping** (tracing a live resource
  back to the exact IaC commit/PR that created it) is Azure DevOps-only today; see the caveat in
  the main [README](../README.md#a-note-on-code-to-cloud--iac-template-mapping).

## Steps

1. Sign in to the [Azure Portal](https://portal.azure.com) with a user that has **Security Admin**
   (or **Owner/Contributor**) on the subscription hosting Defender for Cloud, and **organization
   owner/admin** rights on the GitHub org you want to connect (GitHub App installation requires
   org-admin consent).
2. Go to **Microsoft Defender for Cloud → Environment settings**.
3. Select **Add environment → GitHub**.
4. Give the connector a name, pick (or create) the subscription/resource group it should report
   under, and select **Next: Repositories**.
5. Select **Authorize** — this redirects to GitHub to install/authorize the **Microsoft Security
   DevOps** GitHub App against your organization.
6. On the GitHub authorization screen, choose **All repositories** or **Only select repositories**
   and pick this repository, then **Install & Authorize**.
7. Back in the Azure Portal, select which repositories to onboard (this one), review, and select
   **Create**.
8. Wait a few minutes, then go to **Defender for Cloud → DevOps Security** (left nav) — the
   connected repo should appear, along with a security posture score once scans have produced
   results.

## Keeping it populated

- [`security-devops.yml`](../.github/workflows/security-devops.yml) already runs on every push/PR
  to `main`, on a weekly schedule, and on manual dispatch — no further action is needed for new
  findings to appear in GitHub's Security tab and (via the connector above) in Defender for Cloud.
- If you enable GitHub's own **Code scanning** / **Dependabot alerts** (Settings → Code security and
  analysis), those also surface through the same connector.

## Removing the connector

**Defender for Cloud → Environment settings → (your GitHub connector) → Delete**. This does not
uninstall the Microsoft Security DevOps GitHub App from your org — do that separately under your
GitHub organization's **Settings → GitHub Apps → Microsoft Security DevOps → Uninstall** if you no
longer want it installed.
