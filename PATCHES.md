# Dependency Patch Documentation

## pdf-parse debug disable patch

Patch file: `patches/pdf-parse+1.1.1.patch`

### Purpose
The upstream `pdf-parse` package includes a debug block in `node_modules/pdf-parse/index.js` that runs when `module.parent` is falsy. In our ESM/tsx execution environment this condition incorrectly evaluates to true, causing the library to attempt to read a non-existent file: `./test/data/05-versions-space.pdf`. That produced `ENOENT` errors and aborted processing. The patch forces `isDebugMode = false` to prevent unintended execution of the debug routine.

### What Changed
In `node_modules/pdf-parse/index.js`:
```diff
-let isDebugMode = !module.parent;
+// Disabled to prevent accidental debug run when used via ESM/tsx environments
+let isDebugMode = false;
```
No functional parsing logic was altered—only the guard controlling the optional debug snippet.

### How It Works
We use `patch-package` (see `devDependencies` and the `postinstall` script in `package.json`). After every install (`npm install`, CI bootstrap), `patch-package` reapplies the diff automatically.

### Recreating / Updating the Patch
If `pdf-parse` is upgraded (version number changes) you must regenerate the patch:
1. Remove or rename the existing file: `patches/pdf-parse+1.1.1.patch`.
2. Reinstall dependencies (ensures a clean copy):
   ```bash
   rm -rf node_modules
   npm install
   ```
3. Edit the new version's `node_modules/pdf-parse/index.js` to apply the same change (set `isDebugMode = false`).
4. Run:
   ```bash
   npx patch-package pdf-parse
   ```
5. Commit the new patch file (its filename will reflect the new version).

### Verification
Run the app (e.g. `npm run dev -- ...args`) and confirm:
- No attempt to read `./test/data/05-versions-space.pdf`.
- Normal PDF parsing proceeds.

### Alternatives Considered
- Direct import of implementation: `import pdfParse from 'pdf-parse/lib/pdf-parse.js'` (avoids wrapper but ties us to internal path).
- Removing `pdf-parse` and relying solely on `pdfjs-dist` (larger refactor required to mimic combined text output).
- Forking the dependency (more maintenance overhead).

We chose a patch for minimal intrusion and easy reversal.

### Removal
To undo: delete the patch file and the `postinstall` script line; run `npm install` again.

---
Maintain this file whenever altering or adding dependency patches.
