# Blog image originals (local only, NOT in git)

`tools/blog-generate.mjs` optimizes images in `blog/images/` in place and copies
the full-size source here first. Everything in this folder except this README is
gitignored, so the originals live on Kevin's machine and are not pushed.

They were removed from the repo on 2026-08-04: 53 MB of full-size PNGs were being
served publicly by GitHub Pages while being linked from no page, no feed, and no
sitemap. Deploy weight only, but it was most of the repo.

## Read this before relying on the folder

**Back it up. Nothing else does.**

The last in-repo copy is recoverable from git history at commit `b8902d7` or
earlier (`git show b8902d7:blog/images/_originals/<name>`), and there is a copy
at `~/Downloads/middleton-blog-originals-backup-2026-08-04/`. Neither of those
grows. Anything added from here on exists only here.

**Originals for posts published through Sveltia are not preserved.**

The generator runs in CI on push to `blog/_posts/**`. It copies the original
here, overwrites the served copy, and the Action commits the result. Because
this folder is ignored, the original is written to an ephemeral runner and dies
with it. Only images optimized by running the generator locally end up here.

If a full-size source matters for a given post, either run
`node tools/blog-generate.mjs` locally before pushing, or keep the source
somewhere else. Covers generated from a design file are usually reproducible;
photographs and screenshots are not.
