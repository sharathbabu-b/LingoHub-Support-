const mongoose = require('mongoose');
const config = require('./config');
const { createApp } = require('./app');
const { routeQueued } = require('./services/ticketService');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectMongo() {
  let attempt = 0;
  while (true) {
    try {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
      return;
    } catch (error) {
      if (config.isProd) throw error;
      attempt += 1;
      const delay = Math.min(1000 * 2 ** attempt, 30000);
      console.error(`MongoDB unavailable (attempt ${attempt}): ${error.message}`);
      console.error('Check Atlas Network Access, cluster status, and VPN/firewall TLS inspection. Retrying shortly.');
      await wait(delay);
    }
  }
}

async function main() {
  await connectMongo();
  console.log('MongoDB connected');
  const app = createApp();
  app.listen(config.port, () => console.log(`LingoHub API on :${config.port}`));

  // Shift changes: queued tickets get picked up as soon as a matching agent comes on shift.
  setInterval(() => routeQueued().catch((e) => console.error('routing sweep failed', e.message)), config.routingIntervalMs);
}

main().catch((e) => {
  console.error(`MongoDB startup failed: ${e.message}`);
  process.exit(1);
});
