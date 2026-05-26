/**
 * Emergency admin password reset script.
 * Run on the server when all other recovery options are unavailable:
 *
 *   node reset-admin.js
 *   node reset-admin.js newpassword123
 */
const bcrypt = require('bcryptjs');
const Datastore = require('@seald-io/nedb');
const path = require('path');

const newPassword = process.argv[2] || 'Admin@1234';

const db = new Datastore({
  filename: path.join(__dirname, 'data', 'users.db'),
  autoload: true,
});

const hash = bcrypt.hashSync(newPassword, 12);

db.update(
  { isAdmin: true },
  { $set: { password: hash, twoFAEnabled: false, otpCode: null, otpExpires: null } },
  { multi: false },
  function (err, numReplaced) {
    if (err) { console.error('Error:', err); process.exit(1); }
    if (numReplaced === 0) { console.error('No admin user found.'); process.exit(1); }
    console.log(`\n✅  Admin password reset to: ${newPassword}`);
    console.log('    2FA has been disabled.');
    console.log('    Login at /login with username: admin\n');
    process.exit(0);
  }
);
