// Pulls the live Gantt data from Firebase and saves it as a dated JSON file under backups/.
// Run automatically by .github/workflows/backup.yml — see BACKUP_SETUP.md for one-time setup.

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// This isn't a secret — it's the same databaseURL value that's already sitting in plain sight
// inside index.html's Firebase config, visible to anyone who views the page source. Security
// comes from the service account credential below, not from hiding this URL.
const DATABASE_URL = 'https://gantt-bb910-default-rtdb.firebaseio.com';
const STATE_PATH = 'ganttState';

function fail(msg){
  console.error('Backup failed: ' + msg);
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '');
} catch (e) {
  fail('The FIREBASE_SERVICE_ACCOUNT secret is missing or is not valid JSON. See BACKUP_SETUP.md.');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL
});

async function run(){
  const snapshot = await admin.database().ref(STATE_PATH).once('value');
  const data = snapshot.val();

  // Refuse to save an empty or obviously-broken backup — a backup that silently contains
  // nothing useful is worse than no backup at all, since it gives false confidence later.
  if (!data || typeof data !== 'object') {
    fail('No data found at "' + STATE_PATH + '" — refusing to overwrite good backups with nothing.');
  }
  if (!data.regions || typeof data.regions !== 'object' || !Array.isArray(data.employees)) {
    fail('Data at "' + STATE_PATH + '" is missing expected fields (regions/employees) — looks corrupted or incomplete, refusing to save.');
  }

  const dir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const json = JSON.stringify(data, null, 2);

  fs.writeFileSync(path.join(dir, dateStr + '.json'), json);
  fs.writeFileSync(path.join(dir, 'latest.json'), json); // convenient rolling copy of the most recent backup

  console.log('Backup saved: backups/' + dateStr + '.json (' + json.length + ' bytes, ' + data.employees.length + ' employees, ' + Object.keys(data.regions).length + ' regions)');
  process.exit(0);
}

run().catch(err => fail(err.message || String(err)));
