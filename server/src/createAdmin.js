const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('./config');
const { User } = require('./models');
const { passwordSchema, containsEmailName } = require('./lib/password');

async function main() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (!email || !password) throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in server/.env first');

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!validEmail) throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
  const passwordResult = passwordSchema.safeParse(password);
  if (!passwordResult.success) throw new Error(passwordResult.error.issues[0].message);
  if (containsEmailName(password, email)) throw new Error('Admin password must not contain the email name');

  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  try {
    const existing = await User.findOne({ email });
    if (existing) {
      if (existing.role !== 'admin') throw new Error('That email already belongs to a non-admin account');
      console.log('Admin account already exists; no changes made.');
      return;
    }
    await User.create({ name: 'Platform Admin', email, role: 'admin', passwordHash: await bcrypt.hash(password, 12) });
    console.log(`Admin account created for ${email}. Remove BOOTSTRAP_ADMIN_PASSWORD from server/.env after setup.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`Admin bootstrap failed: ${error.message}`);
  process.exitCode = 1;
});