# PDF Gallery Starter

A zero-build static PDF gallery for GitHub Pages.

## What it does

- Reads `links.csv`
- Uses the first column as the PDF URL
- Optional second column = title
- Optional third column = note/description
- Paginates at 30 PDFs per page
- Supports search
- Works on GitHub Pages with no dependencies

## Files

- `index.html`
- `styles.css`
- `app.js`
- `links.csv`

## CSV format

```csv
url,title,note
https://example.com/001.pdf,Volume 1,Optional description
https://example.com/002.pdf,Volume 2,Optional description
```

Only the first column is required.

## Deploy on GitHub Pages

1. Create a new GitHub repo.
2. Upload these files to the repo root.
3. Replace `links.csv` with your real CSV.
4. In GitHub: Settings -> Pages.
5. Set source to `Deploy from a branch`.
6. Choose `main` branch and `/root`.
7. Save.

Your site will go live on GitHub Pages.

## Important privacy note

If your CSV contains raw Google Drive share links, visitors may still be able to infer ownership through Google sharing behavior or file metadata. For cleaner separation, later swap the links to a separate public file host or proxy domain.

## Keep it stable

- Do not embed 30 live PDF viewers on one page.
- Link out to the PDFs instead.
- Keep `links.csv` as plain UTF-8 CSV.
- If a title contains commas, wrap it in quotes.

## Extending forever

Just keep adding rows to `links.csv`.
The site will automatically paginate.
