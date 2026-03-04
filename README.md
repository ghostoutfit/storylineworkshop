# Storyline Workshop

A lightweight resource-sharing site for physics teachers implementing OpenSciEd in Denver Public Schools.

Teachers submit resources via a Google Form. That form writes to a Google Sheet. This site reads from the published sheet and displays resources with filtering, commenting, and likes.

```
Google Form → Google Sheet → Published as TSV → This site (GitHub Pages)
                                                        ↕
                                               Firebase Firestore
                                             (comments + likes)
```

---

## File Structure

```
index.html    — single page, all markup
style.css     — all styles
app.js        — data fetching, parsing, filtering, rendering
firebase.js   — Firebase init, comments and likes functions
config.js     — sheet URL, Firebase config (edit this to configure)
README.md     — this file
CLAUDE.md     — notes for AI assistants working on this project
```

---

## How to Configure

### 1. Google Sheet

The sheet is already published as TSV. The URL is in `config.js`:

```js
sheetUrl: 'https://docs.google.com/spreadsheets/d/e/…/pub?output=tsv'
```

To use a different sheet:
1. Open your Google Sheet
2. File → Share → Publish to web
3. Choose "Tab-separated values (.tsv)" and publish
4. Copy the link and paste it as `sheetUrl` in `config.js`

Expected TSV columns (tab-separated, first row is header):
```
Timestamp  Email  Program  Course  UnitName  Lesson  Part  Description  Coherence  Link  Contributor  ProjectTag
```

The `Email` column is used only to generate a stable resource ID and is never displayed.

### 2. Google Form URL

Set `formUrl` in `config.js` to the URL of your submission form:

```js
formUrl: 'https://docs.google.com/forms/d/YOUR_FORM_ID/viewform'
```

### 3. Contact Email

Set `contactEmail` in `config.js` to the address shown in the footer.

### 4. Firebase (comments + likes)

Firebase Firestore is used to store comments and like counts across users.

**Set up a new Firebase project:**

1. Go to [console.firebase.google.com](https://console.firebase.google.com/)
2. Create a new project (e.g., `storyline-workshop`)
3. In the project, go to **Build → Firestore Database** and create a database
4. Choose production mode, then update the security rules (see below)
5. Go to **Project Settings → Your apps → Web** and register a web app
6. Copy the `firebaseConfig` object and paste it into `config.js`

**Firestore Security Rules:**

In Firestore → Rules, set:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Anyone can read anything
    match /{document=**} {
      allow read: true;
    }

    // Anyone can add a comment
    match /resources/{resourceId}/comments/{commentId} {
      allow create: true;
    }

    // Anyone can increment likes on a resource document
    // (only the likes field, no other fields, no decrements)
    match /resources/{resourceId} {
      allow update: if request.resource.data.keys().hasOnly(['likes'])
                    && request.resource.data.likes == resource.data.likes + 1;
      allow create: if request.resource.data.keys().hasOnly(['likes'])
                    && request.resource.data.likes == 1;
    }
  }
}
```

**Firestore Data Structure:**

```
resources/
  {resourceId}/          ← short hash of Timestamp+Email
    likes: (number)
    comments/
      {autoId}/
        name: (string)
        text: (string)
        timestamp: (Firestore timestamp)
```

---

## How to Deploy (GitHub Pages)

1. Push all files to the `main` branch (or `master`)
2. In your GitHub repository, go to **Settings → Pages**
3. Set Source to `Deploy from a branch`, choose `main` (or `master`), folder `/` (root)
4. Save — GitHub will publish the site at `https://yourusername.github.io/storylineworkshop/`

No build step required. These are static files served directly.

---

## Default Filter Values

On page load, the filters default to:
- **Program:** OpenSciEd
- **Course:** HS Physics

Change these in `config.js` under `defaults`.

---

## What's Not Included

- No user accounts or authentication
- No admin panel
- No server or backend — everything is client-side
- No search — filtering is sufficient at this scale
- No pagination

---

## Notes

- **Email is internal only.** It is hashed client-side to generate a stable resource ID and immediately discarded. It never appears in the UI.
- **Likes use localStorage** to prevent the same browser from liking a resource twice. Counts are stored in Firestore so they're shared across users.
- **Comments require Firebase** to be configured. If Firebase is unavailable, the app still works — likes and comments just won't function.
- **TSV not CSV** — commas appear in description fields, so the sheet is published as tab-separated values.
