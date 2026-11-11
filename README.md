# Vanguard CRM

Vanguard Security's prospect and client tracker, at **vanguardcrm.netlify.app**. Everyone signs in with their name and a PIN they choose. Firebase holds the live data. Admins can download a current Excel copy at any time.

Matthew Lambert, Vice President, Vanguard Security LLC

## How it fits together

- **The CRM is where work happens.** Visits, calls, notes, follow-ups, owners, stages and deals are entered at vanguardcrm.netlify.app.
- **Firebase project `vanguard-crm`** holds the data. It has its own project, kept separate from IronHalo.
- **Excel on demand.** Admin menu, Employees, Download Excel builds a current workbook from Firebase in the same layout as the original prospect list, plus tabs for all prospects (filterable), clients, follow-ups, team, people and the activity log. It's a snapshot. Changes go in the CRM.
- **Hidden admin menu.** There's no Admin button. Admins click the Vanguard logo to open the admin menu (team pace, audit log, employees). When anyone else clicks the logo, it goes to the Pipeline. The server and database rules still block non-admins even if they find the page.
- **Lane:** every account has a lane, Vanguard, Iron Halo, or Vanguard + Iron Halo, so whoever reaches out knows which approach to take. The 233 starting accounts come in with a suggested lane from the research, and any research nuance shows on the account. The owner confirms or changes it, and the app makes them pick a lane before they can log a call, email, meeting or visit.
- **Temperature:** every open prospect is Hot, Warm or Cold, worked out by the CRM from what's logged (`public/heat.js`, shared with the Excel export). Points: stage (Contacted 1, Meeting 3, Proposal 5), an open deal 3, a meeting or visit in the last 30 days 2 (or a call or email 1), three or more contacts in 30 days 1, a decision maker on file 1, a follow-up scheduled 1. A missed follow-up date takes 1 off, and no contact in 60 days takes 4 off. 6 or more is Hot, 3 to 5 is Warm, under 3 is Cold. Owners can set it by hand from the account, and it stays that way until they set it back to Auto.
- **Who can change what:** everyone sees every account. Only an account's owners and admins can change it. An account with no owner can be claimed by whoever adds themselves. The database rules enforce this, not just the screens.
- **PINs** are hashed on the server (PBKDF2, 150,000 rounds) and kept where no browser can read them. Five wrong PINs lock a name for 15 minutes. Admins reset PINs from the Employees page.
- **Audit log:** every change is recorded with who made it, and entries can't be edited or deleted.

### Permanent record

The original Excel prospect list gets imported once at setup and is retired after that. From then on, Firebase is the master record and it only grows. Nothing is ever deleted, by anyone, including admins, and the database rules enforce this. Records close out instead: accounts move to Parked or Lost, deals to Lost, follow-ups get marked done, employees get marked removed. Every visit, call, note, stage change, owner change, handoff and edit is logged with who did it and when. Detail edits record the old and new values. The one exception: admins can delete test accounts (company name starting with "Test") from the account's More menu or with Delete all test accounts on the Employees page. The server refuses anything else, and the audit log keeps a line for each test account removed. Download Excel is still there, but it's a snapshot for reports or a backup, not something to edit.

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
5. **Web app config:** already built into the app (project vanguard-crm-6dde0). These values are public; the rules and the PIN check are what protect the data.
6. **Service account key:** Project settings, Service accounts, Generate new private key. This downloads a JSON file. Keep it private and never commit it. Netlify uses it to check PINs.

### 2. Create the Netlify site from GitHub

1. Netlify, Add new site, Import an existing project, GitHub, **VanguardIronHalo/Vanguard-CRM**. `netlify.toml` already holds the build settings.
2. Site configuration, Site details, Change site name, **vanguardcrm**.
3. Site configuration, Environment variables. Add:

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | The whole service account JSON from step 1.6 |

4. Deploys, Trigger deploy, so the functions pick up the variables.

### 3. Load the starting data

In PowerShell, using the key you made up:

```powershell
Invoke-RestMethod -Method Post "https://vanguardcrm.netlify.app/api/setup"
```

You should see 11 employees and 233 accounts added. Setup only runs while the employee list is empty, so it switches itself off after this.

### 4. Turn on backups

Since Firebase is the only master copy, give it backups. In the Firebase console, open Firestore, then Disaster recovery:

1. **Point in time recovery: on.** This lets you roll the database back to any minute in the last 7 days, which covers a bad bulk change or a mistake.
2. **Scheduled backups: daily kept 7 days, plus weekly every Sunday kept 98 days.** These are full copies you can restore from if something bigger goes wrong. Firebase caps daily copies at 7 days, which is why the weekly one is there.

All three are on as of November 6, 2026, with the project on the Blaze plan.

Both need the project on the Blaze (pay as you go) plan. At this data size the cost is pennies a month.

### 5. Sign in

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
