# pdf.js 6.2.108 (vendored)

Mozilla pdf.js, Apache License 2.0. The full licence notice is preserved at the
top of each `.mjs` file. Upstream: https://github.com/mozilla/pdf.js

`pdf.min.mjs` and `pdf.worker.min.mjs` are byte-identical to what cdnjs serves
for this version (sha256 verified on 2026-08-22):

    pdf.min.mjs         e0be3863c23c8af2305b16548febd58e7f8874a460253317d7771cddbc1c0f6d
    pdf.worker.min.mjs  0613f41490dd6aaceed7a93fbbd38c85e6d6aa60474b6588c6e7709cfbe18cb3

## Why this is vendored and not loaded from cdnjs

The rest of the site pulls third-party script from cdnjs, and this started there
too. It cannot work: pdf.js runs its parser in a Web Worker, and a Worker script
must be same-origin. Pointing `GlobalWorkerOptions.workerSrc` at a cdnjs URL
throws

    SecurityError: Failed to construct 'Worker': Script at
    'https://cdnjs.cloudflare.com/.../pdf.worker.min.mjs' cannot be accessed
    from origin 'https://middleton.io'.

and the viewer then hangs rather than failing loudly. The usual workaround is to
fetch the worker and hand pdf.js a blob: URL, which trades a hard dependency on
cdnjs being up AND sending CORS headers for one that is only on cdnjs being up.
Serving both files ourselves removes the dependency instead of relocating it.

Nothing here is on the critical path. Both files are fetched only when a reader
clicks "View document" on an embed, so a page with no embed, or an embed nobody
opens, never touches them.

## Upgrading

The version is in the directory name so an upgrade is a new directory and can
never be served from a stale cache. To move to a new release: add
`js/pdfjs-<version>/`, bump `PDFJS` in `blog/pdf-embed.js`, delete the old
directory. Check the pdf.js release notes for security fixes; `isEvalSupported:
false` is already set at the call site, which closes the font-driven code
execution path that CVE-2024-4367 used.
