# Vanguard CRM

Vanguard Security's prospect and client tracker, at **vanguardcrm.netlify.app**. Everyone signs in with their name and a PIN they choose. Firebase holds the live data. Admins can download a current Excel copy at any time.

Matthew Lambert, Vice President, Vanguard Security LLC

## How it fits together

- **The CRM is where work happens.** Visits, calls, notes, follow-ups, owners, stages and deals are entered at vanguardcrm.netlify.app.
- **Firebase project `vanguard-crm`** holds the data. It has its own project, kept separate from IronHalo.
- **Excel on demand.** Admin menu, Employees, Download Excel builds a current workbook from Firebase in the same layout as the original prospect list, plus tabs for all prospects (filterable), clients, follow-ups, team, people and the activity log. It's a snapshot. Changes go in the CRM.
- **Hidden admin menu.** There's no Admin button. Admins click the Vanguard logo to open the admin menu (team pace, audit log, employees). When anyone else clicks the logo, it goes to the Pipeline. The server and database rules still block non-admins even if they find the page.
- **Who can change what:** everyone sees every account. Only an account's owners and admins can change it. An account with no owner can be claimed by whoever adds themselves. The database rules enforce this, not just the screens.
- **PINs** are hashed on the server (PBKDF2, 150,000 rounds) and kept where no browser can read them. Five wrong PINs lock a name for 15 minutes. Admins reset PINs from the Employees page.
- **Audit log:** every change is recorded with who made it, and entries can't be edited or deleted.

### Files

| Path | What it is |
|---|---|
| `public/index.html` | The whole app, plus the sign in screen |
| `netlify/functions/login.js`, `set-pin.js`, `names.js` | Sign in and PINs |
| `netlify/functions/admin.js` | Admin actions: reset a PIN |
| `netlify/functions/export.js` | Builds the Excel download (admins only) |
| `netlify/functions/setup.js` | One time load of the employees and the 233 prospects |
| `netlify/lib/excel.js` | Builds the workbook |
| `firestore.rules` | Database rules for the vanguard-crm Firebase project |

## One time setup

Do these in order. Each step needs the one before it.

### 1. Create the Firebase project

1. Firebase console, Add project, name it **vanguard-crm**. You can turn Google Analytics off.
2. **Firestore Database:** Create database, production mode, location `us-central1` (same as IronHalo).
3. **Rules:** in Firestore, open the Rules tab, replace everything there with the contents of `firestore.rules` from this repo, and publish. These rules limit edits to owners and admins and keep PINs hidden.
4. **Authentication:** click Get started. You don't need to turn on any sign in method, because the CRM signs people in with its own tokens. Authentication just has to be switched on.
5. **Web app config:** Project settings, General, Your apps, add a Web app named `vanguard-crm`. Copy the config object; you'll need it in step 3.
6. **Service account key:** Project settings, Service accounts, Generate new private key. This downloads a JSON file. Keep it private and never commit it. Netlify uses it to check PINs.

### 2. Create the Netlify site from GitHub

1. Netlify, Add new site, Import an existing project, GitHub, **VanguardIronHalo/Vanguard-CRM**. `netlify.toml` already holds the build settings.
2. Site configuration, Site details, Change site name, **vanguardcrm**.
3. Site configuration, Environment variables. Add:

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | The whole service account JSON from step 1.6 |
| `FIREBASE_WEB_CONFIG` | The web config from step 1.5 as one line of JSON, for example `{"apiKey":"...","authDomain":"vanguard-crm.firebaseapp.com","projectId":"vanguard-crm","storageBucket":"...","messagingSenderId":"...","appId":"..."}` |
| `CRM_SETUP_KEY` | Any long phrase you make up. Delete it after step 3. |

4. Deploys, Trigger deploy, so the functions pick up the variables.

### 3. Load the starting data

In PowerShell, using the key you made up:

```powershell
Invoke-RestMethod -Method Post "https://vanguardcrm.netlify.app/api/setup?key=YOUR_SETUP_KEY"
```

You should see 11 employees and 233 accounts added. Running it twice is safe. Then **delete `CRM_SETUP_KEY`** in Netlify and redeploy, which turns setup off.

### 4. Sign in

Open vanguardcrm.netlify.app, pick your name and make your PIN. You start as the only admin. Click the Vanguard logo to open the admin menu, then Employees, to make others admins, add or remove people, reset PINs, and download Excel.

## Day to day

- **New employee:** Logo, Employees, Add employee. They make a PIN the first time they sign in.
- **Forgotten PIN:** Logo, Employees, Reset PIN. It signs them out everywhere.
- **Someone leaves:** Logo, Employees, Remove. They can't sign in anymore, and their history stays.
- **Changing the app:** edit, commit, push to `main`. Netlify redeploys on its own.
- **Need a spreadsheet:** logo, Employees, Download Excel.

## Not built yet

- Merging duplicate records
- Text or email alerts for reminders (they show in the app)
