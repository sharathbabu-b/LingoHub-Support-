const crypto = require('crypto');
const Counter = require('./counter');

const newApiKey = () => 'lh_' + crypto.randomBytes(24).toString('hex');

async function nextTicketNumber(clientId) {
  const counter = await Counter.findOneAndUpdate(
    { _id: `ticket:${clientId}` },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return counter.seq;
}

module.exports = { newApiKey, nextTicketNumber };