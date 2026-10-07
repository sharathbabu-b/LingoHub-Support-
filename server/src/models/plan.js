const mongoose = require('mongoose');
const { LANGUAGE_CODES, LEVEL_CODES } = require('../lib/meta');

const planSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  languages: { type: [{ code: { type: String, enum: LANGUAGE_CODES }, minLevel: { type: String, enum: LEVEL_CODES, default: 'C1' }, _id: false }], default: [] },
  slots: { type: [Number], default: [] },
  maxRate: { type: Number, default: null },
  timezone: { type: String, default: 'UTC' },
}, { timestamps: true });

module.exports = mongoose.model('Plan', planSchema);