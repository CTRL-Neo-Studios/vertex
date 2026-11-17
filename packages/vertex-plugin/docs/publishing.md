# Publishing

A plugin is published from a public Git repository on GitHub, GitLab, Gitea or Forgejo (self-hosted ones included).
Users install it with the repository's link (Settings → Plugins → Install…), and Vertex finds its updates there. It
needs no account and no forge API: it reads the repository's refs over HTTPS, as `git ls-remote` does.

Set `repository` in `plugin.json` to the repository's URL: Vertex shows it, and offers Use its repository to someone who
installed the plugin from elsewhere.

## A release with `plugin.zip` (recommended)

A release whose tag is a version (`0.2.0` or `v0.2.0`, without a pre-release suffix) with an asset named `plugin.zip`:
the built plugin, its files at the top. `vertex({pack: true})` writes it beside `dist/`.

A workflow that releases on a tag, `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun run build
      - run: gh release create "$GITHUB_REF_NAME" plugin.zip --title "$GITHUB_REF_NAME" --generate-notes
        env:
          GH_TOKEN: ${{ github.token }}
```

Then a release is: bump `version` in `plugin.json`, commit, `git tag v0.2.0`, `git push --tags`. Commit `bun.lock`.

Vertex picks the newest version tag whose release has a `plugin.zip` (the three newest are tried). On GitLab, the
asset is a release link whose direct path is `/plugin.zip`.

## A branch of built files

A branch that holds the built plugin (`plugin.json` and `main.js` together) at its top or in `dist/`, followed as it
moves. A workflow can push `dist/` to a `dist` branch on each push to the main branch. A branch that holds only the
source is refused, with what to install instead.

## What users can install

| They give | Vertex installs | Updates |
| --- | --- | --- |
| The repository's link | The newest release with `plugin.zip` | A newer release |
| A link to a branch (`…/tree/dist`) | That branch's files | A new commit |
| A link to a tag, or a commit | Those files | None: pinned |
| A `.zip` URL | The `.zip` | Other bytes at the URL |
| A `.zip` file or a folder | It | None (a folder is watched while developing) |

Users choose among the repository's latest release, its branches and its tags in the install dialog.

## Updates

Vertex asks a plugin's source whether there's something newer when the user checks (Settings → Plugins → Check for
updates), and daily if they turned that on. A check sends one request per repository, carrying nothing about the user.
An update installs only when the user accepts it, through the same dialog, which shows what changed.

A workspace's copy of a plugin is pinned ([Trust](trust.md#a-workspaces-plugins)): an update installed from Settings is
pinned with it, and a copy changed any other way is off until the user accepts it again.
