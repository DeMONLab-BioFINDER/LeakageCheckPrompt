# Plumber: Leakage check for machine learning pipelines in biomedical studies

Generate LLM prompts to review method sections for potential data leakage issues in biomedical machine learning studies.

## Reference

- [Performance of protein panels is inflated across many biomarker studies](https://www.demonlab.org)

## What this repository does

- Lets a user paste a method section.
- Loads the reviewer role from `instructions/role.md`.
- Loads selectable leakage-check instructions from markdown files in `instructions/`.
- Generates a structured prompt that can be pasted into LLMs.

## Contribute prompt content

1. Create or edit the reviewer preface in `instructions/role.md`.
2. Create or edit markdown files in `instructions/`.
3. Add front matter using this pattern:

```md
---
id: cross-site-splits
title: Cross-site Splits
summary: Check whether site-level leakage could inflate performance.
defaultSelected: true
---

# Cross-site Splits

## What to check

- ...

## Red flags

- ...
```

4. Add the filename to `instructions/manifest.json`.

## Local preview

Because the site uses `fetch()` to load markdown files, preview it through a local web server instead of opening `index.html` directly as a file.

Example:

```bash
python3 -m http.server 8000
```

## GitHub Pages

This repository includes a root `.nojekyll` file so GitHub Pages serves the markdown instruction files in `instructions/` as static assets. Without it, Pages may process those `.md` files and the frontend fetches for `instructions/*.md` can fail with `404`.
