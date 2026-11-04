# Vanguard CRM

Vanguard Security's prospect and client tracker. Everyone signs in with their name and a PIN they choose. The app runs on Netlify, and its data lives in the IronHalo Firebase project (ironhalolite) in collections that start with `crm_`.

Matthew Lambert, Vice President, Vanguard Security LLC

## How it fits together

- **public/index.html** is the whole app: pipeline, prospects, clients, board, people, my work, and the admin pages (team pace, audit log, employees).
- **netlify/functions** are the small server pieces. `login` and `set-pin` check PINs and hand back a Firebase sign in. `admin` resets PINs. `names` lists employees for the sign in screen. `config` gives the browser the Firebase web settings. `setup` loads the starting data one time.
- PINs are hashed (PBKDF2, 150,000 rounds, random salt) and kept in `crm_secrets`. The Firestore rules block every browser read and write there, so only the server can check a PIN. Five wrong PINs lock that name for 15 minutes.
- Firestore rules decide who can change what. Only admins can edit the employee list. Nobody can edit or delete the audit log, and each entry has to carry the real signed in name.

## One time setup

Do these in order. Each step depends on the one before it.

### 1. Add the CRM rules to Firebase

The CRM shares the ironhalolite database with IronHalo, so its rules get **added to** IronHalo's rules. They don't replace them.

1. Firebase console, project **ironhalolite**, Firestore Database, Rules.
2. Open `firestore.rules.crm` from this repo. Paste everything between the two `=====` lines inside the existing `match /databases/{database}/documents { ... }` block, next to the IronHalo rules.
3. Publish.

Check this while you're there: if any IronHalo rule only says `request.auth != null`, a CRM user would pass it too, because they're signed in to the same project. Tighten those IronHalo rules to check an IronHalo role, or add `&& request.auth.token.crm != true`, so CRM sign ins can't read IronHalo data.

### 2. Create the Netlify site from GitHub

1. Netlify, Add new site, Import an existing project, GitHub, pick **VanguardIronHalo/vanguard-crm**.
2. Netlify reads `netlify.toml`, so leave the build settings as they are. Every push to `main` now redeploys the site.
3. In Site configuration, change the site name to something like `crmbyvanguard`.

### 3. Set the environment variables

In Netlify, Site configuration, Environment variables:

| Name | Value | Why |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | The same service account JSON the IronHalo site uses (whole JSON, or base64 of it) | Lets the functions check PINs and sign people in |
| `FIREBASE_WEB_CONFIG` | The ironhalolite web config as one line of JSON: `{"apiKey":"...","authDomain":"ironhalolite.firebaseapp.com","projectId":"ironhalolite","storageBucket":"...","messagingSenderId":"...","appId":"..."}` | Tells the browser which Firebase project to talk to. Copy it from Firebase console, Project settings, Your apps. |
| `CRM_SETUP_KEY` | Any long random phrase | Turns on the one time data load. You'll delete it after step 4. |

Then trigger a redeploy (Deploys, Trigger deploy) so the functions pick the variables up.

### 4. Load the starting data

From a Windows PowerShell window:

```powershell
Invoke-RestMethod -Method Post "https://YOUR-SITE.netlify.app/api/setup?key=YOUR_SETUP_KEY"
```

You should see `employeesAdded: 11` and `accountsAdded: 233`. Running it again is safe, because it skips anything that already exists.

Then **delete `CRM_SETUP_KEY`** in Netlify and redeploy, which switches setup off for good.

### 5. Sign in

Open the site, pick your name, and make your PIN. You're the only admin to start. Use the **Admin** button next to your name, then **Employees**, to make others admins, add or remove people, and reset PINs.

## Day to day

- **New employee:** Admin, Employees, Add employee. They pick their name and make a PIN the first time they open the site.
- **Forgotten PIN:** Admin, Employees, Reset PIN. It signs them out everywhere, and they make a new PIN at their next sign in.
- **Someone leaves:** Admin, Employees, Remove. They can't sign in anymore, and everything they logged stays.
- **Changes to the app:** edit the files, commit, push to `main`. Netlify redeploys on its own.

## Data

| Collection | What's in it |
|---|---|
| `crm_users` | Employees: name, admin, active, whether a PIN is set, last sign in |
| `crm_secrets` | PIN hashes. Server only. |
| `crm_accounts` | Prospects and clients, owners, stage, contacts, research |
| `crm_activity` | Audit log: every visit, call, note, stage change, owner change, handoff. Can't be edited or deleted. |
| `crm_reminders` | Follow-ups and Zoom calls |
| `crm_deals` | Deals with value per month or year |

## Not built yet

- Merging duplicate records
- Hiding deal values from non admins
- Text or email alerts for reminders (they show in the app only)
