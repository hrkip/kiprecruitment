KIP RECRUITMENT SYSTEM — OPTIMIZED VERSION

FILES
1. Code.gs          -> Replace the entire Apps Script Code.gs file.
2. index.html       -> Upload to the GitHub Pages repository root.
3. Admin.html       -> Upload to the same GitHub Pages repository root.
4. Pelamar.html     -> Upload to the same GitHub Pages repository root.
5. kip-api.js       -> Upload to the same GitHub Pages repository root.

IMPORTANT DEPLOYMENT STEPS
1. Replace Code.gs completely, save it, and run setupDatabase() once.
2. Deploy Apps Script as a NEW Web App version.
3. Execute as: Me / script owner.
4. Who has access: Anyone.
5. If Google gives a new /exec URL, replace window.KIP_GAS_API_URL in:
   - index.html
   - Admin.html
   - Pelamar.html
   - DEFAULT_GAS_API_URL in kip-api.js
6. Upload all four frontend files to the same GitHub Pages folder.
7. Hard-refresh the browser after deployment: Ctrl+Shift+R.

PERFORMANCE CHANGES
- React, Babel, and runtime Tailwind were removed.
- The Admin page now loads only the active module.
- Role data is loaded in one bundled request per module.
- The candidate portal uses one bundled startup request.
- The iframe bridge uses one shared readiness promise instead of one resolver per call.
- SpreadsheetApp.openById() is reused inside each Apps Script execution.
- Common read results use short server-side caching with write invalidation.
- Applicant lookup uses TextFinder instead of reading the full applicant sheet.
- Test answers no longer rerender the full test page after every click.

The spreadsheet IDs, Drive folder IDs, status names, role names, email workflow,
question management, interview grading, onboarding contract, notifications, and recap
remain included.

LATEST REFINEMENTS
------------------
- Fixed interview grading "ghost scroll": selecting a score now updates only the selected row and total, without rebuilding the modal.
- Added general scroll preservation for Admin page re-renders and horizontal tables.
- Fixed Applicant Login: inactive Admin fields are disabled, Applicant ID is required/normalized, and successful verification opens Pelamar.html automatically.
- Added the official KIP logo to index.html, Admin.html, Pelamar.html, dialogs, and generated onboarding PDF.
- Keep kip-logo.webp beside all HTML files on GitHub Pages.
