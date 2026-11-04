# Vanguard CRM

Vanguard Security's prospect and client tracker, at **vanguardcrm.netlify.app**. Everyone signs in with their name and a PIN they choose. As people work in the CRM, it keeps a live Excel workbook in OneDrive or SharePoint up to date so the whole team can see where every prospect stands.

Matthew Lambert, Vice President, Vanguard Security LLC

## How it fits together

- **The CRM is where work happens.** Visits, calls, notes, follow-ups, owners, stages and deals are entered at vanguardcrm.netlify.app.
- **Firebase project `vanguard-crm`** holds the data. It has its own project, kept separate from IronHalo.
- **The Excel workbook is the shared view.** Every 5 minutes, if anything changed, the CRM rebuilds the workbook and saves it to OneDrive or SharePoint. It uses the same layout as the original prospect list, plus tabs for all prospects (filterable), clients, follow-ups, team activity, people and the activity log. The workbook is read only by design, and anything typed into it is replaced at the next update. Admins can force an update from Admin, Employees, Update Excel now.
- **Who can change what:** everyone sees every account. Only an account's owners and admins can change it. An account with no owner can be claimed by whoever adds themselves. The database rules enforce this, not just the screens.
- **PINs** are hashed on the server (PBKDF2, 150,000 rounds) and kept where no browser can read them. Five wrong PINs lock a name for 15 minutes. Admins reset PINs from the Employees page.
- **Audit log:** every change is recorded with who made it, and entries can't be edited or deleted.

### Files

| Path | What it is |
|---|---|
| `public/index.html` | The whole app, plus the sign in screen |
| `netlify/functions/login.js`, `set-pin.js`, `names.js` | Sign in and PINs |
| `netlify/functions/admin.js` | Admin actions: reset a PIN, update Excel now |
| `netlify/functions/excel-sync.js` | Runs every 5 minutes and updates the workbook |
| `netlify/functions/setup.js` | One time load of the employees and the 233 prospects |
| `netlify/lib/excel.js` | Builds the workbook and uploads it to Microsoft |
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

### 2. Let the CRM write to OneDrive or SharePoint

The CRM needs its own sign in to Microsoft 365 so it can save the workbook without anyone being logged in.

1. Go to **entra.microsoft.com**, App registrations, New registration. Name it `Vanguard CRM`, single tenant, no redirect URI.
2. On the app's page, copy the **Application (client) ID** and the **Directory (tenant) ID**.
3. Certificates and secrets, New client secret, 24 months. Copy the **Value** right away, because it's shown only once. Put a reminder on your calendar before it expires.
4. API permissions, Add a permission, Microsoft Graph, **Application permissions**, `Files.ReadWrite.All`. Then click **Grant admin consent**. Without consent, the upload is refused.
5. Decide where the workbook lives:
   - **Your OneDrive:** you'll set `EXCEL_DRIVE` to `user:matthew@vanguard901.com`.
   - **A SharePoint or Teams library** (better if others should own it too): you'll set `EXCEL_DRIVE` to `drive:` followed by the library's drive ID. Ask me and I'll walk you through finding it.
6. After the first update, open the workbook in OneDrive or SharePoint and **share it with the team as view only**. That keeps the CRM as the one place where changes get made.

### 3. Create the Netlify site from GitHub

1. Netlify, Add new site, Import an existing project, GitHub, **VanguardIronHalo/Vanguard-CRM**. `netlify.toml` already holds the build settings.
2. Site configuration, Site details, Change site name, **vanguardcrm**.
3. Site configuration, Environment variables. Add:

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | The whole service account JSON from step 1.6 |
| `FIREBASE_WEB_CONFIG` | The web config from step 1.5 as one line of JSON, for example `{"apiKey":"...","authDomain":"vanguard-crm.firebaseapp.com","projectId":"vanguard-crm","storageBucket":"...","messagingSenderId":"...","appId":"..."}` |
| `MS_TENANT_ID` | Directory (tenant) ID from step 2.2 |
| `MS_CLIENT_ID` | Application (client) ID from step 2.2 |
| `MS_CLIENT_SECRET` | Secret value from step 2.3 |
| `EXCEL_DRIVE` | `user:matthew@vanguard901.com` or `drive:<library id>` |
| `EXCEL_PATH` | Where to save it, for example `Vanguard CRM/Vanguard Prospect List (Live).xlsx` |
| `CRM_SETUP_KEY` | Any long phrase you make up. Delete it after step 4. |

4. Deploys, Trigger deploy, so the functions pick up the variables.

### 4. Load the starting data

In PowerShell, using the key you made up:

```powershell
Invoke-RestMethod -Method Post "https://vanguardcrm.netlify.app/api/setup?key=YOUR_SETUP_KEY"
```

You should see 11 employees and 233 accounts added. Running it twice is safe. Then **delete `CRM_SETUP_KEY`** in Netlify and redeploy, which turns setup off.

### 5. Sign in and check Excel

Open vanguardcrm.netlify.app, pick your name and make your PIN. You start as the only admin. Go to Admin, Employees, and click **Update Excel now**. The panel should say "Up to date" with an Open workbook button. If it shows a problem, the message says which setting to fix.

## Day to day

- **New employee:** Admin, Employees, Add employee. They make a PIN the first time they sign in.
- **Forgotten PIN:** Admin, Employees, Reset PIN. It signs them out everywhere.
- **Someone leaves:** Admin, Employees, Remove. They can't sign in anymore, and their history stays.
- **Changing the app:** edit, commit, push to `main`. Netlify redeploys on its own.
- **Workbook didn't update:** usually someone has it open in desktop Excel with editing on, which locks the file. It tries again in 5 minutes. Admin, Employees shows the last update and any error.

## Not built yet

- Merging duplicate records
- Text or email alerts for reminders (they show in the app and the Follow-ups tab)
